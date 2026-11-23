import test from 'node:test';
import assert from 'node:assert/strict';
import { entryCaptureDimensions, preferCurrentFrame, readEntryDiagnostics, measureFrameDetail } from './entryCapture.js';

test('capture uses native pixels, preserves proportions and stays below decoder limits', () => {
  assert.deepEqual(entryCaptureDimensions(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(entryCaptureDimensions(640, 480), { width: 640, height: 480 });
  assert.deepEqual(entryCaptureDimensions(3840, 2160), { width: 2560, height: 1440 });
  assert.equal(entryCaptureDimensions(0, 0), null);
  const portrait = entryCaptureDimensions(2160, 3840);
  assert.ok(portrait.width * portrait.height < 4_000_000);
  assert.equal(portrait.height, 2560);
});

test('sharp-frame selection expires stale frames and prefers fresh ties', () => {
  const best = { score: 20, capturedAt: 100 };
  assert.equal(preferCurrentFrame(best, { score: 5 }, 150), false);
  assert.equal(preferCurrentFrame(best, { score: 20 }, 150), true);
  assert.equal(preferCurrentFrame(best, { score: 5 }, 350), true);
});

test('detail selection distinguishes a flat image from edges without authorizing faces', () => {
  const flat = new Uint8ClampedArray(8 * 8 * 4).fill(100);
  const edges = flat.slice();
  for (let i = 0; i < 64; i += 2) edges.fill(220, i * 4, i * 4 + 3);
  assert.ok(measureFrameDetail(edges, 8, 8).score > measureFrameDetail(flat, 8, 8).score);
});

test('camera diagnostics expose numeric readings only', () => {
  const data = readEntryDiagnostics({ 'server-timing': 'decode;dur=2.1, total;dur=123.45', 'x-entry-min-face-pixels': '95' }, 200.7);
  assert.equal(data.serverMs, 123);
  assert.equal(data.minFacePixels, 95);
  assert.equal(data.roundTripMs, 201);
  assert.equal(readEntryDiagnostics({ 'x-entry-frame-width': 'private-value' }, 0).frameWidth, null);
});
