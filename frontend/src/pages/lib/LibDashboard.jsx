import { loadSections } from '../../api/loadSections';
import FineContent from '../../components/FineContent';
import ModalFrame from '../../components/ModalFrame';
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
    shell: 'border-danger bg-danger-soft border-danger bg-danger-soft',
    icon: 'bg-rose-600 text-white',
    title: 'text-danger text-danger',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  'due-soon': {
    shell: 'border-warning bg-warning-soft border-warning bg-warning-soft',
    icon: 'bg-amber-500 text-ink',
    title: 'text-warning text-warning',
    button: 'bg-amber-500 hover:bg-amber-600 text-ink',
  },
  setup: {
    shell: 'border-line bg-info-soft border-line bg-info-soft',
    icon: 'bg-action text-white',
    title: 'text-link text-link',
    button: 'bg-action hover:bg-action-hover text-white',
  },
  clear: {
    shell: 'border-success bg-success-soft border-success bg-success-soft',
    icon: 'bg-emerald-700 text-white',
    title: 'text-success text-success',
    button: 'bg-emerald-700 hover:bg-emerald-700 text-white',
  },
};

const STATUS_STYLES = {
  overdue: {
    label: 'Overdue',
    row: 'border-danger bg-danger-soft border-danger bg-danger-soft',
    badge: 'bg-danger-soft text-danger bg-danger-soft text-danger',
  },
  'due-soon': {
    label: 'Due Soon',
    row: 'border-warning bg-warning-soft border-warning bg-warning-soft',
    badge: 'bg-warning-soft text-warning bg-warning-soft text-warning',
  },
  active: {
    label: 'Active',
    row: 'border-line bg-panel ',
    badge: 'bg-success-soft text-success bg-success-soft text-success',
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
  const [failedSections, setFailedSections] = useState([]);
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
    loadSections([
      ['totals', getStats, setStats], ['borrowing trend', () => getBorrowTrend(6), setTrend],
      ['active loans', () => getTransactions({ status: 'active', limit: 100 }), rows => setLoans(previous => [...previous.filter(row => row.status !== 'active'), ...rows])],
      ['overdue loans', () => getTransactions({ status: 'overdue', limit: 100 }), rows => setLoans(previous => [...previous.filter(row => row.status !== 'overdue'), ...rows])],
      ['entry log', () => getEntryLogs({ limit: 20 }), setEntryLogs],
    ]).then(setFailedSections).finally(() => setLoading(false));
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
      <div className="rpl-page flex min-h-screen items-center justify-center bg-subtle">
        <RefreshCw size={28} className="animate-spin text-link" />
      </div>
    );
  }

  return (
    <div className={`rpl-page min-w-0 [overflow-wrap:anywhere] ${layoutClasses.page}`}>
      <div className={layoutClasses.content}>
        {failedSections.length > 0 && <p role="alert" className="text-danger">Unavailable: {failedSections.join(', ')}. Displayed values may be incomplete. <button className="underline" onClick={() => fetchAll(false)}>Retry dashboard</button></p>}
        <p className="text-sm text-muted">Recent activity preview. Use Borrow / Return for complete searchable history.</p>
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-normal text-muted">
              Librarian Home
            </p>
            <h1 className="font-semibold tracking-normal text-ink min-[390px]: rpl-title">
              {getGreeting()}, <span className="text-link">Staff</span>
            </h1>
            <p className="mt-2 text-sm font-bold tracking-normal text-muted">
              {today}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowRegModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-3 text-sm font-semibold tracking-normal text-white transition hover:bg-action-hover"
            >
              <UserPlus size={14} />
              Register Member
            </button>
            <button
              onClick={() => fetchAll(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold tracking-normal text-muted transition hover:border-line hover:text-link"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </header>

        <TodayPanel notice={overview.primaryNotice} entrySummary={overview.entrySummary} />

        <section className="mb-8 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
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

        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
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

        <section className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.85fr)]">
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
    <section className={`mb-6 rounded-xl border p-5 shadow-sm sm:p-6 lg:p-7 ${style.shell}`}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
          <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${style.icon}`}>
            {notice.kind === 'overdue' ? <AlertCircle size={22} /> : <Library size={22} />}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-sm font-semibold tracking-normal text-muted">
              Today's Priority
            </p>
            <h2 className={`text-2xl font-semibold tracking-normal sm:text-3xl ${style.title}`}>
              {notice.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-muted">
              {notice.body}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to={notice.actionHref}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold tracking-normal transition ${style.button}`}
              >
                {notice.actionLabel}
                <ArrowRight size={14} />
              </Link>
              {notice.actionHref !== '/librarian/borrow-return' && <Link
                to="/librarian/borrow-return"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 text-sm font-semibold tracking-normal text-muted transition hover:border-line hover:text-link"
              >
                <ArrowUpRight size={14} />
                Borrow / Return
              </Link>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold tracking-normal text-muted">
              Entry Gate
            </p>
            <Camera size={16} className="text-muted" />
          </div>
          <p className="text-base font-semibold text-ink">{entrySummary.latestVisitor}</p>
          <p className="mt-1 text-sm font-medium text-muted">
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
      <p className="text-2xl font-semibold tracking-normal text-ink sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm font-semibold tracking-normal text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-muted">{detail}</p>
    </div>
  );
};

const MiniMetric = ({ label, value }) => (
  <div className="rounded-xl bg-subtle p-3">
    <p className="text-lg font-semibold text-ink">{value}</p>
    <p className="mt-1 text-sm font-semibold tracking-normal text-muted">{label}</p>
  </div>
);

const PriorityLoans = ({ loans, totalLoans, loanSearch, setLoanSearch }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-semibold tracking-normal text-muted">
          Loan Watch
        </p>
        <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
          Books needing staff attention
        </h2>
      </div>
      <div className="relative w-full lg:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
        <input aria-label="Search member or book"
          type="text"
          placeholder="Search member or book"
          value={loanSearch}
          onChange={(e) => setLoanSearch(e.target.value)}
          className="w-full rounded-lg border border-line bg-subtle py-3 pl-9 pr-4 text-base font-bold text-muted outline-none transition focus:ring-2 focus:ring-line"
        />
      </div>
    </div>

    {loans.length === 0 ? (
      <div className="rounded-xl border border-dashed border-line bg-subtle p-8 text-center">
        <BookOpen size={30} className="mx-auto mb-3 text-ink" />
        <p className="text-base font-semibold text-ink">
          {totalLoans === 0 ? 'No active loans right now' : 'No loans match your search'}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-muted">
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
    <article className={`grid grid-cols-1 gap-3 rounded-xl border p-4 transition hover:shadow-md lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center ${style.row}`}>
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-sm font-semibold tracking-normal ${style.badge}`}>
            {style.label}
          </span>
          <FineContent>
          {fineAmount > 0 && (
            <span className="rounded-full bg-panel px-2.5 py-1 text-sm font-semibold tracking-normal text-danger">
              Fine {formatMoney(fineAmount)}
            </span>
          )}
          </FineContent>
        </div>
        <h3 className="font-semibold text-ink rpl-subheading">{loan.book_title || 'Unknown book'}</h3>
        <p className="text-sm font-bold text-muted">
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
  <div className="rounded-xl bg-panel p-3">
    <p className="text-sm font-semibold tracking-normal text-muted">{label}</p>
    <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
  </div>
);

const QuickActions = ({ onRegister }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5">
      <p className="text-sm font-semibold tracking-normal text-muted">
        Immediate Tasks
      </p>
      <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">Most used today</h2>
    </div>
    <div className="space-y-2">
      <ActionButton onClick={onRegister} icon={UserPlus} label="Register Member" tone="blue" />
      <ActionLink to="/librarian/borrow-return" icon={ArrowUpRight} label="Borrow / Return" tone="emerald" />
      <ActionLink to="/librarian/due-books" icon={CalendarClock} label="Due Books" tone="amber" />
    </div>
  </section>
);

const actionTone = {
  emerald: 'bg-success-soft text-success border-success hover:bg-success-soft bg-success-soft text-success border-success',
  blue: 'bg-info-soft text-link border-line hover:bg-info-soft bg-info-soft text-link border-line',
  amber: 'bg-warning-soft text-warning border-warning hover:bg-warning-soft bg-warning-soft text-warning border-warning',
  violet: 'bg-info-soft text-link border-line hover:bg-info-soft bg-info-soft text-link border-line',
  slate: 'bg-subtle text-muted border-line hover:bg-subtle ',
};

const ActionLink = ({ to, icon, label, tone }) => (
  <Link to={to} className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${actionTone[tone]}`}>
    {createElement(icon, { size: 16 })}
    <span className="flex-1 text-sm font-semibold tracking-normal">{label}</span>
    <ChevronRight size={14} />
  </Link>
);

const ActionButton = ({ onClick, icon, label, tone }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${actionTone[tone]}`}>
    {createElement(icon, { size: 16 })}
    <span className="flex-1 text-sm font-semibold tracking-normal">{label}</span>
    <ChevronRight size={14} />
  </button>
);

const CollectionSnapshot = ({ overview }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5">
      <p className="text-sm font-semibold tracking-normal text-muted">
        Collection Snapshot
      </p>
      <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
        Available books
      </h2>
    </div>
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-3xl font-semibold tracking-normal text-ink">
          {overview.metrics.availableBooks}
        </p>
        <p className="text-sm font-semibold tracking-normal text-muted">
          of {overview.metrics.totalBooks} copies
        </p>
      </div>
      <p className="text-2xl font-semibold text-link">
        {overview.metrics.inventoryAvailablePct}%
      </p>
    </div>
    <div className="h-3 overflow-hidden rounded-full bg-subtle">
      <div
        className="h-full rounded-full bg-action"
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
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-normal text-muted">
            Library Activity
          </p>
          <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
            Borrowing trend
          </h2>
        </div>
        <span className="text-sm font-semibold tracking-normal text-muted">
          Last 6 months
        </span>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ActivityMetric icon={BookOpen} label="Total Borrows" value={trendSummary.totalBorrows} />
        <ActivityMetric icon={BarChart3} label="Latest Month" value={trendSummary.latestBorrows} />
        <ActivityMetric
          icon={Clock}
          label="Month Change"
          value={trendSummary.monthChange > 0 ? `+${trendSummary.monthChange}` : trendSummary.monthChange}
        />
      </div>

      <div role="group" aria-label="Monthly borrowing totals" className="flex items-end gap-2 rounded-xl bg-subtle p-3 sm:gap-4 sm:p-4">
        {trendSummary.bars.map((bar) => {
          const heightPct = (bar.borrows / maxBorrows) * 100;
          return (
            <div key={`${bar.month}-${bar.index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2" aria-label={`${bar.month}: ${bar.borrows} borrows`}>
              <p className="w-full truncate text-center text-sm font-semibold tabular-nums text-ink" title={`${bar.borrows} borrows`}>{bar.borrows}</p>
              <div className="flex h-36 w-full shrink-0 items-end justify-center border-b border-line">
                <div
                  className="w-full max-w-12 rounded-t-md bg-action"
                  style={{ height: `${heightPct}%` }}
                  title={`${bar.month}: ${bar.borrows} borrows`}
                />
              </div>
              <p className="text-sm font-semibold tracking-normal text-muted" title={bar.month}>
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
  <div className="rounded-xl border border-line bg-subtle p-4">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-panel text-link shadow-sm">
      {createElement(icon, { size: 18 })}
    </div>
    <p className="text-2xl font-semibold tracking-normal text-ink">{value}</p>
    <p className="mt-1 text-sm font-semibold tracking-normal text-muted">{label}</p>
  </div>
);

const EntryActivityPanel = ({ entryLogs, entrySummary }) => (
  <section className="rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
    <div className="mb-5">
      <p className="text-sm font-semibold tracking-normal text-muted">
        Entry Activity
      </p>
      <h2 className="mt-1 font-semibold tracking-normal text-ink rpl-section-title">
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
        <div className="rounded-xl border border-dashed border-line bg-subtle p-6 text-center">
          <Camera size={26} className="mx-auto mb-3 text-ink" />
          <p className="text-sm font-semibold text-ink">No entry logs yet</p>
        </div>
      )}
    </div>
  </section>
);

const isEntryInside = (log) => Boolean(log?.granted && (log?.is_inside ?? !log?.time_out));

const EntryRow = ({ log }) => (
  <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle p-3">
    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${log.granted ? 'bg-success-soft text-success bg-success-soft text-success' : 'bg-danger-soft text-danger bg-danger-soft text-danger'}`}>
      {log.granted ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-ink">
        {log.member_name || 'Unknown visitor'}
      </p>
      <p className="text-sm font-bold tracking-normal text-muted">
        {log.entry_type === 'face_scan' ? 'Face Scan' : 'Manual'} - {formatTime(log.accessed_at)}
      </p>
    </div>
    {isEntryInside(log) ? (
      <span className="rounded-full bg-warning-soft px-2.5 py-1 text-sm font-semibold tracking-normal text-warning">
        Inside
      </span>
    ) : (
      <span className="text-sm font-bold text-muted">{log.time_out ? formatTime(log.time_out) : ''}</span>
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
  <ModalFrame onClose={onClose} aria-label="Register member" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6">
    <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-panel p-8 shadow-sm sm:p-10">
      <button aria-label="Close"
        onClick={onClose}
        className="absolute right-6 top-6 rounded-lg p-2 text-muted transition hover:bg-subtle hover:text-ink"
      >
        <X size={20} />
      </button>

      <h2 className="mb-1 font-semibold tracking-normal text-ink rpl-section-title">
        Register Member
      </h2>
      <p className="mb-7 border-b border-line pb-5 text-sm font-semibold tracking-normal text-muted">
        Create a new library member account
      </p>

      {regResult && (
        <div className="flex flex-col items-center space-y-4 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-success bg-success-soft">
            <CheckCircle2 size={28} className="text-success" />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold tracking-normal text-success">Member Registered</p>
            <p className="text-xl font-semibold text-ink">{regResult.name}</p>
            <p className="text-sm text-muted">{regResult.email || 'No email provided'}</p>
          </div>
          <div className="w-full space-y-3 rounded-xl border border-line bg-subtle px-5 py-4 text-left">
            <div>
              <p className="mb-1 text-sm font-semibold tracking-normal text-muted">Member ID</p>
              <p className="font-sans text-lg font-semibold text-link">{regResult.member_id}</p>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold tracking-normal text-muted">Temporary Password</p>
              <p className="font-sans font-semibold text-muted">{regResult.temporary_password}</p>
            </div>
          </div>
          <div className="flex w-full items-start gap-2.5 rounded-xl border border-warning bg-warning-soft px-4 py-3 text-left">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-warning" />
            <p className="text-sm font-medium text-warning">Remind the member to change their password after first login.</p>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-action py-3 text-sm font-semibold tracking-normal text-white transition hover:bg-action-hover"
          >
            Done
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className={`space-y-4 ${regResult ? 'hidden' : ''}`}>
        <div className="flex items-start gap-3 rounded-xl border border-line bg-info-soft px-4 py-3.5">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-link" />
          <div>
            <p className="text-sm font-semibold text-link">A unique temporary password will be generated.</p>
            <p className="mt-0.5 text-sm text-link">The member will be reminded to change this after first login.</p>
          </div>
        </div>

        <FormInput label="Full Name" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="Juan dela Cruz" />
        <FormInput label="Email Address" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="juan@email.com" type="email" optional />
        <FormInput label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} placeholder="09XX-XXX-XXXX" type="tel" optional />
        <FormInput label="Address / Barangay" required value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Brgy. San Jose, Antipolo" />

        <div>
          <label className="mb-1.5 block text-sm font-semibold tracking-normal text-muted">
            Valid Government ID <span className="text-danger">*</span>
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
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-subtle py-7 transition hover:border-line hover:bg-info-soft"
            >
              <Upload size={20} className="text-muted" />
              <div className="text-center">
                <p className="text-sm font-bold text-muted">Click to upload government ID</p>
                <p className="mt-0.5 text-sm text-muted">JPG, PNG, WEBP, or PDF - max 10 MB</p>
              </div>
            </button>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-subtle">
              {idPreview ? (
                <img src={idPreview} alt="ID preview" className="max-h-40 w-full object-contain" />
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">
                  <ImageIcon size={18} className="flex-shrink-0 text-muted" />
                  <p className="truncate text-sm font-bold text-muted">{idFile.name}</p>
                </div>
              )}
              <div className="flex border-t border-line">
                <button
                  type="button"
                  onClick={() => idFileRef.current?.click()}
                  className="flex-1 py-2 text-sm font-semibold tracking-normal text-link transition hover:bg-info-soft"
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
                  className="flex-1 border-l border-line py-2 text-sm font-semibold tracking-normal text-danger transition hover:bg-danger-soft"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {regError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger bg-danger-soft p-3">
            <XCircle size={14} className="mt-0.5 flex-shrink-0 text-danger" />
            <p className="text-sm font-bold text-danger">{regError}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-line py-3.5 text-sm font-semibold tracking-normal text-muted transition hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={regLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-action py-3.5 text-sm font-semibold tracking-normal text-white shadow-sm transition hover:bg-action-hover disabled:opacity-60"
          >
            {regLoading ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {regLoading ? 'Registering...' : 'Register Member'}
          </button>
        </div>
      </form>
    </div>
  </ModalFrame>
);

const FormInput = ({ label, value, onChange, placeholder, type = 'text', required = false, optional = false }) => (
  <div>
    <label className="mb-1.5 block text-sm font-semibold tracking-normal text-muted">
      {label} {required && <span className="text-danger">*</span>}
      {optional && <span className="font-normal normal-case text-muted"> (optional)</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full rounded-lg border border-line bg-subtle px-4 py-3 text-base font-medium text-ink outline-none transition placeholder:text-muted focus:ring-2 focus:ring-line"
    />
  </div>
);

export default LibDashboard;
