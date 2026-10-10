export function apiBaseUrl(value, development = false) {
  return (value || (development ? 'http://localhost:8000' : '')).replace(/\/+$/, '');
}

export const API_BASE_URL = apiBaseUrl(import.meta.env?.VITE_API_URL, import.meta.env?.DEV);

export function assetUrl(value, base = API_BASE_URL) {
  if (!value) return null;
  return value.startsWith('/') ? `${base}${value}` : value;
}
