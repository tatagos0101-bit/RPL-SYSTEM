import client from './client';

export const getFavorites = () => client.get('/api/user/favorites');
export const favoriteBook = (bookId) => client.put(`/api/user/favorites/${bookId}`);
export const unfavoriteBook = (bookId) => client.delete(`/api/user/favorites/${bookId}`);
export const recordBookView = (bookId) => client.post(`/api/user/book-views/${bookId}`);
