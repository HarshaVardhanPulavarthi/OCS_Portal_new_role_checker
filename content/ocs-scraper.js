chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'RUN_SCRAPER') {
    // Run the async scraping process, keep the message channel open
    runScrapingProcess()
      .then(roles => {
        sendResponse({ status: 'success', data: roles });
      })
      .catch(err => {
        sendResponse({ status: 'error', error: err.message });
      });
    return true; // Keep channel open for async response
  }
});

async function runScrapingProcess() {
  const dataGrid = document.querySelector('.MuiDataGrid-root, [role="grid"]');
  if (!dataGrid) {
    throw new Error('Could not find the OCS job table (MuiDataGrid). Please ensure you are on the correct page.');
  }

  notifyProgress('Checking for active filters...');
  const filterRemoved = await removeEligibilityFilter();
  if (filterRemoved) {
    notifyProgress('Waiting for table to refresh...');
    await sleep(500); // Wait for DataGrid to re-render after filter removal
  }

  // Attempt to set page size to 50 if possible
  notifyProgress('Setting up scraper...');

  let allRoles = new Map(); // Deduplicate by role signature
  let hasNextPage = true;
  let pageCount = 1;

  while (hasNextPage) {
    notifyProgress(`Reading page ${pageCount}...`);
    
    // Scrape the current page (handling virtual scrolling)
    const pageRoles = await scrapeCurrentPage(dataGrid);
    
    // Add roles to our map
    pageRoles.forEach(role => {
      const uniqueKey = (role.company && role.title) 
        ? `${cleanText(role.company).toLowerCase()}|${cleanText(role.title).toLowerCase()}` 
        : `${pageCount}_${role.posting_id}`;
      allRoles.set(uniqueKey, role);
    });

    // Try to find and click the "Next Page" button
    const nextPageBtn = document.querySelector(
      'button[aria-label="Go to next page"], button[title="Go to next page"], button[aria-label*="next" i]'
    );
    if (nextPageBtn && !nextPageBtn.disabled && nextPageBtn.getAttribute('aria-disabled') !== 'true') {
      nextPageBtn.click();
      pageCount++;
      // Wait for table to update after clicking next page
      await sleep(600); 
    } else {
      hasNextPage = false;
    }
  }

  return Array.from(allRoles.values());
}

async function scrapeCurrentPage(dataGrid) {
  const virtualScroller = dataGrid.querySelector('.MuiDataGrid-virtualScroller') || 
                          dataGrid.querySelector('[class*="virtualScroller"]') ||
                          document.getElementById('student-main') ||
                          dataGrid;
  if (!virtualScroller) {
    throw new Error('Could not find the virtual scroller in the DataGrid.');
  }

  let pageRoles = new Map();
  let previousScrollTop = -1;
  
  // Scroll to top first
  virtualScroller.scrollTop = 0;
  await sleep(500);

  while (true) {
    // Extract currently visible rows
    const rows = virtualScroller.querySelectorAll('[role="row"], .MuiDataGrid-row');
    
    for (const row of rows) {
      const dataId = row.getAttribute('data-id');
      // Skip header rows or invalid rows
      if (!dataId) continue;

      const roleData = extractRowData(row, dataId);
      if (roleData) {
        const rowKey = (roleData.company && roleData.title)
          ? `${cleanText(roleData.company).toLowerCase()}|${cleanText(roleData.title).toLowerCase()}`
          : dataId;
        pageRoles.set(rowKey, roleData);
      }
    }

    // Scroll down by a chunk (e.g., 500px)
    previousScrollTop = virtualScroller.scrollTop;
    virtualScroller.scrollTop += 500;
    
    await sleep(120); // Wait for React/MUI to render new virtual rows

    // If we haven't moved, check with brief delay before concluding end of list
    if (virtualScroller.scrollTop === previousScrollTop) {
      await sleep(250);
      if (virtualScroller.scrollTop === previousScrollTop) {
        break;
      }
    }
  }

  // Reset scroll to top for the user
  virtualScroller.scrollTop = 0;
  return Array.from(pageRoles.values());
}

function extractRowData(row, dataId) {
  const getCellText = (...fields) => {
    for (const field of fields) {
      const cell = row.querySelector(`[data-field="${field}" i]`);
      if (cell) {
        const text = cleanText(cell.textContent);
        if (text) return text;
      }
    }
    return '';
  };

  const getRoleUrl = () => {
    const actionCell = row.querySelector('[data-field="action" i], [data-field="actions" i], [data-field="apply" i], [data-field="operations" i]');
    if (actionCell) {
      const link = actionCell.querySelector('a');
      return link ? link.href : '';
    }
    const anyLink = row.querySelector('a[href*="job"], a[href*="posting"], a[href*="role"], a[href*="view"]');
    return anyLink ? anyLink.href : '';
  };

  const cells = row.querySelectorAll('.MuiDataGrid-cell');
  const company = getCellText('company', 'company_name', 'organization', 'companyName') || 
                  (cells.length > 0 ? cleanText(cells[0].textContent) : '');
  const title = getCellText('title', 'role', 'designation', 'profile', 'job_title') || 
                (cells.length > 1 ? cleanText(cells[1].textContent) : '');
  
  // If both company and title are missing, check if any cell has text
  if (!company && !title) return null;

  return {
    posting_id: dataId,
    company: company,
    title: title,
    ctc: getCellText('ctc', 'package', 'salary', 'stipend') || (cells.length > 2 ? cleanText(cells[2].textContent) : ''),
    eligibility: getCellText('eligibility', 'eligible') || (cells.length > 3 ? cleanText(cells[3].textContent) : ''),
    deadline: getCellText('deadline', 'last_date', 'apply_by') || (cells.length > 4 ? cleanText(cells[4].textContent) : ''),
    registered: getCellText('registered', 'applied', 'status'),
    role_url: getRoleUrl()
  };
}

async function removeEligibilityFilter() {
  // 1. Check if filters are open, if not, open them
  const filterBtn = document.querySelector('button[aria-label="Show filters"], button[aria-label*="filter" i], button[title*="filter" i]');
  if (filterBtn) {
    // MUI filter button is usually a toggle. Check if filter panel is already open
    // We look for the panel using role="presentation" or role="tooltip" which MUI uses for popovers
    const isFilterPanelOpen = () => document.querySelector('.MuiDataGrid-filterForm');
    
    if (!isFilterPanelOpen()) {
      filterBtn.click();
      await sleep(500); // wait for panel to open
    }
    
    if (!isFilterPanelOpen()) {
       console.log("Filter panel did not open or could not be found.");
       return false;
    }
    
    // 2. Look for the Eligibility filter row
    // MUI DataGrid filters usually have a field selector. We look for a combobox or select that has "Eligibility" selected
    // Since the structure can vary slightly, a robust way is to find the filter form containing "eligibility"
    const filterForms = Array.from(document.querySelectorAll('.MuiDataGrid-filterForm'));
    let eligibilityFilterForm = null;
    
    for (const form of filterForms) {
      // Find the field selector (usually a select or input)
      const selects = Array.from(form.querySelectorAll('select, input'));
      const isEligibility = selects.some(el => el.value === 'eligibility' || el.textContent.includes('Eligibility'));
      if (isEligibility) {
        eligibilityFilterForm = form;
        break;
      }
    }
    
    if (eligibilityFilterForm) {
       // Check if the value is "Yes"
       const valueInput = eligibilityFilterForm.querySelector('input[type="text"], input[placeholder="Filter value"]');
       if (valueInput && (valueInput.value === 'Yes' || valueInput.value === 'yes')) {
          console.log("Found Eligibility = Yes filter. Removing...");
          
          // Find the delete button for this specific filter row
          const deleteBtn = eligibilityFilterForm.querySelector('button[aria-label="Delete filter"], button[title="Delete"]');
          if (deleteBtn) {
            deleteBtn.click();
            await sleep(500); // wait for deletion
            
            // Close the filter panel to reset state if needed, or leave it open
            // Press escape or click outside to close (or click filterBtn again)
            filterBtn.click();
            return true;
          } else {
             throw new Error("Could not find the delete button for the Eligibility filter.");
          }
       }
    } else {
       console.log("No Eligibility filter found.");
       // Close the panel since we opened it
       filterBtn.click();
    }
  } else {
    console.log("Could not find 'Show filters' button.");
  }
  return false;
}

function cleanText(text) {
  if (!text) return '';
  // Normalize whitespace: replace non-breaking spaces with normal spaces, 
  // collapse multiple spaces, and trim.
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notifyProgress(msg) {
  chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: msg }).catch?.(() => {});
  try {
    window.dispatchEvent(new CustomEvent('ocs-scan-progress', { detail: { text: msg } }));
  } catch (e) {}
}
