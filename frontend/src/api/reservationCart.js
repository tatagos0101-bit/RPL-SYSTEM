export const RESERVATION_CART_KEY = 'rp_cart';

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
    const parsed = JSON.parse(storage.getItem(RESERVATION_CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveReservationCart = (items, storage = localStorage) => {
  const current = Array.isArray(items) ? items : [];
  storage.setItem(RESERVATION_CART_KEY, JSON.stringify(current));
  return current;
};
