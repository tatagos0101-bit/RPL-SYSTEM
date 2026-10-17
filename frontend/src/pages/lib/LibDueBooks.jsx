import FineContent from '../../components/FineContent';
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, Search, Bell, CheckCircle2, RefreshCw, BookOpen, List } from 'lucide-react';
import { getDueBooks, returnBook } from '../../api/librarian';
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
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [operationError, setOperationError] = useState('');

  const [search, setSearch] = useState('');
  const loansPage = useServerPage('/api/transactions', { status: 'active', search }, '/api/transactions/count');
  const { items: filteredLoans, loading: loansLoading, reload: fetchLoans } = loansPage;

  const fetchBooks = useCallback((f = 'all') => {
    setLoading(true);
    setOperationError('');
    getDueBooks(f)
      .then((res) => setBooks(res.data))
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

  const handleReturn = (b) => {
    returnBook(b.user_id, b.book_id)
      .then(() => { fetchBooks(filter); fetchLoans(); })
      .catch(() => setOperationError('Return could not be confirmed. Check loan history before retrying.'));
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
                  {overdue} book{overdue > 1 ? 's are' : ' is'} overdue — contact members through the library’s existing process; automated delivery is unavailable.
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
                    return (
                      <div key={b.transaction_id} className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-info-soft hover:bg-subtle transition-all duration-200 ${cfg.row}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className="font-bold text-sm text-ink group-hover:text-link transition-colors duration-200">{b.member_name}</p>
                            <span className="text-sm font-semibold text-muted">{b.member_id}</span>
                          </div>
                          <p className="text-sm text-muted font-medium">{b.book_title}</p>
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
                          <button
                            title="Email/SMS reminder delivery is unavailable"
                            disabled
                            className="group/btn flex items-center gap-1.5 px-3 py-2 bg-warning-soft text-warning border border-warning rounded-lg text-sm font-semibold tracking-normal hover:bg-warning-soft transition-all duration-200 disabled:opacity-50"
                          >
                            <Bell size={11} /> Delivery unavailable
                          </button>
                          <button
                            onClick={() => handleReturn(b)}
                            className="group/btn flex items-center gap-1.5 px-3 py-2 bg-success-soft text-success border border-success rounded-lg text-sm font-semibold tracking-normal hover:bg-success-soft transition-all duration-200"
                          >
                            <CheckCircle2 size={11} /> Returned
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
