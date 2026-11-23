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
      { to: '/librarian/catalog', label: 'Public Catalog' },
    ],
  );
});

test('staff public catalog keeps the librarian portal route', () => {
  const catalogLink = STAFF_LIBRARIAN_NAV_LINKS.find(link => link.key === 'public-catalog');

  assert.deepEqual(
    { to: catalogLink?.to, label: catalogLink?.label },
    { to: '/librarian/catalog', label: 'Public Catalog' },
  );
});

test('staff can open the entrance station directly while the public navigation stays unchanged', () => {
  const routes = STAFF_LIBRARIAN_NAV_LINKS.map((link) => link.to);
  const stationLink = STAFF_LIBRARIAN_NAV_LINKS.find(link => link.key === 'entry-station');

  assert.deepEqual(stationLink, { key: 'entry-station', to: '/entry-station', label: 'Entrance Station' });
  assert.equal(PUBLIC_LIBRARIAN_NAV_LINKS.some(link => link.to === '/entry-station'), false);
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

test('librarian account creation has its own main-librarian-only route', () => {
  const staff = STAFF_LIBRARIAN_NAV_LINKS.find(link => link.key === 'staff');
  const members = STAFF_LIBRARIAN_NAV_LINKS.find(link => link.key === 'users');
  assert.equal(staff.to, '/librarian/staff');
  assert.equal(staff.managerOnly, true);
  assert.notEqual(staff.to, members.to);
});
