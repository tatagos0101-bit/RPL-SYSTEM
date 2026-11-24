import client from './client';
import { prepareUploadForm } from './uploads';
import { getStoredAuth } from './authRoutes';
import { buildPasswordChangeRequest } from './passwordPolicy';
import { createSharedRead } from './sharedReads';

const readScope = () => {
  const { userId, role, isLoggedIn, mustChangePassword } = getStoredAuth();
  return JSON.stringify([userId, role, isLoggedIn, mustChangePassword]);
};
export const getProfile = createSharedRead('profile', config => client.get('/api/user/profile', config), readScope);

export const updateProfile = (data) =>
  client.put('/api/user/profile', data);

export const requestContactCode = (channel, password) =>
  client.post('/api/auth/contact-verification/request', { channel, password });

export const confirmContactCode = (channel, code) =>
  client.post('/api/auth/contact-verification/confirm', { channel, code });

export const getBiometricStatus = () =>
  client.get('/api/user/biometric-status');

export const getLoans = () =>
  client.get('/api/user/loans');

export const getFines = createSharedRead('fines', () => client.get('/api/user/fines'), readScope);

export const getReadingStats = () =>
  client.get('/api/user/reading-stats');

export const getActivity = (days = 84) =>
  client.get('/api/user/activity', { params: { days } });

export const getGoals = () =>
  client.get('/api/user/goals');

export const getRecommendations = (limit = 10) =>
  client.get('/api/recommendations', { params: { limit } });

export const getTranscriptUrl = () => '/api/reports/transcript';

export const updateGoals = (data) =>
  client.put('/api/user/goals', data);

export const reportLoan = (transactionId, reason, note = '') =>
  client.post(`/api/transactions/${transactionId}/report`, { reason, note });

export const getNotifications = () =>
  client.get('/api/user/notifications');

export const markNotificationRead = (id) =>
  client.post(`/api/user/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  client.post('/api/user/notifications/read-all');

export const changePassword = (currentPassword, newPassword, options) =>
  client.put('/api/user/change-password', buildPasswordChangeRequest(currentPassword, newPassword, options));

export const uploadAvatar = async (file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/api/user/avatar', await prepareUploadForm(form, 'file', 'avatars'), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const removeAvatar = () =>
  client.delete('/api/user/avatar');
