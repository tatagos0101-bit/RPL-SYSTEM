import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCsv,
  buildPrintDocument,
  fetchAllPaginated,
  filterEntryLogs,
  filterTransactions,
  getReportFilename,
} from './reports.js';

test('CSV treats spreadsheet formulas as literal text and preserves numbers', () => {
  const columns = [{ key: 'value', label: 'Value' }];
  for (const value of ['=HYPERLINK("https://example.test")', '+SUM(1)', '-SUM(1)', '@SUM(1)', '\tformula', '  =SUM(1)']) {
    const csv = buildCsv(columns, [{ value }]);
    assert.ok(csv.split('\r\n')[1].replace(/^"/, '').startsWith("'"));
  }
  assert.equal(buildCsv(columns, [{ value: -5 }, { value: 'Rizal Library' }]), 'Value\r\n-5\r\nRizal Library');
});

const transactions = [
  {
    id: 1,
    member_name: 'Ana Reyes',
    member_id: 'RPL-00001',
    book_title: 'Noli, Me Tangere',
    type: 'borrow',
    status: 'active',
    borrow_date: '2026-07-01T09:00:00',
    due_date: '2026-07-08T09:00:00',
    return_date: null,
    fine_amount: '0',
  },
  {
    id: 2,
    member_name: 'Ben Santos',
    member_id: 'RPL-00002',
    book_title: 'El Filibusterismo',
    type: 'return',
    status: 'returned',
    borrow_date: '2026-06-28T10:00:00',
    due_date: '2026-07-05T10:00:00',
    return_date: '2026-07-01T12:00:00',
    fine_amount: '5',
  },
];

const entryLogs = [
  {
    id: 10,
    member_name: 'Ana Reyes',
    member_id: 'RPL-00001',
    entry_type: 'face_scan',
    granted: true,
    is_inside: true,
    accessed_at: '2026-07-01T08:01:00',
    time_out: null,
    note: 'Recognized',
  },
  {
    id: 11,
    member_name: null,
    member_id: null,
    entry_type: 'face_scan',
    granted: false,
    is_inside: false,
    accessed_at: '2026-07-02T08:01:00',
    time_out: null,
    note: 'Unknown visitor',
  },
];

test('filterTransactions supports query, type, status, and date range', () => {
  const result = filterTransactions(transactions, {
    query: 'noli',
    type: 'borrow',
    status: 'active',
    startDate: '2026-07-01',
    endDate: '2026-07-01',
  });

  assert.deepEqual(result.map((item) => item.id), [1]);
});

test('filterEntryLogs supports visitor status, query, and date range', () => {
  const result = filterEntryLogs(entryLogs, {
    query: 'unknown',
    access: 'denied',
    startDate: '2026-07-02',
    endDate: '2026-07-02',
  });

  assert.deepEqual(result.map((item) => item.id), [11]);
});

test('buildCsv escapes commas and quotes', () => {
  const csv = buildCsv(
    [
      { key: 'member', label: 'Member' },
      { key: 'book', label: 'Book' },
    ],
    [{ member: 'Ana "A"', book: 'Noli, Me Tangere' }],
  );

  assert.equal(csv, 'Member,Book\r\n"Ana ""A""","Noli, Me Tangere"');
});

test('buildPrintDocument escapes row content and includes report title', () => {
  const html = buildPrintDocument({
    title: 'Borrow / Return Records',
    subtitle: 'July 2026',
    columns: [{ key: 'member', label: 'Member' }],
    rows: [{ member: '<script>alert(1)</script>' }],
  });

  assert.equal(html.includes('Borrow / Return Records'), true);
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
});

test('fetchAllPaginated keeps requesting pages until the final partial page', async () => {
  const calls = [];
  const rows = await fetchAllPaginated(async ({ skip, limit }) => {
    calls.push({ skip, limit });
    if (skip === 0) return ['a', 'b'];
    if (skip === 2) return ['c'];
    return [];
  }, { limit: 2, maxPages: 5 });

  assert.deepEqual(rows, ['a', 'b', 'c']);
  assert.deepEqual(calls, [
    { skip: 0, limit: 2 },
    { skip: 2, limit: 2 },
  ]);
});

test('getReportFilename makes stable CSV file names', () => {
  assert.equal(
    getReportFilename('entry-logs', { startDate: '2026-07-01', endDate: '2026-07-31' }),
    'entry-logs-2026-07-01-to-2026-07-31.csv',
  );
});
