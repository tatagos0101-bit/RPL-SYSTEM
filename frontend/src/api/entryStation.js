import client from './client';

const ENTRY_STATION_PIN_KEY = 'entryStationPin';

export const getStoredEntryStationPin = () =>
  sessionStorage.getItem(ENTRY_STATION_PIN_KEY) || '';

export const storeEntryStationPin = (pin) => {
  sessionStorage.setItem(ENTRY_STATION_PIN_KEY, pin.trim());
};

export const clearStoredEntryStationPin = () => {
  sessionStorage.removeItem(ENTRY_STATION_PIN_KEY);
};

export const getEntryStationLogs = (stationPin, limit = 30) =>
  client.get('/api/kiosk/entry-logs', {
    params: { limit },
    headers: { 'X-Entry-Station-Pin': stationPin },
  });

export const entryStationFaceAuth = (imageBase64, stationPin) =>
  client.post(
    '/api/kiosk/face',
    { image: imageBase64, station_pin: stationPin },
    { timeout: 30000 },
  );
