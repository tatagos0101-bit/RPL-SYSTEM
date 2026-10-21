import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState } from 'react';
import { BookMarked, Clock, CheckCircle2, Search, RefreshCw, X, Users } from 'lucide-react';
import { cancelLibReservation } from '../../api/librarian';
import { formatTimeLeft, parseApiDateTime } from '../../api/dateTime';
import BookCover from '../../components/BookCover';

const STATUS_CFG = {
  ready:   { label: 'Ready for Pickup', cls: 'bg-success-soft bg-success-soft text-success text-success', row: 'border-l-4 border-success border-success' },
  pending: { label: 'In Queue',         cls: 'bg-warning-soft bg-warning-soft text-warning text-warning',         row: 'border-l-4 border-warning border-warning' },
};

export default function LibReservations() {
  const [filter, setFilter]             = useState('all');
  const [search, setSearch]             = useState('');
  const [cancelling, setCancelling]     = useState(null);

  const listing = useServerPage('/api/librarian/reservations', { status: filter, search }, '/api/librarian/reservations/count');
  const { items: reservations, loading } = listing;
  const [cancelError, setCancelError] = useState('');

  const handleCancel = async (r) => {
    if (!window.confirm(`Cancel ${r.member_name}'s reservation for "${r.book_title}"?`)) return;
    setCancelError(''); setCancelling(r.id);
    try {
      await cancelLibReservation(r.id);
      listing.reload();
    } catch {
      setCancelError('Cancellation could not be confirmed. Refresh the list to check its current status before retrying Cancel.');
    } finally {
      setCancelling(null);
    }
  };

  const readyCount   = listing.totals.ready ?? 0;
  const pendingCount = listing.totals.pending ?? 0;

  const fmt = (dateStr) =>
    parseApiDateTime(dateStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rpl-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <p className="text-sm font-semibold tracking-normal text-link mb-1">
            Librarian Terminal
          </p>
          <h1 className="font-semibold tracking-normal leading-none rpl-title">
            Book <span className="text-link">Reservations</span>
          </h1>
          <p className="text-sm text-muted font-medium mt-2">
            All active member reservations — queue and ready for pickup.
          </p>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-7 animate-fade-in-up delay-100">
          <div className="bg-success-soft border border-success rounded-xl p-6 flex items-center gap-4 hover:shadow-sm hover:shadow-emerald-100 dark:hover:shadow-emerald-900/20 transition-all duration-200 cursor-default">
            <CheckCircle2 size={20} className="text-success flex-shrink-0" />
            <div>
              <p className="text-3xl font-semibold tracking-normal text-success">{readyCount}</p>
              <p className="text-sm font-semibold tracking-normal text-success">Ready for Pickup</p>
            </div>
          </div>
          <div className="bg-warning-soft border border-warning rounded-xl p-6 flex items-center gap-4 hover:shadow-sm hover:shadow-amber-100 dark:hover:shadow-amber-900/20 transition-all duration-200 cursor-default">
            <Clock size={20} className="text-warning flex-shrink-0" />
            <div>
              <p className="text-3xl font-semibold tracking-normal text-warning">{pendingCount}</p>
              <p className="text-sm font-semibold tracking-normal text-warning">In Queue</p>
            </div>
          </div>
          <div className="col-span-2 md:col-span-1 bg-info-soft border border-line rounded-xl p-6 flex items-center gap-4 hover:shadow-sm transition-all duration-200 cursor-default">
            <Users size={20} className="text-link flex-shrink-0" />
            <div>
              <p className="text-3xl font-semibold tracking-normal text-link">{listing.total}</p>
              <p className="text-sm font-semibold tracking-normal text-link">Total Active</p>
            </div>
          </div>
        </div>

        {/* Alert: any ready but close to expiry */}
        {readyCount > 0 && (
          <div className="animate-fade-in-up delay-75 bg-success-soft border border-success rounded-xl p-5 flex items-center gap-4 mb-7 hover:shadow-sm hover:shadow-emerald-100 dark:hover:shadow-emerald-900/20 transition-all duration-200">
            <div className="w-10 h-10 bg-success-soft rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={18} className="text-success" />
            </div>
            <p className="font-semibold text-sm text-success">
              {readyCount} reservation{readyCount > 1 ? 's are' : ' is'} ready for pickup — notify members to claim within 24 hours.
            </p>
          </div>
        )}

        <PageControls {...listing} />
        {cancelError && <p role="alert" className="text-danger">{cancelError} <button onClick={listing.reload}>Refresh reservations</button></p>}
        {/* Table */}
        <div className="animate-fade-in-up delay-200 bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-line">
            <div className="flex gap-2 flex-wrap">
              {['all', 'ready', 'pending'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 ${
                    filter === f
                      ? f === 'ready'
                        ? 'bg-emerald-700 text-white shadow-md shadow-emerald-200 dark:shadow-emerald-900/40'
                        : f === 'pending'
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-200 dark:shadow-amber-900/40'
                          : 'bg-action text-white shadow-md '
                      : 'bg-subtle text-muted hover:text-ink hover:bg-subtle '
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'ready' ? 'Ready for Pickup' : 'In Queue'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                <input aria-label="Search member or book..."
                  type="text"
                  placeholder="Search member or book..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-subtle border border-line rounded-lg py-2 pl-8 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line w-52 text-muted placeholder:text-muted"
                />
              </div>
              <button
                onClick={listing.reload}
                className="p-2 rounded-lg bg-subtle text-muted hover:text-link hover:bg-info-soft transition-all"
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw size={24} className="animate-spin text-link" />
            </div>
          ) : listing.error ? null : reservations.length === 0 ? (
            <div className="text-center py-16">
              <BookMarked size={32} className="mx-auto mb-3 text-link text-muted" />
              <p className="text-sm font-semibold tracking-normal text-muted">
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
                    className={`group flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 hover:bg-info-soft hover:bg-subtle transition-all duration-200 ${cfg.row}`}
                  >
                    {/* Cover thumbnail */}
                    <div className="w-10 h-14 rounded-lg overflow-hidden bg-subtle flex-shrink-0">
                      <BookCover src={r.cover_url} alt={r.book_title} />
                    </div>

                    {/* Book + Member info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-ink group-hover:text-link transition-colors duration-200 truncate">
                        {r.book_title}
                      </p>
                      <p className="text-sm text-muted font-medium">{r.book_author}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-sm font-semibold tracking-normal text-link">{r.member_name}</span>
                        <span className="text-sm font-semibold text-muted">{r.member_id}</span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-4 text-sm md:flex-shrink-0">
                      {r.queue_position && r.status === 'pending' && (
                        <div>
                          <p className="text-sm font-semibold tracking-normal text-muted">Queue</p>
                          <p className="font-semibold text-sm text-warning">#{r.queue_position}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold tracking-normal text-muted">Reserved</p>
                        <p className="font-sans font-bold text-muted text-sm">{fmt(r.reserved_at)}</p>
                      </div>
                      {r.expires_at && (
                        <div>
                          <p className="text-sm font-semibold tracking-normal text-muted">Expires</p>
                          <p className={`font-semibold text-sm ${
                            parseApiDateTime(r.expires_at).getTime() - Date.now() < 3_600_000
                              ? 'text-danger text-danger'
                              : 'text-success text-success'
                          }`}>
                            {formatTimeLeft(r.expires_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold tracking-normal flex-shrink-0 ${cfg.cls}`}>
                      {cfg.label}
                    </span>

                    {/* Cancel */}
                    <button
                      onClick={() => handleCancel(r)}
                      disabled={cancelling === r.id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-danger-soft text-danger border border-danger rounded-lg text-sm font-semibold tracking-normal hover:bg-danger-soft transition-all duration-200 disabled:opacity-50 flex-shrink-0"
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
