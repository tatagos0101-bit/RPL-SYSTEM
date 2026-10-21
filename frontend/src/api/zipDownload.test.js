import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZip, exportCopyBatches } from './zipDownload.js';

function readStoredEntries(bytes) {
  const view = new DataView(bytes.buffer), entries = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0);
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true);
    const start = offset + 30 + nameLength;
    const name = new TextDecoder().decode(bytes.slice(offset + 30, start));
    entries.set(name, bytes.slice(start, start + size));
    offset = start + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50);
  assert.equal(view.getUint16(bytes.length - 12, true), entries.size);
  return entries;
}

test('stored ZIP preserves binary PDF bytes, UTF-8 names and standard CRC32', async () => {
  const blob = await buildZip([{ name: 'test.pdf', blob: new Blob(['123456789']) },
    { name: 'labels-é.pdf', blob: new Blob([new Uint8Array([0, 255, 42])]) }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(14, true), 0xcbf43926);
  const entries = readStoredEntries(bytes);
  assert.deepEqual([...entries.get('labels-é.pdf')], [0, 255, 42]);
});

test('all export covers more than 10,000 identities with bounded requests and an exact manifest', async () => {
  const ids = Array.from({ length: 10001 }, (_, index) => index + 1), seen = [];
  const response = await exportCopyBatches({ copy_ids: ids, total: ids.length }, async batch => {
    assert.ok(batch.length <= 200); seen.push(...batch);
    return { data: new Blob(['%PDF synthetic']) };
  });
  assert.deepEqual(seen, ids);
  const entries = readStoredEntries(new Uint8Array(await response.data.arrayBuffer()));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.total_labels, 10001);
  assert.equal(manifest.parts.length, 51);
  assert.equal(manifest.parts.reduce((total, part) => total + part.labels, 0), 10001);
});

test('missing identities or failed middle batches never return a partial download', async () => {
  await assert.rejects(exportCopyBatches({ copy_ids: [1], total: 2 }, () => assert.fail('must not fetch')), /incomplete/);
  let calls = 0;
  await assert.rejects(exportCopyBatches({ copy_ids: Array.from({ length: 401 }, (_, i) => i + 1), total: 401 }, async () => {
    if (++calls === 2) throw new Error('Interrupted');
    return { data: new Blob(['%PDF']) };
  }), /Interrupted/);
  assert.equal(calls, 2);
});
