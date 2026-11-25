import test from 'node:test';
import assert from 'node:assert/strict';
import { faceEnrollmentSupportDetails } from './faceConsent.js';

const diagnostic = () => ({ model: 'sface_2021dec_int8', metric: 'cosine_distance', stage: 'live_to_saved',
  maximum_distance: 0.45, distances: { id_to_saved: 0, live_to_saved: 0.6, live_to_id: 0.6 },
  quality: { live: { width_px: 180, height_px: 220, brightness: 130, contrast: 42, sharpness: 98.1 } } });

test('support report contains only the known comparison and quality measurements', () => {
  const report = faceEnrollmentSupportDetails(diagnostic());
  assert.match(report, /^RPL-ID-FACE-DIAG\/1/);
  assert.match(report, /live_to_saved=0\.6000/);
  assert.match(report, /maximum_distance=0\.4500/);
  assert.match(report, /live\.width_px=180/);
});

test('support copying excludes every identity, image, reference and template extra', () => {
  const value = diagnostic();
  Object.assign(value, { email: 'synthetic@example.test', name: 'Synthetic Person', image: 'data:image/png;base64,private',
    encoding: [1, 2], id_document_digest: 'synthetic-private-digest', current_password: 'SyntheticSecret' });
  value.quality.live.image = 'private-image'; value.distances.token = 'private-token';
  const report = faceEnrollmentSupportDetails(value);
  for (const privateValue of ['synthetic@example.test', 'Synthetic Person', 'base64', 'encoding', 'synthetic-private-digest', 'SyntheticSecret', 'private-image', 'private-token']) assert.ok(!report.includes(privateValue));
});

test('malformed or unrelated API errors cannot become a support report', () => {
  for (const value of [undefined, null, {}, { ...diagnostic(), model: 'arbitrary text' }, { ...diagnostic(), stage: '<script>' },
    { ...diagnostic(), stage: 'id_to_saved' }, { ...diagnostic(), metric: 'password' }]) assert.equal(faceEnrollmentSupportDetails(value), '');
  const value = diagnostic();
  value.distances.live_to_saved = Infinity; value.quality.live.width_px = '<img>'; value.quality.live.height_px = -1;
  const report = faceEnrollmentSupportDetails(value);
  assert.ok(!report.includes('Infinity') && !report.includes('<img>') && !report.includes('live.height_px'));
});

test('live alignment reports allow only known detector issue codes', () => {
  const value = { ...diagnostic(), stage: 'live_alignment', detector_issue: 'not_found', distances: { id_to_saved: 0 } };
  const report = faceEnrollmentSupportDetails(value);
  assert.match(report, /stage=live_alignment/);
  assert.match(report, /detector_issue=not_found/);
  assert.match(report, /id_to_saved=0\.0000/);
  assert.ok(!report.includes('live_to_saved='));
  value.detector_issue = 'private-or-arbitrary-text';
  assert.ok(!faceEnrollmentSupportDetails(value).includes(value.detector_issue));
});

test('the fixed preprocessing identifier is copied without accepting arbitrary text', () => {
  const value = { ...diagnostic(), preprocessing: 'face_scale_160_lanczos_v1' };
  assert.match(faceEnrollmentSupportDetails(value), /preprocessing=face_scale_160_lanczos_v1/);
  value.preprocessing = 'private-arbitrary-text';
  assert.ok(!faceEnrollmentSupportDetails(value).includes(value.preprocessing));
});
