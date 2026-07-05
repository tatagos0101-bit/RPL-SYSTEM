import test from 'node:test';
import assert from 'node:assert/strict';

import { isQuietWalkThroughMessage, shouldLoadEntryStationLogsOnMount } from './entryStationState.js';

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
