import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLIC_LIBRARIAN_NAV_LINKS,
  STAFF_LIBRARIAN_NAV_LINKS,
} from './librarianNavigation.js';

test('public librarian navigation exposes only safe public links', () => {
  assert.deepEqual(
    PUBLIC_LIBRARIAN_NAV_LINKS.map(({ to, label }) => ({ to, label })),
    [
      { to: '/librarian', label: 'Librarian Home' },
      { to: '/browse', label: 'Public Catalog' },
    ],
  );
});

test('staff librarian navigation does not expose the entrance station route', () => {
  const routes = STAFF_LIBRARIAN_NAV_LINKS.map((link) => link.to);

  assert.equal(routes.includes('/entry-station'), false);
  assert.equal(routes.includes('/librarian/entry'), false);
  assert.equal(routes.includes('/librarian/borrow-return'), true);
});

test('staff librarian navigation exposes printable reports', () => {
  const reportsLink = STAFF_LIBRARIAN_NAV_LINKS.find((link) => link.key === 'reports');

  assert.deepEqual(
    { to: reportsLink?.to, label: reportsLink?.label },
    { to: '/librarian/reports', label: 'Reports' },
  );
});
