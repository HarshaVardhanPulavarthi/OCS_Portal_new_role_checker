import { findNewRoles } from '../utils/comparison.js';

// Keep the latest scan in memory to make saving instantaneous
let lastScannedRoles = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_SCAN') {
    startScan();
    sendResponse({ status: 'started' });
  } else if (message.action === 'UPDATE_DATABASE') {
    (async () => {
      try {
        chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Starting save process...' });
        await updateDatabase();
        chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Save complete!' });
        sendResponse({ status: 'updated' });
      } catch (err) {
        chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Save failed!' });
        sendResponse({ status: 'error', error: err.message || String(err) });
      }
    })();
    return true;
  }
  return true;
});

async function updateDatabase() {
  if (lastScannedRoles) {
    chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Saving from memory...' });
    await chrome.storage.local.set({ 
      allRoles: lastScannedRoles,
      lastChecked: Date.now()
    });
    // Clear memory
    lastScannedRoles = null;
    chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Memory save successful.' });
  } else {
    // Fallback if service worker restarted (rare during normal flow)
    chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Memory empty, reading pendingRoles...' });
    const result = await chrome.storage.local.get(['pendingRoles']);
    if (result.pendingRoles) {
      chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Found pendingRoles, saving to allRoles...' });
      await chrome.storage.local.set({ 
        allRoles: result.pendingRoles,
        lastChecked: Date.now()
      });
      await chrome.storage.local.remove('pendingRoles');
      chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'Fallback save successful.' });
    } else {
      chrome.runtime.sendMessage({ type: 'SAVE_PROGRESS', text: 'No pending roles found to save.' });
    }
  }
}

async function startScan() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found.");
    }
    const tabId = tabs[0].id;

    // Inject the scraper script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/ocs-scraper.js']
    });

    // Notify popup that we're detecting OCS
    chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: 'Detecting OCS table...' });

    // Send message to the content script to start scraping
    const response = await chrome.tabs.sendMessage(tabId, { action: 'RUN_SCRAPER' });
    
    if (response && response.status === 'success') {
      const currentRoles = response.data;
      
      // Notify phase 2: comparison
      chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: 'Comparing with previous roles...' });
      
      // Fetch historic roles from local storage
      const storageResult = await chrome.storage.local.get(['allRoles']);
      const historicRoles = storageResult.allRoles || [];

      const isFirstRun = historicRoles.length === 0;
      const { newRoles, updatedRoles } = findNewRoles(currentRoles, historicRoles);

      // Since roles only get added, the current scrape is the new complete database.
      lastScannedRoles = currentRoles; // store in memory for instant save
      chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: 'Waiting for database update...' });
      
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

      // Notify popup we are done
      chrome.runtime.sendMessage({ 
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
    chrome.runtime.sendMessage({ type: 'SCAN_ERROR', error: error.message || String(error) });
  }
}
