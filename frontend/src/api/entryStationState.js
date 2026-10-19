export const shouldLoadEntryStationLogsOnMount = (stationPin) =>
  Boolean(String(stationPin || '').trim());

export const isQuietWalkThroughMessage = (message) =>
  ['no_face', 'too_far'].includes(message);

// Two stations on one public IP need headroom below 120 scans / 60 log reads per minute.
export const ENTRY_SCAN_INTERVAL_MS = 1500;
export const ENTRY_LOG_MIN_INTERVAL_MS = 2500;

export function entryStationRetryDelay(error, now = Date.now()) {
  const fallback = error?.response?.status === 429 ? 60000 : 5000;
  const headers = error?.response?.headers;
  const value = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const text = String(value).trim();
  const delay = /^\d+$/.test(text)
    ? Number(text) * 1000
    : /GMT$/i.test(text) ? Date.parse(text) - now : NaN;
  return Number.isFinite(delay) && delay >= 0 ? Math.max(1000, delay) : fallback;
}
