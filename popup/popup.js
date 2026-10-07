document.addEventListener('DOMContentLoaded', () => {
  const checkBtn = document.getElementById('check-btn');
  const updateBtn = document.getElementById('update-btn');
  const viewDbBtn = document.getElementById('view-db-btn');
  const statusText = document.getElementById('status-text');
  const progressContainer = document.getElementById('progress-container');
  const progressText = document.getElementById('progress-text');
  const resultsContainer = document.getElementById('results-container');
  const lastChecked = document.getElementById('last-checked');
  const lastScanCount = document.getElementById('last-scan-count');

  const scriptUrlInput = document.getElementById('script-url');
  const sheetUrlInput = document.getElementById('sheet-url');
  const syncBtn = document.getElementById('sync-calendar-btn');

  // Load initial state
  chrome.storage.local.get(['lastChecked', 'lastScanCount', 'scriptUrl', 'sheetUrl'], (result) => {
    if (result.lastChecked) {
      lastChecked.textContent = new Date(result.lastChecked).toLocaleString();
    }
    if (result.lastScanCount !== undefined) {
      lastScanCount.textContent = result.lastScanCount;
    }
    if (result.scriptUrl) {
      scriptUrlInput.value = result.scriptUrl;
    }
    if (result.sheetUrl) {
      sheetUrlInput.value = result.sheetUrl;
    }
  });

  // Save URLs when they change
  if (scriptUrlInput) {
    scriptUrlInput.addEventListener('input', (e) => {
      chrome.storage.local.set({ scriptUrl: e.target.value.trim() });
    });
  }
  if (sheetUrlInput) {
    sheetUrlInput.addEventListener('input', (e) => {
      chrome.storage.local.set({ sheetUrl: e.target.value.trim() });
    });
  }

  // Check if we are on the OCS page (for UI feedback)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url && currentTab.url.toLowerCase().includes('ocs') && currentTab.url.toLowerCase().includes('iith')) {
      statusText.textContent = 'Ready';
      statusText.className = 'success';
    } else {
      statusText.textContent = 'Please open the OCS portal';
      checkBtn.disabled = true;
    }
  });

  checkBtn.addEventListener('click', () => {
    checkBtn.disabled = true;
    updateBtn.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    progressText.textContent = 'Starting scan...';

    chrome.runtime.sendMessage({ action: 'START_SCAN' }, (response) => {
      if (chrome.runtime.lastError) {
        progressContainer.classList.add('hidden');
        checkBtn.disabled = false;
        alert('Error: ' + chrome.runtime.lastError.message);
        return;
      }
    });
  });

  updateBtn.addEventListener('click', () => {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Saving...';
    
    chrome.runtime.sendMessage({ action: 'UPDATE_DATABASE' }, (response) => {
      if (chrome.runtime.lastError || (response && response.status === 'error')) {
        progressContainer.classList.add('hidden');
        alert('Error: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : response.error));
        updateBtn.disabled = false;
        updateBtn.textContent = 'SAVE NEW DATABASE';
        return;
      }
      if (response && response.status === 'updated') {
        updateBtn.textContent = 'SAVED ✓';
        updateBtn.style.backgroundColor = '#1e7e34';
        
        // Update the last checked time in the UI
        const now = Date.now();
        document.getElementById('last-checked').textContent = new Date(now).toLocaleString();
        
        setTimeout(() => {
          updateBtn.classList.add('hidden');
          updateBtn.disabled = false;
          updateBtn.textContent = 'SAVE NEW DATABASE';
          updateBtn.style.backgroundColor = '#28a745';
          progressContainer.classList.add('hidden');
        }, 1000); // Give user 1s to read "Save complete!"
      }
    });
  });

  if (viewDbBtn) {
    viewDbBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('database/database.html') });
    });
  }

  // Listen for progress updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PROGRESS_UPDATE' || message.type === 'SAVE_PROGRESS') {
      progressContainer.classList.remove('hidden');
      progressText.textContent = message.text;
    } else if (message.type === 'SCAN_COMPLETE') {
      progressContainer.classList.add('hidden');
      checkBtn.disabled = false;
      
      const { totalFound, newRoles, roles } = message.data;
      
      // Update stats (only last scan count, lastChecked happens on DB update or here?)
      // Actually, let's keep lastScanCount updated here
      const now = Date.now();
      chrome.storage.local.set({ lastScanCount: totalFound });
      lastScanCount.textContent = totalFound;

      // Show results preview
      resultsContainer.innerHTML = '';
      resultsContainer.classList.remove('hidden');

      const header = document.createElement('div');
      header.className = 'result-header';
      
      if (newRoles > 0 || message.data.isFirstRun) {
        if (message.data.isFirstRun) {
          header.textContent = `🎉 Initialized with ${totalFound} ROLES`;
        } else {
          header.textContent = `🎉 ${newRoles} NEW ROLES (Total: ${totalFound})`;
        }
        updateBtn.classList.remove('hidden');
      } else {
        header.textContent = `Scan complete ✓ (Total: ${totalFound}, No New Roles)`;
      }
      resultsContainer.appendChild(header);

      // Show up to 10 items in test mode
      const displayRoles = roles.slice(0, 10);
      displayRoles.forEach(role => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.innerHTML = `
          <span class="result-company">${escapeHtml(role.company)}</span>
          <span class="result-title">${escapeHtml(role.title)}</span>
          <span class="result-ctc">${escapeHtml(role.ctc || 'N/A')}</span>
        `;
        resultsContainer.appendChild(item);
      });

      if (roles.length > 10) {
        const more = document.createElement('div');
        more.style.fontSize = '11px';
        more.style.color = 'var(--text-muted)';
        more.style.textAlign = 'center';
        more.style.marginTop = '4px';
        more.textContent = `+ ${roles.length - 10} more roles found`;
        resultsContainer.appendChild(more);
      }
    } else if (message.type === 'SCAN_ERROR') {
      progressContainer.classList.add('hidden');
      checkBtn.disabled = false;
      alert(message.error);
    }
  });

  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  // --- Hidden Roles Management ---
  const manageHiddenBtn = document.getElementById('manage-hidden-btn');
  const hiddenRolesContainer = document.getElementById('hidden-roles-container');
  const hiddenRolesList = document.getElementById('hidden-roles-list');
  const backBtn = document.getElementById('back-btn');
  const mainActions = document.getElementById('main-actions');

  manageHiddenBtn.addEventListener('click', () => {
    mainActions.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    hiddenRolesContainer.classList.remove('hidden');
    loadHiddenRoles();
  });

  backBtn.addEventListener('click', () => {
    hiddenRolesContainer.classList.add('hidden');
    mainActions.classList.remove('hidden');
  });

  function loadHiddenRoles() {
    hiddenRolesList.innerHTML = '';
    chrome.storage.local.get(['hiddenRoles'], (result) => {
      const roles = result.hiddenRoles || [];
      if (roles.length === 0) {
        hiddenRolesList.innerHTML = '<div style="text-align:center; color: var(--text-muted); font-size: 12px; padding: 10px;">No hidden roles.</div>';
        return;
      }

      roles.forEach((role, index) => {
        const item = document.createElement('div');
        item.className = 'result-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        
        const info = document.createElement('div');
        info.innerHTML = `<div class="result-company" style="font-weight:bold;font-size:12px;">${escapeHtml(role.company)}</div><div class="result-title" style="font-size:11px;color:#aaa;">${escapeHtml(role.title)}</div>`;
        
        const unhideBtn = document.createElement('button');
        unhideBtn.textContent = 'Unhide';
        Object.assign(unhideBtn.style, {
          padding: '4px 8px', fontSize: '10px', backgroundColor: '#28a745', 
          color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer',
          fontWeight: 'bold', marginLeft: '10px'
        });

        unhideBtn.addEventListener('click', () => {
          // Filter by posting_id instead of splice in case indices changed
          const updatedRoles = roles.filter(r => r.posting_id !== role.posting_id);
          chrome.storage.local.set({ hiddenRoles: updatedRoles }, () => {
            loadHiddenRoles(); // reload list
          });
        });

        item.appendChild(info);
        item.appendChild(unhideBtn);
        hiddenRolesList.appendChild(item);
      });
    });
  }

  // --- Calendar Sync ---
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      const url = scriptUrlInput.value.trim();
      const sheetUrl = sheetUrlInput.value.trim();
      
      if (!url || !sheetUrl) {
        alert('Please paste both the Schedule Sheet URL and your Web App URL.');
        return;
      }

      syncBtn.disabled = true;
      syncBtn.textContent = 'SYNCING...';

      chrome.storage.local.get(['allRoles'], (result) => {
        const roles = result.allRoles || [];
        
        // Filter roles that the user applied to
        const appliedRoles = roles.filter(r => 
          (r.registered && r.registered.toUpperCase() === 'YES') || 
          (r.applied && r.applied.toUpperCase() === 'YES')
        );

        if (appliedRoles.length === 0) {
          alert('No applied roles found. Make sure you have scanned the portal first.');
          syncBtn.disabled = false;
          syncBtn.textContent = 'SYNC APPLIED TO CALENDAR';
          return;
        }

        const companies = [...new Set(appliedRoles.map(r => r.company))];

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = url;
        form.target = '_blank'; // Opens the Apps Script response in a new tab
        
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'payload';
        input.value = JSON.stringify({ companies: companies, sheetUrl: sheetUrl });
        
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(form);
          syncBtn.disabled = false;
          syncBtn.textContent = 'SYNC APPLIED TO CALENDAR';
        }, 1000);
      });
    });
  }

});
