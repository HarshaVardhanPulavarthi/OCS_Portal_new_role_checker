// Normalization utility

function normalizeText(text) {
  if (!text) return '';
  // Collapse whitespace and trim
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function generateFallbackKey(company, title) {
  return `${normalizeText(company)}|${normalizeText(title)}`;
}

export { normalizeText, generateFallbackKey };
