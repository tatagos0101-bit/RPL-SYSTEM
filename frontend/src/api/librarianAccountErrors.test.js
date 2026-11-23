import test from 'node:test';
import assert from 'node:assert/strict';
import { staffAccountError } from './librarianAccountErrors.js';

test('uncertain account creation instructs staff to check before repeating', () => {
  for (const error of [{}, { code: 'ECONNABORTED' }, { response: { status: 503 } }]) {
    assert.match(staffAccountError(error), /could not be confirmed/);
    assert.match(staffAccountError(error), /before trying again/);
  }
});

test('validation errors never expose raw request data or password values', () => {
  const error = { response: { status: 422, data: { detail: [{ input: 'private-password', msg: 'Invalid input' }] } } };
  assert.equal(staffAccountError(error).includes('private-password'), false);
  assert.match(staffAccountError(error), /Check the name/);
  assert.match(staffAccountError({ response: { status: 429 } }), /wait a minute/);
  assert.equal(staffAccountError({ response: { status: 409, data: { detail: 'Account already exists.' } } }), 'Account already exists.');
});
