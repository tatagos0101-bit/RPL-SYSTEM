import { parseApiDateTime } from './dateTime.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOAN_DAYS = 14;
const WEEK_COUNT = 12;
const DAYS_PER_WEEK = 7;

const toNumber = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getVisits = (day) => {
  const visits = Number(day?.visits);
  if (Number.isFinite(visits)) return visits;
  const intensity = Number(day?.intensity);
  return Number.isFinite(intensity) ? intensity : 0;
};

export const getLoanDueInfo = (dueDate, now = Date.now()) => {
  const due = parseApiDateTime(dueDate);
  const dueMs = due.getTime();

  if (!Number.isFinite(dueMs)) {
    return {
      status: 'unknown',
      label: 'Due date unavailable',
      priority: 3,
      daysLeft: null,
      pct: 0,
      tone: 'neutral',
    };
  }

  const diffMs = dueMs - now;
  const pct = Math.max(0, Math.min(100, (diffMs / (LOAN_DAYS * MS_PER_DAY)) * 100));

  if (diffMs <= 0) {
    const daysOverdue = Math.max(1, Math.ceil(Math.abs(diffMs) / MS_PER_DAY));
    return {
      status: 'overdue',
      label: daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`,
      priority: 0,
      daysLeft: -daysOverdue,
      pct: 0,
      tone: 'danger',
    };
  }

  const daysLeft = Math.ceil(diffMs / MS_PER_DAY);
  if (daysLeft <= 3) {
    return {
      status: 'soon',
      label: daysLeft <= 1 ? 'Due today' : `Due in ${daysLeft} days`,
      priority: 1,
      daysLeft,
      pct,
      tone: 'warning',
    };
  }

  return {
    status: 'safe',
    label: `${daysLeft} days left`,
    priority: 2,
    daysLeft,
    pct,
    tone: 'success',
  };
};

const getPrimaryNotice = ({ overdueCount, dueSoonCount, borrowedNow }) => {
  if (overdueCount > 0) {
    return {
      kind: 'overdue',
      title: 'Return overdue books first',
      body: 'Borrowing is paused until overdue books are returned.',
      actionLabel: 'Check borrowed books',
      actionHref: '#borrowed-books',
    };
  }

  if (dueSoonCount > 0) {
    return {
      kind: 'soon',
      title: 'A due date is coming up',
      body: 'Return books on time to avoid fines and keep borrowing easy.',
      actionLabel: 'Review due dates',
      actionHref: '#borrowed-books',
    };
  }

  if (borrowedNow > 0) {
    return {
      kind: 'active',
      title: 'Your borrowed books are on track',
      body: 'Keep an eye on due dates and report any book issue early.',
      actionLabel: 'View borrowed books',
      actionHref: '#borrowed-books',
    };
  }

  return {
    kind: 'clear',
    title: 'Ready for your next book',
    body: 'Browse the catalog and add books to your reservation list.',
    actionLabel: 'Browse catalog',
    actionHref: '/user/browse',
  };
};

export const summarizeActivity = (activity = []) => {
  const days = Array.isArray(activity) ? activity.slice(-WEEK_COUNT * DAYS_PER_WEEK) : [];
  const paddedDays = [
    ...Array.from({ length: Math.max(0, WEEK_COUNT * DAYS_PER_WEEK - days.length) }, () => ({
      visits: 0,
      intensity: 0,
      date: null,
    })),
    ...days,
  ];

  const totalVisits = paddedDays.reduce((sum, day) => sum + getVisits(day), 0);
  const activeDays = paddedDays.filter((day) => getVisits(day) > 0).length;
  const lastVisit = [...paddedDays].reverse().find((day) => getVisits(day) > 0 && day.date);

  const weeklyBars = Array.from({ length: WEEK_COUNT }, (_, weekIndex) => {
    const start = weekIndex * DAYS_PER_WEEK;
    const weekDays = paddedDays.slice(start, start + DAYS_PER_WEEK);
    const visits = weekDays.reduce((sum, day) => sum + getVisits(day), 0);
    return {
      index: weekIndex,
      label: weekIndex === WEEK_COUNT - 1 ? 'This week' : `${WEEK_COUNT - weekIndex - 1}w ago`,
      visits,
    };
  });

  const maxVisits = Math.max(1, ...weeklyBars.map((bar) => bar.visits));

  return {
    totalVisits,
    activeDays,
    lastVisitDate: lastVisit?.date ?? null,
    lastVisitLabel: lastVisit?.date ? formatShortDate(lastVisit.date) : 'No visits yet',
    weeklyBars: weeklyBars.map((bar) => ({
      ...bar,
      heightPct: bar.visits > 0 ? Math.max(18, Math.round((bar.visits / maxVisits) * 100)) : 8,
    })),
  };
};

export const buildUserHomeOverview = ({
  loans = [],
  fines = {},
  stats = {},
  activity = [],
  now = Date.now(),
} = {}) => {
  const overdueIds = new Set((fines?.overdue_loans || []).map((loan) => loan.transaction_id));
  const priorityLoans = (Array.isArray(loans) ? loans : [])
    .map((loan) => {
      const dueInfo = getLoanDueInfo(loan.due_date, now);
      const forcedOverdue = overdueIds.has(loan.transaction_id) || loan.status === 'overdue';
      return {
        ...loan,
        dueInfo: forcedOverdue && dueInfo.status !== 'overdue'
          ? { ...dueInfo, status: 'overdue', label: 'Overdue', priority: 0, tone: 'danger' }
          : dueInfo,
      };
    })
    .sort((a, b) => {
      if (a.dueInfo.priority !== b.dueInfo.priority) return a.dueInfo.priority - b.dueInfo.priority;
      return parseApiDateTime(a.due_date).getTime() - parseApiDateTime(b.due_date).getTime();
    });

  const borrowedNow = priorityLoans.length;
  const overdueCount = Math.max(
    priorityLoans.filter((loan) => loan.dueInfo.status === 'overdue').length,
    fines?.overdue_loans?.length || 0,
  );
  const dueSoonCount = priorityLoans.filter((loan) => loan.dueInfo.status === 'soon').length;

  return {
    borrowedNow,
    dueSoonCount,
    overdueCount,
    totalFine: toNumber(fines?.total_fine),
    booksBorrowed: Number(stats?.total_books_read || 0),
    priorityLoans,
    primaryNotice: getPrimaryNotice({ overdueCount, dueSoonCount, borrowedNow }),
    activitySummary: summarizeActivity(activity),
  };
};

const formatShortDate = (date) => {
  const parsed = parseApiDateTime(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
};
