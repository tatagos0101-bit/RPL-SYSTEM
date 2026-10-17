import client from './client';

export const getReservations = () =>
  client.get('/api/reservations');

export const createReservation = (bookId) =>
  client.post('/api/reservations', { book_id: bookId });

export const confirmReservations = (payload) => client.post('/api/reservations/confirm', payload);
export const getBorrowingCapacity = (memberId) => client.get(memberId
  ? `/api/librarian/member/${memberId}/borrowing-capacity` : '/api/user/borrowing-capacity');

export const cancelReservation = (id) =>
  client.delete(`/api/reservations/${id}`);
