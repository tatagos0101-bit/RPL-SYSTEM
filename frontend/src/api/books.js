import client from './client';

export const getBooks = (params = {}) =>
  client.get('/api/books', { params });

export const getBook = (id) =>
  client.get(`/api/books/${id}`);

export const getCategories = () =>
  client.get('/api/books/categories');

export const getTrending = (limit = 10) =>
  client.get('/api/books/trending', { params: { limit } });

export const getBookByQR = (qrCode) =>
  client.get(`/api/books/qr/${qrCode}`);

export const getBookByScan = (code) =>
  client.get(`/api/books/scan/${encodeURIComponent(code)}`);

export const getLoanPolicy = () => client.get('/api/books/policy');
