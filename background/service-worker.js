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

// Setup background timer on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('ocs-hourly-check', {
    periodInMinutes: 60
  });
});

// Listen for the background timer
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ocs-hourly-check') {
    const currentHour = new Date().getHours();
    // Only run between 8 AM (8) and 8 PM (20)
    if (currentHour >= 8 && currentHour < 20) {
      runBackgroundScan();
    }
  }
});

async function runBackgroundScan() {
  try {
    // Find a tab that has 'ocs' in the URL
    const tabs = await chrome.tabs.query({});
    const ocsTab = tabs.find(t => t.url && t.url.toLowerCase().includes('ocs'));
    
    if (ocsTab) {
      await startScan(ocsTab.id, true);
    } else {
      console.log("OCS tab not found. Skipping background scan.");
    }
  } catch (error) {
    console.error("Background scan error:", error);
  }
}

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

async function startScan(targetTabId = null, isBackground = false) {
  try {
    let tabId = targetTabId;
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error("No active tab found.");
      }
      tabId = tabs[0].id;
    }

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
      if (!isBackground) chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: 'Comparing with previous roles...' });
      
      // Fetch historic roles (the baseline database) and pending roles (the last scan)
      const storageResult = await chrome.storage.local.get(['allRoles', 'pendingRoles']);
      const historicRoles = storageResult.allRoles || [];
      const previousScanRoles = storageResult.pendingRoles || historicRoles;

      const isFirstRun = historicRoles.length === 0;
      
      // Cumulative new roles (since user last clicked Update Database)
      const cumulativeResult = findNewRoles(currentRoles, historicRoles);
      const cumulativeNewRoles = cumulativeResult.newRoles;

      // Strictly new roles (since the last background scan or manual scan)
      const strictlyNewResult = findNewRoles(currentRoles, previousScanRoles);
      const strictlyNewRoles = strictlyNewResult.newRoles;

      // Since roles only get added, the current scrape is the new pending database.
      lastScannedRoles = currentRoles; // store in memory for instant save
      if (!isBackground) chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: 'Waiting for database update...' });
      
      // Store in pendingRoles as our new baseline for the NEXT background scan
      await chrome.storage.local.set({ pendingRoles: currentRoles });

      // Only notify if there are STRICTLY new roles (or if it's a manual scan and we want to show results)
      const reportedNewRoles = isFirstRun ? [] : (isBackground ? strictlyNewRoles : cumulativeNewRoles);

      // Send notifications
      if (reportedNewRoles.length > 0) {
        let notifMessage = reportedNewRoles.map(r => `${r.company} — ${r.title} (${r.ctc || 'N/A'})`).join('\n');
        if (reportedNewRoles.length > 3) {
           notifMessage = reportedNewRoles.slice(0, 3).map(r => `${r.company} — ${r.title} (${r.ctc || 'N/A'})`).join('\n') + `\n\n+ ${reportedNewRoles.length - 3} more new roles`;
        }
        
        if (isBackground && cumulativeNewRoles.length > strictlyNewRoles.length) {
            notifMessage += `\n(You have ${cumulativeNewRoles.length} total unread roles)`;
        } else {
            notifMessage += `\n\nAll the best! 🚀`;
        }

        chrome.notifications.create({
          type: 'basic',
          title: `OCS — ${reportedNewRoles.length} New Roles!`,
          message: notifMessage,
          iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });
      } else if (!isBackground) {
         const msg = isFirstRun ? `Database initialized with ${currentRoles.length} roles.` : "OCS checked — no new roles found.";
         chrome.notifications.create({
          type: 'basic',
          title: `OCS Role Checker`,
          message: msg,
          iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });
      }

      // Notify popup we are done
      if (!isBackground) {
        chrome.runtime.sendMessage({ 
          type: 'SCAN_COMPLETE', 
          data: {
            totalFound: currentRoles.length,
            newRoles: cumulativeNewRoles.length,
            isFirstRun: isFirstRun,
            roles: isFirstRun ? currentRoles : cumulativeNewRoles
          }
        });
      }
    } else {
      throw new Error((response && response.error) ? response.error : 'Unknown error occurred during scraping.');
    }

  } catch (error) {
    console.error("Scan error:", error);
    chrome.runtime.sendMessage({ type: 'SCAN_ERROR', error: error.message || String(error) });
  }
}
