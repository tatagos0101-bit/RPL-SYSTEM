import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addReservationCartItem,
  bookToReservationCartItem,
  loadReservationCart, saveReservationCart, clearReservationCart,
} from './reservationCart.js';

test('selections are isolated by account and anonymous visitor', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  saveReservationCart([{ id: 1 }], storage);
  storage.setItem('userId', '10');
  assert.deepEqual(loadReservationCart(storage), []);
  saveReservationCart([{ id: 2 }], storage);
  storage.setItem('userId', '20');
  assert.deepEqual(loadReservationCart(storage), []);
  saveReservationCart([{ id: 3 }], storage);
  storage.setItem('rp_cart:member:20:confirmation', 'synthetic pending confirmation');
  storage.setItem('rp_cart:member:10:confirmation', 'other account confirmation');
  clearReservationCart(storage);
  assert.equal(storage.getItem('rp_cart:member:20:confirmation'), undefined);
  assert.equal(storage.getItem('rp_cart:member:10:confirmation'), 'other account confirmation');
  storage.setItem('userId', '10');
  assert.deepEqual(loadReservationCart(storage), [{ id: 2 }]);
  storage.removeItem('userId');
  assert.deepEqual(loadReservationCart(storage), [{ id: 1 }]);
});

test('bookToReservationCartItem maps API book data to My Selection item shape', () => {
  const item = bookToReservationCartItem({
    id: 7,
    title: 'Noli Me Tangere',
    author: 'Jose Rizal',
    category: 'Classic',
    cover_url: '/covers/noli.jpg',
    copies_available: 0,
    availability_status: 'Unavailable',
  });

  assert.deepEqual(item, {
    id: 7,
    title: 'Noli Me Tangere',
    author: 'Jose Rizal',
    category: 'Classic',
    cover: '/covers/noli.jpg',
    copies_available: 0,
    availability_status: 'Unavailable',
  });
});

test('addReservationCartItem appends a new book once and reports duplicates', () => {
  const existing = [
    { id: 7, title: 'Noli Me Tangere', author: 'Jose Rizal', category: 'Classic', cover: null },
  ];
  const book = {
    id: 8,
    title: 'El Filibusterismo',
    author: 'Jose Rizal',
    category: 'Classic',
    cover_url: '/covers/fili.jpg',
  };

  const added = addReservationCartItem(existing, book);
  const duplicate = addReservationCartItem(added.items, book);

  assert.equal(added.added, true);
  assert.equal(added.items.length, 2);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.items.length, 2);
});
