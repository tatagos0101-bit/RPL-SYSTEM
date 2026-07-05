import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addReservationCartItem,
  bookToReservationCartItem,
} from './reservationCart.js';

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
