import { exportCopyBatches } from './zipDownload';
import client from './client';
import { resetMemberPasswordPath } from './passwordRecovery';
import { prepareUploadForm } from './uploads';

export const getEntryStationPinStatus = () => client.get('/api/librarian/settings/entry-station-pin');

export const updateEntryStationPin = (currentPassword, newPin) =>
  client.put('/api/librarian/settings/entry-station-pin', { current_password: currentPassword, new_pin: newPin });

// Dashboard
export const getStats = () =>
  client.get('/api/librarian/stats');

export const getBorrowTrend = (months = 6) =>
  client.get('/api/librarian/borrow-trend', { params: { months } });

export const getEntryLogs = (params = {}) =>
  client.get('/api/librarian/entry-logs', { params });

export const getDueBooks = (filter = 'all') =>
  client.get('/api/librarian/due-books', { params: { filter } });

// Members
export const getMembers = (params = {}) =>
  client.get('/api/librarian/users', { params });

export const registerMember = async (formData) =>
  client.post('/api/librarian/users/register', await prepareUploadForm(formData, 'id_image', 'ids'));

export const getMemberStats = () =>
  client.get('/api/librarian/users/stats');

export const updateMemberStatus = (userId, status) =>
  client.put(`/api/librarian/users/${userId}/status`, { status });

export const resetMemberPassword = (userId) =>
  client.post(resetMemberPasswordPath(userId));

export const enrollMemberFace = (userId, imageBase64) =>
  client.post(`/api/librarian/users/${userId}/enroll-face`, { image: imageBase64 });

export const deleteMemberFace = (userId, currentPassword) =>
  client.delete(`/api/librarian/users/${userId}/face`, { data: { current_password: currentPassword } });

export const deleteMemberAccount = (userId, currentPassword) =>
  client.delete(`/api/librarian/users/${userId}`, { data: { current_password: currentPassword } });

export const notifyMember = (transactionId) =>
  client.post(`/api/librarian/notify/${transactionId}`);

// Transactions
export const getTransactions = (params = {}) =>
  client.get('/api/transactions', { params });

export const borrowBook = (userId, bookId, copyId = null) =>
  client.post('/api/transactions/borrow', {
    user_id: userId,
    book_id: bookId,
    ...(copyId ? { copy_id: copyId } : {}),
  });

export const returnBook = (userId, bookId, copyId = null) =>
  client.post('/api/transactions/return', {
    user_id: userId,
    book_id: bookId,
    ...(copyId ? { copy_id: copyId } : {}),
  });

// Inventory
export const getInventoryStats = () =>
  client.get('/api/inventory/stats');

export const addBook = (data, requestId) =>
  client.post('/api/inventory/books', data, { headers: requestId ? { 'Idempotency-Key': requestId } : {} });

export const getInventoryWrite = (requestId) => client.get(`/api/inventory/write-requests/${requestId}`);

export const updateBook = (id, data) =>
  client.put(`/api/inventory/books/${id}`, data);

export const deleteBook = (id) =>
  client.delete(`/api/inventory/books/${id}`);

export const bulkUpload = async (formData, requestId, digest) =>
  client.post('/api/inventory/bulk-upload', await prepareUploadForm(formData, 'file', 'imports'), {
    headers: { 'Content-Type': 'multipart/form-data', ...(requestId ? { 'Idempotency-Key': requestId, 'X-Content-SHA256': digest } : {}) },
  });

export const getQRImage = (bookId) =>
  client.get(`/api/inventory/books/${bookId}/qr`, { responseType: 'blob' });

export const getBookCopies = (params = {}) =>
  client.get('/api/inventory/book-copies', { params });

export const getCopyQRImage = (copyId) =>
  client.get(`/api/inventory/book-copies/${copyId}/qr`, { responseType: 'blob' });

export const uploadBookCover = async (bookId, file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post(`/api/inventory/books/${bookId}/cover`, await prepareUploadForm(form, 'file', 'covers'), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const bulkQRPdf = (bookIds) =>
  client.post('/api/inventory/books/qr-pdf', bookIds, { responseType: 'blob' });

export const bulkCopyQRPdf = (copyIds) =>
  client.post('/api/inventory/book-copies/qr-pdf', copyIds, { responseType: 'blob' });

export const getMonthlyReportUrl = (month, year) =>
  `/api/reports/monthly?month=${month}&year=${year}`;

export const getMonthlyReport = (month, year) =>
  client.get('/api/reports/monthly', {
    params: { month, year },
    responseType: 'blob',
  });

// Notifications
export const getNotifications = (unreadOnly = false) =>
  client.get('/api/librarian/notifications', { params: { unread_only: unreadOnly } });

export const markNotificationRead = (id) =>
  client.patch(`/api/librarian/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  client.post('/api/librarian/notifications/read-all');

// Reservations (librarian view)
export const getLibReservations = (params = {}) =>
  client.get('/api/librarian/reservations', { params });

export const cancelLibReservation = (id) =>
  client.delete(`/api/librarian/reservations/${id}`);

export const getMemberReservations = (userId) =>
  client.get(`/api/librarian/member/${userId}/reservations`);

export const getMemberActiveLoans = (userId) =>
  client.get(`/api/librarian/member/${userId}/active-loans`);

export const exportAllCopyQRs = async (search, onProgress) => {
  const snapshot = await client.get('/api/inventory/book-copies/export', { params: { search } });
  return exportCopyBatches(snapshot.data, bulkCopyQRPdf, onProgress);
};


export const suggestBookCategory = (labels) =>
  client.post('/api/inventory/category-suggestion', {
    labels: labels.filter((label) => typeof label === 'string').slice(0, 100).map((label) => label.slice(0, 1000)),
  });

export const getCategoryReview = (skip = 0) => client.get('/api/inventory/category-review', { params: { skip, limit: 100 } });
export const getCategoryMasters = () => client.get('/api/inventory/category-masters');
export const resolveCategoryReview = (rawLabel, masterCategory) =>
  client.post('/api/inventory/category-review/resolve', { raw_api_label: rawLabel, master_category: masterCategory });
