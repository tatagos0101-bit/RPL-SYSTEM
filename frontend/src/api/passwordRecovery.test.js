import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPasswordResetConfirm,
  buildPasswordResetRequest,
  resetMemberPasswordPath,
} from './passwordRecovery.js';

test('buildPasswordResetRequest trims identifier and omits automatic channel', () => {
  assert.deepEqual(buildPasswordResetRequest('  juan@example.com  ', 'auto'), {
    identifier: 'juan@example.com',
  });
});

test('buildPasswordResetRequest includes explicit email or sms channel', () => {
  assert.deepEqual(buildPasswordResetRequest('RPL-12345', 'sms'), {
    identifier: 'RPL-12345',
    channel: 'sms',
  });
});

test('buildPasswordResetConfirm maps frontend fields to API shape', () => {
  assert.deepEqual(buildPasswordResetConfirm(' RPL-12345 ', ' 123456 ', 'new-password'), {
    identifier: 'RPL-12345',
    code: '123456',
    new_password: 'new-password',
  });
});

test('resetMemberPasswordPath returns librarian reset endpoint', () => {
  assert.equal(resetMemberPasswordPath(42), '/api/librarian/users/42/reset-password');
});
