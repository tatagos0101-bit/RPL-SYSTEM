import test from 'node:test';
import assert from 'node:assert/strict';
import { appendIdentityReview, idFileError } from './identityForm.js';
import { buildFaceEnrollment } from './faceConsent.js';

test('ID uploads reject PDFs, empty files and oversized images', () => {
  assert.match(idFileError(new File(['synthetic'], 'id.pdf', { type: 'application/pdf' })), /PDF/);
  assert.match(idFileError(new File([], 'id.jpg', { type: 'image/jpeg' })), /10 MB/);
  assert.match(idFileError({ type: 'image/jpeg', size: 11 * 1024 * 1024 }), /10 MB/);
  assert.equal(idFileError(new File(['synthetic'], 'id.jpg', { type: 'image/jpeg' })), '');
});

test('registration needs an ID review and preserves the bound upload ticket', () => {
  assert.throws(() => appendIdentityReview(new FormData(), null, true), /check the required photo ID/);
  const prepared = new FormData(); prepared.set('upload_ticket', 'synthetic-owner-bound-ticket');
  const form = new FormData(); form.set('name', 'Reviewed Synthetic Name');
  appendIdentityReview(form, { review_token: 'synthetic-review', prepared }, true);
  assert.equal(form.get('name'), 'Reviewed Synthetic Name');
  assert.equal(form.get('upload_ticket'), 'synthetic-owner-bound-ticket');
  assert.equal(form.get('id_review_token'), 'synthetic-review');
  assert.equal(form.get('identity_checked'), 'true');
});

test('remote enrollment submits a separate comparison ID with current consent', () => {
  const body = buildFaceEnrollment('synthetic-live', true, 'synthetic-id');
  assert.equal(body.id_image, 'synthetic-id');
  assert.equal(body.image, 'synthetic-live');
  assert.equal(body.face_consent_version, '2026-11-25');
  assert.equal(body.accept_face_recognition, true);
  assert.equal(Object.hasOwn(buildFaceEnrollment('synthetic-live', true), 'id_image'), false);
});
