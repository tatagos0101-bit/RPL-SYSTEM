import client from './client';
import { clearStoredAuth, persistStoredAuth } from './authRoutes';
import {
  buildPasswordResetConfirm,
  buildPasswordResetRequest,
  PASSWORD_RESET_CONFIRM_PATH,
  PASSWORD_RESET_REQUEST_PATH,
} from './passwordRecovery';

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password });

export const signup = (data) =>
  client.post('/api/auth/signup', data);

export const requestPasswordReset = (identifier, channel = 'auto') =>
  client.post(PASSWORD_RESET_REQUEST_PATH, buildPasswordResetRequest(identifier, channel));

export const confirmPasswordReset = (identifier, code, newPassword) =>
  client.post(PASSWORD_RESET_CONFIRM_PATH, buildPasswordResetConfirm(identifier, code, newPassword));

export const enrollFace = (imageBase64) =>
  client.post('/api/auth/enroll-face', { image: imageBase64 });

export const faceAuth = (imageBase64) =>
  client.post('/api/auth/face', { image: imageBase64 }, { timeout: 30000 });

export const faceLookup = (imageBase64) =>
  client.post('/api/auth/face-lookup', { image: imageBase64 });

export const logout = () =>
  client.post('/api/auth/logout');

/** Save auth data to localStorage after a successful login */
export const persistAuth = ({ user_id, name, role, must_change_password }) => {
  persistStoredAuth({ user_id, name, role, must_change_password });
};

export const clearAuth = () => {
  clearStoredAuth();
  return logout().catch(() => {});
};
