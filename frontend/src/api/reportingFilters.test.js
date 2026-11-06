import test from 'node:test';
import assert from 'node:assert/strict';
import { periodDates, filtersFromSearch, reportHref } from './reportingFilters.js';

test('Philippine midnight and leap-year calendar periods', () => {
  assert.equal(periodDates('today', new Date('2024-02-28T16:00:00Z')).start, '2024-02-29');
  assert.equal(periodDates('month', new Date('2024-02-15T00:00:00Z')).end, '2024-02-29');
  const previous = periodDates('last-month', new Date('2026-01-01T00:00:00Z'));
  assert.equal(previous.start, '2025-12-01'); assert.equal(previous.end, '2025-12-31');
  assert.equal(periodDates('last-year', new Date('2026-01-01T00:00:00Z')).start, '2025-01-01');
  assert.equal(periodDates('week', new Date('2026-11-04T00:00:00Z')).start, '2026-11-02');
});
test('dashboard drill-down retains combined filters and validates URL keys', () => {
  const period = periodDates('month', new Date('2026-11-04T00:00:00Z'));
  const link = reportHref(period, 'collection', { holdings: 'current', author: 'Author', year_from: 2020 });
  const filters = filtersFromSearch(link.split('?')[1]);
  assert.equal(filters.start, '2026-11-01'); assert.equal(filters.holdings, 'current');
  assert.equal(filters.date_scope, 'all'); assert.equal(filters.year_from, 2020);
  assert.equal(filtersFromSearch('category=invalid&secret=bad').category, 'circulation');
  assert.equal(filtersFromSearch('category=nlp&template=monthly').category, 'circulation');
  assert.equal(filtersFromSearch('category=nlp&template=monthly').template, undefined);
  assert.equal(filtersFromSearch('category=visits&secret=bad').secret, undefined);
});
