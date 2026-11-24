import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPasswordChangeRequest, isValidNewPassword } from './passwordPolicy.js';
import { PRIVACY_NOTICE_VERSION } from './privacyPolicy.js';

test('new password length and digit requirements', () => {
  for (const value of ['short1', 'nodigitsatall', 'A1'.repeat(65)]) assert.equal(isValidNewPassword(value), false);
  for (const value of ['Password1', 'A1'.repeat(64), '😀'.repeat(7) + '1']) assert.equal(isValidNewPassword(value), true);
});

test('password change records the displayed notice version only after affirmative acknowledgment', () => {
  assert.deepEqual(buildPasswordChangeRequest(null, 'Example1', { acceptPrivacyPolicy: true }), {
    new_password: 'Example1',
    accept_privacy_policy: true,
    privacy_policy_version: PRIVACY_NOTICE_VERSION,
  });
  assert.deepEqual(buildPasswordChangeRequest(null, 'Example1', { acceptPrivacyPolicy: false }), {
    new_password: 'Example1',
  });
  assert.deepEqual(buildPasswordChangeRequest('Previous1', 'Example1'), {
    current_password: 'Previous1',
    new_password: 'Example1',
  });
});
