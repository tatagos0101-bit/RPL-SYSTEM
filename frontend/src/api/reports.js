import { parseApiDateTime } from './dateTime.js';

export const REPORT_PAGE_LIMIT = 200;
export const REPORT_MAX_PAGES = 25;

const pad2 = (value) => String(value).padStart(2, '0');

export const toDateKey = (value) => {
  const date = parseApiDateTime(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const formatReportDateTime = (value) => {
  const date = parseApiDateTime(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatReportDate = (value) => {
  const date = parseApiDateTime(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const textIncludes = (value, query) =>
  String(value || '').toLowerCase().includes(query);

const isWithinDateRange = (value, startDate, endDate) => {
  const key = toDateKey(value);
  if (!key) return false;
  if (startDate && key < startDate) return false;
  if (endDate && key > endDate) return false;
  return true;
};

const getTransactionActivityDate = (transaction) =>
  transaction?.return_date || transaction?.borrow_date;

export const filterTransactions = (transactions = [], filters = {}) => {
  const query = String(filters.query || '').trim().toLowerCase();
  const type = filters.type || 'all';
  const status = filters.status || 'all';

  return transactions.filter((transaction) => {
    if (type !== 'all' && transaction.type !== type) return false;
    if (status !== 'all' && transaction.status !== status) return false;
    if ((filters.startDate || filters.endDate) && !isWithinDateRange(getTransactionActivityDate(transaction), filters.startDate, filters.endDate)) {
      return false;
    }
    if (!query) return true;
    return (
      textIncludes(transaction.member_name, query) ||
      textIncludes(transaction.member_id, query) ||
      textIncludes(transaction.book_title, query) ||
      textIncludes(transaction.type, query) ||
      textIncludes(transaction.status, query)
    );
  });
};

export const filterEntryLogs = (logs = [], filters = {}) => {
  const query = String(filters.query || '').trim().toLowerCase();
  const access = filters.access || 'all';

  return logs.filter((log) => {
    const inside = Boolean(log.granted && (log.is_inside ?? !log.time_out));
    if (access === 'granted' && !log.granted) return false;
    if (access === 'denied' && log.granted) return false;
    if (access === 'inside' && !inside) return false;
    if (access === 'out' && (inside || !log.granted)) return false;
    if ((filters.startDate || filters.endDate) && !isWithinDateRange(log.accessed_at, filters.startDate, filters.endDate)) {
      return false;
    }
    if (!query) return true;
    return (
      textIncludes(log.member_name || 'Unknown visitor', query) ||
      textIncludes(log.member_id, query) ||
      textIncludes(log.entry_type, query) ||
      textIncludes(log.note, query) ||
      textIncludes(log.granted ? 'granted' : 'denied', query)
    );
  });
};

const csvCell = (value) => {
  let text = value == null ? '' : String(value);
  // Treat untrusted strings as text when spreadsheets open exported CSV files.
  if (typeof value === 'string' && (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) {
    text = `'${text}`;
  }
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

export const buildCsv = (columns, rows) => {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row[column.key])).join(',')
  );
  return [header, ...body].join('\r\n');
};

export const transactionToReportRow = (transaction, index = 0) => ({
  no: index + 1,
  member: transaction.member_name || '-',
  member_id: transaction.member_id || '-',
  book: transaction.book_title || '-',
  type: transaction.type || '-',
  status: transaction.status || '-',
  borrowed: formatReportDateTime(transaction.borrow_date),
  due: formatReportDate(transaction.due_date),
  returned: formatReportDateTime(transaction.return_date),
  fine: `P ${Number.parseFloat(transaction.fine_amount || 0).toFixed(2)}`,
});

export const entryLogToReportRow = (log, index = 0) => {
  const inside = Boolean(log.granted && (log.is_inside ?? !log.time_out));
  return {
    no: index + 1,
    member: log.member_name || 'Unknown visitor',
    member_id: log.member_id || '-',
    access: log.granted ? 'Granted' : 'Denied',
    time_in: formatReportDateTime(log.accessed_at),
    time_out: inside ? 'Inside' : formatReportDateTime(log.time_out),
    status: inside ? 'Inside' : (log.granted ? 'Out' : 'Denied'),
    note: log.note || '-',
  };
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const buildPrintDocument = ({ title, subtitle, columns, rows }) => {
  const headerCells = columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join('');
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}">No records found.</td></tr>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 32px; color: #111827; font-family: Arial, sans-serif; }
    .letterhead { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 6px; color: #1d4ed8; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    .subtitle { margin: 6px 0 0; color: #4b5563; font-size: 12px; font-weight: 700; }
    .meta { color: #6b7280; font-size: 11px; text-align: right; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #eff6ff; color: #1e3a8a; text-align: left; text-transform: uppercase; letter-spacing: 0.08em; }
    th, td { border: 1px solid #dbeafe; padding: 7px 8px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 16px; color: #6b7280; font-size: 10px; }
    @media print {
      body { margin: 18mm 12mm; }
      .no-print { display: none; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
  </style>
</head>
<body>
  <div class="letterhead">
    <div>
      <p class="eyebrow">Rizal Provincial Library</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
    </div>
    <div class="meta">
      Generated<br>${escapeHtml(new Date().toLocaleString('en-PH'))}<br>
      ${rows.length} record${rows.length === 1 ? '' : 's'}
    </div>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="footer">This report was generated from the Rizal Provincial Library System.</p>
</body>
</html>`;
};

const responseData = (result) => Array.isArray(result) ? result : (result?.data || []);

export const fetchAllPaginated = async (
  fetchPage,
  { limit = REPORT_PAGE_LIMIT, maxPages = REPORT_MAX_PAGES } = {},
) => {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const skip = page * limit;
    const pageRows = responseData(await fetchPage({ skip, limit }));
    rows.push(...pageRows);
      if (pageRows.length < limit) return rows;
  }
    throw new Error('Export exceeds the safety limit. A complete export cannot be produced; no partial export was generated.');
};

export const getReportFilename = (base, filters = {}) => {
  const start = filters.startDate || 'all';
  const end = filters.endDate || 'today';
  return `${base}-${start}-to-${end}.csv`;
};
