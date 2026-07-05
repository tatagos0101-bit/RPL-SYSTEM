import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  ImageIcon,
  Info,
  Library,
  RefreshCw,
  Search,
  Upload,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  getStats,
  getBorrowTrend,
  getEntryLogs,
  getTransactions,
  registerMember,
} from '../../api/librarian';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import { buildLibrarianHomeOverview } from '../../api/librarianHomeSummary';
import { getLibrarianHomeLayoutClasses } from '../../api/librarianHomeLayout';

const EMPTY_FORM = { name: '', email: '', phone: '', location: '' };

const NOTICE_STYLES = {
  overdue: {
    shell: 'border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
    icon: 'bg-rose-600 text-white',
    title: 'text-rose-700 dark:text-rose-300',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  'due-soon': {
    shell: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
    icon: 'bg-amber-500 text-white',
    title: 'text-amber-700 dark:text-amber-300',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  setup: {
    shell: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
    icon: 'bg-blue-600 text-white',
    title: 'text-blue-700 dark:text-blue-300',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  clear: {
    shell: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
    icon: 'bg-emerald-600 text-white',
    title: 'text-emerald-700 dark:text-emerald-300',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

const STATUS_STYLES = {
  overdue: {
    label: 'Overdue',
    row: 'border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/20',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  },
  'due-soon': {
    label: 'Due Soon',
    row: 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
  active: {
    label: 'Active',
    row: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const formatDate = (value, options = { month: 'short', day: 'numeric' }) => {
  if (!value) return 'No date';
  const date = toUtcDate(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-PH', options);
};

const formatTime = (value) => {
  if (!value) return 'No time';
  const date = toUtcDate(value);
  if (Number.isNaN(date.getTime())) return 'No time';
  return date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount) => `P ${Number.parseFloat(amount || 0).toFixed(2)}`;

const getLoanStatus = (loan) => {
  if (loan.status === 'overdue') return 'overdue';
  const due = loan.due_date ? toUtcDate(loan.due_date) : null;
  if (!due || Number.isNaN(due.getTime())) return 'active';
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (daysLeft <= 0) return 'overdue';
  if (daysLeft <= 3) return 'due-soon';
  return 'active';
};

const getStatusPriority = (loan) => {
  const status = getLoanStatus(loan);
  if (status === 'overdue') return 0;
  if (status === 'due-soon') return 1;
  return 2;
};

const LibDashboard = () => {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loans, setLoans] = useState([]);
  const [entryLogs, setEntryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegModal, setShowRegModal] = useState(false);
  const [loanSearch, setLoanSearch] = useState('');
  const refreshRef = useRef(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [idFile, setIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regResult, setRegResult] = useState(null);
  const idFileRef = useRef(null);

  const fetchAll = useCallback((showSpinner = false) => {
    if (showSpinner) setLoading(true);
    Promise.all([
      getStats(),
      getBorrowTrend(6),
      getTransactions({ status: 'active', limit: 100 }),
      getTransactions({ status: 'overdue', limit: 100 }),
      getEntryLogs({ limit: 20 }),
    ])
      .then(([sRes, tRes, activeRes, overdueRes, eRes]) => {
        setStats(sRes.data);
        setTrend(tRes.data);
        setLoans([...(overdueRes.data || []), ...(activeRes.data || [])]);
        setEntryLogs(eRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  useEffect(() => {
    refreshRef.current = setInterval(() => fetchAll(false), 10000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchAll]);

  const overview = useMemo(
    () => buildLibrarianHomeOverview({ stats, loans, entryLogs, trend }),
    [stats, loans, entryLogs, trend],
  );

  const filteredLoans = useMemo(() => {
    const query = loanSearch.trim().toLowerCase();
    return loans
      .filter((loan) => {
        if (!query) return true;
        return (
          (loan.member_name || '').toLowerCase().includes(query) ||
          (loan.member_id || '').toLowerCase().includes(query) ||
          (loan.book_title || '').toLowerCase().includes(query)
        );
      })
      .slice()
      .sort((a, b) => {
        const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return toUtcDate(a.due_date).getTime() - toUtcDate(b.due_date).getTime();
      });
  }, [loanSearch, loans]);

  const today = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const layoutClasses = getLibrarianHomeLayoutClasses();

  const handleRegClose = () => {
    setShowRegModal(false);
    setForm(EMPTY_FORM);
    setIdFile(null);
    setIdPreview(null);
    if (idFileRef.current) idFileRef.current.value = '';
    setRegError('');
    setRegResult(null);
  };

  const handleRegSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    if (!form.name.trim()) {
      setRegError('Full name is required.');
      return;
    }
    if (!form.location.trim()) {
      setRegError('Address is required.');
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setRegError('Enter a valid email address.');
      return;
    }
    if (!idFile) {
      setRegError('Please upload a valid government ID.');
      return;
    }

    setRegLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name.trim());
      if (form.email.trim()) fd.append('email', form.email.trim());
      if (form.phone.trim()) fd.append('phone', form.phone.trim());
      fd.append('location', form.location.trim());
      fd.append('id_image', idFile);
      const res = await registerMember(fd);
      setRegResult(res.data);
      setForm(EMPTY_FORM);
      setIdFile(null);
      setIdPreview(null);
      if (idFileRef.current) idFileRef.current.value = '';
      fetchAll(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setRegError(Array.isArray(detail) ? detail.map((item) => item.msg).join(', ') : (detail || 'Registration failed. Please try again.'));
    } finally {
      setRegLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
        <RefreshCw size={28} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className={layoutClasses.page}>
      <div className={layoutClasses.content}>
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.35em] text-slate-400 dark:text-slate-500">
              Librarian Home
            </p>
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              {getGreeting()}, <span className="text-blue-600">Staff</span>
            </h1>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {today}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowRegModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 active:scale-95"
            >
              <UserPlus size={14} />
              Register Member
            </button>
            <button
              onClick={() => fetchAll(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </header>

        <TodayPanel notice={overview.primaryNotice} entrySummary={overview.entrySummary} />

        <section className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatusCard
            icon={BookOpen}
            label="Active Loans"
            value={overview.metrics.activeLoans}
            detail="Books currently out"
            tone="blue"
          />
          <StatusCard
            icon={AlertTriangle}
            label="Overdue"
            value={overview.metrics.overdueCount}
            detail="Follow up first"
            tone="rose"
            urgent={overview.metrics.overdueCount > 0}
          />
          <StatusCard
            icon={CalendarClock}
            label="Due Soon"
            value={overview.metrics.dueSoonCount}
            detail="Due within 3 days"
            tone="amber"
            urgent={overview.metrics.dueSoonCount > 0}
          />
          <StatusCard
            icon={Users}
            label="Visitors Today"
            value={overview.metrics.visitorsToday}
            detail={`${overview.entrySummary.insideCount} currently inside`}
            tone="emerald"
          />
        </section>

        <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
          <PriorityLoans
            loans={filteredLoans}
            totalLoans={loans.length}
            loanSearch={loanSearch}
            setLoanSearch={setLoanSearch}
          />

          <aside className="space-y-6">
            <QuickActions onRegister={() => setShowRegModal(true)} />
            <CollectionSnapshot overview={overview} />
          </aside>
        </div>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.85fr)]">
          <BorrowTrendPanel trendSummary={overview.trendSummary} />
          <EntryActivityPanel entryLogs={entryLogs} entrySummary={overview.entrySummary} />
        </section>
      </div>

      {showRegModal && (
        <RegisterMemberModal
          form={form}
          setForm={setForm}
          idFile={idFile}
          setIdFile={setIdFile}
          idPreview={idPreview}
          setIdPreview={setIdPreview}
          idFileRef={idFileRef}
          regLoading={regLoading}
          regError={regError}
          regResult={regResult}
          onClose={handleRegClose}
          onSubmit={handleRegSubmit}
        />
      )}
    </div>
  );
};

const TodayPanel = ({ notice, entrySummary }) => {
  const style = NOTICE_STYLES[notice.kind] || NOTICE_STYLES.clear;
  return (
    <section className={`mb-6 rounded-[2rem] border p-5 shadow-sm sm:p-6 lg:p-7 ${style.shell}`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)] lg:items-stretch">
        <div className="flex gap-4">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
            {notice.kind === 'overdue' ? <AlertCircle size={22} /> : <Library size={22} />}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
              Today's Priority
            </p>
            <h2 className={`text-2xl font-black tracking-tight sm:text-3xl ${style.title}`}>
              {notice.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              {notice.body}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to={notice.actionHref}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition active:scale-95 ${style.button}`}
              >
                {notice.actionLabel}
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/librarian/borrow-return"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
              >
                <ArrowUpRight size={14} />
                Borrow / Return
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
              Entry Gate
            </p>
            <Camera size={16} className="text-slate-400" />
          </div>
          <p className="text-base font-black text-slate-950 dark:text-white">{entrySummary.latestVisitor}</p>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Latest scan {entrySummary.latestAccessGranted === false ? 'was denied' : 'was granted'}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="Granted" value={entrySummary.grantedCount} />
            <MiniMetric label="Denied" value={entrySummary.deniedCount} />
            <MiniMetric label="Inside" value={entrySummary.insideCount} />
          </div>
        </div>
      </div>
    </section>
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
      <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">{detail}</p>
    </div>
  );
};

const MiniMetric = ({ label, value }) => (
  <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
    <p className="text-lg font-black text-slate-950 dark:text-white">{value}</p>
    <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
  </div>
);

const PriorityLoans = ({ loans, totalLoans, loanSearch, setLoanSearch }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
          Loan Watch
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          Books needing staff attention
        </h2>
      </div>
      <div className="relative w-full lg:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
        <input
          type="text"
          placeholder="Search member or book"
          value={loanSearch}
          onChange={(e) => setLoanSearch(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-4 text-xs font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
    </div>

    {loans.length === 0 ? (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <BookOpen size={30} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
        <p className="text-base font-black text-slate-900 dark:text-white">
          {totalLoans === 0 ? 'No active loans right now' : 'No loans match your search'}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-slate-500 dark:text-slate-400">
          Overdue and due-soon books will appear here first.
        </p>
      </div>
    ) : (
      <div className="space-y-3">
        {loans.slice(0, 8).map((loan) => (
          <LoanRow key={loan.id} loan={loan} />
        ))}
      </div>
    )}
  </section>
);

const LoanRow = ({ loan }) => {
  const status = getLoanStatus(loan);
  const style = STATUS_STYLES[status] || STATUS_STYLES.active;
  const fineAmount = Number.parseFloat(loan.fine_amount || 0);
  return (
    <article className={`grid gap-3 rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${style.row}`}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${style.badge}`}>
            {style.label}
          </span>
          {fineAmount > 0 && (
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-700 dark:bg-slate-900 dark:text-rose-300">
              Fine {formatMoney(fineAmount)}
            </span>
          )}
        </div>
        <h3 className="truncate text-base font-black text-slate-950 dark:text-white">{loan.book_title || 'Unknown book'}</h3>
        <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
          {loan.member_name || 'Unknown member'} {loan.member_id ? `- ${loan.member_id}` : ''}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-left lg:min-w-52">
        <DateChip label="Borrowed" value={formatDate(loan.borrow_date)} />
        <DateChip label="Due" value={formatDate(loan.due_date)} />
      </div>
    </article>
  );
};

const DateChip = ({ label, value }) => (
  <div className="rounded-2xl bg-white/80 p-3 dark:bg-slate-900/50">
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">{value}</p>
  </div>
);

const QuickActions = ({ onRegister }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        Immediate Tasks
      </p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">Most used today</h2>
    </div>
    <div className="space-y-2">
      <ActionButton onClick={onRegister} icon={UserPlus} label="Register Member" tone="blue" />
      <ActionLink to="/librarian/borrow-return" icon={ArrowUpRight} label="Borrow / Return" tone="emerald" />
      <ActionLink to="/librarian/due-books" icon={CalendarClock} label="Due Books" tone="amber" />
    </div>
  </section>
);

const actionTone = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800',
  blue: 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  violet: 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800',
  slate: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700',
};

const ActionLink = ({ to, icon, label, tone }) => (
  <Link to={to} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${actionTone[tone]}`}>
    {createElement(icon, { size: 16 })}
    <span className="flex-1 text-xs font-black uppercase tracking-widest">{label}</span>
    <ChevronRight size={14} />
  </Link>
);

const ActionButton = ({ onClick, icon, label, tone }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${actionTone[tone]}`}>
    {createElement(icon, { size: 16 })}
    <span className="flex-1 text-xs font-black uppercase tracking-widest">{label}</span>
    <ChevronRight size={14} />
  </button>
);

const CollectionSnapshot = ({ overview }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        Collection Snapshot
      </p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
        Available books
      </h2>
    </div>
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {overview.metrics.availableBooks}
        </p>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
          of {overview.metrics.totalBooks} copies
        </p>
      </div>
      <p className="text-2xl font-black text-blue-600 dark:text-blue-300">
        {overview.metrics.inventoryAvailablePct}%
      </p>
    </div>
    <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div
        className="h-full rounded-full bg-blue-600"
        style={{ width: `${overview.metrics.inventoryAvailablePct}%` }}
      />
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <MiniMetric label="Members" value={overview.metrics.totalMembers} />
      <MiniMetric label="Need Face ID" value={overview.metrics.pendingFaceSetup} />
    </div>
  </section>
);

const BorrowTrendPanel = ({ trendSummary }) => {
  const maxBorrows = Math.max(1, ...trendSummary.bars.map((bar) => bar.borrows));
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
            Library Activity
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            Borrowing trend
          </h2>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Last 6 months
        </span>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <ActivityMetric icon={BookOpen} label="Total Borrows" value={trendSummary.totalBorrows} />
        <ActivityMetric icon={BarChart3} label="Latest Month" value={trendSummary.latestBorrows} />
        <ActivityMetric
          icon={Clock}
          label="Month Change"
          value={trendSummary.monthChange > 0 ? `+${trendSummary.monthChange}` : trendSummary.monthChange}
        />
      </div>

      <div className="flex h-52 items-end gap-3 rounded-3xl bg-slate-50 p-4 dark:bg-slate-900/40">
        {trendSummary.bars.map((bar) => {
          const heightPct = bar.borrows > 0 ? Math.max(12, Math.round((bar.borrows / maxBorrows) * 100)) : 6;
          return (
            <div key={`${bar.month}-${bar.index}`} className="flex flex-1 flex-col items-center justify-end gap-2">
              <div className="flex h-36 w-full items-end">
                <div
                  className={`w-full rounded-t-2xl transition-all ${bar.borrows > 0 ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                  style={{ height: `${heightPct}%` }}
                  title={`${bar.month}: ${bar.borrows} borrows`}
                />
              </div>
              <p className="text-[10px] font-black text-slate-700 dark:text-slate-300">{bar.borrows}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {bar.month?.split(' ')[0] || 'N/A'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const ActivityMetric = ({ icon, label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300">
      {createElement(icon, { size: 18 })}
    </div>
    <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
  </div>
);

const EntryActivityPanel = ({ entryLogs, entrySummary }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
    <div className="mb-5">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-500">
        Entry Activity
      </p>
      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">
        Recent gate scans
      </h2>
    </div>
    <div className="mb-4 grid grid-cols-3 gap-2">
      <MiniMetric label="Granted" value={entrySummary.grantedCount} />
      <MiniMetric label="Denied" value={entrySummary.deniedCount} />
      <MiniMetric label="Inside" value={entrySummary.insideCount} />
    </div>
    <div className="space-y-2">
      {entryLogs.slice(0, 6).map((log) => (
        <EntryRow key={log.id} log={log} />
      ))}
      {entryLogs.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <Camera size={26} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-black text-slate-900 dark:text-white">No entry logs yet</p>
        </div>
      )}
    </div>
  </section>
);

const isEntryInside = (log) => Boolean(log?.granted && (log?.is_inside ?? !log?.time_out));

const EntryRow = ({ log }) => (
  <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${log.granted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
      {log.granted ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-black text-slate-950 dark:text-white">
        {log.member_name || 'Unknown visitor'}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {log.entry_type === 'face_scan' ? 'Face Scan' : 'Manual'} - {formatTime(log.accessed_at)}
      </p>
    </div>
    {isEntryInside(log) ? (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        Inside
      </span>
    ) : (
      <span className="text-[10px] font-bold text-slate-400">{log.time_out ? formatTime(log.time_out) : ''}</span>
    )}
  </div>
);

const RegisterMemberModal = ({
  form,
  setForm,
  idFile,
  setIdFile,
  idPreview,
  setIdPreview,
  idFileRef,
  regLoading,
  regError,
  regResult,
  onClose,
  onSubmit,
}) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-xl">
    <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] border border-slate-100 bg-white p-8 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-10">
      <button
        onClick={onClose}
        className="absolute right-6 top-6 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <X size={20} />
      </button>

      <h2 className="mb-1 text-3xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
        Register Member
      </h2>
      <p className="mb-7 border-b border-slate-100 pb-5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-800">
        Create a new library member account
      </p>

      {regResult && (
        <div className="flex flex-col items-center space-y-4 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Member Registered</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">{regResult.name}</p>
            <p className="text-sm text-slate-500">{regResult.email || 'No email provided'}</p>
          </div>
          <div className="w-full space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left dark:border-slate-700 dark:bg-slate-800">
            <div>
              <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Member ID</p>
              <p className="font-mono text-lg font-black text-blue-600 dark:text-blue-400">{regResult.member_id}</p>
            </div>
            <div>
              <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Temporary Password</p>
              <p className="font-mono font-black text-slate-700 dark:text-slate-200">{regResult.temporary_password}</p>
            </div>
          </div>
          <div className="flex w-full items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left dark:border-amber-800/50 dark:bg-amber-900/20">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Remind the member to change their password after first login.</p>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-blue-600 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 active:scale-95"
          >
            Done
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className={`space-y-4 ${regResult ? 'hidden' : ''}`}>
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3.5 dark:border-blue-800/60 dark:bg-blue-900/20">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-blue-500" />
          <div>
            <p className="text-xs font-black text-blue-700 dark:text-blue-300">A unique temporary password will be generated.</p>
            <p className="mt-0.5 text-[10px] text-blue-600/70 dark:text-blue-400/70">The member will be reminded to change this after first login.</p>
          </div>
        </div>

        <FormInput label="Full Name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="Juan dela Cruz" />
        <FormInput label="Email Address" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="juan@email.com" type="email" optional />
        <FormInput label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="09XX-XXX-XXXX" type="tel" optional />
        <FormInput label="Address / Barangay" required value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Brgy. San Jose, Antipolo" />

        <div>
          <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Valid Government ID <span className="text-rose-500">*</span>
          </label>
          <input
            ref={idFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setIdFile(file);
              if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (ev) => setIdPreview(ev.target.result);
                reader.readAsDataURL(file);
              } else {
                setIdPreview(null);
              }
            }}
            className="hidden"
          />
          {!idFile ? (
            <button
              type="button"
              onClick={() => idFileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 py-7 transition hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-600 dark:bg-slate-800/50 dark:hover:border-blue-500 dark:hover:bg-blue-900/10"
            >
              <Upload size={20} className="text-slate-400" />
              <div className="text-center">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Click to upload government ID</p>
                <p className="mt-0.5 text-[10px] text-slate-400">JPG, PNG, WEBP, or PDF - max 10 MB</p>
              </div>
            </button>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {idPreview ? (
                <img src={idPreview} alt="ID preview" className="max-h-40 w-full object-contain" />
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <ImageIcon size={18} className="flex-shrink-0 text-slate-400" />
                  <p className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">{idFile.name}</p>
                </div>
              )}
              <div className="flex border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => idFileRef.current?.click()}
                  className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdFile(null);
                    setIdPreview(null);
                    if (idFileRef.current) idFileRef.current.value = '';
                  }}
                  className="flex-1 border-l border-slate-200 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 transition hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-900/20"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {regError && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20">
            <XCircle size={14} className="mt-0.5 flex-shrink-0 text-rose-500" />
            <p className="text-[11px] font-bold text-rose-800 dark:text-rose-400">{regError}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={regLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
          >
            {regLoading ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {regLoading ? 'Registering...' : 'Register Member'}
          </button>
        </div>
      </form>
    </div>
  </div>
);

const FormInput = ({ label, value, onChange, placeholder, type = 'text', required = false, optional = false }) => (
  <div>
    <label className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
      {label} {required && <span className="text-rose-500">*</span>}
      {optional && <span className="font-normal normal-case text-slate-400"> (optional)</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-600"
    />
  </div>
);

export default LibDashboard;
