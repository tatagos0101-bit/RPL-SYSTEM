import axios from 'axios';
import { clearStoredAuth, loginForPath } from './authRoutes';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 10000,
  withCredentials: true,
});

// Keep bearer compatibility for old sessions, but new logins use HttpOnly cookies.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 → clear auth and redirect to login (skip auth endpoints themselves)
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthEndpoint = url.includes('/api/auth/');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      const next = window.location.pathname + window.location.search;
      clearStoredAuth();
      window.location.href = `${loginForPath(window.location.pathname)}?next=${encodeURIComponent(next)}`;
    }
    return Promise.reject(err);
  }
);

export default client;
