import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidNewPassword } from './passwordPolicy.js';

test('new password length and digit requirements', () => {
  for (const value of ['short1', 'nodigitsatall', 'A1'.repeat(65)]) assert.equal(isValidNewPassword(value), false);
  for (const value of ['Password1', 'A1'.repeat(64), '😀'.repeat(7) + '1']) assert.equal(isValidNewPassword(value), true);
});
