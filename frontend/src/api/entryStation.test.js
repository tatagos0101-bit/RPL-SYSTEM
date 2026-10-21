import test from 'node:test';
import assert from 'node:assert/strict';

import { entryStationRetryDelay, isQuietWalkThroughMessage, shouldLoadEntryStationLogsOnMount } from './entryStationState.js';

test('entry station does not show checking state before a PIN is available', () => {
  assert.equal(shouldLoadEntryStationLogsOnMount(''), false);
  assert.equal(shouldLoadEntryStationLogsOnMount('   '), false);
});

test('entry station shows checking state when a stored PIN can be validated', () => {
  assert.equal(shouldLoadEntryStationLogsOnMount('1234'), true);
});

test('entry station keeps scanning quietly for non-blocking walk-through hints', () => {
  assert.equal(isQuietWalkThroughMessage('no_face'), true);
  assert.equal(isQuietWalkThroughMessage('too_far'), true);
  assert.equal(isQuietWalkThroughMessage('too_dark'), false);
});

test('station retries respect Retry-After seconds and HTTP dates', () => {
  const now = Date.parse('Sun, 18 Oct 2026 00:00:00 GMT');
  const error = value => ({ response: { status: 429, headers: { 'retry-after': value } } });
  assert.equal(entryStationRetryDelay(error('12'), now), 12000);
  assert.equal(entryStationRetryDelay(error('Sun, 18 Oct 2026 00:02:00 GMT'), now), 120000);
  assert.equal(entryStationRetryDelay(error('0'), now), 1000);
  assert.equal(entryStationRetryDelay({ response: { headers: new Headers({ 'Retry-After': '8' }) } }, now), 8000);
});

test('missing or malformed retry hints cannot cause immediate retry storms', () => {
  for (const value of [undefined, '', 'bad', '-1', 'Infinity', '1.5', '9'.repeat(400)]) {
    assert.equal(entryStationRetryDelay({ response: { status: 429, headers: { 'retry-after': value } } }), 60000);
  }
  assert.equal(entryStationRetryDelay({ response: { status: 503 } }), 5000);
  assert.equal(entryStationRetryDelay(new Error('Network Error')), 5000);
});
