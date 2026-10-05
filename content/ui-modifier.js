let hiddenRoles = [];
let roleNotes = {}; // Format: { [posting_id]: "note text" }
let observer = null;
let showHiddenRoles = false;

// Load state from Chrome Storage
const currentUrl = window.location.href.toLowerCase();
if (currentUrl.includes('ocs') && currentUrl.includes('iith')) {
  chrome.storage.local.get(['hiddenRoles', 'roleNotes'], (result) => {
    hiddenRoles = result.hiddenRoles || [];
    roleNotes = result.roleNotes || {};
    initWhenReady();
  });

  // Listen for cross-tab or popup changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let changed = false;
      if (changes.hiddenRoles) { hiddenRoles = changes.hiddenRoles.newValue || []; changed = true; }
      if (changes.roleNotes) { roleNotes = changes.roleNotes.newValue || {}; changed = true; }
      if (changed) {
        document.querySelectorAll('.MuiDataGrid-row, [role="row"]').forEach(processRow);
      }
    }
  });
}

let hasRemovedFilters = false;

function initWhenReady() {
  injectFloatingToggle();
  const checkInterval = setInterval(() => {
    const scroller = document.querySelector('.MuiDataGrid-virtualScroller');
    if (scroller) {
      clearInterval(checkInterval);
      startObserving(scroller);
      // Process already rendered rows
      document.querySelectorAll('.MuiDataGrid-row, [role="row"]').forEach(processRow);
      
      if (!hasRemovedFilters) {
        hasRemovedFilters = true;
        removeEligibilityFilter();
      }
    }
  }, 1000);
}

// 1. Floating Toggle Button to Show/Hide Hidden Roles
function injectFloatingToggle() {
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'ocs-toggle-hidden-btn';
  toggleBtn.innerHTML = '👁️ Show Hidden';
  Object.assign(toggleBtn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 20px',
    backgroundColor: '#111',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: '30px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    zIndex: '9999',
    fontWeight: 'bold',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  });

  toggleBtn.addEventListener('mouseenter', () => toggleBtn.style.transform = 'scale(1.05)');
  toggleBtn.addEventListener('mouseleave', () => toggleBtn.style.transform = 'scale(1)');

  toggleBtn.addEventListener('click', () => {
    showHiddenRoles = !showHiddenRoles;
    toggleBtn.innerHTML = showHiddenRoles ? '🙈 Hide Hidden' : '👁️ Show Hidden';
    toggleBtn.style.backgroundColor = showHiddenRoles ? '#28a745' : '#111';
    document.querySelectorAll('.MuiDataGrid-row, [role="row"]').forEach(processRow);
  });

  document.body.appendChild(toggleBtn);
}

function startObserving(scroller) {
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && (node.getAttribute('role') === 'row' || node.classList.contains('MuiDataGrid-row'))) {
            processRow(node);
          } else if (node.nodeType === 1) {
            const rows = node.querySelectorAll('.MuiDataGrid-row, [role="row"]');
            rows.forEach(processRow);
          }
        });
      }
    }
  });
  observer.observe(scroller, { childList: true, subtree: true });
}

function processRow(row) {
  const dataId = row.getAttribute('data-id');
  if (!dataId) return;

  const isHidden = hiddenRoles.some(r => r.posting_id === dataId);

  // Manage visibility & Hide/Unhide Buttons
  if (isHidden) {
    if (showHiddenRoles) {
      row.style.opacity = '0.35';
      row.style.filter = 'grayscale(100%)';
      row.style.removeProperty('display');
      injectActionButtons(row, dataId, true);
    } else {
      row.style.setProperty('display', 'none', 'important');
    }
  } else {
    row.style.opacity = '1';
    row.style.filter = 'none';
    row.style.removeProperty('display');
    injectActionButtons(row, dataId, false);
  }

  // Inject Features
  injectNote(row, dataId);
  highlightDeadlineAndApplied(row);
}

// 2. Action Buttons (Hide/Unhide)
function injectActionButtons(row, dataId, isHiddenMode) {
  const companyCell = row.querySelector('[data-field="company"]');
  if (!companyCell) return;

  let actionBtn = companyCell.querySelector('.ocs-action-btn');
  if (!actionBtn) {
    actionBtn = document.createElement('button');
    actionBtn.className = 'ocs-action-btn';
    
    companyCell.style.display = 'flex';
    companyCell.style.alignItems = 'center';
    companyCell.style.justifyContent = 'space-between';
    companyCell.appendChild(actionBtn);

    // Fade effect for hide button
    row.addEventListener('mouseenter', () => { if(!isHiddenMode) actionBtn.style.opacity = '1'; });
    row.addEventListener('mouseleave', () => { if(!isHiddenMode) actionBtn.style.opacity = '0.2'; });
  }

  // Remove old listeners by cloning
  const newBtn = actionBtn.cloneNode(true);
  actionBtn.parentNode.replaceChild(newBtn, actionBtn);
  actionBtn = newBtn;

  // Apply state (Unhide vs Hide)
  if (isHiddenMode) {
    actionBtn.textContent = 'Unhide';
    Object.assign(actionBtn.style, {
      marginLeft: 'auto', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
      backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px',
      fontWeight: 'bold', opacity: '1', zIndex: '10', transition: 'none', pointerEvents: 'auto'
    });
    // Use mousedown to prevent React cell focus rerender
    actionBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation(); e.preventDefault();
      hiddenRoles = hiddenRoles.filter(r => r.posting_id !== dataId);
      chrome.storage.local.set({ hiddenRoles });
    });
  } else {
    actionBtn.textContent = 'Hide';
    Object.assign(actionBtn.style, {
      marginLeft: 'auto', padding: '2px 8px', fontSize: '11px', cursor: 'pointer',
      backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '4px',
      fontWeight: '600', opacity: '0.2', transition: 'opacity 0.2s', zIndex: '10', pointerEvents: 'auto'
    });
    // Use mousedown to prevent React cell focus rerender
    actionBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation(); e.preventDefault();
      hideRole(row, dataId);
    });
  }
}

function hideRole(row, dataId) {
  const clone = row.cloneNode(true);
  clone.querySelectorAll('.ocs-action-btn').forEach(btn => btn.remove());
  const company = clone.querySelector('[data-field="company"]')?.textContent?.trim() || 'Unknown';
  const title = clone.querySelector('[data-field="title"]')?.textContent?.trim() || 'Unknown';
  
  hiddenRoles.push({ posting_id: dataId, company, title, hiddenAt: Date.now() });
  chrome.storage.local.set({ hiddenRoles }, () => {
    if (!showHiddenRoles) row.style.setProperty('display', 'none', 'important');
  });
}

// 3. Custom Tags & Notes
function injectNote(row, dataId) {
  const titleCell = row.querySelector('[data-field="title"]');
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

  // Clear existing badge to re-render
  noteContainer.innerHTML = '';

  const text = roleNotes[dataId];
  const badge = document.createElement('span');
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
  } else {
    badge.textContent = '+ Note';
    badge.style.backgroundColor = 'transparent';
    badge.style.color = '#999';
    badge.style.border = '1px dashed #ccc';
  }

  // USE mousedown instead of click to beat React's focus rerender
  badge.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // Turn into an inline input box
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

    // Prevent DataGrid from catching keypresses (e.g. spacebar, enter)
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        saveNote();
      } else if (e.key === 'Escape') {
        processRow(row); // Abort and revert to badge
      }
    });

    // Prevent click/mousedown from expanding row and losing focus
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());

    const saveNote = () => {
      const newNote = input.value.trim();
      if (newNote === '') {
        delete roleNotes[dataId];
      } else {
        roleNotes[dataId] = newNote;
      }
      chrome.storage.local.set({ roleNotes });
      // The storage listener will trigger processRow to re-render it as a badge
    };

    // Save when clicking outside
    input.addEventListener('blur', saveNote);

    noteContainer.innerHTML = '';
    noteContainer.appendChild(input);
    input.focus();
  });

  noteContainer.appendChild(badge);
}

// 4. Deadline & Applied Status Highlighting
function highlightDeadlineAndApplied(row) {
  let appliedCell = row.querySelector('[data-field="applied"]') || row.querySelector('[data-field="registered"]');
  const deadlineCell = row.querySelector('[data-field="deadline"]');

  // Fallback to find Applied cell by content if data-field is weird
  if (!appliedCell) {
    const cells = Array.from(row.querySelectorAll('.MuiDataGrid-cell'));
    appliedCell = cells.find(c => {
      const txt = c.textContent.trim().toUpperCase();
      return txt === 'YES' || txt === 'NO';
    });
  }

  if (!appliedCell || !deadlineCell) return;

  const appliedText = appliedCell.textContent.trim().toUpperCase();
  const isApplied = appliedText === 'YES';
  
  // Create a nice badge look inside the cell
  const contentNode = appliedCell.querySelector('.MuiDataGrid-cellContent') || appliedCell;
  contentNode.style.padding = '4px 12px';
  contentNode.style.borderRadius = '16px';
  contentNode.style.fontWeight = 'bold';
  contentNode.style.display = 'inline-block';
  contentNode.style.textAlign = 'center';
  
  if (isApplied) {
    // Already Applied -> Nice Green
    contentNode.style.backgroundColor = '#d4edda';
    contentNode.style.color = '#155724';
  } else {
    // Not Applied -> Check Deadline
    const deadlineText = deadlineCell.textContent.trim(); 
    const parsedDate = new Date(deadlineText.replace(',', ''));
    
    if (!isNaN(parsedDate)) {
      const hoursLeft = (parsedDate - new Date()) / (1000 * 60 * 60);
      
      if (hoursLeft < 0) {
        // Deadline Passed
        contentNode.style.backgroundColor = '#e9ecef';
        contentNode.style.color = '#6c757d';
      } else if (hoursLeft < 24) {
        // Critical (Red)
        contentNode.style.backgroundColor = '#f8d7da';
        contentNode.style.color = '#721c24';
      } else if (hoursLeft < 72) {
        // Warning (Orange)
        contentNode.style.backgroundColor = '#fff3cd';
        contentNode.style.color = '#856404';
      } else {
        // Plenty of time
        contentNode.style.backgroundColor = '#f8f9fa';
        contentNode.style.color = '#333';
      }
    }
  }
}

// 5. Auto-Remove Eligibility Filter
async function removeEligibilityFilter() {
  const filterBtn = document.querySelector('button[aria-label="Show filters"]');
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
