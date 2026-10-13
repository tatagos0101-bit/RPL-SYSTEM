import { useState, useEffect, useCallback } from 'react';
import { BookMarked, Clock, CheckCircle2, Search, RefreshCw, X, Users } from 'lucide-react';
import { getLibReservations, cancelLibReservation } from '../../api/librarian';
import { formatTimeLeft, parseApiDateTime } from '../../api/dateTime';
import BookCover from '../../components/BookCover';

const STATUS_CFG = {
  ready:   { label: 'Ready for Pickup', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', row: 'border-l-4 border-emerald-400 dark:border-emerald-600' },
  pending: { label: 'In Queue',         cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',         row: 'border-l-4 border-amber-400 dark:border-amber-500' },
};

export default function LibReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState('all');
  const [search, setSearch]             = useState('');
  const [cancelling, setCancelling]     = useState(null);

  const fetchReservations = useCallback((f = filter, s = search) => {
    setLoading(true);
    const params = {};
    if (f !== 'all') params.status = f;
    if (s)           params.search = s;
    getLibReservations(params)
      .then((res) => setReservations(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, search]);

  useEffect(() => {
    const id = setTimeout(fetchReservations, 0);
    return () => clearTimeout(id);
  }, [fetchReservations]);

  const handleFilterChange = (f) => {
    setFilter(f);
    fetchReservations(f, search);
  };

  const handleSearch = (s) => {
    setSearch(s);
    fetchReservations(filter, s);
  };

  const handleCancel = async (r) => {
    if (!window.confirm(`Cancel ${r.member_name}'s reservation for "${r.book_title}"?`)) return;
    setCancelling(r.id);
    try {
      await cancelLibReservation(r.id);
      setReservations((prev) => prev.filter((x) => x.id !== r.id));
    } catch {
      // silently fail
    } finally {
      setCancelling(null);
    }
  };

  const readyCount   = reservations.filter((r) => r.status === 'ready').length;
  const pendingCount = reservations.filter((r) => r.status === 'pending').length;

  const fmt = (dateStr) =>
    parseApiDateTime(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-transparent pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-1">
            Librarian Terminal
          </p>
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none">
            Book <span className="text-blue-500">Reservations</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-2">
            All active member reservations — queue and ready for pickup.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-7 animate-fade-in-up delay-100">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-100 dark:hover:shadow-emerald-900/20 transition-all duration-200 cursor-default">
            <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-3xl font-black tracking-tighter text-emerald-600 dark:text-emerald-400">{readyCount}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 dark:text-emerald-500">Ready for Pickup</p>
            </div>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-100 dark:hover:shadow-amber-900/20 transition-all duration-200 cursor-default">
            <Clock size={20} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-3xl font-black tracking-tighter text-amber-600 dark:text-amber-400">{pendingCount}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 dark:text-amber-500">In Queue</p>
            </div>
          </div>
          <div className="col-span-2 md:col-span-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-[2rem] p-6 flex items-center gap-4 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-100 dark:hover:shadow-blue-900/20 transition-all duration-200 cursor-default">
            <Users size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-3xl font-black tracking-tighter text-blue-600 dark:text-blue-400">{reservations.length}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-500">Total Active</p>
            </div>
          </div>
        </div>

        {/* Alert: any ready but close to expiry */}
        {readyCount > 0 && (
          <div className="animate-fade-in-up delay-75 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-[2rem] p-5 flex items-center gap-4 mb-7 hover:shadow-lg hover:shadow-emerald-100 dark:hover:shadow-emerald-900/20 transition-all duration-200">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="font-black text-sm text-emerald-800 dark:text-emerald-300">
              {readyCount} reservation{readyCount > 1 ? 's are' : ' is'} ready for pickup — notify members to claim within 24 hours.
            </p>
          </div>
        )}

        {/* Table */}
        <div className="animate-fade-in-up delay-200 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-blue-50 dark:border-slate-800">
            <div className="flex gap-2 flex-wrap">
              {['all', 'ready', 'pending'].map((f) => (
                <button
                  key={f}
                  onClick={() => handleFilterChange(f)}
                  className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 ${
                    filter === f
                      ? f === 'ready'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/40'
                        : f === 'pending'
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-200 dark:shadow-amber-900/40'
                          : 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'ready' ? 'Ready for Pickup' : 'In Queue'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Search member or book..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-8 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 w-52 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
              <button
                onClick={() => fetchReservations()}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-blue-600" />
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center py-16">
              <BookMarked size={32} className="mx-auto mb-3 text-blue-200 dark:text-slate-700" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                No active reservations
              </p>
            </div>
          ) : (
            <div className="divide-y divide-blue-50 dark:divide-slate-800">
              {reservations.map((r) => {
                const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending;
                return (
                  <div
                    key={r.id}
                    className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-all duration-200 ${cfg.row}`}
                  >
                    {/* Cover thumbnail */}
                    <div className="w-10 h-14 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex-shrink-0">
                      <BookCover src={r.cover_url} alt={r.book_title} />
                    </div>

                    {/* Book + Member info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors duration-200 truncate">
                        {r.book_title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{r.book_author}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">{r.member_name}</span>
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500">{r.member_id}</span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-4 text-xs md:flex-shrink-0">
                      {r.queue_position && r.status === 'pending' && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Queue</p>
                          <p className="font-black text-sm text-amber-600 dark:text-amber-400">#{r.queue_position}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Reserved</p>
                        <p className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px]">{fmt(r.reserved_at)}</p>
                      </div>
                      {r.expires_at && (
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Expires</p>
                          <p className={`font-black text-xs ${
                            parseApiDateTime(r.expires_at).getTime() - Date.now() < 3_600_000
                              ? 'text-rose-500 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {formatTimeLeft(r.expires_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${cfg.cls}`}>
                      {cfg.label}
                    </span>

                    {/* Cancel */}
                    <button
                      onClick={() => handleCancel(r)}
                      disabled={cancelling === r.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all duration-200 active:scale-95 disabled:opacity-50 flex-shrink-0"
                    >
                      <X size={11} />
                      {cancelling === r.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
