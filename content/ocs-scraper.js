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
  const dataGrid = document.querySelector('.MuiDataGrid-root');
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

  let allRoles = new Map(); // Use map to deduplicate by data-id
  let hasNextPage = true;
  let pageCount = 1;

  while (hasNextPage) {
    notifyProgress(`Reading page ${pageCount}...`);
    
    // Scrape the current page (handling virtual scrolling)
    const pageRoles = await scrapeCurrentPage(dataGrid);
    
    // Add roles to our map
    pageRoles.forEach(role => {
      allRoles.set(role.posting_id, role);
    });

    // Try to find and click the "Next Page" button
    const nextPageBtn = document.querySelector('button[aria-label="Go to next page"]');
    if (nextPageBtn && !nextPageBtn.disabled) {
      nextPageBtn.click();
      pageCount++;
      // Wait for table to update after clicking next page
      await sleep(500); 
    } else {
      hasNextPage = false;
    }
  }

  return Array.from(allRoles.values());
}

async function scrapeCurrentPage(dataGrid) {
  const virtualScroller = dataGrid.querySelector('.MuiDataGrid-virtualScroller');
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
    const rows = virtualScroller.querySelectorAll('[role="row"]');
    
    for (const row of rows) {
      const dataId = row.getAttribute('data-id');
      // Skip header rows or invalid rows
      if (!dataId) continue;

      const roleData = extractRowData(row, dataId);
      if (roleData) {
        pageRoles.set(dataId, roleData);
      }
    }

    // Scroll down by a chunk (e.g., 500px)
    previousScrollTop = virtualScroller.scrollTop;
    virtualScroller.scrollTop += 500;
    
    await sleep(100); // Wait for React/MUI to render new virtual rows

    // If we haven't moved, we've reached the bottom of this page
    if (virtualScroller.scrollTop === previousScrollTop) {
      break;
    }
  }

  // Reset scroll to top for the user
  virtualScroller.scrollTop = 0;
  return Array.from(pageRoles.values());
}

function extractRowData(row, dataId) {
  const getCellText = (field) => {
    const cell = row.querySelector(`[data-field="${field}"]`);
    return cell ? cleanText(cell.textContent) : '';
  };

  const getRoleUrl = () => {
    const actionCell = row.querySelector('[data-field="action"]');
    if (actionCell) {
      const link = actionCell.querySelector('a');
      return link ? link.href : '';
    }
    return '';
  };

  const company = getCellText('company');
  const title = getCellText('title');
  
  // If both company and title are missing, it might not be a valid job row
  if (!company && !title) return null;

  return {
    posting_id: dataId,
    company: company,
    title: title,
    ctc: getCellText('ctc'),
    eligibility: getCellText('eligibility'),
    deadline: getCellText('deadline'),
    registered: getCellText('registered'),
    role_url: getRoleUrl()
  };
}

async function removeEligibilityFilter() {
  // 1. Check if filters are open, if not, open them
  const filterBtn = document.querySelector('button[aria-label="Show filters"]');
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
  chrome.runtime.sendMessage({ type: 'PROGRESS_UPDATE', text: msg });
}
