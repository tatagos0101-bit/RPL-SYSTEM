import { errorMessage } from './inventoryWrites.js';

const keyFor = actor => `rpl:circulation:v1:${actor}`;
export function readCirculation(actor, storage = localStorage) {
  if (!actor) throw new Error('Sign in again before recording circulation.');
  const value = JSON.parse(storage.getItem(keyFor(actor)) || '[]');
  if (!Array.isArray(value) || value.some(row => !row || !['borrow', 'return'].includes(row.operation)
    || typeof row.requestId !== 'string' || !row.payload
    || !Number.isInteger(row.payload.user_id) || !Number.isInteger(row.payload.book_id)
    || (row.operation === 'return' && !Number.isInteger(row.payload.transaction_id)))) {
    throw new Error('Recovery data is unreadable. Contact support before retrying.');
  }
  return value;
}

// Only operation/request/account/book/copy/loan IDs persist, never patron names or images.
export function saveCirculation(actor, record, storage = localStorage) {
  const rows = readCirculation(actor, storage).filter(row => row.requestId !== record.requestId);
  storage.setItem(keyFor(actor), JSON.stringify([...rows, record]));
}
export function clearCirculation(actor, requestId, storage = localStorage) {
  storage.setItem(keyFor(actor), JSON.stringify(readCirculation(actor, storage).filter(row => row.requestId !== requestId)));
}

export async function submitCirculation(record, { send, lookup }) {
  try {
    const response = await send(record);
    return { status: 'confirmed', data: response.data };
  } catch (error) {
    // A timeout/transport/server failure may follow a committed write.
    if (error.response && [400, 403, 404, 409, 422, 429].includes(error.response.status)) {
      return { status: 'failed', error: errorMessage(error) };
    }
    try {
      const { data } = await lookup(record.requestId);
      if (data.operation !== record.operation) throw new Error('Request operation mismatch.');
      return { status: 'confirmed', data: data.result };
    } catch {
      return { status: 'unknown', error: 'Outcome unknown. Stop here and check or retry this original request.' };
    }
  }
}

export function normalizeLibraryCode(raw) {
  const code = String(raw).replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z0-9-]{1,60}$/.test(code)) throw new Error('Enter a valid library QR code.');
  if (/^\d{10,13}$/.test(code)) throw new Error('ISBN barcodes identify titles, not physical library copies.');
  return code;
}
