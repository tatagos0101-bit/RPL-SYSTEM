import client from './client';

export const getLibrarianAccounts = (page = 1, signal) =>
  client.get('/api/librarian/staff', { params: { page, page_size: 25 }, signal }).then(response => response.data);

export const createLibrarianAccount = body =>
  client.post('/api/librarian/staff', body, { timeout: 30000 }).then(response => response.data);
