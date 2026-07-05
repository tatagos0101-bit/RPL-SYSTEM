import test from 'node:test';
import assert from 'node:assert/strict';

import { formatTimeLeft, parseApiDateTime } from './dateTime.js';

test('parseApiDateTime treats timezone-less API datetimes as Philippine time', () => {
  const parsed = parseApiDateTime('2026-07-01T14:26:46');

  assert.equal(parsed.toISOString(), '2026-07-01T06:26:46.000Z');
});

test('parseApiDateTime preserves explicit timezone offsets', () => {
  const parsed = parseApiDateTime('2026-07-01T14:26:46+08:00');

  assert.equal(parsed.toISOString(), '2026-07-01T06:26:46.000Z');
});

test('formatTimeLeft shows a 24-hour pickup window as 23h 59m near creation time', () => {
  const now = Date.parse('2026-06-30T14:26:50+08:00');

  assert.equal(formatTimeLeft('2026-07-01T14:26:46', now), '23h 59m left');
});
