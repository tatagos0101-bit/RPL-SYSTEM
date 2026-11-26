import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationBase, notificationHref, notificationContext } from './notificationLinks.js';

test('overdue email notices link to the matching borrowing records', () => {
  for (const type of ['overdue_email_sent', 'overdue_email_unknown']) {
    assert.equal(notificationContext({ type }, 'member').to, '/user/home#borrowed-books');
    assert.equal(notificationContext({ type }, 'librarian').to, '/librarian/due-books');
  }
});

test('notification details use the matching protected role route', () => {
  assert.equal(notificationHref('member', 12), '/user/notifications/12');
  assert.equal(notificationHref('librarian', 13), '/librarian/notifications/13');
  assert.throws(() => notificationBase('admin'));
});
test('untrusted notification IDs cannot introduce a navigation destination', () => {
  for (const id of ['https://example.test', '../settings', '1?next=evil', -1, 0, null, '9007199254740993']) {
    assert.equal(notificationHref('member', id), '/user/notifications');
  }
});
test('related actions use known workflows and never URLs in notification text', () => {
  assert.equal(notificationContext({ type: 'reservation_ready' }, 'member').to, '/user/reservations');
  assert.equal(notificationContext({ type: 'reservation' }, 'librarian').to, '/librarian/reservations');
  assert.equal(notificationContext({ type: 'report' }, 'librarian').to, '/librarian/borrow-return');
  assert.equal(notificationContext({ type: 'unknown', message: 'javascript:alert(1)' }, 'member').to, undefined);
});
