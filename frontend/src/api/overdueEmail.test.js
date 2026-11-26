import test from 'node:test';
import assert from 'node:assert/strict';
import { overdueEmailOutcome, overdueEmailError } from './overdueEmail.js';

test('only explicit email-service acceptance is presented as submitted', () => {
  assert.equal(overdueEmailOutcome({ status: 'accepted', message: 'Submitted' }).status, 'accepted');
  for (const data of [{ success: true }, {}, { status: 'unknown' }, null]) {
    assert.equal(overdueEmailOutcome(data).status, 'unknown');
  }
  assert.equal(overdueEmailOutcome({ status: 'failed' }).status, 'failed');
  assert.ok(!overdueEmailOutcome({ success: true, message: 'Email sent' }).message.includes('Email sent'));
});

test('timeouts and server failures do not invite an unconfirmed send to be replayed', () => {
  for (const error of [{}, { response: { status: 502 } }, { response: { status: 500, data: { detail: 'Private provider text' } } }]) {
    const result = overdueEmailError(error);
    assert.equal(result.status, 'unknown');
    assert.ok(!result.message.includes('Private provider text'));
  }
  assert.equal(overdueEmailError({ response: { status: 429, data: { detail: 'Wait for the previous send' } } }).status, 'recent');
  assert.equal(overdueEmailError({ response: { status: 422, data: { detail: 'Verify email first' } } }).message, 'Verify email first');
});
