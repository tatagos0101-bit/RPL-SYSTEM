export const categories = { visits: 'Library usage', patrons: 'Patrons', circulation: 'Circulation', collection: 'Collection', acquisitions: 'Acquisitions', inventory: 'Inventory checks' };
export const periodNames = { today: 'Today', yesterday: 'Yesterday', week: 'This week', 'last-week': 'Last week', month: 'This month', 'last-month': 'Last month', quarter: 'This quarter', year: 'This year', 'last-year': 'Last year', custom: 'Custom dates' };
const iso = date => date.toISOString().slice(0, 10);
export function periodDates(period = 'month', now = new Date()) {
  const day = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00Z`);
  let start = new Date(day), end = new Date(day);
  if (period === 'yesterday') { start.setUTCDate(start.getUTCDate() - 1); end = new Date(start); }
  if (period === 'week' || period === 'last-week') {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7 - (period === 'last-week' ? 7 : 0));
    end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  }
  if (['month', 'last-month', 'quarter', 'year', 'last-year'].includes(period)) {
    let month = day.getUTCMonth(), year = day.getUTCFullYear(), count = 1;
    if (period === 'last-month') month -= 1;
    if (period === 'quarter') { month -= month % 3; count = 3; }
    if (period === 'year' || period === 'last-year') { month = 0; count = 12; year -= period === 'last-year' ? 1 : 0; }
    start = new Date(Date.UTC(year, month, 1)); end = new Date(Date.UTC(year, month + count, 0));
  }
  return { start: iso(start), end: iso(end), period, group: ['year', 'last-year', 'quarter'].includes(period) ? 'month' : 'day' };
}
export function defaultFilters(category = 'circulation') {
  return { category, ...periodDates(), date_scope: ['collection', 'patrons'].includes(category) ? 'all' : 'period', sort: 'id', direction: 'desc' };
}
const keys = new Set(['category', 'start', 'end', 'period', 'group', 'query', 'date_basis', 'book_category', 'author', 'isbn', 'qr', 'shelf', 'year_from', 'year_to', 'member_id', 'account_status', 'participation', 'loan_status', 'copy_status', 'holdings', 'source', 'date_scope', 'party', 'recorded_by', 'sort', 'direction']);
export function filtersFromSearch(search) {
  const params = new URLSearchParams(search);
  const category = Object.hasOwn(categories, params.get('category')) ? params.get('category') : 'circulation';
  const filters = defaultFilters(category);
  for (const [key, value] of params) if (keys.has(key) && key !== 'category' && value !== '') filters[key] = ['year_from', 'year_to', 'recorded_by'].includes(key) ? Number(value) : value;
  return filters;
}
export function reportHref(period, category, extra = {}) {
  return `/librarian/reports?${new URLSearchParams({ ...defaultFilters(category), start: period.start, end: period.end, group: period.group, period: period.period, ...extra })}`;
}
export const humanize = value => String(value).replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export function appliedFilterEntries(filters) {
  return Object.entries(filters).filter(([key, value]) => value !== '' && value != null
    && !['category', 'sort', 'direction'].includes(key)
    && (key !== 'date_basis' || filters.category === 'circulation')
    && (key !== 'holdings' || filters.category === 'collection')
    && (key !== 'date_scope' || ['patrons', 'collection', 'acquisitions'].includes(filters.category)));
}
export function formatReportValue(value) {
  if (value == null) return 'Not recorded';
  if (typeof value === 'number') return value.toLocaleString('en-PH', { maximumFractionDigits: 2 });
  if (/^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
  return String(value);
}
