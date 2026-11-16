export const normalizeCatalogSearch = (value) =>
  typeof value === 'string' ? Array.from(value.trim()).slice(0, 200).join('') : '';

export function catalogSearchPath(value) {
  const query = normalizeCatalogSearch(value);
  return query ? `/browse?q=${encodeURIComponent(query)}` : '/browse';
}

export function catalogMatchParts(value, query) {
  const text = String(value ?? '');
  const term = normalizeCatalogSearch(query);
  if (!term) return [{ text, match: false }];
  // Escape every regex operator: user input always represents literal text.
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const parts = [];
  let cursor = 0;
  for (const hit of text.matchAll(pattern)) {
    if (hit.index > cursor) parts.push({ text: text.slice(cursor, hit.index), match: false });
    parts.push({ text: hit[0], match: true });
    cursor = hit.index + hit[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
