document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('roles-body');
  const roleCount = document.getElementById('role-count');
  const searchInput = document.getElementById('search-input');
  
  let allRoles = [];

  // Load roles from storage
  chrome.storage.local.get(['allRoles'], (result) => {
    allRoles = result.allRoles || [];
    renderTable(allRoles);
  });

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filteredRoles = allRoles.filter(role => {
      const company = (role.company || '').toLowerCase();
      const title = (role.title || '').toLowerCase();
      return company.includes(query) || title.includes(query);
    });
    renderTable(filteredRoles);
  });

  function renderTable(roles) {
    roleCount.textContent = `Total Roles: ${roles.length}`;
    tbody.innerHTML = '';

    if (roles.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" class="empty-state">No roles found in database.</td>`;
      tbody.appendChild(tr);
      return;
    }

    roles.forEach(role => {
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td class="company-cell">${escapeHtml(role.company)}</td>
        <td>${role.role_url ? `<a href="${escapeHtml(role.role_url)}" target="_blank" style="color: #1a73e8; text-decoration: none;">${escapeHtml(role.title)}</a>` : escapeHtml(role.title)}</td>
        <td>${escapeHtml(role.ctc)}</td>
        <td>${escapeHtml(role.eligibility)}</td>
        <td>${escapeHtml(role.deadline)}</td>
        <td>${escapeHtml(role.registered)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(unsafe) {
    if (!unsafe) return '-';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }
});
