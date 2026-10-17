import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSections } from './loadSections.js';

test('one unavailable dashboard section does not discard successful sections', async () => {
  const values = [];
  const failures = await loadSections([
    ['totals', async () => ({ data: 5 }), value => values.push(value)],
    ['activity', async () => { throw new Error('unavailable'); }, () => {}],
  ]);
  assert.deepEqual(values, [5]);
  assert.deepEqual(failures, ['activity']);
});
