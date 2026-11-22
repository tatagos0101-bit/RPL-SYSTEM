import test from 'node:test';
import assert from 'node:assert/strict';
import { loginErrorMessage } from './loginErrors.js';

test('preserves the non-enumerating credentials and portal messages', () => {
  for (const [status, detail] of [
    [401, 'Invalid email/Member ID or password'],
    [403, 'This account belongs to the other portal. Use its matching sign-in page.'],
  ]) {
    assert.equal(loginErrorMessage({ response: { status, data: { detail } } }), detail);
  }
});

test('explains rate limiting even when SlowAPI returns error instead of detail', () => {
  assert.match(loginErrorMessage({ response: { status: 429, data: { error: 'Rate limit exceeded' } } }), /Too many sign-in attempts.*wait a minute/i);
});

test('explains unavailable services without displaying proxy HTML or server internals', () => {
  for (const data of ['<html>Bad gateway</html>', { detail: 'Private database diagnostic' }]) {
    const message = loginErrorMessage({ response: { status: 502, data } });
    assert.match(message, /temporarily unavailable/);
    assert.doesNotMatch(message, /<html>|Private database/);
  }
});

test('distinguishes timeouts from failed credentials', () => {
  for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
    assert.match(loginErrorMessage({ code }), /took too long/);
  }
});

test('explains connection failures without exposing request configuration', () => {
  const message = loginErrorMessage({ code: 'ERR_NETWORK', config: { data: 'private submitted fields' } });
  assert.match(message, /server could not be reached/);
  assert.doesNotMatch(message, /private submitted fields/);
});

test('renders validation arrays as a readable string instead of React children', () => {
  const message = loginErrorMessage({ response: { status: 422, data: { detail: [{ loc: ['body', 'password'], msg: 'Invalid value' }] } } });
  assert.equal(typeof message, 'string');
  assert.match(message, /Check your email or Member ID and password/);
});

test('identifies unavailable browser storage after an otherwise successful login', () => {
  for (const name of ['SecurityError', 'QuotaExceededError']) {
    assert.match(loginErrorMessage({ name }), /browser could not save your sign-in/);
  }
});

test('returns a safe fallback for missing or unexpected errors', () => {
  assert.equal(typeof loginErrorMessage(), 'string');
  assert.equal(typeof loginErrorMessage({ response: { status: 400, data: {} } }), 'string');
});
