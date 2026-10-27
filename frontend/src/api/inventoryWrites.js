export function errorMessage(error, fallback = 'The request could not be confirmed. Please retry.') {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(item => typeof item === 'string' ? item : item?.msg || 'Invalid value').join('; ');
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message;
  return error?.message || fallback;
}

export function matchCategory(raw, categories) {
  if (!raw) return { matched: '', isNew: false };
  const matched = categories.find(c => c.toLowerCase() === raw.toLowerCase())
    || categories.find(c => raw.toLowerCase().includes(c.toLowerCase()));
  return { matched: matched || raw, isNew: !matched };
}

function journalKey(storage) {
  const actor = storage.getItem('userId');
  if (!actor) throw new Error('Sign in again before changing inventory.');
  return `rpl:inventory-writes:${actor}`;
}

export function readJournal(storage = localStorage) {
  const raw = storage.getItem(journalKey(storage));
  if (!raw) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Inventory recovery data is unreadable. Contact support before retrying imports.');
  return value;
}

export function saveJournal(slot, value, storage = localStorage) {
  const journal = readJournal(storage);
  journal[slot] = value;
  // Persist before dispatch. If storage is unavailable, do not send a write.
  storage.setItem(journalKey(storage), JSON.stringify(journal));
}

export const isUnconfirmedISBNRow = row => Boolean(row.requestId && !row.imported && !row.skipped);

export function removeISBNResults(rows, isbns, storage = localStorage) {
  if (rows.some(row => isbns.has(row.isbn) && isUnconfirmedISBNRow(row))) {
    throw new Error('Resolve the unconfirmed imports before clearing their results. Select those rows and retry adding them to check the saved outcome.');
  }
  const remaining = rows.filter(row => !isbns.has(row.isbn));
  // Persist first so a storage failure cannot hide recovery data from the UI.
  saveJournal('rows', remaining, storage);
  return remaining;
}

export async function reconcileWrite(requestId, lookup, send) {
  try {
    const response = await lookup(requestId);
    return { data: response.data.result };
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
  }
  return send(requestId);
}

export function isDefiniteRejection(error) {
  return [400, 413, 422].includes(error?.response?.status);
}

export async function sha256(file) {
  const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}
