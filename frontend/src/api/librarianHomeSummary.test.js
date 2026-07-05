import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLibrarianHomeOverview,
  summarizeEntryLogs,
  summarizeTrend,
} from './librarianHomeSummary.js';

test('buildLibrarianHomeOverview prioritizes overdue loans first', () => {
  const overview = buildLibrarianHomeOverview({
    stats: {
      active_loans: 21,
      overdue_count: 4,
      due_soon_count: 3,
      visitors_today: 12,
      total_members: 80,
      pending_registrations: 2,
      total_books: 400,
      available_books: 180,
    },
    loans: [],
    entryLogs: [],
    trend: [],
  });

  assert.equal(overview.primaryNotice.kind, 'overdue');
  assert.equal(overview.primaryNotice.title, 'Overdue books need follow-up');
  assert.equal(overview.metrics.activeLoans, 21);
  assert.equal(overview.metrics.overdueCount, 4);
  assert.equal(overview.metrics.pendingFaceSetup, 2);
  assert.equal(overview.metrics.inventoryAvailablePct, 45);
});

test('buildLibrarianHomeOverview falls back to due-soon and then all-clear priority', () => {
  const dueSoon = buildLibrarianHomeOverview({
    stats: {
      active_loans: 8,
      overdue_count: 0,
      due_soon_count: 5,
      visitors_today: 2,
      total_members: 20,
      pending_registrations: 0,
      total_books: 100,
      available_books: 60,
    },
  });
  const clear = buildLibrarianHomeOverview({
    stats: {
      active_loans: 0,
      overdue_count: 0,
      due_soon_count: 0,
      visitors_today: 0,
      total_members: 20,
      pending_registrations: 0,
      total_books: 100,
      available_books: 60,
    },
  });

  assert.equal(dueSoon.primaryNotice.kind, 'due-soon');
  assert.equal(clear.primaryNotice.kind, 'clear');
});

test('summarizeEntryLogs counts granted, denied, inside, and latest visitor', () => {
  const summary = summarizeEntryLogs([
    {
      id: 1,
      member_name: 'Ana Reyes',
      granted: true,
      is_inside: false,
      accessed_at: '2026-07-01T09:00:00',
      time_out: '2026-07-01T09:30:00',
    },
    {
      id: 2,
      member_name: 'Ben Santos',
      granted: false,
      is_inside: false,
      accessed_at: '2026-07-01T10:00:00',
      time_out: null,
    },
    {
      id: 3,
      member_name: 'Cara Cruz',
      granted: true,
      is_inside: true,
      accessed_at: '2026-07-01T11:00:00',
      time_out: null,
    },
  ]);

  assert.equal(summary.grantedCount, 2);
  assert.equal(summary.deniedCount, 1);
  assert.equal(summary.insideCount, 1);
  assert.equal(summary.latestVisitor, 'Cara Cruz');
});

test('summarizeTrend calculates total and latest month movement', () => {
  const summary = summarizeTrend([
    { month: 'Apr 2026', borrows: 12 },
    { month: 'May 2026', borrows: 18 },
    { month: 'Jun 2026', borrows: 15 },
  ]);

  assert.equal(summary.totalBorrows, 45);
  assert.equal(summary.latestBorrows, 15);
  assert.equal(summary.previousBorrows, 18);
  assert.equal(summary.monthChange, -3);
});
