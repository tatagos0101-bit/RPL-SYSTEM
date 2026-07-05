const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getStatsValue = (stats, key) => toNumber(stats?.[key]);

export const summarizeTrend = (trend = []) => {
  const points = Array.isArray(trend) ? trend : [];
  const totalBorrows = points.reduce((sum, point) => sum + toNumber(point?.borrows), 0);
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const latestBorrows = toNumber(latest?.borrows);
  const previousBorrows = toNumber(previous?.borrows);

  return {
    totalBorrows,
    latestBorrows,
    previousBorrows,
    monthChange: latest ? latestBorrows - previousBorrows : 0,
    latestMonth: latest?.month || 'No month yet',
    bars: points.map((point, index) => ({
      index,
      month: point.month,
      borrows: toNumber(point.borrows),
    })),
  };
};

export const summarizeEntryLogs = (entryLogs = []) => {
  const logs = (Array.isArray(entryLogs) ? entryLogs : [])
    .slice()
    .sort((a, b) => new Date(b?.accessed_at || 0).getTime() - new Date(a?.accessed_at || 0).getTime());
  const grantedCount = logs.filter((log) => log.granted).length;
  const deniedCount = logs.filter((log) => !log.granted).length;
  const insideCount = logs.filter((log) => log.granted && (log.is_inside ?? !log.time_out)).length;
  const latest = logs[0] || null;

  return {
    grantedCount,
    deniedCount,
    insideCount,
    latestVisitor: latest?.member_name || (latest ? 'Unknown visitor' : 'No visitors yet'),
    latestAccessGranted: latest?.granted ?? null,
  };
};

const buildPrimaryNotice = (metrics) => {
  if (metrics.overdueCount > 0) {
    return {
      kind: 'overdue',
      title: 'Overdue books need follow-up',
      body: 'Start with overdue returns before routine circulation work.',
      actionLabel: 'Open due books',
      actionHref: '/librarian/due-books',
    };
  }

  if (metrics.dueSoonCount > 0) {
    return {
      kind: 'due-soon',
      title: 'Upcoming due dates need reminders',
      body: 'Review books due within three days and remind members early.',
      actionLabel: 'Review due books',
      actionHref: '/librarian/due-books',
    };
  }

  if (metrics.pendingFaceSetup > 0) {
    return {
      kind: 'setup',
      title: 'Members still need face enrollment',
      body: 'Finish setup so entry station recognition works smoothly.',
      actionLabel: 'Open users',
      actionHref: '/librarian/users',
    };
  }

  return {
    kind: 'clear',
    title: 'Circulation is clear right now',
    body: 'No urgent overdue or due-soon work is waiting.',
    actionLabel: 'Borrow or return',
    actionHref: '/librarian/borrow-return',
  };
};

export const buildLibrarianHomeOverview = ({
  stats = {},
  loans = [],
  entryLogs = [],
  trend = [],
} = {}) => {
  const totalBooks = getStatsValue(stats, 'total_books');
  const availableBooks = getStatsValue(stats, 'available_books');
  const metrics = {
    activeLoans: getStatsValue(stats, 'active_loans'),
    overdueCount: getStatsValue(stats, 'overdue_count'),
    dueSoonCount: getStatsValue(stats, 'due_soon_count'),
    visitorsToday: getStatsValue(stats, 'visitors_today'),
    totalMembers: getStatsValue(stats, 'total_members'),
    pendingFaceSetup: getStatsValue(stats, 'pending_registrations'),
    totalBooks,
    availableBooks,
    inventoryAvailablePct: totalBooks > 0 ? Math.round((availableBooks / totalBooks) * 100) : 0,
    visibleLoanCount: Array.isArray(loans) ? loans.length : 0,
  };

  return {
    metrics,
    primaryNotice: buildPrimaryNotice(metrics),
    entrySummary: summarizeEntryLogs(entryLogs),
    trendSummary: summarizeTrend(trend),
  };
};
