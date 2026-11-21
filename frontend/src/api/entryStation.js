import client from './client';

const key = 'entryStationPin';
const options = (pin, signal) => ({ headers: { 'X-Entry-Station-Pin': pin }, signal });
export const getStoredEntryStationPin = () => sessionStorage.getItem(key) || '';
export const storeEntryStationPin = pin => sessionStorage.setItem(key, pin.trim());
export const clearStoredEntryStationPin = () => sessionStorage.removeItem(key);
export const getEntryStationLogs = (pin, limit = 30, signal) =>
  client.get('/api/kiosk/entry-logs', { ...options(pin, signal), params: { limit } });
export const entryStationFaceAuth = (image, pin, presentUserIds = [], signal) =>
  client.post('/api/kiosk/face', { image, station_pin: pin, present_user_ids: presentUserIds }, { ...options(pin, signal), timeout: 30000 });
export const recordManualEntry = (pin, draft, signal) =>
  client.post('/api/kiosk/manual-entries', draft, options(pin, signal));
export const recordManualExit = (pin, id, signal) =>
  client.post(`/api/kiosk/manual-entries/${id}/exit`, {}, options(pin, signal));
export const searchOpenVisits = (pin, search, skip, signal) =>
  client.post('/api/kiosk/manual-entries/search', { open_only: true, search, skip, limit: 20 }, options(pin, signal));
