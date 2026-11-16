import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberRegistrationForm, registrationDeliveryNotice, registrationErrorMessage } from './memberRegistration.js';

test('optional ID is omitted while name/address and supplied contacts are trimmed', () => {
  const body = buildMemberRegistrationForm({ name: ' Synthetic Member ', location: ' Test Library ', email: ' reader@example.com ', phone: ' ' }, null);
  assert.equal(body.get('name'), 'Synthetic Member');
  assert.equal(body.get('location'), 'Test Library');
  assert.equal(body.get('email'), 'reader@example.com');
  assert.equal(body.has('phone'), false);
  assert.equal(body.has('id_image'), false);
});

test('optional attachment is retained as a File for the existing private upload path', () => {
  const file = new File(['synthetic fixture'], 'sample.pdf', { type: 'application/pdf' });
  const body = buildMemberRegistrationForm({ name: 'Synthetic', location: 'Test Library' }, file);
  assert.equal(body.get('id_image'), file);
});

test('accepted email and SMS describe delivery without exposing a temporary password', () => {
  for (const channel of ['email', 'sms']) {
    const notice = registrationDeliveryNotice({ password_delivery: { channel, status: 'accepted' }, temporary_password: 'synthetic-private' });
    assert.equal(notice.tone, 'success');
    assert.equal(notice.temporaryPassword, null);
    assert.match(notice.title, channel === 'email' ? /email/i : /text/i);
  }
});

test('manual, unavailable and unknown provider outcomes offer the original handoff password', () => {
  for (const status of ['manual', 'unavailable', 'failed']) {
    const notice = registrationDeliveryNotice({ password_delivery: { channel: status === 'manual' ? 'librarian' : 'sms', status }, temporary_password: 'Synthetic1' });
    assert.equal(notice.tone, 'warning');
    assert.equal(notice.temporaryPassword, 'Synthetic1');
    assert.match(notice.message, /member/i);
  }
});

test('older registration response supports manual handoff without inventing delivery success', () => {
  const legacy = registrationDeliveryNotice({ temporary_password: 'Synthetic1' });
  assert.equal(legacy.temporaryPassword, 'Synthetic1');
  assert.equal(legacy.tone, 'warning');
  const unknown = registrationDeliveryNotice({});
  assert.equal(unknown.temporaryPassword, null);
  assert.match(unknown.message, /reset password/i);
});

test('unknown registration responses tell staff to check members before another registration', () => {
  assert.match(registrationErrorMessage({}), /check the member list/i);
  assert.equal(registrationErrorMessage({ response: { data: { detail: 'Synthetic validation message' } } }), 'Synthetic validation message');
  assert.equal(registrationErrorMessage({ response: { data: { detail: [{ msg: 'Name required' }] } } }), 'Name required');
});
