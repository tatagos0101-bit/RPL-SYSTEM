import { SHOW_FINES } from '../../api/fineVisibility';
import FineContent from '../../components/FineContent';
import { createElement, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bookmark,
  CalendarClock,
  CheckCircle,
  Clock,
  Flag,
  Library,
  Pencil,
  RefreshCw,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import { getLoans, getFines, getReadingStats, getActivity, getGoals, updateGoals, reportLoan } from '../../api/user';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import { buildUserHomeOverview } from '../../api/userHomeSummary';
import BookCover from '../../components/BookCover';

const GENRE_COLORS = ['#2563eb', '#7c3aed', '#f59e0b', '#059669', '#db2777', '#0891b2'];

const NOTICE_STYLES = {
  overdue: {
    shell: 'border-danger border-danger bg-danger-soft bg-danger-soft',
    icon: 'bg-rose-600 text-white',
    title: 'text-danger text-danger',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  soon: {
    shell: 'border-warning border-warning bg-warning-soft bg-warning-soft',
    icon: 'bg-amber-500 text-ink',
    title: 'text-warning text-warning',
    button: 'bg-amber-500 hover:bg-amber-600 text-ink',
  },
  active: {
    shell: 'border-line border-line bg-info-soft bg-info-soft',
    icon: 'bg-action text-white',
    title: 'text-link text-link',
    button: 'bg-action hover:bg-action-hover text-white',
  },
  clear: {
    shell: 'border-success border-success bg-success-soft bg-success-soft',
    icon: 'bg-emerald-700 text-white',
    title: 'text-success text-success',
    button: 'bg-emerald-700 hover:bg-emerald-700 text-white',
  },
};

const DUE_STYLES = {
  overdue: {
    row: 'border-danger border-danger bg-danger-soft bg-danger-soft',
    badge: 'bg-danger-soft bg-danger-soft text-danger text-danger',
    bar: 'bg-rose-600',
  },
  soon: {
    row: 'border-warning border-warning bg-warning-soft bg-warning-soft',
    badge: 'bg-warning-soft bg-warning-soft text-warning text-warning',
    bar: 'bg-amber-500',
  },
  safe: {
    row: 'border-line bg-panel ',
    badge: 'bg-success-soft bg-success-soft text-success text-success',
    bar: 'bg-emerald-500',
  },
  unknown: {
    row: 'border-line bg-panel ',
    badge: 'bg-subtle text-muted ',
    bar: 'bg-subtle',
  },
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatLoanDate = (value) => {
  const date = toUtcDate(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatMoney = (amount) => `P ${Number(amount || 0).toFixed(2)}`;

const DonutChart = ({ data }) => {
  const r = 42;
  const cx = 60;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <svg viewBox="0 0 120 120" className="block h-full w-full">
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={15}
          stroke="currentColor"
          className="text-ink"
        />
      </svg>
    );
  }

  const segments = data.reduce((acc, seg) => {
    const previousEnd = acc.length ? acc[acc.length - 1].end : 0;
    const segLen = (seg.value / total) * C;
    acc.push({ ...seg, segLen, dashOffset: -previousEnd, end: previousEnd + segLen });
    return acc;
  }, []);

  return (
    <svg viewBox="0 0 120 120" className="block h-full w-full">
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        strokeWidth={15}
        stroke="currentColor"
        className="text-ink"
      />
      {segments.map((seg) => (
        <circle
          key={seg.label}
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={15}
          strokeDasharray={`${seg.segLen} ${C}`}
          strokeDashoffset={seg.dashOffset}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      ))}
    </svg>
  );
};

const UserHome = () => {
  const [loans, setLoans] = useState([]);
  const [fines, setFines] = useState({ total_fine: 0, overdue_loans: [] });
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ annual_books: 12, genres: 3, visits: 24 });
  const [goalsSaving, setGoalsSaving] = useState(false);

  const [reportModal, setReportModal] = useState(null);
  const [reportReason, setReportReason] = useState('damaged');
  const [reportNote, setReportNote] = useState('');
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const userName = localStorage.getItem('userName') || 'Member';

  useEffect(() => {
    Promise.all([
      getLoans(),
      getFines(),
      getReadingStats(),
      getActivity(84),
      getGoals(),
    ])
      .then(([lRes, fRes, sRes, aRes, gRes]) => {
        setLoans(lRes.data);
        setFines(fRes.data);
        setStats(sRes.data);
        setActivity(aRes.data);
        setGoals(gRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const overview = useMemo(
    () => buildUserHomeOverview({ loans, fines, stats, activity }),
    [loans, fines, stats, activity],
  );

  const genreData = (stats?.genres || []).map((g, i) => ({
    label: g.category,
    value: g.percentage,
    color: GENRE_COLORS[i % GENRE_COLORS.length],
  }));
  const topGenrePct = genreData[0]?.value || 0;
  const nextLoan = overview.priorityLoans[0];
  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const openGoalsModal = () => {
    const draft = { annual_books: 12, genres: 3, visits: 24 };
    goals.forEach((g) => {
      if (g.goal_type in draft) draft[g.goal_type] = g.target;
    });
    setGoalDraft(draft);
    setGoalsModalOpen(true);
  };

  const handleSaveGoals = async () => {
    setGoalsSaving(true);
    try {
      const res = await updateGoals(goalDraft);
      setGoals(res.data);
      setGoalsModalOpen(false);
    } catch {
      // Keep modal open so the member can try again.
    } finally {
      setGoalsSaving(false);
    }
  };

  const openReportModal = (loan) => {
    setReportModal({ transactionId: loan.transaction_id, bookTitle: loan.book_title });
    setReportReason('damaged');
    setReportNote('');
    setReportSuccess(false);
  };

  const handleSubmitReport = async () => {
    setReportSaving(true);
    try {
      await reportLoan(reportModal.transactionId, reportReason, reportNote);
      setReportSuccess(true);
    } catch {
      // Keep modal open so the member can retry.
    } finally {
      setReportSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rpl-page flex min-h-screen items-center justify-center bg-subtle">
        <RefreshCw size={28} className="animate-spin text-link" />
      </div>
    );
  }

  return (
    <div className="min-w-0 [overflow-wrap:anywhere] px-4 py-6 pb-16 sm:px-6 lg:px-10">
      <header className="mb-6">
        <p className="mb-2 text-sm font-semibold tracking-normal text-muted">
          {getGreeting()}
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-semibold tracking-normal text-ink min-[390px]: rpl-title">
              {userName.split(' ')[0]}
              {userName.split(' ').length > 1 && (
                <span className="text-link"> {userName.split(' ').slice(1).join(' ')}</span>
              )}
            </h1>
            <p className="mt-2 text-sm font-bold tracking-normal text-muted">
              {today}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/user/browse"
              className="inline-flex items-center gap-2 rounded-xl bg-panel px-4 py-3 text-sm font-semibold tracking-normal text-link transition hover:bg-action-hover hover:bg-info-soft"
            >
              <BookOpen size={14} />
              Browse
            </Link>
            <Link
              to="/user/reservations"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 text-sm font-semibold tracking-normal text-muted transition hover:border-line hover:text-link"
            >
              <Bookmark size={14} />
              Reservations
            </Link>
          </div>
        </div>
      </header>

      <TodayPanel notice={overview.primaryNotice} nextLoan={nextLoan} />

      <div className={SHOW_FINES ? 'contents' : 'contents fine-free-summary'}>
      <section className="mb-8 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          icon={BookOpen}
          label="Borrowed Now"
          value={overview.borrowedNow}
          detail="Books currently with you"
          tone="blue"
        />
        <StatusCard
          icon={CalendarClock}
          label="Due Soon"
          value={overview.dueSoonCount}
          detail="Due within 3 days"
          tone="amber"
          urgent={overview.dueSoonCount > 0}
        />
        <StatusCard
          icon={AlertCircle}
          label="Overdue Books"
          value={overview.overdueCount}
          detail="Return these first"
          tone="rose"
          urgent={overview.overdueCount > 0}
        />
        <FineContent>
        <StatusCard
          icon={Wallet}
          label="Fine to Pay"
          value={formatMoney(overview.totalFine)}
          detail="Current overdue fees"
          tone={overview.totalFine > 0 ? 'rose' : 'emerald'}
          urgent={overview.totalFine > 0}
        />
        </FineContent>
      </section>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
        <BorrowedBooks loans={overview.priorityLoans} openReportModal={openReportModal} />

        <aside className="space-y-6">
          <ReadingTastes genreData={genreData} topGenrePct={topGenrePct} />
          <ReadingGoals goals={goals} openGoalsModal={openGoalsModal} />
        </aside>
      </div>

      <LibraryActivity activitySummary={overview.activitySummary} />

      {goalsModalOpen && (
        <GoalsModal
          goalDraft={goalDraft}
          setGoalDraft={setGoalDraft}
          goalsSaving={goalsSaving}
          onClose={() => setGoalsModalOpen(false)}
          onSave={handleSaveGoals}
        />
      )}

      {reportModal && (
        <ReportLoanModal
          reportModal={reportModal}
          reportReason={reportReason}
          setReportReason={setReportReason}
          reportNote={reportNote}
          setReportNote={setReportNote}
          reportSaving={reportSaving}
          reportSuccess={reportSuccess}
          onClose={() => setReportModal(null)}
          onSubmit={handleSubmitReport}
        />
      )}
    </div>
  );
};

const TodayPanel = ({ notice, nextLoan }) => {
  const style = NOTICE_STYLES[notice.kind] || NOTICE_STYLES.active;

  return (
    <section className={`mb-6 rounded-xl border p-5 shadow-sm sm:p-6 lg:p-7 ${style.shell}`}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
            {notice.kind === 'overdue' ? <AlertCircle size={22} /> : <Library size={22} />}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-sm font-semibold tracking-normal text-muted">
              Your Library Today
            </p>
            <h2 className={`text-2xl font-semibold tracking-normal sm:text-3xl ${style.title}`}>
              {notice.title}
            </h2>
            {(SHOW_FINES || notice.kind !== 'soon') && (
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted">
              {notice.body}
            </p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <NoticeAction notice={notice} className={style.button} />
              <Link
                to="/user/reservations"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 text-sm font-semibold tracking-normal text-muted transition hover:border-line hover:text-link"
              >
                <Bookmark size={14} />
                My Reservations
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-normal text-muted">
              Next Due
            </p>
            <Clock size={16} className="text-muted" />
          </div>
          {nextLoan ? (
            <div>
              <p className="text-base font-semibold text-ink">
                {nextLoan.book_title}
              </p>
              <p className="mt-1 text-sm font-medium text-muted">
                {formatLoanDate(nextLoan.due_date)}
              </p>
              <DueBadge dueInfo={nextLoan.dueInfo} className="mt-3" />
            </div>
          ) : (
            <div>
              <p className="text-base font-semibold text-ink">No borrowed books</p>
              <p className="mt-1 text-sm font-medium text-muted">
                Your account is clear right now.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const NoticeAction = ({ notice, className }) => {
  const content = (
    <>
      {notice.actionLabel}
      <ArrowRight size={14} />
    </>
  );
  const baseClass = `inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${className}`;

  if (notice.actionHref?.startsWith('#')) {
    return (
      <a href={notice.actionHref} className={baseClass}>
        {content}
      </a>
    );
  }

  return (
    <Link to={notice.actionHref || '/user/browse'} className={baseClass}>
      {content}
    </Link>
  );
};

const StatusCard = ({ icon, label, value, detail, tone, urgent = false }) => {
  const tones = {
    blue: 'bg-info-soft text-link bg-info-soft text-link',
    amber: 'bg-warning-soft text-warning bg-warning-soft text-warning',
    rose: 'bg-danger-soft text-danger bg-danger-soft text-danger',
    emerald: 'bg-success-soft text-success bg-success-soft text-success',
  };

  return (
    <div className={`rounded-xl border bg-panel p-4 shadow-sm sm:p-5 ${urgent ? 'border-danger border-danger' : 'border-line '}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
          {createElement(icon, { size: 18 })}
        </div>
        {urgent && <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />}
      </div>
      <p className="text-xl font-semibold tracking-normal text-ink sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm font-semibold tracking-normal text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-muted">{detail}</p>
    </div>
  );
};

const BorrowedBooks = ({ loans, openReportModal }) => (
  <section id="borrowed-books" className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold tracking-normal text-muted">
          Borrowed Books
        </p>
        <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
          What needs attention
        </h2>
      </div>
      <span className="text-sm font-semibold tracking-normal text-muted">
        Overdue first
      </span>
    </div>

    {loans.length === 0 ? (
      <div className="rounded-xl border border-dashed border-line bg-subtle p-8 text-center">
        <BookOpen size={30} className="mx-auto mb-3 text-ink" />
        <p className="text-base font-semibold text-ink">No borrowed books right now</p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-muted">
          Your account is clear. Browse the catalog when you are ready to reserve another book.
        </p>
        <Link
          to="/user/browse"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-action px-4 py-3 text-sm font-semibold tracking-normal text-white transition hover:bg-action-hover"
        >
          Browse Books
          <ArrowRight size={14} />
        </Link>
      </div>
    ) : (
      <div className="space-y-3">
        {loans.map((loan) => (
          <LoanRow key={loan.transaction_id} loan={loan} openReportModal={openReportModal} />
        ))}
      </div>
    )}
  </section>
);

const LoanRow = ({ loan, openReportModal }) => {
  const dueStyle = DUE_STYLES[loan.dueInfo.status] || DUE_STYLES.unknown;
  const barWidth = loan.dueInfo.status === 'overdue' ? '100%' : `${Math.round(loan.dueInfo.pct)}%`;
  const fineAmount = Number.parseFloat(loan.fine_amount || 0);

  return (
    <article className={`grid grid-cols-1 gap-3 rounded-xl border p-3 transition hover:shadow-md sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${dueStyle.row}`}>
      <div className="flex items-center gap-3 sm:contents">
        <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-subtle shadow-sm sm:h-20 sm:w-14">
          <BookCover
            src={loan.cover_url}
            alt={loan.book_title}
            className="h-full w-full object-cover"
            iconSize={18}
          />
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <DueBadge dueInfo={loan.dueInfo} />
            <FineContent>
            {fineAmount > 0 && (
              <span className="rounded-full bg-panel px-2.5 py-1 text-sm font-semibold tracking-normal text-danger">
                Fine {formatMoney(fineAmount)}
              </span>
            )}
            </FineContent>
          </div>
          <h3 className="font-semibold text-ink rpl-subheading">{loan.book_title}</h3>
          <p className="text-sm font-medium text-muted">{loan.book_author || 'Unknown author'}</p>
          <p className="mt-2 text-sm font-bold tracking-normal text-muted">
            Due {formatLoanDate(loan.due_date)}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-subtle">
            <div className={`h-full rounded-full ${dueStyle.bar}`} style={{ width: barWidth }} />
          </div>
        </div>
      </div>

      <button
        onClick={() => openReportModal(loan)}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold tracking-normal text-muted transition hover:border-danger hover:text-danger"
      >
        <Flag size={13} />
        Report
      </button>
    </article>
  );
};

const DueBadge = ({ dueInfo, className = '' }) => {
  const dueStyle = DUE_STYLES[dueInfo.status] || DUE_STYLES.unknown;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold tracking-normal ${dueStyle.badge} ${className}`}>
      {dueInfo.label}
    </span>
  );
};

const ReadingTastes = ({ genreData, topGenrePct }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5 text-center">
      <p className="text-sm font-semibold tracking-normal text-muted">
        Reading Tastes
      </p>
      <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
        Your usual genres
      </h2>
    </div>

    <div className="mb-4 flex justify-center">
      <div className="relative h-40 w-40 shrink-0">
        <DonutChart data={genreData} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-2xl leading-none font-semibold tabular-nums text-ink">{topGenrePct.toFixed(0)}%</p>
          <p className="text-sm leading-5 font-medium tracking-normal text-muted">
            top genre
          </p>
        </div>
      </div>
    </div>

    {genreData.length > 0 ? (
      <div className="mx-auto w-full max-w-xs space-y-2.5">
        {genreData.map((g) => (
          <div key={g.label} className="grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3">
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
            <p className="min-w-0 flex-1 text-sm font-bold text-muted">{g.label}</p>
            <p className="text-right text-sm font-semibold tabular-nums text-ink">{g.value.toFixed(0)}%</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-center text-sm font-medium text-muted">No reading history yet.</p>
    )}
  </section>
);

const ReadingGoals = ({ goals, openGoalsModal }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold tracking-normal text-muted">
          Reading Goals
        </p>
        <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
          This year
        </h2>
      </div>
      <button
        onClick={openGoalsModal}
        className="inline-flex items-center gap-1.5 rounded-lg bg-info-soft px-3 py-2 text-sm font-semibold tracking-normal text-link transition hover:bg-info-soft"
      >
        <Pencil size={12} />
        Edit
      </button>
    </div>

    {goals.length === 0 ? (
      <div className="rounded-xl border border-dashed border-line bg-subtle p-5">
        <Target size={22} className="mb-3 text-ink" />
        <p className="text-sm font-semibold text-ink">No goals set yet</p>
        <p className="mt-1 text-sm font-medium text-muted">
          Add simple yearly goals for books, genres, and visits.
        </p>
      </div>
    ) : (
      <div className="space-y-5">
        {goals.map((goal) => (
          <div key={goal.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{goal.label}</p>
                <p className="text-sm font-medium text-muted">
                  {goal.current} of {goal.target}
                </p>
              </div>
              <span className="text-xl font-semibold text-ink">{goal.percent}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-action transition-all duration-700" style={{ width: `${goal.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

const LibraryActivity = ({ activitySummary }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold tracking-normal text-muted">
          Library Activity
        </p>
        <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
          Visits at a glance
        </h2>
      </div>
      <span className="text-sm font-semibold tracking-normal text-muted">
        Last 12 weeks
      </span>
    </div>

    <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
      <ActivityMetric icon={Library} label="Visits Recorded" value={activitySummary.totalVisits} />
      <ActivityMetric icon={BarChart3} label="Active Days" value={activitySummary.activeDays} />
      <ActivityMetric icon={Clock} label="Last Visit" value={activitySummary.lastVisitLabel} />
    </div>

    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[620px] items-end gap-3 rounded-xl bg-subtle p-4">
        {activitySummary.weeklyBars.map((bar) => (
          <div key={bar.index} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-36 w-full items-end">
              <div
                className={`w-full rounded-t-2xl transition-all ${bar.visits > 0 ? 'bg-action' : 'bg-subtle '}`}
                style={{ height: `${bar.heightPct}%` }}
                title={`${bar.label}: ${bar.visits} visit${bar.visits === 1 ? '' : 's'}`}
              />
            </div>
            <p className="text-sm font-semibold text-muted">{bar.visits}</p>
            <p className="text-sm font-semibold tracking-normal text-muted">
              {bar.index === 0 || bar.index === 11 ? bar.label : `W${bar.index + 1}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const ActivityMetric = ({ icon, label, value }) => (
  <div className="rounded-xl border border-line bg-subtle p-4">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-panel text-link shadow-sm">
      {createElement(icon, { size: 18 })}
    </div>
    <p className="text-2xl font-semibold tracking-normal text-ink">{value}</p>
    <p className="mt-1 text-sm font-semibold tracking-normal text-muted">{label}</p>
  </div>
);

const GoalsModal = ({ goalDraft, setGoalDraft, goalsSaving, onClose, onSave }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-8">
      <div className="mb-7 flex items-center justify-between">
        <h3 className="font-semibold tracking-normal text-ink rpl-subheading">Set Goals</h3>
        <button aria-label="Close"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted transition hover:bg-subtle hover:text-muted"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-5">
        {[
          { key: 'annual_books', label: 'Books This Year', unit: 'books' },
          { key: 'genres', label: 'Unique Genres', unit: 'genres' },
          { key: 'visits', label: 'Library Visits', unit: 'visits' },
        ].map(({ key, label, unit }) => (
          <div key={key}>
            <label className="mb-2 block text-sm font-semibold tracking-normal text-muted">
              {label}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={999}
                value={goalDraft[key]}
                onChange={(e) => setGoalDraft((d) => ({ ...d, [key]: Math.max(1, Number.parseInt(e.target.value, 10) || 1) }))}
                className="w-24 rounded-lg border border-line bg-subtle px-3 py-2.5 text-center text-base font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-line"
              />
              <span className="text-sm font-bold text-muted">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg bg-subtle py-3 text-sm font-semibold tracking-normal text-muted transition hover:bg-subtle"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={goalsSaving}
          className="flex-1 rounded-lg bg-action py-3 text-sm font-semibold tracking-normal text-white transition hover:bg-action-hover disabled:opacity-60"
        >
          {goalsSaving ? 'Saving...' : 'Save Goals'}
        </button>
      </div>
    </div>
  </div>
);

const ReportLoanModal = ({
  reportModal,
  reportReason,
  setReportReason,
  reportNote,
  setReportNote,
  reportSaving,
  reportSuccess,
  onClose,
  onSubmit,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-8">
      {reportSuccess ? (
        <div className="py-4 text-center">
          <CheckCircle size={40} className="mx-auto mb-4 text-success" />
          <h3 className="mb-1 font-semibold tracking-normal text-ink rpl-subheading">
            Report Submitted
          </h3>
          <p className="mb-6 text-sm font-medium text-muted">
            The librarian has been notified about this issue.
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-subtle px-6 py-2.5 text-sm font-semibold tracking-normal text-muted transition hover:bg-subtle"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold tracking-normal text-ink rpl-subheading">Report Issue</h3>
            <button aria-label="Close"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted transition hover:bg-subtle hover:text-muted"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mb-6 text-sm font-medium text-muted">{reportModal.bookTitle}</p>

          <div className="mb-5 space-y-2">
            <p className="mb-3 text-sm font-semibold tracking-normal text-muted">
              Reason
            </p>
            {[
              { value: 'damaged', label: 'Book is damaged' },
              { value: 'wrong_book', label: 'Wrong book issued' },
              { value: 'lost', label: 'Book is lost' },
              { value: 'other', label: 'Other issue' },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                  reportReason === opt.value
                    ? 'border-line bg-info-soft text-link bg-info-soft text-link'
                    : 'border-line text-muted hover:border-line '
                }`}
              >
                <input
                  type="radio"
                  name="report_reason"
                  value={opt.value}
                  checked={reportReason === opt.value}
                  onChange={() => setReportReason(opt.value)}
                  className="accent-blue-600"
                />
                <span className="text-sm font-bold">{opt.label}</span>
              </label>
            ))}
          </div>

          <textarea aria-label="Additional notes (optional)"
            placeholder="Additional notes (optional)"
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            rows={2}
            className="mb-6 w-full resize-none rounded-lg border border-line bg-subtle px-4 py-3 text-base font-medium text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-line"
          />

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-subtle py-3 text-sm font-semibold tracking-normal text-muted transition hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={reportSaving}
              className="flex-1 rounded-lg bg-rose-600 py-3 text-sm font-semibold tracking-normal text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {reportSaving ? 'Sending...' : 'Submit Report'}
            </button>
          </div>
        </>
      )}
    </div>
  </div>
);

export default UserHome;
