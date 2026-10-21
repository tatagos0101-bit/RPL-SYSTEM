// Stored ZIP entries keep export assembly dependency-free. Each PDF is already
// compressed; do not recompress it or convert binary data through text.
const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function checksum(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export async function buildZip(entries) {
  if (entries.length > 65535) throw new Error('Export exceeds the ZIP entry limit. Narrow the search.');
  const parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const { name, blob } of entries) {
    const filename = encoder.encode(name);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (offset + bytes.length + filename.length + 30 > 0xffffffff) throw new Error('Export exceeds 4 GB. Narrow the search.');
    const crc = checksum(bytes);
    const header = new Uint8Array(30 + filename.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true); view.setUint16(12, 33, true);
    view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true);
    view.setUint16(26, filename.length, true); header.set(filename, 30);
    parts.push(header, blob);
    const central = new Uint8Array(46 + filename.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true);
    cv.setUint16(28, filename.length, true); cv.setUint32(42, offset, true); central.set(filename, 46);
    directory.push(central); directorySize += central.length; offset += header.length + bytes.length;
  }
  if (offset + directorySize > 0xffffffff) throw new Error('Export exceeds 4 GB. Narrow the search.');
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}

export async function exportCopyBatches(snapshot, fetchPdf, onProgress = () => {}) {
  const ids = snapshot.copy_ids;
  if (!Array.isArray(ids) || !ids.length || ids.length !== snapshot.total
      || new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) {
    throw new Error('The export snapshot is incomplete. Refresh and retry.');
  }
  const entries = [], parts = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const response = await fetchPdf(batch);
    const name = `copy-labels-${String(parts.length + 1).padStart(4, '0')}.pdf`;
    entries.push({ name, blob: response.data }); parts.push({ file: name, labels: batch.length });
    onProgress(Math.min(offset + 200, ids.length), ids.length);
  }
  entries.push({ name: 'manifest.json', blob: new Blob([JSON.stringify({ total_labels: ids.length, parts })]) });
  // No download is returned until every captured identity has a successful PDF.
  return { data: await buildZip(entries) };
}
