import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addScannedBookCartItem,
  cartItemKey,
  scanResultToCartItem,
} from './bookCopyScan.js';

const scanResult = {
  qr_type: 'copy',
  can_borrow: true,
  message: 'Copy is available for borrowing.',
  book: {
    id: 7,
    title: 'Noli Me Tangere',
    author: 'Jose Rizal',
    category: 'Novel',
    qr_code: 'RPL-00007',
  },
  copy: {
    id: 42,
    book_id: 7,
    copy_number: 2,
    qr_code: 'RPL-BOOK-00007-C002',
    status: 'available',
  },
};

test('scanResultToCartItem keeps exact physical copy details', () => {
  const item = scanResultToCartItem(scanResult);

  assert.equal(item.id, 7);
  assert.equal(item.copy_id, 42);
  assert.equal(item.copy_number, 2);
  assert.equal(item.copy_qr, 'RPL-BOOK-00007-C002');
  assert.equal(item.copy_status, 'available');
  assert.equal(item.scan_qr_type, 'copy');
  assert.equal(cartItemKey(item), 'copy-42');
});

test('addScannedBookCartItem rejects duplicate physical copy scans', () => {
  const first = addScannedBookCartItem([], scanResultToCartItem(scanResult));
  const duplicate = addScannedBookCartItem(first.items, scanResultToCartItem(scanResult));

  assert.equal(first.added, true);
  assert.equal(first.items.length, 1);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.error, 'This physical copy is already in the session.');
  assert.equal(duplicate.items.length, 1);
});

test('addScannedBookCartItem still rejects duplicate legacy book scans by book id', () => {
  const legacy = scanResultToCartItem({
    qr_type: 'book',
    can_borrow: true,
    message: 'Legacy book QR recognized.',
    book: scanResult.book,
    copy: null,
  });

  const first = addScannedBookCartItem([], legacy);
  const duplicate = addScannedBookCartItem(first.items, legacy);

  assert.equal(first.added, true);
  assert.equal(cartItemKey(legacy), 'book-7');
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.error, 'This book is already in the session.');
});
