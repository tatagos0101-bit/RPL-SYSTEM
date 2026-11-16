export const MAX_BOOK_DESCRIPTION_LENGTH = 2000;

export function plainBookDescription(value) {
  const raw = typeof value === 'string' ? value : typeof value?.value === 'string' ? value.value : '';
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] || match;
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    }).replace(/\s+/g, ' ').trim();
  return text.slice(0, MAX_BOOK_DESCRIPTION_LENGTH).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
}

// External catalog metadata stays separate from the private API client. The
// existing authenticated category helper is supplied by the caller.
export async function fetchBookByISBN(isbn, { fetchImpl = globalThis.fetch, suggestCategory } = {}) {
  const clean = isbn.replace(/[-\s]/g, '');
  const gbRes = await fetchImpl(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
  if (gbRes.ok) {
    const gbData = await gbRes.json();
    if (gbData.totalItems > 0 && gbData.items?.[0]?.volumeInfo) {
      const info = gbData.items[0].volumeInfo;
      const thumbnail = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
      const suggestion = await suggestCategory(info.categories || []);
      return {
        title: info.title || '',
        author: info.authors ? info.authors.join(', ') : '',
        category: suggestion.data.raw_api_label,
        year: info.publishedDate ? info.publishedDate.slice(0, 4) : '',
        cover_url: thumbnail.replace('http://', 'https://').replace('&zoom=1', '&zoom=0'),
        description: plainBookDescription(info.description),
      };
    }
  }
  const olRes = await fetchImpl(`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`);
  if (olRes.ok) {
    const olData = await olRes.json();
    const info = olData[`ISBN:${clean}`];
    if (info) {
      const subjects = (info.subjects || []).map(subject => subject.name || subject).filter(Boolean);
      const suggestion = await suggestCategory(subjects);
      return {
        title: info.title || '',
        author: info.authors ? info.authors.map(author => author.name).join(', ') : '',
        category: suggestion.data.raw_api_label,
        year: info.publish_date ? info.publish_date.slice(-4) : '',
        cover_url: info.cover?.large || info.cover?.medium || info.cover?.small || '',
        description: plainBookDescription(info.description || info.notes),
      };
    }
  }
  throw new Error('Not found');
}
