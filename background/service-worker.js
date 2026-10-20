import { findNewRoles } from '../utils/comparison.js';

// Keep the latest scan in memory to make saving instantaneous
let lastScannedRoles = null;
let currentScanTabId = null;

function notifyAll(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
  if (currentScanTabId) {
    chrome.tabs.sendMessage(currentScanTabId, msg).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_SCAN') {
    const senderTabId = sender?.tab?.id;
    startScan(senderTabId);
    sendResponse({ status: 'started' });
  } else if (message.action === 'UPDATE_DATABASE') {
    (async () => {
      try {
        notifyAll({ type: 'SAVE_PROGRESS', text: 'Starting save process...' });
        await updateDatabase();
        notifyAll({ type: 'SAVE_PROGRESS', text: 'Save complete!' });
        notifyAll({ type: 'DATABASE_UPDATED' });
        sendResponse({ status: 'updated' });
      } catch (err) {
        notifyAll({ type: 'SAVE_PROGRESS', text: 'Save failed!' });
        sendResponse({ status: 'error', error: err.message || String(err) });
      }
    })();
    return true;
  } else if (message.type === 'PROGRESS_UPDATE') {
    // If progress update was sent from content script scraper, also forward to target tab
    if (currentScanTabId) {
      chrome.tabs.sendMessage(currentScanTabId, message).catch(() => {});
    }
  }
  return true;
});

async function updateDatabase() {
  if (lastScannedRoles) {
    notifyAll({ type: 'SAVE_PROGRESS', text: 'Saving from memory...' });
    await chrome.storage.local.set({ 
      allRoles: lastScannedRoles,
      lastChecked: Date.now()
    });
    // Clear memory
    lastScannedRoles = null;
    notifyAll({ type: 'SAVE_PROGRESS', text: 'Memory save successful.' });
  } else {
    // Fallback if service worker restarted (rare during normal flow)
    notifyAll({ type: 'SAVE_PROGRESS', text: 'Memory empty, reading pendingRoles...' });
    const result = await chrome.storage.local.get(['pendingRoles']);
    if (result.pendingRoles) {
      notifyAll({ type: 'SAVE_PROGRESS', text: 'Found pendingRoles, saving to allRoles...' });
      await chrome.storage.local.set({ 
        allRoles: result.pendingRoles,
        lastChecked: Date.now()
      });
      await chrome.storage.local.remove('pendingRoles');
      notifyAll({ type: 'SAVE_PROGRESS', text: 'Fallback save successful.' });
    } else {
      notifyAll({ type: 'SAVE_PROGRESS', text: 'No pending roles found to save.' });
    }
  }
}

async function startScan(senderTabId) {
  try {
    let tabId = senderTabId;
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error("No active tab found.");
      }
      
      const tabUrl = tabs[0].url || '';
      let isOcs = false;
      try {
        const parsed = new URL(tabUrl);
        isOcs = parsed.hostname === 'ocs.iith.ac.in' || parsed.hostname.endsWith('.ocs.iith.ac.in');
      } catch (e) {
        isOcs = false;
      }

      if (!isOcs) {
        throw new Error("This extension only works on the OCS IITH portal (https://ocs.iith.ac.in).");
      }

      tabId = tabs[0].id;
    }
    currentScanTabId = tabId;

    // Inject the scraper script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/ocs-scraper.js']
    });

    // Notify that we're detecting OCS
    notifyAll({ type: 'PROGRESS_UPDATE', text: 'Detecting OCS table...' });

    // Send message to the content script to start scraping
    const response = await chrome.tabs.sendMessage(tabId, { action: 'RUN_SCRAPER' });
    
    if (response && response.status === 'success') {
      const currentRoles = response.data;
      
      // Notify phase 2: comparison
      notifyAll({ type: 'PROGRESS_UPDATE', text: 'Comparing with previous roles...' });
      
      // Fetch historic roles from local storage
      const storageResult = await chrome.storage.local.get(['allRoles']);
      const historicRoles = storageResult.allRoles || [];

      const isFirstRun = historicRoles.length === 0;
      const { newRoles, updatedRoles } = findNewRoles(currentRoles, historicRoles);

      // Since roles only get added, the current scrape is the new complete database.
      lastScannedRoles = currentRoles; // store in memory for instant save
      notifyAll({ type: 'PROGRESS_UPDATE', text: 'Waiting for database update...' });
      
      // Also store in pendingRoles as a fallback in case service worker sleeps
      await chrome.storage.local.set({ pendingRoles: currentRoles });

      // If it's the first run, don't report them as "new", just initialized.
      const reportedNewRoles = isFirstRun ? [] : newRoles;

      // Send notifications
      if (reportedNewRoles.length > 0) {
        let notifMessage = reportedNewRoles.map(r => `${r.company} — ${r.title} (${r.ctc || 'N/A'})`).join('\n');
        if (reportedNewRoles.length > 3) {
           notifMessage = reportedNewRoles.slice(0, 3).map(r => `${r.company} — ${r.title} (${r.ctc || 'N/A'})`).join('\n') + `\n\n+ ${reportedNewRoles.length - 3} more new roles\n\nAll the best! 🚀`;
        } else {
           notifMessage += `\n\nAll the best! 🚀`;
        }

        chrome.notifications.create({
          type: 'basic',
          title: `OCS — ${reportedNewRoles.length} New Roles`,
          message: notifMessage,
          iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });
      } else {
         const msg = isFirstRun ? `Database initialized with ${currentRoles.length} roles.` : "OCS checked — no new roles found.";
         chrome.notifications.create({
          type: 'basic',
          title: `OCS Role Checker`,
          message: msg,
          iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });
      }

      // Notify popup and tab we are done
      notifyAll({ 
        type: 'SCAN_COMPLETE', 
        data: {
          totalFound: currentRoles.length,
          newRoles: reportedNewRoles.length,
          isFirstRun: isFirstRun,
          roles: isFirstRun ? currentRoles : reportedNewRoles
        }
      });
    } else {
      throw new Error((response && response.error) ? response.error : 'Unknown error occurred during scraping.');
    }

  } catch (error) {
    console.error("Scan error:", error);
    notifyAll({ type: 'SCAN_ERROR', error: error.message || String(error) });
  }
}
