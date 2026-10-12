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
    shell: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30',
    icon: 'bg-rose-600 text-white',
    title: 'text-rose-700 dark:text-rose-300',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  soon: {
    shell: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30',
    icon: 'bg-amber-500 text-white',
    title: 'text-amber-700 dark:text-amber-300',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  active: {
    shell: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30',
    icon: 'bg-blue-600 text-white',
    title: 'text-blue-700 dark:text-blue-300',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  clear: {
    shell: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30',
    icon: 'bg-emerald-600 text-white',
    title: 'text-emerald-700 dark:text-emerald-300',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

const DUE_STYLES = {
  overdue: {
    row: 'border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/20',
    badge: 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-600',
  },
  soon: {
    row: 'border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20',
    badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  safe: {
    row: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  unknown: {
    row: 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
    badge: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-400',
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
      <svg viewBox="0 0 120 120" className="h-32 w-32">
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={15}
          stroke="currentColor"
          className="text-slate-100 dark:text-slate-800"
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
    <svg viewBox="0 0 120 120" className="h-32 w-32">
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        strokeWidth={15}
        stroke="currentColor"
        className="text-slate-100 dark:text-slate-800"
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
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900">
        <RefreshCw size={28} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-w-0 [overflow-wrap:anywhere] px-4 py-6 pb-16 sm:px-6 lg:px-10">
      <header className="mb-6">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">
          {getGreeting()}
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950 dark:text-white min-[390px]:text-3xl sm:text-4xl">
              {userName.split(' ')[0]}
              {userName.split(' ').length > 1 && (
                <span className="text-blue-600"> {userName.split(' ').slice(1).join(' ')}</span>
              )}
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {today}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/user/browse"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-100"
            >
              <BookOpen size={14} />
              Browse
            </Link>
            <Link
              to="/user/reservations"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-700"
            >
              <Bookmark size={14} />
              Reservations
            </Link>
          </div>
        </div>
      </header>

      <TodayPanel notice={overview.primaryNotice} nextLoan={nextLoan} />

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
        <StatusCard
          icon={Wallet}
          label="Fine to Pay"
          value={formatMoney(overview.totalFine)}
          detail="Current overdue fees"
          tone={overview.totalFine > 0 ? 'rose' : 'emerald'}
          urgent={overview.totalFine > 0}
        />
      </section>

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
    <section className={`mb-6 rounded-[2rem] border p-5 shadow-sm sm:p-6 lg:p-7 ${style.shell}`}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
            {notice.kind === 'overdue' ? <AlertCircle size={22} /> : <Library size={22} />}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              Your Library Today
            </p>
            <h2 className={`text-2xl font-black tracking-tight sm:text-3xl ${style.title}`}>
              {notice.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              {notice.body}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <NoticeAction notice={notice} className={style.button} />
              <Link
                to="/user/reservations"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                <Bookmark size={14} />
                My Reservations
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Next Due
            </p>
            <Clock size={16} className="text-slate-400" />
          </div>
          {nextLoan ? (
            <div>
              <p className="text-base font-black text-slate-950 dark:text-white">
                {nextLoan.book_title}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {formatLoanDate(nextLoan.due_date)}
              </p>
              <DueBadge dueInfo={nextLoan.dueInfo} className="mt-3" />
            </div>
          ) : (
            <div>
              <p className="text-base font-black text-slate-950 dark:text-white">No borrowed books</p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
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
  const baseClass = `inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition active:scale-95 ${className}`;

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
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  };

  return (
    <div className={`rounded-3xl border bg-white p-4 shadow-sm dark:bg-slate-800 sm:p-5 ${urgent ? 'border-rose-200 dark:border-rose-800' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}>
          {createElement(icon, { size: 18 })}
        </div>
        {urgent && <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />}
      </div>
      <p className="text-xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">{detail}</p>
    </div>
  );
};

const BorrowedBooks = ({ loans, openReportModal }) => (
  <section id="borrowed-books" className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
          Borrowed Books
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          What needs attention
        </h2>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
        Overdue first
      </span>
    </div>

    {loans.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <BookOpen size={30} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
        <p className="text-base font-black text-slate-900 dark:text-white">No borrowed books right now</p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-slate-500 dark:text-slate-400">
          Your account is clear. Browse the catalog when you are ready to reserve another book.
        </p>
        <Link
          to="/user/browse"
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700"
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
    <article className={`grid grid-cols-1 gap-3 rounded-3xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${dueStyle.row}`}>
      <div className="flex items-center gap-3 sm:contents">
        <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-slate-200 shadow-sm dark:bg-slate-700 sm:h-20 sm:w-14">
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
            {fineAmount > 0 && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-700 dark:bg-slate-900 dark:text-rose-300">
                Fine {formatMoney(fineAmount)}
              </span>
            )}
          </div>
          <h3 className="text-base font-black text-slate-950 dark:text-white">{loan.book_title}</h3>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{loan.book_author || 'Unknown author'}</p>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Due {formatLoanDate(loan.due_date)}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className={`h-full rounded-full ${dueStyle.bar}`} style={{ width: barWidth }} />
          </div>
        </div>
      </div>

      <button
        onClick={() => openReportModal(loan)}
        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:border-rose-200 hover:text-rose-700 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-800"
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${dueStyle.badge} ${className}`}>
      {dueInfo.label}
    </span>
  );
};

const ReadingTastes = ({ genreData, topGenrePct }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        Reading Tastes
      </p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
        Your usual genres
      </h2>
    </div>

    <div className="mb-5 flex items-center justify-center">
      <div className="relative">
        <DonutChart data={genreData} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-black text-slate-950 dark:text-white">{topGenrePct.toFixed(0)}%</p>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            top genre
          </p>
        </div>
      </div>
    </div>

    {genreData.length > 0 ? (
      <div className="space-y-2.5">
        {genreData.map((g) => (
          <div key={g.label} className="flex items-center gap-3">
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: g.color }} />
            <p className="min-w-0 flex-1 text-xs font-bold text-slate-600 dark:text-slate-400">{g.label}</p>
            <p className="text-xs font-black text-slate-950 dark:text-white">{g.value.toFixed(0)}%</p>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-center text-sm font-medium text-slate-400">No reading history yet.</p>
    )}
  </section>
);

const ReadingGoals = ({ goals, openGoalsModal }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
          Reading Goals
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
          This year
        </h2>
      </div>
      <button
        onClick={openGoalsModal}
        className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 transition hover:bg-blue-100 active:scale-95 dark:bg-blue-950/40 dark:text-blue-300"
      >
        <Pencil size={12} />
        Edit
      </button>
    </div>

    {goals.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900/40">
        <Target size={22} className="mb-3 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-black text-slate-900 dark:text-white">No goals set yet</p>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
          Add simple yearly goals for books, genres, and visits.
        </p>
      </div>
    ) : (
      <div className="space-y-5">
        {goals.map((goal) => (
          <div key={goal.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950 dark:text-white">{goal.label}</p>
                <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                  {goal.current} of {goal.target}
                </p>
              </div>
              <span className="text-xl font-black text-slate-950 dark:text-white">{goal.percent}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${goal.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

const LibraryActivity = ({ activitySummary }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
          Library Activity
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          Visits at a glance
        </h2>
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
        Last 12 weeks
      </span>
    </div>

    <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
      <ActivityMetric icon={Library} label="Visits Recorded" value={activitySummary.totalVisits} />
      <ActivityMetric icon={BarChart3} label="Active Days" value={activitySummary.activeDays} />
      <ActivityMetric icon={Clock} label="Last Visit" value={activitySummary.lastVisitLabel} />
    </div>

    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[620px] items-end gap-3 rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/40">
        {activitySummary.weeklyBars.map((bar) => (
          <div key={bar.index} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-36 w-full items-end">
              <div
                className={`w-full rounded-t-2xl transition-all ${bar.visits > 0 ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                style={{ height: `${bar.heightPct}%` }}
                title={`${bar.label}: ${bar.visits} visit${bar.visits === 1 ? '' : 's'}`}
              />
            </div>
            <p className="text-[10px] font-black text-slate-700 dark:text-slate-300">{bar.visits}</p>
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {bar.index === 0 || bar.index === 11 ? bar.label : `W${bar.index + 1}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const ActivityMetric = ({ icon, label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300">
      {createElement(icon, { size: 18 })}
    </div>
    <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
  </div>
);

const GoalsModal = ({ goalDraft, setGoalDraft, goalsSaving, onClose, onSave }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
      <div className="mb-7 flex items-center justify-between">
        <h3 className="text-xl font-black uppercase tracking-tight text-slate-950 dark:text-white">Set Goals</h3>
        <button
          onClick={onClose}
          className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
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
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {label}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={999}
                value={goalDraft[key]}
                onChange={(e) => setGoalDraft((d) => ({ ...d, [key]: Math.max(1, Number.parseInt(e.target.value, 10) || 1) }))}
                className="w-24 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-center text-lg font-black text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-2xl bg-slate-100 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={goalsSaving}
          className="flex-1 rounded-2xl bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
    <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-8">
      {reportSuccess ? (
        <div className="py-4 text-center">
          <CheckCircle size={40} className="mx-auto mb-4 text-emerald-500" />
          <h3 className="mb-1 text-lg font-black uppercase tracking-tight text-slate-950 dark:text-white">
            Report Submitted
          </h3>
          <p className="mb-6 text-xs font-medium text-slate-400 dark:text-slate-500">
            The librarian has been notified about this issue.
          </p>
          <button
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-950 dark:text-white">Report Issue</h3>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <p className="mb-6 text-xs font-medium text-slate-400 dark:text-slate-500">{reportModal.bookTitle}</p>

          <div className="mb-5 space-y-2">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
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
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                  reportReason === opt.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
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
                <span className="text-xs font-bold">{opt.label}</span>
              </label>
            ))}
          </div>

          <textarea
            placeholder="Additional notes (optional)"
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            rows={2}
            className="mb-6 w-full resize-none rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-xs font-medium text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-600"
          />

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={reportSaving}
              className="flex-1 rounded-2xl bg-rose-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-rose-700 active:scale-95 disabled:opacity-60"
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
