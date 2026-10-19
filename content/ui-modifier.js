let hiddenRoles = [];
let roleNotes = {}; // Format: { [posting_id]: "note text" }
let notepadData = { top: '', decent: '' }; // Format: { top: "...", decent: "..." }
let isNotepadOpen = false;
let observer = null;
let showHiddenRoles = false;
let totalCompaniesCount = null;

// Load state from Chrome Storage
const currentUrl = window.location.href.toLowerCase();
if (currentUrl.includes('ocs') || currentUrl.includes('iith') || currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1') || currentUrl.includes('ocs_debug') || currentUrl.startsWith('file:')) {
  chrome.storage.local.get(['hiddenRoles', 'roleNotes', 'notepadData', 'isNotepadOpen', 'totalCompaniesCount', 'allRoles'], (result) => {
    hiddenRoles = result.hiddenRoles || [];
    roleNotes = result.roleNotes || {};
    notepadData = result.notepadData || { top: '', decent: '' };
    isNotepadOpen = result.isNotepadOpen || false;
    totalCompaniesCount = result.totalCompaniesCount || (result.allRoles && result.allRoles.length ? result.allRoles.length : null);
    initWhenReady();
  });

  // Listen for cross-tab or popup changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      let changed = false;
      if (changes.hiddenRoles) { hiddenRoles = changes.hiddenRoles.newValue || []; changed = true; }
      if (changes.roleNotes) { roleNotes = changes.roleNotes.newValue || {}; changed = true; }
      if (changes.notepadData) {
        notepadData = changes.notepadData.newValue || { top: '', decent: '' };
        syncNotepadFromStorage();
      }
      if (changes.isNotepadOpen !== undefined) {
        setNotepadOpenState(!!changes.isNotepadOpen.newValue, false);
      }
      if (changes.totalCompaniesCount !== undefined) {
        totalCompaniesCount = changes.totalCompaniesCount.newValue;
        updateTotalCompaniesBadge();
      }
      if (changed) {
        document.querySelectorAll('.MuiDataGrid-row, [role="row"]').forEach(processRow);
      }
    }
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_NOTEPAD') {
      const forceOpen = message.forceOpen !== undefined ? message.forceOpen : !isNotepadOpen;
      setNotepadOpenState(forceOpen, true);
      sendResponse({ status: 'ok', isOpen: isNotepadOpen });
    }
  });
}

let hasRemovedFilters = false;

function initWhenReady() {
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
    updatePortalTotalCount();
  }, 1000);

  const checkInterval = setInterval(() => {
    const scroller = document.querySelector('.MuiDataGrid-virtualScroller');
    if (scroller) {
      clearInterval(checkInterval);
      startObserving(scroller);
      observePagination();
      updatePortalTotalCount();
      // Process already rendered rows
      document.querySelectorAll('.MuiDataGrid-row, [role="row"]').forEach(processRow);
      
      if (!hasRemovedFilters) {
        hasRemovedFilters = true;
        removeEligibilityFilter().then(() => {
          setTimeout(updatePortalTotalCount, 500);
        });
      }
    }
  }, 1000);
}

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
    bottom: '24px',
    right: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    zIndex: '99999',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
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
    padding: '12px 20px',
    backgroundColor: '#111',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: '30px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '14px',
    transition: 'all 0.25s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  });

  totalCountBtn.addEventListener('mouseenter', () => totalCountBtn.style.transform = 'scale(1.05)');
  totalCountBtn.addEventListener('mouseleave', () => totalCountBtn.style.transform = 'scale(1)');
  totalCountBtn.addEventListener('click', () => {
    updatePortalTotalCount();
    const target = document.querySelector('.MuiTablePagination-displayedRows') || 
                   document.querySelector('.MuiDataGrid-footerContainer') || 
                   document.querySelector('.MuiDataGrid-root');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // 2. Floating Notepad Button
  const notepadBtn = document.createElement('button');
  notepadBtn.id = 'ocs-notepad-btn';
  notepadBtn.innerHTML = '📝 Notepad';
  Object.assign(notepadBtn.style, {
    padding: '12px 20px',
    backgroundColor: isNotepadOpen ? '#2563eb' : '#111',
    color: '#fff',
    border: isNotepadOpen ? '1px solid #3b82f6' : '1px solid #333',
    borderRadius: '30px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '14px',
    transition: 'all 0.25s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  });

  notepadBtn.addEventListener('mouseenter', () => notepadBtn.style.transform = 'scale(1.05)');
  notepadBtn.addEventListener('mouseleave', () => notepadBtn.style.transform = 'scale(1)');
  notepadBtn.addEventListener('click', () => {
    setNotepadOpenState(!isNotepadOpen, true);
  });

  // 3. Floating Toggle Button to Show/Hide Hidden Roles
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'ocs-toggle-hidden-btn';
  toggleBtn.innerHTML = showHiddenRoles ? '🙈 Hide Hidden' : '👁️ Show Hidden';
  Object.assign(toggleBtn.style, {
    padding: '12px 20px',
    backgroundColor: showHiddenRoles ? '#28a745' : '#111',
    color: '#fff',
    border: '1px solid #333',
    borderRadius: '30px',
    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'inherit',
    fontSize: '14px',
    transition: 'all 0.25s ease'
  });

  toggleBtn.addEventListener('mouseenter', () => toggleBtn.style.transform = 'scale(1.05)');
  toggleBtn.addEventListener('mouseleave', () => toggleBtn.style.transform = 'scale(1)');

  toggleBtn.addEventListener('click', () => {
    showHiddenRoles = !showHiddenRoles;
    toggleBtn.innerHTML = showHiddenRoles ? '🙈 Hide Hidden' : '👁️ Show Hidden';
    toggleBtn.style.backgroundColor = showHiddenRoles ? '#28a745' : '#111';
    document.querySelectorAll('.MuiDataGrid-row, [role="row"]').forEach(processRow);
  });

  bar.appendChild(totalCountBtn);
  bar.appendChild(notepadBtn);
  bar.appendChild(toggleBtn);
  document.body.appendChild(bar);
}

// Helpers for Detecting and Updating Total Companies on Portal
function detectTotalCompaniesCount() {
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
                 document.querySelector('.MuiDataGrid-root');
  if (target) {
    paginationObserver = new MutationObserver(() => {
      updatePortalTotalCount();
    });
    paginationObserver.observe(target, { childList: true, subtree: true, characterData: true });
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
    width: '560px',
    maxWidth: 'calc(100vw - 48px)',
    height: '330px',
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
    <span style="font-size: 10px; color: #52525b;">Auto-saved • Drag to move</span>
  `;

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  document.body.appendChild(panel);

  updateNotepadCounts();
  setupNotepadDrag(panel, header);
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
    notepadBtn.style.backgroundColor = isNotepadOpen ? '#2563eb' : '#111';
    notepadBtn.style.borderColor = isNotepadOpen ? '#3b82f6' : '#333';
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
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
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
    if (e.target.tagName === 'BUTTON') return;
    panel.style.left = 'auto';
    panel.style.top = 'auto';
    panel.style.bottom = '78px';
    panel.style.right = '24px';
  });
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
