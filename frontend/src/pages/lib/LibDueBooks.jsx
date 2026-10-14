import FineContent from '../../components/FineContent';
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, Search, Bell, CheckCircle2, RefreshCw, BookOpen, List } from 'lucide-react';
import { getDueBooks, notifyMember, returnBook, getTransactions } from '../../api/librarian';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';

const STATUS_CFG = {
  overdue:    { label: 'Overdue',  cls: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',     row: 'border-l-4 border-rose-400 dark:border-rose-600' },
  'due-soon': { label: 'Due Soon', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', row: 'border-l-4 border-amber-400 dark:border-amber-500' },
  active:     { label: 'Active',   cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',     row: '' },
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
  const [notifying, setNotifying] = useState(null);

  // Active Loans state
  const [loans, setLoans] = useState([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [loansFetched, setLoansFetched] = useState(false);

  const [search, setSearch] = useState('');

  const fetchBooks = useCallback((f = 'all') => {
    setLoading(true);
    getDueBooks(f)
      .then((res) => setBooks(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fetchLoans = useCallback(() => {
    setLoansLoading(true);
    getTransactions({ status: 'active', limit: 200 })
      .then((res) => { setLoans(res.data); setLoansFetched(true); })
      .catch(() => {})
      .finally(() => setLoansLoading(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchBooks('all'), 0);
    return () => clearTimeout(id);
  }, [fetchBooks]);

  useEffect(() => {
    if (tab !== 'active' || loansFetched) return undefined;
    const id = setTimeout(fetchLoans, 0);
    return () => clearTimeout(id);
  }, [tab, loansFetched, fetchLoans]);

  const handleFilterChange = (f) => {
    setFilter(f);
    fetchBooks(f);
  };

  const handleNotify = (transactionId) => {
    setNotifying(transactionId);
    notifyMember(transactionId)
      .catch(() => {})
      .finally(() => setNotifying(null));
  };

  const handleReturn = (b) => {
    returnBook(b.user_id, b.book_id)
      .then(() => fetchBooks(filter))
      .catch(() => {});
  };

  const filteredDue = books.filter((b) =>
    (b.member_name || '').toLowerCase().includes(search.toLowerCase()) ||
    b.book_title.toLowerCase().includes(search.toLowerCase())
  );

  const filteredLoans = loans.filter((b) =>
    (b.member_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (b.book_title || '').toLowerCase().includes(search.toLowerCase())
  );

  const overdue = books.filter((b) => b.status === 'overdue').length;
  const dueSoon = books.filter((b) => b.status === 'due-soon').length;

  const fmt = (dateStr) => toUtcDate(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-transparent pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-1">
            Librarian Terminal
          </p>
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none">
            Loans &amp; <span className="text-rose-500">Due Books</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2">
            Monitor active borrowings, overdue items, and upcoming due dates.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-3 mb-7 animate-fade-in-up delay-75">
          <button
            onClick={() => { setTab('due'); setSearch(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 ${
              tab === 'due'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-200 dark:shadow-rose-900/40'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <AlertTriangle size={12} /> Due Books
          </button>
          <button
            onClick={() => { setTab('active'); setSearch(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 ${
              tab === 'active'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen size={12} /> Active Loans
          </button>
        </div>

        {/* ── DUE BOOKS TAB ── */}
        {tab === 'due' && (
          <>
            {overdue > 0 && (
              <div className="animate-fade-in-up bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-[2rem] p-5 flex items-center gap-4 mb-7 hover:shadow-lg hover:shadow-rose-100 dark:hover:shadow-rose-900/20 transition-all duration-200">
                <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/40 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400" />
                </div>
                <p className="font-black text-sm text-rose-800 dark:text-rose-300">
                  {overdue} book{overdue > 1 ? 's are' : ' is'} overdue — send return reminders immediately.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-7 animate-fade-in-up delay-100">
              <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg hover:shadow-rose-100 dark:hover:shadow-rose-900/20 transition-all duration-200 cursor-default">
                <AlertTriangle size={20} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
                <div>
                  <p className="text-3xl font-black tracking-tighter text-rose-600 dark:text-rose-400">{overdue}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 dark:text-rose-500">Overdue Books</p>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-100 dark:hover:shadow-amber-900/20 transition-all duration-200 cursor-default">
                <Clock size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-3xl font-black tracking-tighter text-amber-600 dark:text-amber-400">{dueSoon}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-500">Due Within 3 Days</p>
                </div>
              </div>
            </div>

            <div className="animate-fade-in-up delay-200 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-blue-50 dark:border-slate-800">
                <div className="flex gap-2">
                  {['all', 'overdue', 'due-soon'].map((f) => (
                    <button key={f} onClick={() => handleFilterChange(f)}
                      className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 ${
                        filter === f
                          ? f === 'overdue' ? 'bg-rose-600 text-white shadow-md shadow-rose-200 dark:shadow-rose-900/40' : f === 'due-soon' ? 'bg-amber-500 text-white shadow-md shadow-amber-200 dark:shadow-amber-900/40' : 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}>
                      {f.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <div className="relative md:ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input type="text" placeholder="Search member or book..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-8 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 w-52 text-slate-700 dark:text-slate-200 placeholder:text-slate-400" />
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="divide-y divide-blue-50 dark:divide-slate-800">
                  {filteredDue.map((b) => {
                    const cfg = STATUS_CFG[b.status] || STATUS_CFG['due-soon'];
                    return (
                      <div key={b.transaction_id} className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-all duration-200 ${cfg.row}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors duration-200">{b.member_name}</p>
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">{b.member_id}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{b.book_title}</p>
                        </div>

                        <div className="flex items-center gap-6 text-xs flex-shrink-0">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Borrowed</p>
                            <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmt(b.borrow_date)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Due</p>
                            <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmt(b.due_date)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Days</p>
                            <p className={`font-black text-sm ${b.days_left < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                              {b.days_left < 0 ? `${Math.abs(b.days_left)} late` : `${b.days_left} left`}
                            </p>
                          </div>
                          
                        </div>

                        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${cfg.cls}`}>
                          {cfg.label}
                        </span>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleNotify(b.transaction_id)}
                            disabled={notifying === b.transaction_id}
                            className="group/btn flex items-center gap-1.5 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-all duration-200 active:scale-95 disabled:opacity-50"
                          >
                            <Bell size={11} /> {notifying === b.transaction_id ? 'Sending...' : 'Remind'}
                          </button>
                          <button
                            onClick={() => handleReturn(b)}
                            className="group/btn flex items-center gap-1.5 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all duration-200 active:scale-95"
                          >
                            <CheckCircle2 size={11} /> Returned
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredDue.length === 0 && !loading && (
                    <div className="text-center py-12 text-slate-400 text-xs font-black uppercase tracking-widest">
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
            <div className="grid grid-cols-2 gap-4 mb-7 animate-fade-in-up">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-100 dark:hover:shadow-blue-900/20 transition-all duration-200 cursor-default">
                <BookOpen size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-3xl font-black tracking-tighter text-blue-600 dark:text-blue-400">{loans.length}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-500">Total Active Loans</p>
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg transition-all duration-200 cursor-default">
                <List size={20} className="text-slate-500 dark:text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-3xl font-black tracking-tighter text-slate-700 dark:text-slate-200">
                    {loans.filter((l) => loanStatus(daysLeft(l.due_date)) === 'active').length}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">On-Time Loans</p>
                </div>
              </div>
            </div>

            <div className="animate-fade-in-up delay-100 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-blue-50 dark:border-slate-800">
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  All Borrowed Books
                </p>
                <div className="relative md:ml-auto flex items-center gap-3">
                  <button
                    onClick={fetchLoans}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 active:scale-95"
                  >
                    <RefreshCw size={11} className={loansLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input type="text" placeholder="Search member or book..."
                      value={search} onChange={(e) => setSearch(e.target.value)}
                      className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-8 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 w-52 text-slate-700 dark:text-slate-200 placeholder:text-slate-400" />
                  </div>
                </div>
              </div>

              {loansLoading ? (
                <div className="flex justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="divide-y divide-blue-50 dark:divide-slate-800">
                  {filteredLoans.map((b) => {
                    const dl = daysLeft(b.due_date);
                    const st = loanStatus(dl);
                    const cfg = STATUS_CFG[st];
                    return (
                      <div key={b.id} className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-all duration-200 ${cfg.row}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors duration-200">
                              {b.member_name || '—'}
                            </p>
                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">{b.member_id || ''}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{b.book_title || '—'}</p>
                        </div>

                        <div className="flex items-center gap-6 text-xs flex-shrink-0">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Borrowed</p>
                            <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmt(b.borrow_date)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Due</p>
                            <p className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmt(b.due_date)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Days</p>
                            <p className={`font-black text-sm ${dl < 0 ? 'text-rose-600 dark:text-rose-400' : dl <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                              {dl < 0 ? `${Math.abs(dl)} late` : `${dl} left`}
                            </p>
                          </div>
                          <FineContent>
                          {Number(b.fine_amount) > 0 && (
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Fine</p>
                              <p className="font-black text-sm text-rose-600 dark:text-rose-400">₱{Number(b.fine_amount).toFixed(2)}</p>
                            </div>
                          )}
                          </FineContent>
                        </div>

                        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                  {filteredLoans.length === 0 && !loansLoading && (
                    <div className="text-center py-12 text-slate-400 text-xs font-black uppercase tracking-widest">
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
