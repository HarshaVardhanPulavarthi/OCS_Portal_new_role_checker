let hiddenRoles = [];
let roleNotes = {}; // Format: { [posting_id]: "note text" }
let notepadData = { top: '', decent: '' }; // Format: { top: "...", decent: "..." }
let isNotepadOpen = false;
let notepadSize = { width: 560, height: 330 };
let observer = null;
let showHiddenRoles = false;
let totalCompaniesCount = null;
let isScanning = false;
let scanState = 'IDLE'; // 'IDLE' | 'SCANNING' | 'NEEDS_SAVE' | 'SAVING' | 'SAVED' | 'UP_TO_DATE' | 'ERROR'
let scanRevertTimer = null;
let lastScanNewCount = 0;
let lastScannedRolesList = [];

function ensureGlobalStyles() {
  if (document.getElementById('ocs-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'ocs-ui-styles';
  style.textContent = `
    @keyframes ocs-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .ocs-spinning {
      display: inline-block;
      animation: ocs-spin 1s linear infinite;
    }
    @keyframes ocs-panel-slide-up {
      from {
        opacity: 0;
        transform: translate(-50%, 14px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
      }
    }
    .ocs-custom-scroll::-webkit-scrollbar {
      width: 6px;
    }
    .ocs-custom-scroll::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .ocs-custom-scroll::-webkit-scrollbar-thumb {
      background: #3f3f46;
      border-radius: 4px;
    }
    .ocs-custom-scroll::-webkit-scrollbar-thumb:hover {
      background: #52525b;
    }
    /* OCS Full Table Expansion - All unhidden rows packed at top, full natural scrolling */
    .MuiDataGrid-root {
      height: auto !important;
      max-height: none !important;
    }
    .MuiDataGrid-main {
      height: auto !important;
      max-height: none !important;
    }
    .MuiDataGrid-virtualScroller {
      overflow-y: hidden !important;
    }
    .MuiDataGrid-virtualScrollerContent {
      height: auto !important;
    }
    .MuiDataGrid-virtualScrollerRenderZone {
      position: relative !important;
      transform: none !important;
    }
    .ocs-row-hidden {
      display: none !important;
    }
    .ocs-row-dimmed {
      opacity: 0.35 !important;
      filter: grayscale(100%) !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function renderScanButtonState(btn) {
  if (!btn) btn = document.getElementById('ocs-scan-btn');
  if (!btn) return;

  if (isScanning || scanState === 'SCANNING') {
    btn.innerHTML = `<span class="ocs-spinning">🔄</span> <span id="ocs-scan-btn-label">Scanning...</span>`;
    btn.style.backgroundColor = '#18181b';
    btn.style.borderColor = '#3b82f6';
    btn.style.color = '#93c5fd';
    btn.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.35)';
    btn.style.cursor = 'wait';
    btn.title = 'Scraping and checking OCS portal for new roles...';
  } else if (scanState === 'NEEDS_SAVE') {
    const count = btn.dataset.newCount || (lastScanNewCount ? `${lastScanNewCount}` : '');
    btn.innerHTML = `🎉 ${count ? count + ' ' : ''}New! (Save DB)`;
    btn.style.backgroundColor = '#14532d';
    btn.style.borderColor = '#22c55e';
    btn.style.color = '#ffffff';
    btn.style.boxShadow = '0 0 16px rgba(34, 197, 94, 0.4)';
    btn.style.cursor = 'pointer';
    btn.title = 'New roles detected! Click here to save them to your database.';
  } else if (scanState === 'SAVING') {
    btn.innerHTML = `<span class="ocs-spinning">🔄</span> Saving DB...`;
    btn.style.backgroundColor = '#14532d';
    btn.style.borderColor = '#22c55e';
    btn.style.color = '#ffffff';
    btn.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.35)';
    btn.style.cursor = 'wait';
    btn.title = 'Saving new roles to local database...';
  } else if (scanState === 'SAVED') {
    btn.innerHTML = `✅ Saved ✓`;
    btn.style.backgroundColor = '#14532d';
    btn.style.borderColor = '#22c55e';
    btn.style.color = '#86efac';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    btn.style.cursor = 'default';
    btn.title = 'Database successfully updated!';
  } else if (scanState === 'UP_TO_DATE') {
    btn.innerHTML = `✓ Up to date`;
    btn.style.backgroundColor = '#18181b';
    btn.style.borderColor = '#22c55e';
    btn.style.color = '#4ade80';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    btn.style.cursor = 'default';
    btn.title = 'OCS scan complete: No new roles found.';
  } else if (scanState === 'ERROR') {
    btn.innerHTML = `⚠️ Scan Failed`;
    btn.style.backgroundColor = '#18181b';
    btn.style.borderColor = '#ef4444';
    btn.style.color = '#f87171';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    btn.style.cursor = 'pointer';
  } else {
    // Default IDLE state
    btn.innerHTML = `⚡ Check New Companies`;
    btn.style.backgroundColor = '#18181b';
    btn.style.borderColor = '#33333d';
    btn.style.color = '#fff';
    btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    btn.style.cursor = 'pointer';
    btn.title = 'Check OCS portal for new job postings and companies';
  }
}

function handleScanProgressText(text) {
  if (!text) return;
  isScanning = true;
  scanState = 'SCANNING';
  const scanBtn = document.getElementById('ocs-scan-btn');
  if (!scanBtn) return;

  renderScanButtonState(scanBtn);

  const label = scanBtn.querySelector('#ocs-scan-btn-label');
  if (label) {
    let shortText = text;
    if (text.toLowerCase().includes('reading page')) {
      shortText = text.replace('Reading ', ''); // e.g. "page 2..."
    } else if (text.toLowerCase().includes('filters')) {
      shortText = 'Filters...';
    } else if (text.toLowerCase().includes('comparing')) {
      shortText = 'Comparing...';
    } else if (text.toLowerCase().includes('detecting')) {
      shortText = 'Detecting...';
    } else if (text.toLowerCase().includes('setting up')) {
      shortText = 'Setting up...';
    }
    label.textContent = shortText;
  }
  scanBtn.title = `Scan in progress: ${text}`;
}

// Text normalization helper
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

// Clean up legacy/broken storage entries (e.g. index-based collisions from old row recycling)
function normalizeHiddenRoles(roles, allKnownRoles = []) {
  if (!Array.isArray(roles)) return [];
  const rolesMap = new Map();
  if (Array.isArray(allKnownRoles)) {
    allKnownRoles.forEach(r => {
      if (r && r.dataId) rolesMap.set(String(r.dataId), r);
      if (r && r.id) rolesMap.set(String(r.id), r);
    });
  }

  let wasMigrated = false;
  const cleaned = roles.map(item => {
    if (typeof item === 'string' || typeof item === 'number') {
      item = { posting_id: String(item) };
      wasMigrated = true;
    }
    let comp = item.company ? cleanText(item.company) : '';
    let title = item.title ? cleanText(item.title) : '';
    if (title.toLowerCase() === 'add note' || title.toLowerCase() === '+ note') {
      title = '';
      wasMigrated = true;
    }
    
    // If missing company, try looking up in known roles
    if (!comp && item.posting_id && rolesMap.has(String(item.posting_id))) {
      const known = rolesMap.get(String(item.posting_id));
      comp = cleanText(known.company || '');
      title = cleanText(known.title || '');
      wasMigrated = true;
    }

    return {
      posting_id: item.posting_id || '',
      company: comp,
      title: title,
      hiddenAt: item.hiddenAt || Date.now()
    };
  }).filter(item => {
    // Keep if it has a real company name
    if (item.company && item.company !== 'Unknown' && item.company !== 'unknown') return true;
    // Or if it has a real UUID / alphanumeric posting_id (NOT a 1- or 2-digit index from old row recycling)
    if (item.posting_id && !/^\d{1,2}$/.test(String(item.posting_id))) return true;
    wasMigrated = true;
    return false;
  });

  if (wasMigrated) {
    chrome.storage.local.set({ hiddenRoles: cleaned });
  }

  return cleaned;
}

// Ensure this script strictly runs only on the OCS IITH portal (https://ocs.iith.ac.in)
function isOcsPortal() {
  try {
    const hostname = window.location.hostname.toLowerCase();
    return hostname === 'ocs.iith.ac.in' || hostname.endsWith('.ocs.iith.ac.in');
  } catch (e) {
    return false;
  }
}

if (isOcsPortal()) {
  chrome.storage.local.get(['hiddenRoles', 'roleNotes', 'notepadData', 'isNotepadOpen', 'totalCompaniesCount', 'allRoles', 'notepadSize', 'lastScannedNewRoles', 'pendingRoles'], (result) => {
    hiddenRoles = normalizeHiddenRoles(result.hiddenRoles || [], result.allRoles || []);
    roleNotes = result.roleNotes || {};
    notepadData = result.notepadData || { top: '', decent: '' };
    isNotepadOpen = result.isNotepadOpen || false;
    notepadSize = result.notepadSize || { width: 560, height: 330 };
    totalCompaniesCount = result.totalCompaniesCount || (result.allRoles && result.allRoles.length ? result.allRoles.length : null);
    if (result.lastScannedNewRoles && result.lastScannedNewRoles.length > 0) {
      lastScannedRolesList = result.lastScannedNewRoles;
      if (result.pendingRoles && result.pendingRoles.length > 0) {
        scanState = 'NEEDS_SAVE';
        lastScanNewCount = lastScannedRolesList.length;
      }
    }
    initWhenReady();
  });

  // Listen for cross-tab or popup changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let changed = false;
      if (changes.hiddenRoles) { hiddenRoles = normalizeHiddenRoles(changes.hiddenRoles.newValue || []); changed = true; }
      if (changes.roleNotes) { roleNotes = changes.roleNotes.newValue || {}; changed = true; }
      if (changes.notepadData) {
        notepadData = changes.notepadData.newValue || { top: '', decent: '' };
        syncNotepadFromStorage();
      }
      if (changes.isNotepadOpen !== undefined) {
        setNotepadOpenState(!!changes.isNotepadOpen.newValue, false);
      }
      if (changes.notepadSize) {
        notepadSize = changes.notepadSize.newValue || { width: 560, height: 330 };
        const panel = document.getElementById('ocs-notepad-panel');
        if (panel) {
          panel.style.width = `${notepadSize.width}px`;
          panel.style.height = `${notepadSize.height}px`;
        }
      }
      if (changes.totalCompaniesCount !== undefined) {
        totalCompaniesCount = changes.totalCompaniesCount.newValue;
        updateTotalCompaniesBadge();
      }
      if (changes.lastScannedNewRoles) {
        lastScannedRolesList = changes.lastScannedNewRoles.newValue || [];
      }
      if (changed) {
        document.querySelectorAll('.MuiDataGrid-row').forEach(row => {
          delete row.dataset.ocsStateKey;
        });
        processAllVisibleRows();
      }
    }
  });

  // Listen for scan progress events dispatched from the content scraper
  window.addEventListener('ocs-scan-progress', (e) => {
    const text = e.detail?.text;
    if (text) handleScanProgressText(text);
  });

  // Listen for messages from popup or background service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_NOTEPAD') {
      const forceOpen = message.forceOpen !== undefined ? message.forceOpen : !isNotepadOpen;
      setNotepadOpenState(forceOpen, true);
      sendResponse({ status: 'ok', isOpen: isNotepadOpen });
    } else if (message.type === 'PROGRESS_UPDATE') {
      handleScanProgressText(message.text);
    } else if (message.type === 'SCAN_COMPLETE') {
      isScanning = false;
      const { totalFound, newRoles, isFirstRun, roles } = message.data || {};
      const scanBtn = document.getElementById('ocs-scan-btn');
      
      const rolesList = roles || [];
      lastScannedRolesList = rolesList;

      if (newRoles > 0 || isFirstRun) {
        scanState = 'NEEDS_SAVE';
        lastScanNewCount = isFirstRun ? totalFound : newRoles;
        if (scanBtn) {
          scanBtn.dataset.newCount = isFirstRun ? `${totalFound} Total` : `${newRoles}`;
        }
        renderScanButtonState(scanBtn);

        // Store latest new roles in storage
        chrome.storage.local.set({ lastScannedNewRoles: rolesList });

        // Show the list of new companies directly above the task bar
        showNewCompaniesPanel(rolesList, {
          newRolesCount: newRoles,
          totalFound: totalFound,
          isFirstRun: isFirstRun
        });
      } else {
        scanState = 'UP_TO_DATE';
        renderScanButtonState(scanBtn);
        showUpToDatePopup(totalFound);
        clearTimeout(scanRevertTimer);
        scanRevertTimer = setTimeout(() => {
          if (scanState === 'UP_TO_DATE') {
            scanState = 'IDLE';
            renderScanButtonState();
          }
        }, 3500);
      }
      updatePortalTotalCount();
    } else if (message.type === 'SCAN_ERROR') {
      isScanning = false;
      scanState = 'ERROR';
      const scanBtn = document.getElementById('ocs-scan-btn');
      if (scanBtn && message.error) {
        scanBtn.title = `Error: ${message.error}`;
      }
      renderScanButtonState(scanBtn);
      showScanErrorPopup(message.error);
      clearTimeout(scanRevertTimer);
      scanRevertTimer = setTimeout(() => {
        if (scanState === 'ERROR') {
          scanState = 'IDLE';
          renderScanButtonState();
        }
      }, 3500);
    } else if (message.type === 'DATABASE_UPDATED') {
      scanState = 'SAVED';
      renderScanButtonState();
      updatePanelSaveButtonState('saved');
      clearTimeout(scanRevertTimer);
      scanRevertTimer = setTimeout(() => {
        if (scanState === 'SAVED') {
          scanState = 'IDLE';
          renderScanButtonState();
        }
      }, 2500);
      updatePortalTotalCount();
    }
  });
}

let hasRemovedFilters = false;

function expandDataGridToFull() {
  const grid = document.querySelector('.MuiDataGrid-root, [role="grid"]');
  if (!grid) return;
  const scroller = grid.querySelector('.MuiDataGrid-virtualScroller') || document.querySelector('.MuiDataGrid-virtualScroller');
  const content = grid.querySelector('.MuiDataGrid-virtualScrollerContent');
  const main = grid.querySelector('.MuiDataGrid-main');

  if (!scroller) return;

  let targetHeight = 0;
  if (content && content.style && content.style.height) {
    targetHeight = parseInt(content.style.height, 10);
  }
  if (!targetHeight || targetHeight < 300) {
    targetHeight = 2600;
  }

  if (scroller.clientHeight < targetHeight - 50) {
    scroller.style.minHeight = `${targetHeight}px`;
    scroller.style.height = `${targetHeight}px`;
    scroller.style.overflowY = 'hidden';
    if (main) {
      main.style.height = 'auto';
      main.style.maxHeight = 'none';
    }
    if (grid) {
      grid.style.height = 'auto';
      grid.style.maxHeight = 'none';
    }
    window.dispatchEvent(new Event('resize'));
  }
}

function initWhenReady() {
  ensureGlobalStyles();
  injectFloatingActionUI();
  injectNotepadPanel();
  updatePortalTotalCount();
  observePagination();

  // Re-inject if page navigation or React dynamic DOM updates clear the floating bar
  setInterval(() => {
    if (!document.getElementById('ocs-floating-bar')) {
      injectFloatingActionUI();
    }
    if (!document.getElementById('ocs-notepad-panel')) {
      injectNotepadPanel();
    }
    expandDataGridToFull();
    attachScrollListeners();
    updatePortalTotalCount();
    updateNavButtonsState();
  }, 1000);

  const checkInterval = setInterval(() => {
    const grid = document.querySelector('.MuiDataGrid-root, [role="grid"]');
    const scroller = grid ? (grid.querySelector('.MuiDataGrid-virtualScroller') || grid) : document.querySelector('.MuiDataGrid-virtualScroller');
    if (scroller || grid) {
      clearInterval(checkInterval);
      expandDataGridToFull();
      startObserving(scroller || grid);
      observePagination();
      updatePortalTotalCount();
      // Process already rendered rows
      processAllVisibleRows();
      
      if (!hasRemovedFilters) {
        hasRemovedFilters = true;
        removeEligibilityFilter().then(() => {
          setTimeout(updatePortalTotalCount, 500);
        });
      }
    }
  }, 1000);
}

// Helper: Database Save Handler
function triggerDatabaseSave() {
  scanState = 'SAVING';
  renderScanButtonState();
  updatePanelSaveButtonState('saving');

  chrome.runtime.sendMessage({ action: 'UPDATE_DATABASE' }, (response) => {
    if (chrome.runtime.lastError || (response && response.status === 'error')) {
      scanState = 'ERROR';
      const errMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : response?.error;
      const scanBtn = document.getElementById('ocs-scan-btn');
      if (scanBtn) scanBtn.title = 'Error saving database: ' + errMsg;
      renderScanButtonState(scanBtn);
      updatePanelSaveButtonState('error', errMsg);
      clearTimeout(scanRevertTimer);
      scanRevertTimer = setTimeout(() => {
        scanState = 'IDLE';
        renderScanButtonState();
      }, 3500);
    } else {
      scanState = 'SAVED';
      renderScanButtonState();
      updatePanelSaveButtonState('saved');
      updatePortalTotalCount();
      chrome.storage.local.remove('lastScannedNewRoles');
      clearTimeout(scanRevertTimer);
      scanRevertTimer = setTimeout(() => {
        scanState = 'IDLE';
        renderScanButtonState();
      }, 2500);
    }
  });
}

// Helper: Toast Notifications
function showToastNotification(text, duration = 3000) {
  let toast = document.getElementById('ocs-toast-notification');
  if (toast) toast.remove();

  toast = document.createElement('div');
  toast.id = 'ocs-toast-notification';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '90px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#18181b',
    color: '#f4f4f5',
    padding: '9px 18px',
    borderRadius: '20px',
    border: '1px solid #3f3f46',
    boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
    zIndex: '100005',
    fontSize: '12.5px',
    fontWeight: '600',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease, transform 0.2s ease',
    whiteSpace: 'nowrap'
  });
  toast.textContent = text;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(-4px)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// Helper: Scroll to Company Row in DataGrid
function scrollToCompanyRow(role) {
  if (!role) return;
  let row = role.posting_id ? document.querySelector(`.MuiDataGrid-row[data-id="${role.posting_id}"]`) : null;
  
  if (!row && role.company) {
    const allRows = Array.from(document.querySelectorAll('.MuiDataGrid-row, [role="row"]'));
    row = allRows.find(r => {
      const comp = r.querySelector('[data-field="company"]')?.textContent?.trim().toLowerCase();
      return comp && comp === role.company.trim().toLowerCase();
    });
  }

  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const originalBg = row.style.backgroundColor;
    const originalBoxShadow = row.style.boxShadow;
    const originalTransition = row.style.transition;
    row.style.transition = 'all 0.3s ease';
    row.style.backgroundColor = 'rgba(59, 130, 246, 0.25)';
    row.style.boxShadow = '0 0 18px rgba(59, 130, 246, 0.7)';
    setTimeout(() => {
      row.style.backgroundColor = originalBg;
      row.style.boxShadow = originalBoxShadow;
      row.style.transition = originalTransition;
    }, 2500);
    showToastNotification(`Showing "${role.company}" in table`);
  } else {
    showToastNotification(`"${role.company}" is on another table page. Use ◀ ▶ buttons in dock.`);
  }
}

// Helper: Quick-add company to Top or Decent Notepad
function addCompanyToNotepad(companyName, targetList = 'top') {
  if (!companyName) return false;
  const cleanName = companyName.trim();
  if (!cleanName) return false;

  let currentText = notepadData[targetList] || '';
  
  const existingCompanies = currentText.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim().toLowerCase());

  if (existingCompanies.includes(cleanName.toLowerCase())) {
    return 'already_exists';
  }

  let updatedText = currentText;
  if (updatedText.trim().length > 0 && !updatedText.endsWith('\n')) {
    updatedText += '\n';
  }
  updatedText += cleanName;

  notepadData[targetList] = formatNotepadText(updatedText, { keepEmptyBullets: false });

  const textEl = document.getElementById(targetList === 'top' ? 'ocs-notepad-top-text' : 'ocs-notepad-decent-text');
  if (textEl) {
    textEl.value = notepadData[targetList];
  }

  chrome.storage.local.set({ notepadData }, () => {
    flashNotepadStatus('Saved ✓');
  });

  updateNotepadCounts();
  return 'added';
}

// Floating List of New Companies above the Task Bar
function showNewCompaniesPanel(roles, meta = {}) {
  closeNewCompaniesPanel();
  if (!roles || !Array.isArray(roles) || roles.length === 0) return;

  const bar = document.getElementById('ocs-floating-bar');
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const bottomOffset = barRect ? (window.innerHeight - barRect.top + 12) : 84;

  const panel = document.createElement('div');
  panel.id = 'ocs-new-companies-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: `${bottomOffset}px`,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '540px',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '480px',
    backgroundColor: 'rgba(20, 20, 24, 0.96)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.16)',
    borderRadius: '16px',
    boxShadow: '0 24px 50px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    zIndex: '100000',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
    boxSizing: 'border-box',
    animation: 'ocs-panel-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  // Stop portal key listeners inside panel
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('keyup', (e) => e.stopPropagation());

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '12px 16px',
    backgroundColor: '#1b1b1f',
    borderBottom: '1px solid #2e2e36',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    userSelect: 'none'
  });

  const headerLeft = document.createElement('div');
  Object.assign(headerLeft.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });

  const titleIcon = document.createElement('span');
  titleIcon.textContent = meta.isFirstRun ? '🎉' : '✨';
  titleIcon.style.fontSize = '16px';

  const titleText = document.createElement('span');
  titleText.style.fontWeight = '700';
  titleText.style.fontSize = '14px';
  titleText.style.color = '#fff';
  titleText.textContent = meta.isFirstRun 
    ? `Initialized (${roles.length} Roles)` 
    : `New Companies (${roles.length})`;

  const badge = document.createElement('span');
  Object.assign(badge.style, {
    backgroundColor: '#15803d',
    color: '#86efac',
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '10px',
    border: '1px solid #22c55e'
  });
  badge.textContent = `${roles.length} New`;

  headerLeft.appendChild(titleIcon);
  headerLeft.appendChild(titleText);
  headerLeft.appendChild(badge);

  const headerRight = document.createElement('div');
  Object.assign(headerRight.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'ocs-panel-save-btn';
  saveBtn.innerHTML = `💾 Save DB`;
  Object.assign(saveBtn.style, {
    backgroundColor: '#15803d',
    color: '#ffffff',
    border: '1px solid #22c55e',
    borderRadius: '8px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  });
  saveBtn.addEventListener('mouseenter', () => {
    if (saveBtn.style.cursor !== 'wait') saveBtn.style.backgroundColor = '#16a34a';
  });
  saveBtn.addEventListener('mouseleave', () => {
    if (saveBtn.style.cursor !== 'wait') saveBtn.style.backgroundColor = '#15803d';
  });
  saveBtn.addEventListener('click', () => {
    triggerDatabaseSave();
  });

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close list';
  Object.assign(closeBtn.style, {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    transition: 'all 0.15s ease'
  });
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.backgroundColor = '#2e2e38';
    closeBtn.style.color = '#fff';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.color = '#a1a1aa';
  });
  closeBtn.addEventListener('click', () => closeNewCompaniesPanel());

  headerRight.appendChild(saveBtn);
  headerRight.appendChild(closeBtn);

  header.appendChild(headerLeft);
  header.appendChild(headerRight);
  panel.appendChild(header);

  // Filter input if more than 3 roles
  let filterInput = null;
  if (roles.length > 3) {
    const filterContainer = document.createElement('div');
    Object.assign(filterContainer.style, {
      padding: '8px 14px',
      backgroundColor: '#161619',
      borderBottom: '1px solid #25252d'
    });
    filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.placeholder = '🔍 Search company or role...';
    Object.assign(filterInput.style, {
      width: '100%',
      padding: '6px 10px',
      backgroundColor: '#1f1f24',
      border: '1px solid #32323c',
      borderRadius: '6px',
      color: '#fff',
      fontSize: '12px',
      outline: 'none',
      boxSizing: 'border-box'
    });
    filterContainer.appendChild(filterInput);
    panel.appendChild(filterContainer);
  }

  // Scrollable container for cards
  const listContainer = document.createElement('div');
  listContainer.className = 'ocs-custom-scroll';
  Object.assign(listContainer.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '340px'
  });

  const createCardActionBtn = (label, title, onClick) => {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.title = title;
    Object.assign(btn.style, {
      backgroundColor: '#24242b',
      border: '1px solid #383842',
      color: '#d4d4d8',
      fontSize: '11px',
      fontWeight: '600',
      padding: '3px 7px',
      borderRadius: '5px',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px'
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#32323c';
      btn.style.color = '#fff';
      btn.style.borderColor = '#4f4f5a';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = '#24242b';
      btn.style.color = '#d4d4d8';
      btn.style.borderColor = '#383842';
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(btn);
    });
    return btn;
  };

  const renderRoleCard = (role) => {
    const card = document.createElement('div');
    card.className = 'ocs-new-company-card';
    Object.assign(card.style, {
      backgroundColor: '#18181c',
      border: '1px solid #2d2d38',
      borderRadius: '10px',
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      transition: 'all 0.15s ease'
    });
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#4f4f5e';
      card.style.backgroundColor = '#1e1e24';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#2d2d38';
      card.style.backgroundColor = '#18181c';
    });

    const topLine = document.createElement('div');
    Object.assign(topLine.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      flexWrap: 'wrap'
    });

    const companyInfo = document.createElement('div');
    Object.assign(companyInfo.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    });

    const companyName = document.createElement('span');
    companyName.style.fontWeight = '700';
    companyName.style.fontSize = '14px';
    companyName.style.color = '#ffffff';
    companyName.textContent = role.company || 'Unknown Company';
    companyInfo.appendChild(companyName);

    if (role.ctc) {
      const ctcBadge = document.createElement('span');
      Object.assign(ctcBadge.style, {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        color: '#4ade80',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        fontSize: '11px',
        fontWeight: '600',
        padding: '1px 6px',
        borderRadius: '5px'
      });
      ctcBadge.textContent = role.ctc;
      companyInfo.appendChild(ctcBadge);
    }

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    });

    const topBtn = createCardActionBtn('⭐ +Top', 'Add to Top Companies Notepad', (btn) => {
      const res = addCompanyToNotepad(role.company, 'top');
      if (res === 'added') {
        btn.innerHTML = '✓ Added';
        btn.style.backgroundColor = '#14532d';
        btn.style.borderColor = '#22c55e';
        btn.style.color = '#86efac';
        setTimeout(() => {
          btn.innerHTML = '⭐ +Top';
          btn.style.backgroundColor = '#24242b';
          btn.style.borderColor = '#383842';
          btn.style.color = '#d4d4d8';
        }, 1500);
      } else {
        showToastNotification(`"${role.company}" is already in your Top Notepad!`);
      }
    });

    const decentBtn = createCardActionBtn('👍 +Decent', 'Add to Decent Companies Notepad', (btn) => {
      const res = addCompanyToNotepad(role.company, 'decent');
      if (res === 'added') {
        btn.innerHTML = '✓ Added';
        btn.style.backgroundColor = '#14532d';
        btn.style.borderColor = '#22c55e';
        btn.style.color = '#86efac';
        setTimeout(() => {
          btn.innerHTML = '👍 +Decent';
          btn.style.backgroundColor = '#24242b';
          btn.style.borderColor = '#383842';
          btn.style.color = '#d4d4d8';
        }, 1500);
      } else {
        showToastNotification(`"${role.company}" is already in your Decent Notepad!`);
      }
    });

    const viewBtn = createCardActionBtn('🔍 View', 'Find and highlight in table', () => {
      scrollToCompanyRow(role);
    });

    actions.appendChild(topBtn);
    actions.appendChild(decentBtn);
    actions.appendChild(viewBtn);

    if (role.role_url) {
      const linkBtn = createCardActionBtn('🔗 JD', 'Open job details link', () => {
        window.open(role.role_url, '_blank');
      });
      actions.appendChild(linkBtn);
    }

    topLine.appendChild(companyInfo);
    topLine.appendChild(actions);

    const bottomLine = document.createElement('div');
    Object.assign(bottomLine.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      fontSize: '12px',
      color: '#a1a1aa',
      flexWrap: 'wrap'
    });

    const titleSpan = document.createElement('span');
    titleSpan.style.color = '#93c5fd';
    titleSpan.style.fontWeight = '500';
    titleSpan.textContent = `💼 ${role.title || 'Role not specified'}`;
    bottomLine.appendChild(titleSpan);

    if (role.deadline) {
      const deadlineSpan = document.createElement('span');
      deadlineSpan.style.color = '#fbbf24';
      deadlineSpan.style.fontSize = '11px';
      deadlineSpan.textContent = `⏰ ${role.deadline}`;
      bottomLine.appendChild(deadlineSpan);
    }

    if (role.eligibility) {
      const eligSpan = document.createElement('span');
      eligSpan.style.fontSize = '11px';
      eligSpan.style.color = '#a1a1aa';
      eligSpan.textContent = `📋 ${role.eligibility}`;
      bottomLine.appendChild(eligSpan);
    }

    card.appendChild(topLine);
    card.appendChild(bottomLine);
    return card;
  };

  const updateListDisplay = (query = '') => {
    listContainer.innerHTML = '';
    const q = query.trim().toLowerCase();
    const filtered = q
      ? roles.filter(r => (r.company && r.company.toLowerCase().includes(q)) || (r.title && r.title.toLowerCase().includes(q)))
      : roles;
    if (filtered.length === 0) {
      const emptyNotice = document.createElement('div');
      emptyNotice.style.padding = '20px';
      emptyNotice.style.textAlign = 'center';
      emptyNotice.style.color = '#71717a';
      emptyNotice.style.fontSize = '13px';
      emptyNotice.textContent = `No companies match "${query}"`;
      listContainer.appendChild(emptyNotice);
    } else {
      filtered.forEach(role => {
        listContainer.appendChild(renderRoleCard(role));
      });
    }
  };

  updateListDisplay();

  if (filterInput) {
    filterInput.addEventListener('input', (e) => {
      updateListDisplay(e.target.value);
    });
  }

  panel.appendChild(listContainer);

  // Footer
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    padding: '10px 16px',
    backgroundColor: '#1b1b1f',
    borderTop: '1px solid #2e2e36',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#a1a1aa'
  });

  const footerText = document.createElement('span');
  footerText.textContent = `Showing ${roles.length} new ${roles.length === 1 ? 'company' : 'companies'}`;

  const footerActions = document.createElement('div');
  Object.assign(footerActions.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });

  const footerSaveBtn = document.createElement('button');
  footerSaveBtn.className = 'ocs-panel-save-btn';
  footerSaveBtn.innerHTML = `💾 Save to Database`;
  Object.assign(footerSaveBtn.style, {
    backgroundColor: '#15803d',
    color: '#ffffff',
    border: '1px solid #22c55e',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  });
  footerSaveBtn.addEventListener('mouseenter', () => {
    if (footerSaveBtn.style.cursor !== 'wait') footerSaveBtn.style.backgroundColor = '#16a34a';
  });
  footerSaveBtn.addEventListener('mouseleave', () => {
    if (footerSaveBtn.style.cursor !== 'wait') footerSaveBtn.style.backgroundColor = '#15803d';
  });
  footerSaveBtn.addEventListener('click', () => {
    triggerDatabaseSave();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  Object.assign(dismissBtn.style, {
    backgroundColor: '#27272a',
    color: '#d4d4d8',
    border: '1px solid #3f3f46',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  });
  dismissBtn.addEventListener('mouseenter', () => {
    dismissBtn.style.backgroundColor = '#323238';
    dismissBtn.style.color = '#fff';
  });
  dismissBtn.addEventListener('mouseleave', () => {
    dismissBtn.style.backgroundColor = '#27272a';
    dismissBtn.style.color = '#d4d4d8';
  });
  dismissBtn.addEventListener('click', () => closeNewCompaniesPanel());

  footerActions.appendChild(dismissBtn);
  footerActions.appendChild(footerSaveBtn);

  footer.appendChild(footerText);
  footer.appendChild(footerActions);
  panel.appendChild(footer);

  document.body.appendChild(panel);
}

function closeNewCompaniesPanel() {
  const panel = document.getElementById('ocs-new-companies-panel');
  if (panel) panel.remove();
}

function positionNewCompaniesPanel() {
  const panel = document.getElementById('ocs-new-companies-panel');
  const bar = document.getElementById('ocs-floating-bar');
  if (!panel || !bar) return;

  const barRect = bar.getBoundingClientRect();
  const bottomOffset = window.innerHeight - barRect.top + 12;
  panel.style.bottom = `${bottomOffset}px`;
}

function updatePanelSaveButtonState(state, errorMsg) {
  const panel = document.getElementById('ocs-new-companies-panel');
  if (!panel) return;

  const saveBtns = panel.querySelectorAll('.ocs-panel-save-btn');
  saveBtns.forEach(btn => {
    if (state === 'saving') {
      btn.innerHTML = `<span class="ocs-spinning">🔄</span> Saving...`;
      btn.style.cursor = 'wait';
      btn.disabled = true;
    } else if (state === 'saved') {
      btn.innerHTML = `✅ Saved to Database!`;
      btn.style.backgroundColor = '#14532d';
      btn.style.borderColor = '#22c55e';
      btn.style.color = '#86efac';
      btn.style.cursor = 'default';
      btn.disabled = true;
    } else if (state === 'error') {
      btn.innerHTML = `⚠️ Save Failed`;
      btn.style.backgroundColor = '#7f1d1d';
      btn.style.borderColor = '#ef4444';
      btn.style.color = '#fca5a5';
      btn.style.cursor = 'pointer';
      btn.disabled = false;
      btn.title = errorMsg || 'Error saving';
    } else {
      btn.innerHTML = `💾 Save to Database`;
      btn.style.backgroundColor = '#15803d';
      btn.style.borderColor = '#22c55e';
      btn.style.color = '#ffffff';
      btn.style.cursor = 'pointer';
      btn.disabled = false;
    }
  });
}

function showUpToDatePopup(totalFound) {
  closeNewCompaniesPanel();
  const oldPopup = document.getElementById('ocs-up-to-date-popup');
  if (oldPopup) oldPopup.remove();

  const bar = document.getElementById('ocs-floating-bar');
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const bottomOffset = barRect ? (window.innerHeight - barRect.top + 12) : 84;

  const popup = document.createElement('div');
  popup.id = 'ocs-up-to-date-popup';
  Object.assign(popup.style, {
    position: 'fixed',
    bottom: `${bottomOffset}px`,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 18px',
    backgroundColor: 'rgba(20, 20, 24, 0.95)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    borderRadius: '24px',
    color: '#f4f4f5',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    zIndex: '100000',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    animation: 'ocs-panel-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    whiteSpace: 'nowrap'
  });

  const checkIcon = document.createElement('span');
  checkIcon.textContent = '✓';
  checkIcon.style.color = '#4ade80';
  checkIcon.style.fontSize = '15px';
  checkIcon.style.fontWeight = 'bold';

  const textSpan = document.createElement('span');
  textSpan.textContent = totalFound 
    ? `All ${totalFound} companies up to date — No new companies found`
    : 'Portal is up to date — No new companies found';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    color: '#a1a1aa',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '12px',
    fontWeight: 'bold',
    marginLeft: '6px'
  });
  closeBtn.addEventListener('click', () => popup.remove());

  popup.appendChild(checkIcon);
  popup.appendChild(textSpan);
  popup.appendChild(closeBtn);
  document.body.appendChild(popup);

  setTimeout(() => {
    if (popup.parentNode) {
      popup.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      popup.style.opacity = '0';
      popup.style.transform = 'translateX(-50%) translateY(6px)';
      setTimeout(() => popup.remove(), 300);
    }
  }, 4000);
}

function showScanErrorPopup(errorMsg) {
  closeNewCompaniesPanel();
  const oldPopup = document.getElementById('ocs-up-to-date-popup');
  if (oldPopup) oldPopup.remove();

  const bar = document.getElementById('ocs-floating-bar');
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const bottomOffset = barRect ? (window.innerHeight - barRect.top + 12) : 84;

  const popup = document.createElement('div');
  popup.id = 'ocs-up-to-date-popup';
  Object.assign(popup.style, {
    position: 'fixed',
    bottom: `${bottomOffset}px`,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 18px',
    backgroundColor: 'rgba(28, 15, 15, 0.95)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '24px',
    color: '#fecaca',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55)',
    zIndex: '100000',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    animation: 'ocs-panel-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  const icon = document.createElement('span');
  icon.textContent = '⚠️';

  const textSpan = document.createElement('span');
  textSpan.textContent = errorMsg ? `Scan Failed: ${errorMsg}` : 'Scan Failed. Please try again.';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background: 'none',
    border: 'none',
    color: '#f87171',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '12px',
    fontWeight: 'bold',
    marginLeft: '6px'
  });
  closeBtn.addEventListener('click', () => popup.remove());

  popup.appendChild(icon);
  popup.appendChild(textSpan);
  popup.appendChild(closeBtn);
  document.body.appendChild(popup);

  setTimeout(() => {
    if (popup.parentNode) {
      popup.style.transition = 'opacity 0.3s ease';
      popup.style.opacity = '0';
      setTimeout(() => popup.remove(), 300);
    }
  }, 5000);
}

// Close new companies panel when clicking outside
document.addEventListener('mousedown', (e) => {
  const panel = document.getElementById('ocs-new-companies-panel');
  const bar = document.getElementById('ocs-floating-bar');
  if (!panel) return;
  if (panel.contains(e.target) || (bar && bar.contains(e.target))) return;
  const notepad = document.getElementById('ocs-notepad-panel');
  if (notepad && notepad.contains(e.target)) return;
  closeNewCompaniesPanel();
});

window.addEventListener('resize', positionNewCompaniesPanel, { passive: true });

// Backward compatibility
function injectFloatingToggle() {
  injectFloatingActionUI();
}

// Floating Bar at Bottom of Screen with Total Count, Notepad & Show Hidden Buttons
function injectFloatingActionUI() {
  let bar = document.getElementById('ocs-floating-bar');
  if (bar) bar.remove();

  bar = document.createElement('div');
  bar.id = 'ocs-floating-bar';
  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 10px',
    backgroundColor: 'rgba(20, 20, 24, 0.88)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '40px',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    zIndex: '99999',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: 'calc(100vw - 32px)',
    boxSizing: 'border-box'
  });

  // 1. Floating Total Companies Count Icon/Badge
  const totalCountBtn = document.createElement('button');
  totalCountBtn.id = 'ocs-total-count-btn';
  const displayCount = totalCompaniesCount !== null ? totalCompaniesCount : '...';
  totalCountBtn.innerHTML = `🏢 Total: ${displayCount}`;
  totalCountBtn.title = totalCompaniesCount !== null 
    ? `Total Companies on Portal: ${totalCompaniesCount} (Click to scroll to table)` 
    : 'Detecting total companies from table...';
  Object.assign(totalCountBtn.style, {
    padding: '9px 18px',
    backgroundColor: '#18181b',
    color: '#fff',
    border: '1px solid #33333d',
    borderRadius: '24px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '13.5px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  });

  totalCountBtn.addEventListener('mouseenter', () => {
    totalCountBtn.style.transform = 'translateY(-2px)';
    totalCountBtn.style.borderColor = '#4f4f5a';
  });
  totalCountBtn.addEventListener('mouseleave', () => {
    totalCountBtn.style.transform = 'translateY(0)';
    totalCountBtn.style.borderColor = '#33333d';
  });
  totalCountBtn.addEventListener('click', () => {
    updatePortalTotalCount();
    const target = document.querySelector('.MuiTablePagination-displayedRows') || 
                   document.querySelector('.MuiDataGrid-footerContainer') || 
                   document.querySelector('.MuiDataGrid-root');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // 2. Floating Scan for New Roles Button
  const scanBtn = document.createElement('button');
  scanBtn.id = 'ocs-scan-btn';
  Object.assign(scanBtn.style, {
    padding: '9px 18px',
    borderRadius: '24px',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '13.5px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  });
  renderScanButtonState(scanBtn);

  scanBtn.addEventListener('mouseenter', () => {
    scanBtn.style.transform = 'translateY(-2px)';
    if (scanState === 'IDLE') scanBtn.style.borderColor = '#4f4f5a';
  });
  scanBtn.addEventListener('mouseleave', () => {
    scanBtn.style.transform = 'translateY(0)';
    if (scanState === 'IDLE') scanBtn.style.borderColor = '#33333d';
  });

  scanBtn.addEventListener('click', () => {
    if (scanState === 'NEEDS_SAVE') {
      const panel = document.getElementById('ocs-new-companies-panel');
      if (!panel && lastScannedRolesList && lastScannedRolesList.length > 0) {
        showNewCompaniesPanel(lastScannedRolesList, {
          newRolesCount: lastScanNewCount,
          totalFound: totalCompaniesCount,
          isFirstRun: false
        });
      }
      triggerDatabaseSave();
      return;
    }

    if (isScanning || scanState === 'SAVING') return;

    isScanning = true;
    scanState = 'SCANNING';
    renderScanButtonState(scanBtn);
    closeNewCompaniesPanel();

    chrome.runtime.sendMessage({ action: 'START_SCAN' }, (response) => {
      if (chrome.runtime.lastError) {
        isScanning = false;
        scanState = 'ERROR';
        scanBtn.title = 'Error starting scan: ' + chrome.runtime.lastError.message;
        renderScanButtonState(scanBtn);
        showScanErrorPopup(chrome.runtime.lastError.message);
        clearTimeout(scanRevertTimer);
        scanRevertTimer = setTimeout(() => {
          scanState = 'IDLE';
          renderScanButtonState();
        }, 3500);
      }
    });
  });

  // 3. Floating Notepad Button
  const notepadBtn = document.createElement('button');
  notepadBtn.id = 'ocs-notepad-btn';
  notepadBtn.innerHTML = '📝 Notepad';
  Object.assign(notepadBtn.style, {
    padding: '9px 18px',
    backgroundColor: isNotepadOpen ? '#2563eb' : '#18181b',
    color: '#fff',
    border: isNotepadOpen ? '1px solid #3b82f6' : '1px solid #33333d',
    borderRadius: '24px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '13.5px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  });

  notepadBtn.addEventListener('mouseenter', () => {
    notepadBtn.style.transform = 'translateY(-2px)';
    if (!isNotepadOpen) notepadBtn.style.borderColor = '#4f4f5a';
  });
  notepadBtn.addEventListener('mouseleave', () => {
    notepadBtn.style.transform = 'translateY(0)';
    if (!isNotepadOpen) notepadBtn.style.borderColor = '#33333d';
  });
  notepadBtn.addEventListener('click', () => {
    setNotepadOpenState(!isNotepadOpen, true);
  });

  // 4. Floating Toggle Button to Show/Hide Hidden Roles
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'ocs-toggle-hidden-btn';
  toggleBtn.innerHTML = showHiddenRoles ? '🙈 Hide Hidden' : '👁️ Show Hidden';
  Object.assign(toggleBtn.style, {
    padding: '9px 18px',
    backgroundColor: showHiddenRoles ? '#28a745' : '#18181b',
    color: '#fff',
    border: showHiddenRoles ? '1px solid #34d399' : '1px solid #33333d',
    borderRadius: '24px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '13.5px',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap'
  });

  toggleBtn.addEventListener('mouseenter', () => {
    toggleBtn.style.transform = 'translateY(-2px)';
    if (!showHiddenRoles) toggleBtn.style.borderColor = '#4f4f5a';
  });
  toggleBtn.addEventListener('mouseleave', () => {
    toggleBtn.style.transform = 'translateY(0)';
    if (!showHiddenRoles) toggleBtn.style.borderColor = '#33333d';
  });

  toggleBtn.addEventListener('click', () => {
    showHiddenRoles = !showHiddenRoles;
    toggleBtn.innerHTML = showHiddenRoles ? '🙈 Hide Hidden' : '👁️ Show Hidden';
    toggleBtn.style.backgroundColor = showHiddenRoles ? '#28a745' : '#18181b';
    toggleBtn.style.borderColor = showHiddenRoles ? '#34d399' : '#33333d';
    processAllVisibleRows();
  });

  // 5. Subtle Vertical Divider
  const divider = document.createElement('div');
  Object.assign(divider.style, {
    width: '1px',
    height: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    margin: '0 2px'
  });

  // Helper for small action circle buttons
  function createScrollNavBtn(id, title, svgIcon, onClick) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.title = title;
    btn.innerHTML = svgIcon;
    Object.assign(btn.style, {
      width: '35px',
      height: '35px',
      minWidth: '35px',
      borderRadius: '50%',
      backgroundColor: '#18181b',
      color: '#e4e4e7',
      border: '1px solid #33333d',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s ease',
      padding: '0',
      outline: 'none'
    });

    btn.addEventListener('mouseenter', () => {
      if (btn.style.opacity !== '0.35') {
        btn.style.transform = 'translateY(-2px)';
        btn.style.borderColor = '#4f4f5a';
        btn.style.backgroundColor = '#27272a';
        btn.style.color = '#ffffff';
      }
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.borderColor = '#33333d';
      btn.style.backgroundColor = '#18181b';
      btn.style.color = '#e4e4e7';
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  // 6. Left Page (Previous Page) Button
  const prevPageBtn = createScrollNavBtn(
    'ocs-prev-page-btn',
    'Go to previous page (Left page)',
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    () => triggerTablePagination('prev')
  );

  // 7. Right Page (Next Page) Button
  const nextPageBtn = createScrollNavBtn(
    'ocs-next-page-btn',
    'Go to next page (Right page)',
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    () => triggerTablePagination('next')
  );

  // 8. Go to Top Button
  const scrollTopBtn = createScrollNavBtn(
    'ocs-scroll-top-btn',
    'Scroll to top of page',
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const mainContainer = document.getElementById('student-main') || document.querySelector('main');
      if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
      const scroller = document.querySelector('.MuiDataGrid-virtualScroller');
      if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
    }
  );

  // 9. Go to Bottom Button
  const scrollBottomBtn = createScrollNavBtn(
    'ocs-scroll-bottom-btn',
    'Scroll to bottom of page',
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    () => {
      const maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      window.scrollTo({ top: maxScroll, behavior: 'smooth' });
      const mainContainer = document.getElementById('student-main') || document.querySelector('main');
      if (mainContainer) mainContainer.scrollTo({ top: mainContainer.scrollHeight, behavior: 'smooth' });
      const scroller = document.querySelector('.MuiDataGrid-virtualScroller');
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
    }
  );

  bar.appendChild(totalCountBtn);
  bar.appendChild(scanBtn);
  bar.appendChild(notepadBtn);
  bar.appendChild(toggleBtn);
  bar.appendChild(divider);
  bar.appendChild(prevPageBtn);
  bar.appendChild(nextPageBtn);
  bar.appendChild(scrollTopBtn);
  bar.appendChild(scrollBottomBtn);
  document.body.appendChild(bar);

  updateNavButtonsState();
}

// Helpers for Table Pagination Navigation via Dock Buttons
function findPaginationBtn(direction) {
  if (direction === 'prev') {
    const btn = document.querySelector('button[aria-label="Go to previous page"], button[title="Go to previous page"], button[aria-label*="previous" i]');
    if (btn) return btn;
    const actions = document.querySelector('.MuiTablePagination-actions');
    if (actions) {
      const buttons = actions.querySelectorAll('button');
      if (buttons.length >= 2) return buttons[0];
    }
    return null;
  } else {
    const btn = document.querySelector('button[aria-label="Go to next page"], button[title="Go to next page"], button[aria-label*="next" i]');
    if (btn) return btn;
    const actions = document.querySelector('.MuiTablePagination-actions');
    if (actions) {
      const buttons = actions.querySelectorAll('button');
      if (buttons.length >= 2) return buttons[buttons.length - 1];
    }
    return null;
  }
}

function triggerTablePagination(direction) {
  const btn = findPaginationBtn(direction);
  if (!btn) {
    const footer = document.querySelector('.MuiDataGrid-footerContainer') || document.querySelector('.MuiTablePagination-root');
    if (footer) {
      const buttons = footer.querySelectorAll('button');
      if (direction === 'prev' && buttons.length >= 2) {
        buttons[buttons.length - 2].click();
      } else if (direction === 'next' && buttons.length >= 1) {
        buttons[buttons.length - 1].click();
      }
    }
    setTimeout(updateNavButtonsState, 250);
    return;
  }

  const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
  if (isDisabled) {
    updateNavButtonsState();
    return;
  }

  btn.click();
  setTimeout(() => {
    expandDataGridToFull();
    updatePortalTotalCount();
    updateNavButtonsState();
    processAllVisibleRows();
  }, 350);
}

function updateNavButtonsState() {
  const prevTableBtn = findPaginationBtn('prev');
  const nextTableBtn = findPaginationBtn('next');

  const prevDockBtn = document.getElementById('ocs-prev-page-btn');
  const nextDockBtn = document.getElementById('ocs-next-page-btn');

  if (prevDockBtn) {
    const isPrevDisabled = !prevTableBtn || prevTableBtn.disabled || prevTableBtn.getAttribute('aria-disabled') === 'true';
    prevDockBtn.style.opacity = isPrevDisabled ? '0.35' : '1';
    prevDockBtn.style.cursor = isPrevDisabled ? 'not-allowed' : 'pointer';
    prevDockBtn.title = isPrevDisabled ? 'First page (No previous page)' : 'Go to previous page';
  }

  if (nextDockBtn) {
    const isNextDisabled = !nextTableBtn || nextTableBtn.disabled || nextTableBtn.getAttribute('aria-disabled') === 'true';
    nextDockBtn.style.opacity = isNextDisabled ? '0.35' : '1';
    nextDockBtn.style.cursor = isNextDisabled ? 'not-allowed' : 'pointer';
    nextDockBtn.title = isNextDisabled ? 'Last page (No next page)' : 'Go to next page';
  }
}

// Helpers for Detecting and Updating Total Companies on Portal
function detectTotalCompaniesCount() {
  // Strategy 0: Direct MUI DataGrid aria-rowcount attribute (e.g. aria-rowcount="247" on .MuiDataGrid-root)
  const grid = document.querySelector('.MuiDataGrid-root, [role="grid"]');
  if (grid) {
    const rawAttr = grid.getAttribute('aria-rowcount');
    if (rawAttr) {
      const parsed = parseInt(rawAttr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        // aria-rowcount includes the header row, so data rows = aria-rowcount - 1
        const hasHeader = grid.querySelector('.MuiDataGrid-columnHeaders, .MuiDataGrid-columnHeader, [role="columnheader"]') !== null;
        const total = (hasHeader && parsed > 1) ? parsed - 1 : parsed;
        return total;
      }
    }
  }

  // Strategy 1: Standard MUI TablePagination displayed rows element (e.g. "1–50 of 138")
  const displayedRowsEl = document.querySelector('.MuiTablePagination-displayedRows');
  if (displayedRowsEl && displayedRowsEl.textContent) {
    const match = displayedRowsEl.textContent.match(/(?:of|\/)\s*([0-9,]+)/i);
    if (match) {
      const parsed = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // Strategy 2: Look inside DataGrid footer or pagination containers
  const footerContainers = document.querySelectorAll(
    '.MuiDataGrid-footerContainer, .MuiTablePagination-root, [class*="TablePagination"], [class*="footerContainer"]'
  );
  for (const container of footerContainers) {
    const elements = container.querySelectorAll('p, span, div, typography');
    for (const el of elements) {
      const text = el.textContent ? el.textContent.trim() : '';
      if (text.includes('of')) {
        const match = text.match(/\b(?:of|\/)\s*([0-9,]+)\b/i);
        if (match) {
          const parsed = parseInt(match[1].replace(/,/g, ''), 10);
          if (!isNaN(parsed) && parsed > 0) return parsed;
        }
      }
    }
  }

  // Strategy 3: Global search for pagination pattern "X-Y of Z" or "X–Y of Z"
  const allLeafNodes = document.querySelectorAll('p, span, div');
  for (const el of allLeafNodes) {
    if (el.children.length === 0 && el.textContent && el.textContent.length < 50) {
      const text = el.textContent.trim();
      const match = text.match(/\b\d+\s*[-–—]\s*\d+\s+of\s+([0-9,]+)\b/i);
      if (match) {
        const parsed = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
  }

  // Strategy 4: Fallback to count visible rows if on a single page with no pagination
  const rows = document.querySelectorAll('.MuiDataGrid-row[data-id]');
  if (rows.length > 0 && !document.querySelector('button[aria-label="Go to next page"]')) {
    return rows.length;
  }

  return null;
}

function updatePortalTotalCount() {
  const count = detectTotalCompaniesCount();
  if (count !== null && count > 0) {
    if (count !== totalCompaniesCount) {
      totalCompaniesCount = count;
      chrome.storage.local.set({ totalCompaniesCount: count });
    }
    updateTotalCompaniesBadge();
  } else if (totalCompaniesCount !== null) {
    updateTotalCompaniesBadge();
  }
}

function updateTotalCompaniesBadge() {
  const badge = document.getElementById('ocs-total-count-btn');
  if (badge) {
    const displayCount = totalCompaniesCount !== null ? totalCompaniesCount : '...';
    badge.innerHTML = `🏢 Total: ${displayCount}`;
    badge.title = totalCompaniesCount !== null 
      ? `Total Companies on Portal: ${totalCompaniesCount} (Click to scroll to table)` 
      : 'Detecting total companies from table...';
  }
}

let paginationObserver = null;
function observePagination() {
  if (paginationObserver) paginationObserver.disconnect();
  const target = document.querySelector('.MuiTablePagination-root') || 
                 document.querySelector('.MuiDataGrid-footerContainer') ||
                 document.querySelector('.MuiDataGrid-root, [role="grid"]');
  if (target) {
    paginationObserver = new MutationObserver(() => {
      updatePortalTotalCount();
      updateNavButtonsState();
    });
    paginationObserver.observe(target, { 
      childList: true, 
      subtree: true, 
      characterData: true, 
      attributes: true, 
      attributeFilter: ['aria-rowcount', 'aria-colcount', 'disabled', 'aria-disabled'] 
    });
  }
}

// Small Notepad Component at the Bottom of the Screen
function injectNotepadPanel() {
  let panel = document.getElementById('ocs-notepad-panel');
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'ocs-notepad-panel';
  Object.assign(panel.style, {
    position: 'fixed',
    bottom: '78px',
    right: '24px',
    width: `${notepadSize.width || 560}px`,
    maxWidth: 'calc(100vw - 48px)',
    height: `${notepadSize.height || 330}px`,
    maxHeight: 'calc(100vh - 120px)',
    minWidth: '380px',
    minHeight: '220px',
    backgroundColor: '#18181b',
    color: '#f4f4f5',
    border: '1px solid #3f3f46',
    borderRadius: '14px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
    zIndex: '100000',
    display: isNotepadOpen ? 'flex' : 'none',
    flexDirection: 'column',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: 'hidden',
    boxSizing: 'border-box'
  });

  // Stop portal & DataGrid from catching keyboard events inside notepad
  panel.addEventListener('keydown', (e) => e.stopPropagation());
  panel.addEventListener('keyup', (e) => e.stopPropagation());

  // Header Bar
  const header = document.createElement('div');
  header.id = 'ocs-notepad-header';
  header.title = 'Drag to move • Double-click to reset position';
  Object.assign(header.style, {
    padding: '10px 14px',
    backgroundColor: '#202024',
    borderBottom: '1px solid #2e2e33',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'move',
    userSelect: 'none'
  });

  const titleGroup = document.createElement('div');
  titleGroup.style.display = 'flex';
  titleGroup.style.alignItems = 'center';
  titleGroup.style.gap = '8px';

  const titleSpan = document.createElement('span');
  titleSpan.style.fontWeight = '700';
  titleSpan.style.fontSize = '13.5px';
  titleSpan.style.letterSpacing = '0.3px';
  titleSpan.textContent = '📝 Companies Notepad';

  const totalBadge = document.createElement('span');
  totalBadge.id = 'ocs-total-count';
  totalBadge.textContent = 'Total: 0';
  Object.assign(totalBadge.style, {
    fontSize: '11px',
    color: '#e4e4e7',
    fontWeight: '700',
    backgroundColor: '#27272a',
    padding: '2px 8px',
    borderRadius: '10px',
    border: '1px solid #3f3f46'
  });

  const statusBadge = document.createElement('span');
  statusBadge.id = 'ocs-notepad-status';
  statusBadge.textContent = 'Saved ✓';
  Object.assign(statusBadge.style, {
    fontSize: '11px',
    color: '#10b981',
    fontWeight: '600',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: '2px 7px',
    borderRadius: '10px',
    opacity: '0',
    transition: 'opacity 0.25s ease'
  });

  titleGroup.appendChild(titleSpan);
  titleGroup.appendChild(totalBadge);
  titleGroup.appendChild(statusBadge);

  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.alignItems = 'center';
  headerActions.style.gap = '6px';

  const createIconButton = (label, title, onClick) => {
    const btn = document.createElement('button');
    btn.innerHTML = label;
    btn.title = title;
    Object.assign(btn.style, {
      background: 'transparent',
      border: 'none',
      color: '#a1a1aa',
      cursor: 'pointer',
      padding: '4px 7px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 'bold',
      lineHeight: '1',
      transition: 'background-color 0.15s, color 0.15s'
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#2e2e35';
      btn.style.color = '#fff';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = 'transparent';
      btn.style.color = '#a1a1aa';
    });
    btn.addEventListener('click', onClick);
    return btn;
  };

  const minimizeBtn = createIconButton('—', 'Minimize', (e) => {
    e.stopPropagation();
    setNotepadOpenState(false, true);
  });

  const closeBtn = createIconButton('✕', 'Close', (e) => {
    e.stopPropagation();
    setNotepadOpenState(false, true);
  });

  headerActions.appendChild(minimizeBtn);
  headerActions.appendChild(closeBtn);

  header.appendChild(titleGroup);
  header.appendChild(headerActions);

  // Body container (Split into 2 sections)
  const body = document.createElement('div');
  Object.assign(body.style, {
    display: 'flex',
    flex: '1',
    padding: '12px',
    gap: '12px',
    minHeight: '0',
    backgroundColor: '#141416',
    boxSizing: 'border-box'
  });

  // Helper function to create section column
  function createColumn(title, icon, color, placeholderText, storageKey, countId, textId) {
    const col = document.createElement('div');
    Object.assign(col.style, {
      flex: '1',
      display: 'flex',
      flexDirection: 'column',
      minWidth: '0'
    });

    const colHeader = document.createElement('div');
    Object.assign(colHeader.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '6px'
    });

    const colTitle = document.createElement('span');
    colTitle.innerHTML = `${icon} ${title}`;
    Object.assign(colTitle.style, {
      fontSize: '12px',
      fontWeight: '700',
      color: color,
      letterSpacing: '0.3px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    });

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.style.gap = '6px';

    const countBadge = document.createElement('span');
    countBadge.id = countId;
    countBadge.textContent = '0 companies';
    Object.assign(countBadge.style, {
      fontSize: '10px',
      fontWeight: '600',
      color: '#a1a1aa',
      backgroundColor: '#232328',
      padding: '2px 7px',
      borderRadius: '10px',
      border: '1px solid #33333d'
    });

    headerRight.appendChild(countBadge);

    colHeader.appendChild(colTitle);
    colHeader.appendChild(headerRight);

    const undoManager = new NotepadUndoManager(notepadData[storageKey] || '');

    const textarea = document.createElement('textarea');
    textarea.id = textId;
    textarea.placeholder = placeholderText;
    textarea.value = formatNotepadText(notepadData[storageKey] || '', { keepEmptyBullets: false });
    Object.assign(textarea.style, {
      flex: '1',
      width: '100%',
      boxSizing: 'border-box',
      backgroundColor: '#1b1b1f',
      color: '#f4f4f5',
      border: '1px solid #32323a',
      borderRadius: '8px',
      padding: '9px 11px',
      fontSize: '12.5px',
      lineHeight: '1.5',
      resize: 'none',
      outline: 'none',
      fontFamily: 'inherit',
      transition: 'border-color 0.2s, box-shadow 0.2s'
    });

    textarea.addEventListener('focus', () => {
      textarea.style.borderColor = color;
      textarea.style.boxShadow = `0 0 0 2px ${color}33`;
    });

    textarea.addEventListener('blur', () => {
      textarea.style.borderColor = '#32323a';
      textarea.style.boxShadow = 'none';
      // Clean up empty bullets when leaving the textarea
      const cleaned = formatNotepadText(textarea.value, { keepEmptyBullets: false });
      if (cleaned !== textarea.value) {
        undoManager.record(textarea.value, textarea.selectionStart, true);
        textarea.value = cleaned;
        undoManager.record(textarea.value, textarea.selectionStart, true);
      }
      updateNotepadCounts();
      triggerNotepadSave();
    });

    textarea.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.isComposing) return;

      const isMod = e.metaKey || e.ctrlKey;

      // Undo (Cmd+Z or Ctrl+Z)
      if (isMod && !e.altKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        const prevState = undoManager.undo(textarea.value, textarea.selectionStart);
        if (prevState) {
          undoManager.isApplying = true;
          textarea.value = prevState.value;
          textarea.setSelectionRange(prevState.cursor, prevState.cursor);
          undoManager.isApplying = false;
          updateNotepadCounts();
          triggerNotepadSave();
        }
        return;
      }

      // Redo (Cmd+Shift+Z, Ctrl+Shift+Z, or Ctrl+Y)
      if (isMod && !e.altKey && (((e.key === 'z' || e.key === 'Z') && e.shiftKey) || e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        const nextState = undoManager.redo();
        if (nextState) {
          undoManager.isApplying = true;
          textarea.value = nextState.value;
          textarea.setSelectionRange(nextState.cursor, nextState.cursor);
          undoManager.isApplying = false;
          updateNotepadCounts();
          triggerNotepadSave();
        }
        return;
      }

      const val = textarea.value;
      const cursor = textarea.selectionStart;

      // 1. Enter Key
      if (e.key === 'Enter') {
        const linesBefore = val.substring(0, cursor).split('\n');
        const lineIndex = linesBefore.length - 1;
        const allLines = val.split('\n');
        const curLine = allLines[lineIndex] || '';

        // Case A: If current line is an empty bullet (e.g. "2. " or "2.")
        if (/^\s*\d+[\.\)]\s*$/.test(curLine)) {
          e.preventDefault();
          undoManager.record(val, cursor, true);
          allLines[lineIndex] = '';
          textarea.value = formatNotepadText(allLines.join('\n'));
          let newPos = 0;
          for (let i = 0; i < lineIndex; i++) {
            newPos += allLines[i].length + 1;
          }
          textarea.setSelectionRange(newPos, newPos);
          undoManager.record(textarea.value, newPos, true);
          updateNotepadCounts();
          triggerNotepadSave();
          return;
        }

        // Case B: If current line is a company line (not a # header/comment)
        const isHeader = curLine.trim().startsWith('#') || /^\s*\d+[\.\)]\s*#/.test(curLine);
        if (!isHeader && curLine.trim().length > 0) {
          e.preventDefault();
          undoManager.record(val, cursor, true);
          // Count companies up to this line
          let countUpToNow = 0;
          for (let i = 0; i <= lineIndex; i++) {
            const lTrim = allLines[i].trim();
            if (lTrim && !lTrim.startsWith('#') && !/^\s*\d+[\.\)]\s*#/.test(allLines[i])) {
              countUpToNow++;
            }
          }
          const nextNum = countUpToNow + 1;
          const bulletToInsert = `\n${nextNum}. `;
          const before = val.substring(0, cursor);
          const after = val.substring(cursor);
          const updatedVal = formatNotepadText(before + bulletToInsert + after, { keepEmptyBullets: true });
          textarea.value = updatedVal;
          const newPos = cursor + bulletToInsert.length;
          textarea.setSelectionRange(newPos, newPos);
          undoManager.record(textarea.value, newPos, true);
          updateNotepadCounts();
          triggerNotepadSave();
          return;
        }
      }

      // 2. Backspace Key on empty bullet
      if (e.key === 'Backspace') {
        if (cursor === textarea.selectionEnd) {
          const linesBefore = val.substring(0, cursor).split('\n');
          const lineIndex = linesBefore.length - 1;
          const allLines = val.split('\n');
          const curLine = allLines[lineIndex] || '';

          if (/^\s*\d+[\.\)]\s*$/.test(curLine)) {
            e.preventDefault();
            undoManager.record(val, cursor, true);
            allLines[lineIndex] = '';
            textarea.value = formatNotepadText(allLines.join('\n'));
            let newPos = 0;
            for (let i = 0; i < lineIndex; i++) {
              newPos += allLines[i].length + 1;
            }
            textarea.setSelectionRange(newPos, newPos);
            undoManager.record(textarea.value, newPos, true);
            updateNotepadCounts();
            triggerNotepadSave();
            return;
          }
        }
      }

      // 3. '#' Key pressed while on an empty bullet
      if (e.key === '#') {
        if (cursor === textarea.selectionEnd) {
          const linesBefore = val.substring(0, cursor).split('\n');
          const lineIndex = linesBefore.length - 1;
          const allLines = val.split('\n');
          const curLine = allLines[lineIndex] || '';

          if (/^\s*\d+[\.\)]\s*$/.test(curLine)) {
            e.preventDefault();
            undoManager.record(val, cursor, true);
            allLines[lineIndex] = '# ';
            textarea.value = formatNotepadText(allLines.join('\n'));
            let newPos = 0;
            for (let i = 0; i < lineIndex; i++) {
              newPos += allLines[i].length + 1;
            }
            newPos += 2; // after "# "
            textarea.setSelectionRange(newPos, newPos);
            undoManager.record(textarea.value, newPos, true);
            updateNotepadCounts();
            triggerNotepadSave();
            return;
          }
        }
      }
    });

    textarea.addEventListener('input', () => {
      undoManager.record(textarea.value, textarea.selectionStart);
      applyAutoNumbering(textarea, undoManager);
    });

    textarea.addEventListener('paste', () => {
      undoManager.record(textarea.value, textarea.selectionStart, true);
      setTimeout(() => applyAutoNumbering(textarea, undoManager), 0);
    });

    textarea.addEventListener('keyup', (e) => e.stopPropagation());
    textarea.addEventListener('keypress', (e) => e.stopPropagation());

    col.appendChild(colHeader);
    col.appendChild(textarea);
    return col;
  }

  // Section 1: Top Companies
  const topCol = createColumn(
    'Top Companies',
    '⭐',
    '#f59e0b',
    'Write top companies in priority order...\n(e.g., Google\nUber\nTower Research)\nAuto-numbers 1, 2, 3... # lines are not counted',
    'top',
    'ocs-top-count',
    'ocs-notepad-top-text'
  );

  // Vertical Divider
  const divider = document.createElement('div');
  Object.assign(divider.style, {
    width: '1px',
    backgroundColor: '#27272a',
    margin: '4px 0'
  });

  // Section 2: Decent Companies
  const decentCol = createColumn(
    'Decent Companies',
    '👍',
    '#60a5fa',
    'Write decent companies in priority order...\n(e.g., Oracle\nQualcomm\nSamsung)\nAuto-numbers 1, 2, 3... # lines are not counted',
    'decent',
    'ocs-decent-count',
    'ocs-notepad-decent-text'
  );

  body.appendChild(topCol);
  body.appendChild(divider);
  body.appendChild(decentCol);

  // Footer Bar
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    padding: '7px 14px',
    backgroundColor: '#1b1b1f',
    borderTop: '1px solid #28282e',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
    color: '#71717a'
  });
  footer.innerHTML = `
    <span id="ocs-footer-total" style="color: #e4e4e7; font-weight: 600;">Total: 0 (0 Top + 0 Decent)</span>
    <span style="font-size: 10px; color: #52525b; margin-right: 16px;">Auto-saved • Drag to move / Corner to resize</span>
  `;

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  document.body.appendChild(panel);

  updateNotepadCounts();
  setupNotepadDrag(panel, header);
  setupNotepadResize(panel);
}

// Helpers for Notepad
let notepadSaveTimer = null;
let notepadStatusTimer = null;

// Undo & Redo History Manager for Notepad Textareas
class NotepadUndoManager {
  constructor(initialVal = '') {
    this.undoStack = [{ value: initialVal, cursor: initialVal.length }];
    this.redoStack = [];
    this.lastPushTime = 0;
    this.isApplying = false;
  }

  record(val, cursor, force = false) {
    if (this.isApplying) return;
    const current = this.undoStack[this.undoStack.length - 1];
    if (current && current.value === val) {
      current.cursor = cursor;
      return;
    }
    const now = Date.now();
    // Group rapid continuous typing within 500ms
    if (!force && current && (now - this.lastPushTime < 500)) {
      current.value = val;
      current.cursor = cursor;
      this.lastPushTime = now;
      return;
    }
    this.undoStack.push({ value: val, cursor });
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
    this.lastPushTime = now;
  }

  undo(currentVal, currentCursor) {
    if (this.undoStack.length <= 1) return null;
    const current = this.undoStack.pop();
    this.redoStack.push({ value: currentVal, cursor: currentCursor });
    return this.undoStack[this.undoStack.length - 1];
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    return next;
  }
}

// Format notepad lines with 1-based sequential numbering.
// Lines starting with # are comments/headers and are never counted or numbered.
// CRITICAL: Whitespace and intra-line spaces are strictly preserved.
function formatNotepadText(text, options = { keepEmptyBullets: true }) {
  if (typeof text !== 'string') return '';
  const lines = text.split('\n');
  let companyIndex = 1;
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 1. Empty or whitespace-only line: preserve whitespace as is
    if (!trimmed) {
      newLines.push(rawLine);
      continue;
    }

    // 2. Line starts with # (or accidentally prefixed like "1. #")
    // Rule: If # is at the start of the line, don't count or number that
    if (trimmed.startsWith('#') || /^\s*\d+[\.\)]\s*#/.test(rawLine)) {
      const cleanHeader = rawLine.replace(/^\s*\d+[\.\)]\s*(#.*)$/, '$1');
      newLines.push(cleanHeader);
      continue;
    }

    // 3. Line is just a bullet with no content yet (e.g. "1.", "1. ", "2. ")
    const bulletOnlyMatch = rawLine.match(/^(\s*)(\d+)[\.\)]\s*$/);
    if (bulletOnlyMatch) {
      if (options.keepEmptyBullets) {
        newLines.push(`${companyIndex}. `);
      } else {
        newLines.push('');
      }
      continue;
    }

    // 4. Line already has a number prefix: e.g. "1. Google" or "1. Tower "
    const numMatch = rawLine.match(/^(\s*)(\d+)[\.\)]\s*(.*)$/);
    if (numMatch) {
      const num = parseInt(numMatch[2], 10);
      const rest = numMatch[3]; // Keep exact rest, DO NOT trim to preserve spaces!
      if (num === companyIndex) {
        newLines.push(rawLine); // Already correct index, keep exact raw line
      } else {
        newLines.push(`${companyIndex}. ${rest}`);
      }
      companyIndex++;
      continue;
    }

    // 5. Line has content but NO number prefix at all (e.g. user typed "Google" or pasted)
    newLines.push(`${companyIndex}. ${rawLine.trimStart()}`);
    companyIndex++;
  }

  return newLines.join('\n');
}

// Count companies in text, ignoring lines starting with # and empty bullets
function getCompanyCount(text) {
  if (!text) return 0;
  return text.split('\n').filter(l => {
    const trimmed = l.trim();
    if (!trimmed || trimmed.startsWith('#')) return false;
    const company = trimmed.replace(/^\d+[\.\)]\s*/, '').trim();
    return company.length > 0;
  }).length;
}

// Apply auto-numbering to a textarea while accurately preserving cursor position and undo history
function applyAutoNumbering(textarea, undoManager, options = {}) {
  if (!textarea) return;

  const originalValue = textarea.value;
  const cursorStart = textarea.selectionStart;

  // 1. Determine which line the cursor is on and the cursor's column within that line
  const linesBeforeCursor = originalValue.substring(0, cursorStart).split('\n');
  const cursorLineIndex = linesBeforeCursor.length - 1;
  const originalLine = originalValue.split('\n')[cursorLineIndex] || '';
  const cursorCol = linesBeforeCursor[linesBeforeCursor.length - 1].length;

  // Determine cursor offset relative to content (excluding existing number prefix)
  const prefixMatch = originalLine.match(/^(\s*\d+[\.\)]\s*)/);
  const oldPrefixLength = prefixMatch ? prefixMatch[1].length : 0;

  let contentOffset;
  if (cursorCol <= oldPrefixLength) {
    contentOffset = 0;
  } else {
    contentOffset = cursorCol - oldPrefixLength;
  }

  // 2. Generate formatted text
  const formattedValue = formatNotepadText(originalValue, {
    keepEmptyBullets: options.keepEmptyBullets !== false
  });

  // If nothing changed, do not touch textarea.value (preserves native spaces & undo stack)
  if (formattedValue === originalValue) {
    updateNotepadCounts();
    return;
  }

  // Record state prior to programmatic change
  if (undoManager) {
    undoManager.record(originalValue, cursorStart, true);
  }

  // 3. Update textarea.value
  textarea.value = formattedValue;

  // 4. Calculate new cursor position
  const newLines = formattedValue.split('\n');
  const clampedLineIndex = Math.min(cursorLineIndex, newLines.length - 1);
  const newLine = newLines[clampedLineIndex] || '';

  const newPrefixMatch = newLine.match(/^(\s*\d+[\.\)]\s*)/);
  const newPrefixLength = newPrefixMatch ? newPrefixMatch[1].length : 0;

  let newCol;
  if (newLine.trim().startsWith('#')) {
    newCol = Math.min(newLine.length, cursorCol);
  } else if (newPrefixLength > 0) {
    newCol = Math.min(newLine.length, newPrefixLength + contentOffset);
  } else {
    newCol = Math.min(newLine.length, contentOffset);
  }

  let newCursorPos = 0;
  for (let i = 0; i < clampedLineIndex; i++) {
    newCursorPos += newLines[i].length + 1;
  }
  newCursorPos += newCol;

  textarea.setSelectionRange(newCursorPos, newCursorPos);

  if (undoManager) {
    undoManager.record(formattedValue, newCursorPos, true);
  }

  // Update counts and trigger debounce save
  updateNotepadCounts();
  triggerNotepadSave();
}

function flashNotepadStatus(text = 'Saved ✓') {
  const statusEl = document.getElementById('ocs-notepad-status');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.opacity = '1';
  clearTimeout(notepadStatusTimer);
  notepadStatusTimer = setTimeout(() => {
    statusEl.style.opacity = '0';
  }, 1500);
}

function updateNotepadCounts() {
  const topText = document.getElementById('ocs-notepad-top-text');
  const decentText = document.getElementById('ocs-notepad-decent-text');
  const topBadge = document.getElementById('ocs-top-count');
  const decentBadge = document.getElementById('ocs-decent-count');
  const totalBadge = document.getElementById('ocs-total-count');
  const footerTotal = document.getElementById('ocs-footer-total');
  const notepadBtn = document.getElementById('ocs-notepad-btn');

  let topCount = 0;
  let decentCount = 0;

  if (topText) {
    topCount = getCompanyCount(topText.value);
    if (topBadge) topBadge.textContent = `${topCount} ${topCount === 1 ? 'company' : 'companies'}`;
  }
  if (decentText) {
    decentCount = getCompanyCount(decentText.value);
    if (decentBadge) decentBadge.textContent = `${decentCount} ${decentCount === 1 ? 'company' : 'companies'}`;
  }

  const totalCount = topCount + decentCount;

  if (totalBadge) {
    totalBadge.textContent = `Total: ${totalCount}`;
  }
  if (footerTotal) {
    footerTotal.textContent = `Total: ${totalCount} (${topCount} Top + ${decentCount} Decent)`;
  }
  if (notepadBtn) {
    notepadBtn.innerHTML = totalCount > 0 ? `📝 Notepad (${totalCount})` : '📝 Notepad';
  }
}

function triggerNotepadSave() {
  updateNotepadCounts();
  const topText = document.getElementById('ocs-notepad-top-text');
  const decentText = document.getElementById('ocs-notepad-decent-text');
  if (!topText || !decentText) return;

  const statusEl = document.getElementById('ocs-notepad-status');
  if (statusEl) {
    statusEl.textContent = 'Saving...';
    statusEl.style.opacity = '0.7';
  }

  clearTimeout(notepadSaveTimer);
  notepadSaveTimer = setTimeout(() => {
    notepadData = {
      top: topText.value,
      decent: decentText.value
    };
    chrome.storage.local.set({ notepadData }, () => {
      flashNotepadStatus('Saved ✓');
    });
  }, 250);
}

function syncNotepadFromStorage() {
  const topText = document.getElementById('ocs-notepad-top-text');
  const decentText = document.getElementById('ocs-notepad-decent-text');
  if (topText && document.activeElement !== topText) {
    topText.value = formatNotepadText(notepadData.top || '', { keepEmptyBullets: false });
  }
  if (decentText && document.activeElement !== decentText) {
    decentText.value = formatNotepadText(notepadData.decent || '', { keepEmptyBullets: false });
  }
  updateNotepadCounts();
}

function setNotepadOpenState(isOpen, saveState = true) {
  isNotepadOpen = isOpen;
  const panel = document.getElementById('ocs-notepad-panel');
  const notepadBtn = document.getElementById('ocs-notepad-btn');

  if (panel) {
    panel.style.display = isNotepadOpen ? 'flex' : 'none';
  }
  if (notepadBtn) {
    notepadBtn.style.backgroundColor = isNotepadOpen ? '#2563eb' : '#18181b';
    notepadBtn.style.borderColor = isNotepadOpen ? '#3b82f6' : '#33333d';
  }

  updateNotepadCounts();

  if (saveState) {
    chrome.storage.local.set({ isNotepadOpen });
  }
}

function setupNotepadDrag(panel, header) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let panelLeft = 0;
  let panelTop = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.closest('.ocs-resize-handle')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = panel.getBoundingClientRect();
    panelLeft = rect.left;
    panelTop = rect.top;

    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newX = panelLeft + dx;
    let newY = panelTop + dy;

    newX = Math.max(10, Math.min(window.innerWidth - panel.offsetWidth - 10, newX));
    newY = Math.max(10, Math.min(window.innerHeight - panel.offsetHeight - 10, newY));

    panel.style.left = `${newX}px`;
    panel.style.top = `${newY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'move';
    }
  });

  header.addEventListener('dblclick', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('.ocs-resize-handle')) return;
    panel.style.left = 'auto';
    panel.style.top = 'auto';
    panel.style.bottom = '78px';
    panel.style.right = '24px';
  });
}

function setupNotepadResize(panel) {
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;
  let startLeft = 0;
  let startTop = 0;
  let activeDir = '';

  const minWidth = 380;
  const minHeight = 220;

  function onPointerDown(e, dir) {
    e.stopPropagation();
    e.preventDefault();
    isResizing = true;
    activeDir = dir;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;

    const rect = panel.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    startLeft = rect.left;
    startTop = rect.top;

    // If resizing from bottom or right while docked to bottom/right:
    // Convert to top/left anchor so expanding downwards/rightwards doesn't push offscreen
    if ((dir.includes('s') || dir.includes('e')) && panel.style.bottom !== 'auto') {
      panel.style.top = `${startTop}px`;
      panel.style.left = `${startLeft}px`;
      panel.style.bottom = 'auto';
      panel.style.right = 'auto';
    }

    document.body.style.userSelect = 'none';
  }

  function onPointerMove(e) {
    if (!isResizing) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - startX;
    const dy = clientY - startY;

    const maxWidth = Math.max(minWidth, window.innerWidth - 48);
    const maxHeight = Math.max(minHeight, window.innerHeight - 100);

    let newWidth = startWidth;
    let newHeight = startHeight;

    const isAnchoredTopLeft = panel.style.bottom === 'auto' && panel.style.top !== 'auto';

    if (activeDir.includes('w')) {
      newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth - dx));
      if (isAnchoredTopLeft) {
        panel.style.left = `${startLeft - (newWidth - startWidth)}px`;
      }
    } else if (activeDir.includes('e')) {
      newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
    }

    if (activeDir.includes('n')) {
      newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight - dy));
      if (isAnchoredTopLeft) {
        panel.style.top = `${startTop - (newHeight - startHeight)}px`;
      }
    } else if (activeDir.includes('s')) {
      newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + dy));
    }

    panel.style.width = `${Math.round(newWidth)}px`;
    panel.style.height = `${Math.round(newHeight)}px`;
  }

  function onPointerUp() {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.userSelect = '';

    const rect = panel.getBoundingClientRect();
    notepadSize = {
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
    chrome.storage.local.set({ notepadSize });
  }

  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('mouseup', onPointerUp);
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp);

  function createHandle(dir, cursor, style, content = '') {
    const handle = document.createElement('div');
    handle.className = `ocs-resize-handle ocs-resize-${dir}`;
    handle.title = 'Drag corner or edge to resize • Double-click to reset size';
    Object.assign(handle.style, {
      position: 'absolute',
      zIndex: '1000',
      cursor: cursor,
      userSelect: 'none',
      boxSizing: 'border-box',
      ...style
    });
    if (content) handle.innerHTML = content;

    handle.addEventListener('mousedown', (e) => onPointerDown(e, dir));
    handle.addEventListener('touchstart', (e) => onPointerDown(e, dir), { passive: false });

    // Double-click resets size to default (560x330)
    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      notepadSize = { width: 560, height: 330 };
      panel.style.width = '560px';
      panel.style.height = '330px';
      chrome.storage.local.set({ notepadSize });
      flashNotepadStatus('Size: 560×330 ✓');
    });

    panel.appendChild(handle);
    return handle;
  }

  // 1. Top-Left Corner Handle (with stylish visual grip icon)
  createHandle('nw', 'nwse-resize', {
    top: '0',
    left: '0',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#71717a',
    transition: 'color 0.15s'
  }, '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 9V2H9M2 2L10 10"/></svg>');

  // 2. Bottom-Right Corner Handle (with classic triangle grip indicator)
  createHandle('se', 'nwse-resize', {
    bottom: '0',
    right: '0',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: '4px',
    color: '#71717a',
    transition: 'color 0.15s'
  }, '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M9 1L10 1L10 10L1 10L1 9L9 9Z M6 5L7 5L7 10L6 10Z M3 8L4 8L4 10L3 10Z"/></svg>');

  // 3. Top-Right Corner Handle
  createHandle('ne', 'nesw-resize', {
    top: '0',
    right: '0',
    width: '16px',
    height: '16px'
  });

  // 4. Bottom-Left Corner Handle
  createHandle('sw', 'nesw-resize', {
    bottom: '0',
    left: '0',
    width: '16px',
    height: '16px'
  });

  // 5. Four edge strips for seamless borders resizing
  createHandle('n', 'ns-resize', { top: '0', left: '24px', right: '24px', height: '6px' });
  createHandle('s', 'ns-resize', { bottom: '0', left: '20px', right: '20px', height: '6px' });
  createHandle('w', 'ew-resize', { left: '0', top: '24px', bottom: '20px', width: '6px' });
  createHandle('e', 'ew-resize', { right: '0', top: '24px', bottom: '20px', width: '6px' });
}

let scrollThrottleTimer = null;
function handleVirtualScroll() {
  if (scrollThrottleTimer) return;
  scrollThrottleTimer = requestAnimationFrame(() => {
    scrollThrottleTimer = null;
    processAllVisibleRows();
  });
}

let isProcessingRows = false;
function processAllVisibleRows() {
  if (isProcessingRows) return;
  isProcessingRows = true;
  try {
    const rows = document.querySelectorAll('.MuiDataGrid-row:not(.MuiDataGrid-columnHeaders)');
    rows.forEach(processRow);
  } finally {
    isProcessingRows = false;
  }
}

let activeScrollTargets = new WeakSet();
function attachScrollListeners() {
  const targets = [
    window,
    document,
    document.getElementById('student-main'),
    document.querySelector('.MuiDataGrid-virtualScroller'),
    document.querySelector('.MuiDataGrid-root')
  ].filter(Boolean);

  targets.forEach(target => {
    if (!activeScrollTargets.has(target)) {
      target.addEventListener('scroll', handleVirtualScroll, { passive: true });
      activeScrollTargets.add(target);
    }
  });
}

function startObserving(scroller) {
  if (observer) observer.disconnect();
  
  attachScrollListeners();

  observer = new MutationObserver((mutations) => {
    if (isProcessingRows) return;
    let shouldReprocess = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === 1 && (node.classList?.contains('MuiDataGrid-row') || node.querySelector?.('.MuiDataGrid-row'))) {
            shouldReprocess = true;
            break;
          }
        }
        if (shouldReprocess) break;
      }
    }
    if (shouldReprocess) {
      expandDataGridToFull();
      handleVirtualScroll();
    }
  });

  const rootOrScroller = document.querySelector('.MuiDataGrid-virtualScrollerRenderZone') || 
                         document.querySelector('.MuiDataGrid-virtualScroller') || 
                         document.querySelector('.MuiDataGrid-root, [role="grid"]') || 
                         scroller;

  if (rootOrScroller) {
    observer.observe(rootOrScroller, {
      childList: true,
      subtree: true
    });
  }
}

function getRowCompany(row) {
  if (!row) return '';
  const cell = row.querySelector('[data-field="company" i], [data-field="company_name" i], [data-field="organization" i], [data-field="employer" i]');
  if (cell) {
    const cellTitle = cell.getAttribute('title');
    if (cellTitle && cellTitle.trim()) return cleanText(cellTitle).toLowerCase();

    const content = cell.querySelector('.MuiDataGrid-cellContent');
    if (content) {
      const contentTitle = content.getAttribute('title');
      if (contentTitle && contentTitle.trim()) return cleanText(contentTitle).toLowerCase();
      const txt = cleanText(content.textContent).toLowerCase();
      if (txt) return txt;
    }

    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.ocs-action-btn, .ocs-note-container, button, input').forEach(el => el.remove());
    return cleanText(clone.textContent).toLowerCase();
  }
  const firstCell = row.querySelector('.MuiDataGrid-cell');
  if (firstCell) {
    const clone = firstCell.cloneNode(true);
    clone.querySelectorAll('.ocs-action-btn, .ocs-note-container, button, input').forEach(el => el.remove());
    return cleanText(clone.textContent).toLowerCase();
  }
  return '';
}

function getRowTitle(row) {
  if (!row) return '';
  const cell = row.querySelector('[data-field="title" i], [data-field="role" i], [data-field="designation" i], [data-field="profile" i], [data-field="job_title" i]');
  if (cell) {
    const cellTitle = cell.getAttribute('title');
    if (cellTitle && cellTitle.trim()) return cleanText(cellTitle).toLowerCase();

    const content = cell.querySelector('.MuiDataGrid-cellContent');
    if (content) {
      const contentTitle = content.getAttribute('title');
      if (contentTitle && contentTitle.trim()) return cleanText(contentTitle).toLowerCase();
      const txt = cleanText(content.textContent).toLowerCase();
      if (txt) return txt;
    }

    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.ocs-note-container, .ocs-action-btn, button, input').forEach(el => el.remove());
    return cleanText(clone.textContent).toLowerCase();
  }
  const cells = row.querySelectorAll('.MuiDataGrid-cell');
  if (cells && cells.length > 1) {
    const clone = cells[1].cloneNode(true);
    clone.querySelectorAll('.ocs-note-container, .ocs-action-btn, button, input').forEach(el => el.remove());
    return cleanText(clone.textContent).toLowerCase();
  }
  return '';
}

function getRowIdentifier(row) {
  if (!row) return null;
  const company = getRowCompany(row);
  const title = getRowTitle(row);
  const dataId = row.getAttribute('data-id') || row.getAttribute('data-rowindex') || row.getAttribute('id');
  if (company && title) {
    return `${company}|${title}`;
  }
  if (company) {
    return `${company}|${dataId || '0'}`;
  }
  return dataId || null;
}

function isRowHidden(row) {
  if (!hiddenRoles || hiddenRoles.length === 0) return false;

  const company = getRowCompany(row);
  const title = getRowTitle(row);
  const dataId = row.getAttribute('data-id');

  if (!company && !title && !dataId) return false;

  return hiddenRoles.some(r => {
    const rComp = cleanText(r.company || '').toLowerCase();
    const rTitle = cleanText(r.title || '').toLowerCase();

    // 1. Primary: exact or prefix match by company AND role title
    if (rComp && company) {
      const compMatches = (rComp === company) || 
        (rComp.length > 4 && (company.startsWith(rComp.replace(/\.+$/, '')) || rComp.startsWith(company.replace(/\.+$/, ''))));
      if (compMatches) {
        // If both have titles, require the title to match!
        if (rTitle && title && rTitle !== 'unknown' && title !== 'unknown') {
          return (rTitle === title) || 
            (rTitle.length > 4 && (title.startsWith(rTitle.replace(/\.+$/, '')) || rTitle.startsWith(title.replace(/\.+$/, ''))));
        }

        // If one is missing a title, match by dataId
        if (dataId && r.posting_id && String(r.posting_id) === String(dataId)) {
          return true;
        }

        // Never hide different roles of the same company!
        return false;
      }
    }

    // 2. Fallback: only if posting_id is a unique alphanumeric ID (NEVER a small numeric row index like "0", "1")
    if (dataId && r.posting_id && String(r.posting_id) === String(dataId)) {
      if (!/^\d{1,2}$/.test(String(dataId))) {
        return true;
      }
    }
    return false;
  });
}

function processRow(row) {
  // CRITICAL: Skip header row or non-data rows
  if (!row || !row.classList || !row.classList.contains('MuiDataGrid-row')) return;
  if (row.classList.contains('MuiDataGrid-columnHeaders') || row.closest('.MuiDataGrid-columnHeaders')) return;

  const comp = getRowCompany(row);
  const ttl = getRowTitle(row);
  const dataId = row.getAttribute('data-id') || `${comp}|${ttl}`;
  if (!comp && !ttl && !row.getAttribute('data-id')) return;

  const isHidden = isRowHidden(row);
  const noteKey = (comp && ttl) ? `${comp}|${ttl}` : (comp || dataId);
  const noteText = roleNotes[noteKey] || (dataId ? roleNotes[dataId] : '') || '';

  // Idempotency state guard: abort if row is already in the expected visual state
  const stateKey = `${dataId}::${comp}::${ttl}::${isHidden}::${showHiddenRoles}::${noteText}`;
  if (row.dataset.ocsStateKey === stateKey) {
    return;
  }
  row.dataset.ocsStateKey = stateKey;

  // Manage visibility & Hide/Unhide Buttons
  if (isHidden) {
    if (showHiddenRoles) {
      row.classList.remove('ocs-row-hidden');
      row.classList.add('ocs-row-dimmed');
      row.style.removeProperty('display');
      row.style.opacity = '0.35';
      row.style.filter = 'grayscale(100%)';
      injectActionButtons(row, true);
    } else {
      row.classList.remove('ocs-row-dimmed');
      row.classList.add('ocs-row-hidden');
      row.style.setProperty('display', 'none', 'important');
    }
  } else {
    row.classList.remove('ocs-row-hidden', 'ocs-row-dimmed');
    row.style.removeProperty('display');
    row.style.opacity = '1';
    row.style.filter = 'none';
    injectActionButtons(row, false);
  }

  // Inject Features
  injectNote(row);
  highlightDeadlineAndApplied(row);
}

// 2. Action Buttons (Hide/Unhide)
function injectActionButtons(row, isHiddenMode) {
  const companyCell = row.querySelector('[data-field="company" i], [data-field="company_name" i], [data-field="organization" i], [data-field="employer" i]') ||
                      row.querySelector('.MuiDataGrid-cell');
  if (!companyCell) return;

  let actionBtn = companyCell.querySelector('.ocs-action-btn');
  if (!actionBtn) {
    actionBtn = document.createElement('button');
    actionBtn.className = 'ocs-action-btn';
    
    companyCell.style.display = 'flex';
    companyCell.style.alignItems = 'center';
    companyCell.style.justifyContent = 'space-between';
    companyCell.appendChild(actionBtn);

    actionBtn.addEventListener('mouseenter', () => {
      if (actionBtn.dataset.mode === 'hide') actionBtn.style.opacity = '1';
    });
    actionBtn.addEventListener('mouseleave', () => {
      if (actionBtn.dataset.mode === 'hide') actionBtn.style.opacity = '0.2';
    });
  }

  const desiredMode = isHiddenMode ? 'unhide' : 'hide';
  if (actionBtn.dataset.mode !== desiredMode) {
    actionBtn.dataset.mode = desiredMode;
    if (isHiddenMode) {
      actionBtn.textContent = 'Unhide';
      Object.assign(actionBtn.style, {
        marginLeft: 'auto', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
        backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px',
        fontWeight: 'bold', opacity: '1', zIndex: '10', transition: 'none', pointerEvents: 'auto'
      });
      actionBtn.onmousedown = (e) => {
        e.stopPropagation(); e.preventDefault();
        unhideRole(row);
      };
    } else {
      actionBtn.textContent = 'Hide';
      Object.assign(actionBtn.style, {
        marginLeft: 'auto', padding: '2px 8px', fontSize: '11px', cursor: 'pointer',
        backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px',
        fontWeight: '600', opacity: '0.2', transition: 'opacity 0.2s', zIndex: '10', pointerEvents: 'auto'
      });
      actionBtn.onmousedown = (e) => {
        e.stopPropagation(); e.preventDefault();
        hideRole(row);
      };
    }
  }
}

function unhideRole(row) {
  const comp = getRowCompany(row);
  const ttl = getRowTitle(row);
  const dataId = row.getAttribute('data-id');

  hiddenRoles = hiddenRoles.filter(r => {
    const rComp = cleanText(r.company || '').toLowerCase();
    const rTitle = cleanText(r.title || '').toLowerCase();
    
    if (comp && rComp) {
      const compMatches = (rComp === comp) || (rComp.length > 4 && (comp.startsWith(rComp.replace(/\.+$/, '')) || rComp.startsWith(comp.replace(/\.+$/, ''))));
      if (compMatches) {
        if (ttl && rTitle && rTitle !== 'unknown') {
          const ttlMatches = (rTitle === ttl) || (rTitle.length > 4 && (ttl.startsWith(rTitle.replace(/\.+$/, '')) || rTitle.startsWith(ttl.replace(/\.+$/, ''))));
          if (ttlMatches) {
            return false; // Remove this specific role only
          }
          return true; // Keep other roles of the same company
        }
        if (dataId && r.posting_id && String(r.posting_id) === String(dataId)) {
          return false;
        }
        return true;
      }
    }
    if (dataId && r.posting_id && String(r.posting_id) === String(dataId)) {
      return false;
    }
    return true;
  });

  delete row.dataset.ocsStateKey;
  chrome.storage.local.set({ hiddenRoles }, () => {
    processRow(row);
  });
}

function hideRole(row) {
  const comp = getRowCompany(row);
  const ttl = getRowTitle(row);
  const dataId = row.getAttribute('data-id') || `${comp}|${ttl}`;
  
  hiddenRoles.push({
    posting_id: dataId,
    company: comp || 'Unknown',
    title: ttl || 'Unknown',
    hiddenAt: Date.now()
  });

  delete row.dataset.ocsStateKey;
  chrome.storage.local.set({ hiddenRoles }, () => {
    processRow(row);
  });
}

// 3. Custom Tags & Notes
function injectNote(row) {
  const comp = getRowCompany(row);
  const ttl = getRowTitle(row);
  const dataId = row.getAttribute('data-id');
  const noteKey = (comp && ttl) ? `${comp}|${ttl}` : (comp || dataId);
  if (!noteKey) return;

  const cells = row.querySelectorAll('.MuiDataGrid-cell');
  const titleCell = row.querySelector('[data-field="title" i], [data-field="role" i], [data-field="designation" i], [data-field="profile" i], [data-field="job_title" i]') ||
                    (cells.length > 1 ? cells[1] : null);
  if (!titleCell) return;

  // Don't interrupt if the user is currently typing a note in this cell
  if (titleCell.querySelector('.ocs-note-input')) return;

  let noteContainer = titleCell.querySelector('.ocs-note-container');
  if (!noteContainer) {
    noteContainer = document.createElement('div');
    noteContainer.className = 'ocs-note-container';
    noteContainer.style.marginLeft = '10px';
    noteContainer.style.display = 'flex';
    noteContainer.style.alignItems = 'center';

    titleCell.style.display = 'flex';
    titleCell.style.alignItems = 'center';
    titleCell.appendChild(noteContainer);
  }

  const text = roleNotes[noteKey] || (dataId ? roleNotes[dataId] : null) || '';

  if (noteContainer.dataset.renderedNote !== text) {
    noteContainer.dataset.renderedNote = text;
    noteContainer.innerHTML = '';

    const badge = document.createElement('span');
    badge.className = 'ocs-note-badge';
    Object.assign(badge.style, {
      padding: '2px 6px', fontSize: '10px', borderRadius: '12px',
      cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap',
      transition: 'all 0.2s ease', display: 'inline-block',
      pointerEvents: 'auto', zIndex: '10'
    });

    if (text) {
      badge.textContent = text;
      badge.style.backgroundColor = '#ffd700'; // Gold badge
      badge.style.color = '#000';
      badge.style.border = 'none';
      badge.title = `Note: ${text} (Click to edit)`;
    } else {
      badge.textContent = '+ Note';
      badge.style.backgroundColor = 'transparent';
      badge.style.color = '#999';
      badge.style.border = '1px dashed #ccc';
      badge.title = 'Add note';
    }

    badge.onmousedown = (e) => {
      e.stopPropagation();
      e.preventDefault();

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'ocs-note-input';
      input.value = text || '';
      input.placeholder = 'Type & press Enter...';
      Object.assign(input.style, {
        padding: '2px 6px', fontSize: '10px', borderRadius: '4px',
        border: '1px solid #666', outline: 'none', width: '130px',
        backgroundColor: '#fff', color: '#000', cursor: 'text',
        pointerEvents: 'auto', zIndex: '10'
      });

      input.addEventListener('keydown', (ke) => {
        ke.stopPropagation();
        if (ke.key === 'Enter') {
          saveNote();
        } else if (ke.key === 'Escape') {
          delete row.dataset.ocsStateKey;
          delete noteContainer.dataset.renderedNote;
          processRow(row);
        }
      });

      input.addEventListener('mousedown', (me) => me.stopPropagation());
      input.addEventListener('click', (ce) => ce.stopPropagation());

      const saveNote = () => {
        const newNote = input.value.trim();
        if (newNote === '') {
          delete roleNotes[noteKey];
          if (dataId) delete roleNotes[dataId];
        } else {
          roleNotes[noteKey] = newNote;
        }
        delete row.dataset.ocsStateKey;
        delete noteContainer.dataset.renderedNote;
        chrome.storage.local.set({ roleNotes }, () => {
          processRow(row);
        });
      };

      input.addEventListener('blur', saveNote);

      noteContainer.innerHTML = '';
      noteContainer.appendChild(input);
      input.focus();
    };

    noteContainer.appendChild(badge);
  }
}

// 4. Deadline & Applied Status Highlighting
function highlightDeadlineAndApplied(row) {
  let appliedCell = row.querySelector('[data-field="applied" i], [data-field="registered" i], [data-field="status" i]');
  let deadlineCell = row.querySelector('[data-field="deadline" i], [data-field="last_date" i]');

  // Fallback to find cells by content if data-field is not matched
  const cells = Array.from(row.querySelectorAll('.MuiDataGrid-cell'));
  if (!appliedCell) {
    appliedCell = cells.find(c => {
      const txt = c.textContent.trim().toUpperCase();
      return txt === 'YES' || txt === 'NO' || txt === 'APPLIED' || txt === 'REGISTERED';
    });
  }

  if (!deadlineCell) {
    deadlineCell = cells.find(c => {
      const txt = c.textContent.trim();
      return /\b\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\b/.test(txt) || /\d{4}-\d{2}-\d{2}/.test(txt);
    });
  }

  // 1. Highlight applied status independently
  if (appliedCell) {
    const appliedText = appliedCell.textContent.trim().toUpperCase();
    const isApplied = appliedText === 'YES' || appliedText === 'APPLIED' || appliedText === 'REGISTERED';
    const contentNode = appliedCell.querySelector('.MuiDataGrid-cellContent') || appliedCell;
    contentNode.style.padding = '4px 12px';
    contentNode.style.borderRadius = '16px';
    contentNode.style.fontWeight = 'bold';
    contentNode.style.display = 'inline-block';
    contentNode.style.textAlign = 'center';

    if (isApplied) {
      contentNode.style.backgroundColor = '#d4edda';
      contentNode.style.color = '#155724';
    }
  }

  // 2. Highlight deadline independently
  if (deadlineCell) {
    const deadlineText = deadlineCell.textContent.trim(); 
    const parsedDate = new Date(deadlineText.replace(',', ''));
    
    if (!isNaN(parsedDate.getTime())) {
      const hoursLeft = (parsedDate - new Date()) / (1000 * 60 * 60);
      const targetNode = deadlineCell.querySelector('.MuiDataGrid-cellContent') || deadlineCell;
      targetNode.style.padding = '3px 8px';
      targetNode.style.borderRadius = '6px';
      targetNode.style.fontWeight = '600';
      targetNode.style.display = 'inline-block';
      
      if (hoursLeft < 0) {
        // Deadline Passed
        targetNode.style.backgroundColor = '#e9ecef';
        targetNode.style.color = '#6c757d';
      } else if (hoursLeft < 24) {
        // Critical (Red)
        targetNode.style.backgroundColor = '#f8d7da';
        targetNode.style.color = '#721c24';
      } else if (hoursLeft < 72) {
        // Warning (Orange)
        targetNode.style.backgroundColor = '#fff3cd';
        targetNode.style.color = '#856404';
      } else {
        // Plenty of time
        targetNode.style.backgroundColor = 'transparent';
        targetNode.style.color = 'inherit';
      }
    }
  }
}

// 5. Auto-Remove Eligibility Filter
async function removeEligibilityFilter() {
  const filterBtn = document.querySelector('button[aria-label="Show filters"], button[aria-label*="filter" i], button[title*="filter" i]');
  if (!filterBtn) return false;

  const isFilterPanelOpen = () => document.querySelector('.MuiDataGrid-filterForm');
  
  if (!isFilterPanelOpen()) {
    filterBtn.click();
    await sleep(400);
  }
  
  if (!isFilterPanelOpen()) return false;
  
  const filterForms = Array.from(document.querySelectorAll('.MuiDataGrid-filterForm'));
  let eligibilityFilterForm = null;
  
  for (const form of filterForms) {
    const selects = Array.from(form.querySelectorAll('select, input'));
    const isEligibility = selects.some(el => el.value === 'eligibility' || el.textContent.includes('Eligibility'));
    if (isEligibility) {
      eligibilityFilterForm = form;
      break;
    }
  }
  
  if (eligibilityFilterForm) {
     const valueInput = eligibilityFilterForm.querySelector('input[type="text"], input[placeholder="Filter value"]');
     if (valueInput && (valueInput.value === 'Yes' || valueInput.value === 'yes')) {
        const deleteBtn = eligibilityFilterForm.querySelector('button[aria-label="Delete filter"], button[title="Delete"]');
        if (deleteBtn) {
          deleteBtn.click();
          await sleep(300);
          filterBtn.click(); // Close panel
          setTimeout(updatePortalTotalCount, 500);
          return true;
        }
     }
  }
  
  // Close panel if we opened it but found no filter to delete
  filterBtn.click();
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
