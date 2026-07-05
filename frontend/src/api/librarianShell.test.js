import test from 'node:test';
import assert from 'node:assert/strict';

import { getLibrarianShellClasses } from './librarianShell.js';

test('librarian shell keeps sidebar as an overlay drawer on desktop and mobile', () => {
  const closed = getLibrarianShellClasses(false);
  const open = getLibrarianShellClasses(true);

  assert.equal(closed.nav.includes('lg:ml-72'), false);
  assert.equal(closed.nav.includes('lg:w-[calc(100%-18rem)]'), false);
  assert.equal(closed.main.includes('lg:pl-72'), false);
  assert.equal(closed.sidebar.includes('lg:translate-x-0'), false);
  assert.equal(closed.hamburger.includes('lg:hidden'), false);
  assert.equal(closed.overlay.includes('lg:hidden'), false);
  assert.equal(closed.sidebar.includes('-translate-x-full'), true);
  assert.equal(open.sidebar.includes('translate-x-0'), true);
});

