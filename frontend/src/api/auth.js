import client from './client';
import { buildFaceEnrollment } from './faceConsent';
import { clearReservationCart } from './reservationCart';
import { clearStoredAuth, persistStoredAuth } from './authRoutes';
import {
  buildPasswordResetConfirm,
  buildPasswordResetRequest,
  PASSWORD_RESET_CONFIRM_PATH,
  PASSWORD_RESET_REQUEST_PATH,
} from './passwordRecovery';

export const login = (email, password, expectedRole) =>
  client.post('/api/auth/login', { email, password, expected_role: expectedRole });

export const getSession = (config) => client.get('/api/auth/session', config);

export const signup = (data) =>
  client.post('/api/auth/signup', data);

export const requestPasswordReset = (identifier, channel = 'auto') =>
  client.post(PASSWORD_RESET_REQUEST_PATH, buildPasswordResetRequest(identifier, channel));

export const confirmPasswordReset = (identifier, code, newPassword) =>
  client.post(PASSWORD_RESET_CONFIRM_PATH, buildPasswordResetConfirm(identifier, code, newPassword));

export const enrollFace = (imageBase64, acceptFaceRecognition) =>
  client.post('/api/auth/enroll-face', buildFaceEnrollment(imageBase64, acceptFaceRecognition), { timeout: 90000 });

export const faceAuth = (imageBase64, expectedRole, config) =>
  client.post('/api/auth/face', { image: imageBase64, expected_role: expectedRole }, { timeout: 30000, ...config });

export const faceLookup = (imageBase64, config) =>
  client.post('/api/auth/face-lookup', { image: imageBase64 }, config);

export const logout = () =>
  client.post('/api/auth/logout');

/** Save auth data to localStorage after a successful login */
export const persistAuth = ({ user_id, name, role, must_change_password }) => {
  persistStoredAuth({ user_id, name, role, must_change_password });
};

export const clearAuth = async () => {
  await logout();
  clearReservationCart();
  clearStoredAuth();
};
