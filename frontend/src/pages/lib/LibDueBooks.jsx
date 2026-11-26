import CirculationDialog from '../../components/CirculationDialog';
import FineContent from '../../components/FineContent';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Clock, Search, Mail, CheckCircle2, RefreshCw, BookOpen, List } from 'lucide-react';
import { getDueBooks, getFineSummary, notifyMember as sendOverdueEmail } from '../../api/librarian';
import { overdueEmailOutcome, overdueEmailError } from '../../api/overdueEmail';
import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';

const STATUS_CFG = {
  overdue:    { label: 'Overdue',  cls: 'bg-danger-soft bg-danger-soft text-danger text-danger',     row: 'border-l-4 border-danger border-danger' },
  'due-soon': { label: 'Due Soon', cls: 'bg-warning-soft bg-warning-soft text-warning text-warning', row: 'border-l-4 border-warning border-warning' },
  active:     { label: 'Active',   cls: 'bg-info-soft bg-info-soft text-link text-link',     row: '' },
};

function daysLeft(dueDateStr) {
  const due = toUtcDate(dueDateStr);
  const now = new Date();
  return Math.floor((due - now) / (1000 * 60 * 60 * 24));
}

function loanStatus(dl) {
  if (dl < 0) return 'overdue';
  if (dl <= 3) return 'due-soon';
  return 'active';
}

export default function LibDueBooks() {
  const [tab, setTab] = useState('due'); // 'due' | 'active'

  // Due Books state
  const [books, setBooks] = useState([]);
  const [fines, setFines] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [operationError, setOperationError] = useState('');
  const [emailStates, setEmailStates] = useState({});
  const pendingEmails = useRef(new Set());

  const [search, setSearch] = useState('');
  const loansPage = useServerPage('/api/transactions', { status: 'active', search }, '/api/transactions/count');
  const { items: filteredLoans, loading: loansLoading, reload: fetchLoans } = loansPage;

  const fetchBooks = useCallback((f = 'all') => {
    setLoading(true);
    setOperationError('');
    Promise.all([getDueBooks(f), getFineSummary()])
      .then(([res, summary]) => { setBooks(res.data); setFines(summary.data); })
      .catch(() => setOperationError('Could not load loans. Please retry.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchBooks('all'), 0);
    return () => clearTimeout(id);
  }, [fetchBooks]);

  const handleFilterChange = (f) => {
    setFilter(f);
    fetchBooks(f);
  };

  const [returnLoan, setReturnLoan] = useState(null);
  const handleReturn = b => setReturnLoan(b);

  const emailMember = async book => {
    if (pendingEmails.current.has(book.user_id) || ['accepted', 'unknown', 'recent'].includes(emailStates[book.user_id]?.status)) return;
    pendingEmails.current.add(book.user_id);
    setEmailStates(previous => ({ ...previous, [book.user_id]: { status: 'sending', message: 'Submitting the overdue email…' } }));
    try {
      const { data } = await sendOverdueEmail(book.transaction_id);
      setEmailStates(previous => ({ ...previous, [book.user_id]: overdueEmailOutcome(data) }));
    } catch (error) {
      setEmailStates(previous => ({ ...previous, [book.user_id]: overdueEmailError(error) }));
    } finally { pendingEmails.current.delete(book.user_id); }
  };

  const filteredDue = books.filter((b) =>
    (b.member_name || '').toLowerCase().includes(search.toLowerCase()) ||
    b.book_title.toLowerCase().includes(search.toLowerCase())
  );

  const overdue = books.filter((b) => b.status === 'overdue').length;
  const dueSoon = books.filter((b) => b.status === 'due-soon').length;

  const fmt = (dateStr) => toUtcDate(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="rpl-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">
      {returnLoan && <CirculationDialog initialReturn={returnLoan} onClose={() => setReturnLoan(null)}
        onCommit={() => { fetchBooks(filter); fetchLoans(); }} />}
      {operationError && <p role="alert" className="p-4 text-danger">{operationError} <button className="underline" onClick={() => { fetchBooks(filter); fetchLoans(); }}>Retry loading</button></p>}
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <p className="text-sm font-semibold tracking-normal text-link mb-1">
            Librarian Terminal
          </p>
          <h1 className="font-semibold tracking-normal leading-none rpl-title">
            Loans &amp; <span className="text-danger">Due Books</span>
          </h1>
          <p className="text-sm text-muted font-medium mt-2">
            Monitor active borrowings, overdue items, and upcoming due dates.
          </p>
        </div>

        <section id="member-fines" aria-label="Member overdue fines" className="mb-7 scroll-mt-24 rounded-xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Member overdue fines</h2><p className="mt-1 text-3xl font-semibold text-link">{fines ? `₱${Number(fines.total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</p></div><button type="button" onClick={() => fetchBooks(filter)} disabled={loading} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold hover:bg-subtle disabled:opacity-50"><RefreshCw size={15} />Refresh fines</button></div>
          {fines && <><p className="mt-3 text-sm">{fines.members_with_fines} members with accrued fines · {fines.overdue_loans} overdue loans</p><p className="mt-1 text-sm text-muted">PHP {fines.daily_rate} per book for each completed day after the due time. Books that are not overdue have no late fee. These are current assessments, not payment records.</p><p className="mt-2 text-xs text-muted">Calculated {toUtcDate(fines.as_of).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}. Refresh to recalculate; the amount stops increasing when the loan is returned or closed.</p></>}
        </section>

        {/* Tab switcher */}
        <div className="flex flex-wrap gap-3 mb-7 animate-fade-in-up delay-75">
          <button
            onClick={() => { setTab('due'); setSearch(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 ${
              tab === 'due'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200 dark:shadow-rose-900/40'
                : 'bg-subtle text-muted hover:text-ink hover:bg-subtle '
            }`}
          >
            <AlertTriangle size={12} /> Due Books
          </button>
          <button
            onClick={() => { setTab('active'); setSearch(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 ${
              tab === 'active'
                ? 'bg-action text-white shadow-md '
                : 'bg-subtle text-muted hover:text-ink hover:bg-subtle '
            }`}
          >
            <BookOpen size={12} /> Active Loans
          </button>
        </div>

        {/* ── DUE BOOKS TAB ── */}
        {tab === 'due' && (
          <>
            {overdue > 0 && (
              <div className="animate-fade-in-up bg-danger-soft border border-danger rounded-xl p-5 flex items-center gap-4 mb-7 hover:shadow-sm hover:shadow-rose-100 dark:hover:shadow-rose-900/20 transition-all duration-200">
                <div className="w-10 h-10 bg-danger-soft rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-danger" />
                </div>
                <p className="font-semibold text-sm text-danger">
                  {overdue} book{overdue > 1 ? 's are' : ' is'} overdue. Send overdue email uses the member’s verified saved email. Each message includes all their current overdue books, due dates, how late they are and current late fees.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-7 animate-fade-in-up delay-100">
              <div className="bg-danger-soft border border-danger rounded-xl p-6 flex items-center gap-4 hover:shadow-sm hover:shadow-rose-100 dark:hover:shadow-rose-900/20 transition-all duration-200 cursor-default">
                <AlertTriangle size={20} className="text-danger flex-shrink-0" />
                <div>
                  <p className="text-3xl font-semibold tracking-normal text-danger">{overdue}</p>
                  <p className="text-sm font-semibold tracking-normal text-danger">Overdue Books</p>
                </div>
              </div>
              <div className="bg-warning-soft border border-warning rounded-xl p-6 flex items-center gap-4 hover:shadow-sm hover:shadow-amber-100 dark:hover:shadow-amber-900/20 transition-all duration-200 cursor-default">
                <Clock size={20} className="text-warning flex-shrink-0" />
                <div>
                  <p className="text-3xl font-semibold tracking-normal text-warning">{dueSoon}</p>
                  <p className="text-sm font-semibold tracking-normal text-warning">Due Within 3 Days</p>
                </div>
              </div>
            </div>

            <div className="animate-fade-in-up delay-200 bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-line">
                <div className="flex gap-2">
                  {['all', 'overdue', 'due-soon'].map((f) => (
                    <button key={f} onClick={() => handleFilterChange(f)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 ${
                        filter === f
                          ? f === 'overdue' ? 'bg-rose-600 text-white shadow-md shadow-rose-200 dark:shadow-rose-900/40' : f === 'due-soon' ? 'bg-amber-500 text-white shadow-md shadow-amber-200 dark:shadow-amber-900/40' : 'bg-action text-white shadow-md '
                          : 'bg-subtle text-muted hover:text-ink hover:bg-subtle '
                      }`}>
                      {f.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-0 w-full md:w-auto md:ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                  <input aria-label="Search member or book..." type="text" placeholder="Search member or book..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="bg-subtle border border-line rounded-lg py-2 pl-8 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line w-full sm:w-52 min-w-0 text-muted placeholder:text-muted" />
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-link" />
                </div>
              ) : (
                <div className="divide-y divide-blue-50 dark:divide-slate-800">
                  {filteredDue.map((b) => {
                    const cfg = STATUS_CFG[b.status] || STATUS_CFG['due-soon'];
                    const email = emailStates[b.user_id];
                    const emailBusy = ['sending', 'accepted', 'unknown', 'recent'].includes(email?.status);
                    return (
                      <div key={b.transaction_id} className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-info-soft hover:bg-subtle transition-all duration-200 ${cfg.row}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-sm text-ink group-hover:text-link transition-colors duration-200">{b.member_name}</p>
                            <span className="text-sm font-semibold text-muted">{b.member_id}</span>
                          </div>
                          <p className="text-sm text-muted font-medium">{b.book_title}</p>
                          <FineContent><p className={`mt-1 text-sm font-semibold ${Number(b.fine_amount) > 0 ? 'text-danger' : 'text-muted'}`}>Current late fee: PHP {Number(b.fine_amount || 0).toFixed(2)}</p></FineContent>
                          {email?.message && <p role={email.status === 'failed' || email.status === 'unknown' ? 'alert' : 'status'} className={`mt-2 max-w-lg text-sm leading-relaxed ${email.status === 'accepted' ? 'text-success' : email.status === 'failed' ? 'text-danger' : 'text-warning'}`}>{email.message}</p>}
                          {b.status === 'overdue' && b.can_email_reminder !== true && <p className="mt-2 text-xs text-muted">{b.email_reminder_reason || 'Email reminder is unavailable. Refresh the saved email details.'}</p>}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm min-w-0">
                          <div>
                            <p className="text-sm font-semibold tracking-normal text-muted">Borrowed</p>
                            <p className="font-sans font-bold text-muted">{fmt(b.borrow_date)}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold tracking-normal text-muted">Due</p>
                            <p className="font-sans font-bold text-muted">{fmt(b.due_date)}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold tracking-normal text-muted">Days</p>
                            <p className={`font-semibold text-sm ${b.days_left < 0 ? 'text-danger text-danger' : 'text-warning text-warning'}`}>
                              {b.days_left < 0 ? `${Math.abs(b.days_left)} late` : `${b.days_left} left`}
                            </p>
                          </div>

                        </div>

                        <span className={`px-3 py-1.5 rounded-full text-sm font-semibold tracking-normal flex-shrink-0 ${cfg.cls}`}>
                          {cfg.label}
                        </span>

                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {b.status === 'overdue' && <button type="button"
                            title={b.can_email_reminder === true ? 'Email all of this member’s overdue books, due dates and current late fees.' : b.email_reminder_reason || 'Email reminder unavailable'}
                            disabled={b.can_email_reminder !== true || emailBusy}
                            onClick={() => emailMember(b)}
                            className="flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50">
                            {email?.status === 'sending' ? <RefreshCw size={15} className="animate-spin" /> : <Mail size={15} />}
                            {email?.status === 'sending' ? 'Sending email…' : email?.status === 'accepted' ? 'Email submitted' : email?.status === 'unknown' ? 'Delivery unconfirmed' : email?.status === 'recent' ? 'Please wait before retrying' : 'Send overdue email'}
                          </button>}
                          <button
                            onClick={() => handleReturn(b)}
                            className="group/btn flex items-center gap-1.5 px-3 py-2 bg-success-soft text-success border border-success rounded-lg text-sm font-semibold tracking-normal hover:bg-success-soft transition-all duration-200"
                          >
                            <CheckCircle2 size={11} /> Inspect return
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredDue.length === 0 && !loading && (
                    <div className="text-center py-12 text-muted text-sm font-semibold tracking-normal">
                      No due books found
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ACTIVE LOANS TAB ── */}
        {tab === 'active' && (
          <>
            <PageControls {...loansPage} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-7 animate-fade-in-up">
              <div className="bg-info-soft border border-line rounded-xl p-6 flex items-center gap-4 hover:shadow-sm transition-all duration-200 cursor-default">
                <BookOpen size={20} className="text-link flex-shrink-0" />
                <div>
                  <p className="text-3xl font-semibold tracking-normal text-link">{loansPage.total}</p>
                  <p className="text-sm font-semibold tracking-normal text-link">Total Active Loans</p>
                </div>
              </div>
              <div className="bg-subtle border border-line rounded-xl p-6 flex items-center gap-4 hover:shadow-sm transition-all duration-200 cursor-default">
                <List size={20} className="text-muted flex-shrink-0" />
                <div>
                  <p className="text-3xl font-semibold tracking-normal text-muted">
                    {loansPage.totals.on_time ?? 0}
                  </p>
                  <p className="text-sm font-semibold tracking-normal text-muted">On-Time Loans</p>
                </div>
              </div>
            </div>

            <div className="animate-fade-in-up delay-100 bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-line">
                <p className="text-sm font-semibold tracking-normal text-muted">
                  All Borrowed Books
                </p>
                <div className="relative min-w-0 w-full md:w-auto md:ml-auto flex flex-wrap items-center gap-3">
                  <button
                    onClick={fetchLoans}
                    className="flex shrink-0 items-center gap-1.5 px-3 py-2 bg-subtle text-muted border border-line rounded-lg text-sm font-semibold tracking-normal hover:bg-subtle transition-all duration-200"
                  >
                    <RefreshCw size={11} className={loansLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                    <input aria-label="Search member or book..." type="text" placeholder="Search member or book..."
                      value={search} onChange={(e) => setSearch(e.target.value)}
                      className="bg-subtle border border-line rounded-lg py-2 pl-8 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line w-full sm:w-52 min-w-0 text-muted placeholder:text-muted" />
                  </div>
                </div>
              </div>

              {loansLoading ? (
                <div className="flex justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-link" />
                </div>
              ) : (
                <div className="divide-y divide-blue-50 dark:divide-slate-800">
                  {filteredLoans.map((b) => {
                    const dl = daysLeft(b.due_date);
                    const st = loanStatus(dl);
                    const cfg = STATUS_CFG[st];
                    return (
                      <div key={b.id} className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-info-soft hover:bg-subtle transition-all duration-200 ${cfg.row}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-sm text-ink group-hover:text-link transition-colors duration-200">
                              {b.member_name || '—'}
                            </p>
                            <span className="text-sm font-semibold text-muted">{b.member_id || ''}</span>
                          </div>
                          <p className="text-sm text-muted font-medium">{b.book_title || '—'}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm min-w-0">
                          <div>
                            <p className="text-sm font-semibold tracking-normal text-muted">Borrowed</p>
                            <p className="font-sans font-bold text-muted">{fmt(b.borrow_date)}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold tracking-normal text-muted">Due</p>
                            <p className="font-sans font-bold text-muted">{fmt(b.due_date)}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold tracking-normal text-muted">Days</p>
                            <p className={`font-semibold text-sm ${dl < 0 ? 'text-danger text-danger' : dl <= 3 ? 'text-warning text-warning' : 'text-link text-link'}`}>
                              {dl < 0 ? `${Math.abs(dl)} late` : `${dl} left`}
                            </p>
                          </div>
                          <FineContent>
                          {Number(b.fine_amount) > 0 && (
                            <div>
                              <p className="text-sm font-semibold tracking-normal text-muted">Fine</p>
                              <p className="font-semibold text-sm text-danger">₱{Number(b.fine_amount).toFixed(2)}</p>
                            </div>
                          )}
                          </FineContent>
                        </div>

                        <span className={`px-3 py-1.5 rounded-full text-sm font-semibold tracking-normal flex-shrink-0 ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                  {filteredLoans.length === 0 && !loansLoading && (
                    <div className="text-center py-12 text-muted text-sm font-semibold tracking-normal">
                      No active loans found
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
