import test from 'node:test';
import assert from 'node:assert/strict';

import { getLibrarianHomeLayoutClasses } from './librarianHomeLayout.js';

test('librarian home uses the available desktop width after sidebar drawer change', () => {
  const classes = getLibrarianHomeLayoutClasses();

  assert.equal(classes.page.includes('max-w-7xl'), false);
  assert.equal(classes.content.includes('max-w-7xl'), false);
  assert.equal(classes.content.includes('mx-auto'), false);
  assert.equal(classes.page.includes('w-full'), true);
  assert.equal(classes.content.includes('max-w-none'), true);
});
