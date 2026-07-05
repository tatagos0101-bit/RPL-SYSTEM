import client from './client';

export const getReservations = () =>
  client.get('/api/reservations');

export const createReservation = (bookId) =>
  client.post('/api/reservations', { book_id: bookId });

export const cancelReservation = (id) =>
  client.delete(`/api/reservations/${id}`);
