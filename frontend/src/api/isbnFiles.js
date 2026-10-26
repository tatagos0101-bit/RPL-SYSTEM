import * as XLSX from 'xlsx';

export const normalizeISBN = value => String(value ?? '').replace(/[-\s]/g, '').toUpperCase();
export const isISBN = value => /^(?:\d{9}[\dX]|\d{13})$/.test(value);

export async function extractISBNsFromFile(file) {
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
    throw new Error('Choose a .csv, .xlsx, or .xls file for ISBN lookup.');
  }
  const data = await file.arrayBuffer();
  // CSV values are identifiers, not numbers: automatic conversion loses the
  // leading zero of ISBN-10. Excel numeric ISBN-13 cells remain supported.
  const wb = XLSX.read(data, { type: 'array', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  const isbnCol = headers.findIndex(h => h.includes('isbn'));
  return [...new Set(rows.slice(isbnCol >= 0 ? 1 : 0)
    .map(row => normalizeISBN(row[isbnCol >= 0 ? isbnCol : 0]))
    .filter(isISBN))];
}
