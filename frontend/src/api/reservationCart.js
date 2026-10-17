export const RESERVATION_CART_KEY = 'rp_cart';

export const reservationCartKey = (storage = localStorage) => {
  const userId = storage.getItem('userId');
  return userId ? `${RESERVATION_CART_KEY}:member:${userId}` : `${RESERVATION_CART_KEY}:anonymous`;
};

export const clearReservationCart = (storage = localStorage) => {
  storage.removeItem(reservationCartKey(storage));
  storage.removeItem(`${reservationCartKey(storage)}:confirmation`);
};

export const pendingConfirmationKey = () => `${reservationCartKey()}:confirmation`;
export const loadPendingConfirmation = () => {
  try { return JSON.parse(localStorage.getItem(pendingConfirmationKey()) || 'null'); }
  catch { return null; }
};

export const bookToReservationCartItem = (book) => ({
  id: book.id,
  title: book.title,
  author: book.author,
  category: book.category,
  cover: book.cover_url ?? book.cover ?? null,
  copies_available: book.copies_available,
  availability_status: book.availability_status,
});

export const addReservationCartItem = (items, book) => {
  const current = Array.isArray(items) ? items : [];
  if (current.some((item) => item.id === book.id)) {
    return { items: current, added: false };
  }
  return {
    items: [...current, bookToReservationCartItem(book)],
    added: true,
  };
};

export const loadReservationCart = (storage = localStorage) => {
  try {
    const parsed = JSON.parse(storage.getItem(reservationCartKey(storage)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveReservationCart = (items, storage = localStorage) => {
  const current = Array.isArray(items) ? items : [];
  storage.setItem(reservationCartKey(storage), JSON.stringify(current));
  return current;
};
