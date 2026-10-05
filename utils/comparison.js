import { generateFallbackKey } from './normalization.js';

/**
 * Compares current scraped roles with historic roles from Sheets.
 * @param {Array} currentRoles - Roles just scraped from the page
 * @param {Array} historicRoles - Roles fetched from the "All Roles" sheet
 * @returns {Object} - { newRoles: [], updatedRoles: [] }
 */
function findNewRoles(currentRoles, historicRoles) {
  const newRoles = [];
  const updatedRoles = [];

  // Build a lookup map from historic roles
  // Historic roles from sheet should have properties like:
  // { 'Posting ID': '123', 'Company': 'ABC', 'Role': 'SDE', 'Fallback Key': 'abc|sde', ... }
  const historicMapById = new Map();
  const historicMapByKey = new Map();

  historicRoles.forEach(role => {
    const id = role.posting_id;
    const key = generateFallbackKey(role.company, role.title);
    
    if (id) historicMapById.set(id, role);
    historicMapByKey.set(key, role);
  });

  currentRoles.forEach(currentRole => {
    const id = currentRole.posting_id;
    const key = generateFallbackKey(currentRole.company, currentRole.title);
    
    // Check by ID first, then by fallback key
    let matchedHistoric = historicMapById.get(id);
    if (!matchedHistoric) {
      matchedHistoric = historicMapByKey.get(key);
    }

    if (!matchedHistoric) {
      // It's a completely new role
      newRoles.push(currentRole);
    } else {
      // It exists, we might want to update mutable fields (deadline, registered) and Last Seen
      updatedRoles.push(currentRole);
    }
  });

  return { newRoles, updatedRoles };
}

export { findNewRoles };
