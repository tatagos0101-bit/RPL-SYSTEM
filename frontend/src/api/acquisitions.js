import client from './client';
export const acquisitionSources = { purchased: 'Purchased', donated: 'Donated', other: 'Other', unknown: 'Unknown' };
export const emptyAcquisition = () => ({ source: '', acquired_on: '', party: '', cost: '', currency: '', reference: '' });
export function acquisitionPayload(value) {
  const fields = Object.fromEntries(Object.keys(emptyAcquisition()).map(key => [key, String(value[key] ?? '').trim() || null]));
  if (fields.currency) fields.currency = fields.currency.toUpperCase();
  return Object.values(fields).some(value => value !== null) ? fields : null;
}
export const getBookAcquisitions = (bookId, skip = 0, signal) => client.get(`/api/inventory/books/${bookId}/acquisitions`, { params: { skip, limit: 25 }, signal }).then(response => response.data);
