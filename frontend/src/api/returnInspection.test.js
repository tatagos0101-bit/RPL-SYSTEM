import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectionError } from './returnInspection.js';

const good = { return_condition: 'good', inspection_reason: 'no_issues', inspection_confirmed: true, condition_fee: '0' };
test('return requires an explicit inspection and matching structured remark', () => {
  assert.ok(inspectionError());
  assert.ok(inspectionError({ ...good, inspection_confirmed: false }));
  assert.ok(inspectionError({ ...good, inspection_reason: 'reported_lost' }));
  assert.equal(inspectionError(good), '');
});
test('assessments must be valid and apply only to damage or loss', () => {
  assert.ok(inspectionError({ ...good, condition_fee: '25' }));
  const damaged = { ...good, return_condition: 'damaged', inspection_reason: 'torn_pages', condition_fee: '125.50' };
  assert.equal(inspectionError(damaged), '');
  for (const fee of ['-1', '5.123', 'NaN', '1000000', '']) assert.ok(inspectionError({ ...damaged, condition_fee: fee }));
  assert.ok(inspectionError({ ...damaged, inspection_reason: 'other', inspection_notes: ' ' }));
  assert.equal(inspectionError({ ...damaged, inspection_reason: 'other', inspection_notes: 'Synthetic damage remark' }), '');
  assert.equal(inspectionError({ ...good, return_condition: 'lost', inspection_reason: 'reported_lost' }), '');
});
