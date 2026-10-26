import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { extractISBNsFromFile } from './isbnFiles.js';

const csv = text => ({ name: 'books.csv', arrayBuffer: async () => new TextEncoder().encode(text).buffer });

test('CSV preserves leading zeroes, X check characters, and deduplicates ISBNs', async () => {
  assert.deepEqual(await extractISBNsFromFile(csv('\uFEFFTitle,ISBN\r\n"First, book",0306406152\r\nSecond,0-8044-2957-x\r\nThird,9780306406157\r\nDuplicate,9780306406157')), ['0306406152', '080442957X', '9780306406157']);
});

test('CSV accepts a headerless first column and semicolon-delimited exports', async () => {
  assert.deepEqual(await extractISBNsFromFile(csv('0306406152\n080442957X')), ['0306406152', '080442957X']);
  assert.deepEqual(await extractISBNsFromFile(csv('Title;ISBN\nFirst;9780306406157')), ['9780306406157']);
});

test('Excel reads numeric ISBN-13 and text ISBN-10 from the ISBN column', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Title', 'ISBN'], ['One', 9780306406157], ['Two', '0306406152'], ['Three', '080442957X'], ['Blank', ''],
  ]), 'Books');
  for (const bookType of ['xlsx', 'xls']) {
    const data = XLSX.write(wb, { type: 'array', bookType });
    assert.deepEqual(await extractISBNsFromFile({ name: `books.${bookType}`, arrayBuffer: async () => data }), ['9780306406157', '0306406152', '080442957X']);
  }
});

test('empty or unrelated CSV returns no ISBNs', async () => {
  assert.deepEqual(await extractISBNsFromFile(csv('Title,Author\nExample,Writer')), []);
  assert.deepEqual(await extractISBNsFromFile(csv('')), []);
});
