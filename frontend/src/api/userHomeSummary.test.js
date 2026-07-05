import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUserHomeOverview,
  summarizeActivity,
} from './userHomeSummary.js';

const NOW = Date.parse('2026-07-01T12:00:00+08:00');

test('buildUserHomeOverview prioritizes overdue loans and blocks the main borrow cue', () => {
  const overview = buildUserHomeOverview({
    loans: [
      { transaction_id: 10, book_title: 'Safe Book', due_date: '2026-07-10T12:00:00' },
      { transaction_id: 11, book_title: 'Due Soon Book', due_date: '2026-07-03T12:00:00' },
      { transaction_id: 12, book_title: 'Late Book', due_date: '2026-06-30T12:00:00' },
    ],
    fines: {
      total_fine: '15.00',
      overdue_loans: [{ transaction_id: 12 }],
    },
    stats: { total_books_read: 8 },
    activity: [],
    now: NOW,
  });

  assert.equal(overview.borrowedNow, 3);
  assert.equal(overview.overdueCount, 1);
  assert.equal(overview.dueSoonCount, 1);
  assert.equal(overview.totalFine, 15);
  assert.equal(overview.booksBorrowed, 8);
  assert.equal(overview.priorityLoans[0].transaction_id, 12);
  assert.equal(overview.primaryNotice.kind, 'overdue');
});

test('buildUserHomeOverview shows a ready state when the member has no active loans', () => {
  const overview = buildUserHomeOverview({
    loans: [],
    fines: { total_fine: 0, overdue_loans: [] },
    stats: { total_books_read: 0 },
    activity: [],
    now: NOW,
  });

  assert.equal(overview.borrowedNow, 0);
  assert.equal(overview.overdueCount, 0);
  assert.equal(overview.dueSoonCount, 0);
  assert.equal(overview.primaryNotice.kind, 'clear');
  assert.equal(overview.priorityLoans.length, 0);
});

test('summarizeActivity turns daily activity into simple 12-week bars', () => {
  const activity = Array.from({ length: 84 }, (_, index) => ({
    date: `2026-04-${String(index + 1).padStart(2, '0')}`,
    visits: 0,
    intensity: 0,
  }));
  activity[76] = { date: '2026-06-24', visits: 1, intensity: 1 };
  activity[82] = { date: '2026-06-30', visits: 2, intensity: 2 };

  const summary = summarizeActivity(activity);

  assert.equal(summary.totalVisits, 3);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.lastVisitDate, '2026-06-30');
  assert.equal(summary.weeklyBars.length, 12);
  assert.equal(summary.weeklyBars[10].visits, 1);
  assert.equal(summary.weeklyBars[11].visits, 2);
});
