import test from 'node:test';
import assert from 'node:assert/strict';
import { readCirculation, saveCirculation, clearCirculation, submitCirculation, normalizeLibraryCode } from './circulationRecovery.js';
import { createQrCamera } from './qrCamera.js';

const storage = () => { const data = new Map(); return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }; };
const record = { operation: 'return', requestId: 'synthetic-id', payload: { user_id: 2, book_id: 3, copy_id: 4, transaction_id: 5 } };
const rejection = status => ({ response: { status, data: { detail: 'Synthetic rejection' } } });

test('normalizes actual copy and legacy formats; rejects URLs and ISBN', () => {
  assert.equal(normalizeLibraryCode(' rpl-book-00001-c001\r\n'), 'RPL-BOOK-00001-C001');
  assert.equal(normalizeLibraryCode('RPL-00001'), 'RPL-00001');
  for (const code of ['https://example.test', '9780140328721', '', 'x'.repeat(61)]) assert.throws(() => normalizeLibraryCode(code));
});
test('recovery IDs survive reloads, stay account scoped and clear individually', () => {
  const store = storage();
  saveCirculation('1', record, store);
  assert.deepEqual(readCirculation('1', store), [record]);
  assert.deepEqual(readCirculation('2', store), []);
  clearCirculation('2', record.requestId, store);
  assert.equal(readCirculation('1', store).length, 1);
  clearCirculation('1', record.requestId, store);
  assert.deepEqual(readCirculation('1', store), []);
  assert.throws(() => saveCirculation(null, record, store));
});
test('lost response reconciles only through a committed receipt', async () => {
  let calls = 0;
  const result = await submitCirculation(record, { send: async sent => { assert.equal(sent, record); calls++; throw new Error('timeout'); },
    lookup: async id => { assert.equal(id, record.requestId); return { data: { operation: 'return', result: { id: 5 } } }; } });
  assert.equal(result.status, 'confirmed'); assert.equal(calls, 1);
});
test('missing receipt stays unknown and never automatically replays', async () => {
  let calls = 0;
  const result = await submitCirculation(record, { send: async () => { calls++; throw new Error('timeout'); }, lookup: async () => { throw rejection(404); } });
  assert.equal(result.status, 'unknown'); assert.equal(calls, 1);
});
test('conflicts and validation errors are failures, transport failures stop the batch', async () => {
  for (const status of [400, 403, 404, 409, 422, 429]) {
    const result = await submitCirculation(record, { send: async () => { throw rejection(status); }, lookup: () => assert.fail('No ambiguous response') });
    assert.equal(result.status, 'failed');
  }
});
test('camera stops a stream received after permission resolves following cancellation', async () => {
  let resolve;
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const session = createQrCamera({ mediaDevices: { getUserMedia: () => new Promise(done => { resolve = done; }) },
    loadDecoder: async () => ({}), video: {}, onDevices: () => assert.fail(), onResult: () => assert.fail() });
  const pending = session.start();
  await Promise.resolve();
  session.stop(); resolve(stream); await pending;
  assert.equal(stopped, 1);
});
test('camera prefers rear lens, decodes QR and releases controls/tracks', async () => {
  let stopCount = 0;
  let callback;
  const stream = { getTracks: () => [{ stop: () => stopCount++ }] };
  const received = [];
  const session = createQrCamera({ mediaDevices: {
    getUserMedia: async constraints => { assert.equal(constraints.video.facingMode.ideal, 'environment'); return stream; },
    enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'camera' }, { kind: 'audioinput' }],
  }, loadDecoder: async () => ({ BrowserQRCodeReader: class {
    async decodeFromStream(actual, video, onResult) { assert.equal(actual, stream); callback = onResult; return { stop: () => stopCount++ }; }
  } }), video: {}, onDevices: devices => assert.equal(devices.length, 1), onResult: code => received.push(code) });
  await session.start(); callback({ getText: () => 'RPL-BOOK-00001-C001' }); session.stop();
  callback({ getText: () => 'ignored after close' });
  assert.deepEqual(received, ['RPL-BOOK-00001-C001']); assert.equal(stopCount, 2);
});
