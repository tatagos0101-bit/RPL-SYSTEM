import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState } from 'react';
import { Search, BookOpen, CheckCircle2, ArrowDownLeft, ArrowUpRight, Zap, ScanFace, RefreshCw, ChevronRight, Package } from 'lucide-react';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import QuickScanModal from '../../components/CirculationDialog';

// ─── STATUS STYLES ─────────────────────────────────────────────────────────────

const TYPE_STYLE = {
  borrow: 'bg-info-soft bg-info-soft text-link text-link',
  return: 'bg-success-soft bg-success-soft text-success text-success',
};
const STATUS_STYLE = {
  active:   'bg-subtle text-muted ',
  returned: 'bg-success-soft bg-success-soft text-success text-success',
  overdue:  'bg-danger-soft bg-danger-soft text-danger text-danger',
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function LibBorrowReturn() {
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [showScanner, setShowScanner]   = useState(false);

  const listing = useServerPage('/api/transactions', { search,
    type: ['borrow', 'return'].includes(filter) ? filter : '',
    status: ['active', 'overdue', 'returned'].includes(filter) ? filter : '' }, '/api/transactions/count');
  const { items: filtered, loading, reload: fetchTransactions } = listing;

  const handleCommit = () => fetchTransactions();

  const [returnLoan, setReturnLoan] = useState(null);
  const handleQuickReturn = tx => { setReturnLoan(tx); setShowScanner(true); };

  const totalBorrowed = listing.totals.borrowed ?? 0;
  const totalReturned = listing.totals.returned ?? 0;
  const totalOverdue  = listing.totals.overdue ?? 0;

  return (
    <div className="rpl-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">

      {showScanner && (
        <QuickScanModal
          initialReturn={returnLoan}
          onClose={() => { setShowScanner(false); setReturnLoan(null); }}
          onCommit={handleCommit}
        />
      )}

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* ── HEADER ── */}
        <div className="animate-fade-in-up flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold tracking-normal text-link mb-1">
              Librarian Terminal
            </p>
            <h1 className="font-semibold tracking-normal leading-none rpl-title">
              Borrow / <span className="text-link">Return</span>
            </h1>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="group flex items-center gap-3 px-7 py-4 bg-action hover:bg-action-hover text-white rounded-lg font-semibold text-sm tracking-normal transition-all duration-200 shadow-sm flex-shrink-0"
          >
            <Zap size={16} className="transition-transform duration-200" />
            Quick Scan Session
          </button>
        </div>

        {/* ── HOW IT WORKS STRIP ── */}
        <div className="animate-fade-in-up delay-75 bg-info-soft border border-line rounded-xl px-6 py-4 mb-7 flex flex-col sm:flex-row items-center gap-4">
          <p className="text-sm font-semibold tracking-normal text-link flex-shrink-0">Quick Scan Flow</p>
          <div className="flex items-center gap-3 flex-1 flex-wrap justify-center sm:justify-start">
            {[
              { icon: <ScanFace size={14} />,    label: 'Borrow: Face / ID · Return: QR first' },
              { icon: <Package size={14} />,     label: 'Add Books (1+)' },
              { icon: <CheckCircle2 size={14} />, label: 'Confirm All' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-panel rounded-xl border border-line text-link">
                  {s.icon}
                  <span className="text-sm font-semibold tracking-normal">{s.label}</span>
                </div>
                {i < 2 && <ChevronRight size={12} className="text-link flex-shrink-0" />}
              </div>
            ))}
          </div>
          <button onClick={() => setShowScanner(true)}
            className="text-sm font-semibold tracking-normal text-link hover:underline underline-offset-4 flex-shrink-0">
            Start →
          </button>
        </div>

        {/* ── SUMMARY TILES ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-7 animate-fade-in-up delay-100">
          {[
            { label: 'Total Borrowed', val: totalBorrowed, icon: <ArrowUpRight size={16} />, color: 'text-link text-link',    bg: 'bg-info-soft bg-info-soft border-line border-line' },
            { label: 'Returned',       val: totalReturned, icon: <ArrowDownLeft size={16} />, color: 'text-success text-success', bg: 'bg-success-soft bg-success-soft border-success border-success' },
            { label: 'Overdue',        val: totalOverdue,  icon: <BookOpen size={16} />,       color: 'text-danger text-danger',      bg: 'bg-danger-soft bg-danger-soft border-danger border-danger' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border rounded-xl sm:rounded-xl p-3 sm:p-5 flex flex-col sm:flex-row items-center sm:gap-4 gap-1 hover:shadow-md transition-all duration-200 cursor-default`}>
              <div className={`${s.color} flex-shrink-0`}>{s.icon}</div>
              <div className="text-center sm:text-left min-w-0">
                <p className="text-xl sm:text-2xl font-semibold tracking-normal text-ink">{s.val}</p>
                <p className={`text-sm sm:text-sm font-semibold tracking-normal leading-tight ${s.color}`}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <PageControls {...listing} />
        {/* ── TRANSACTION TABLE ── */}
        <div className="animate-fade-in-up delay-200 bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-line">
            <h3 className="font-semibold tracking-normal text-ink rpl-subheading">Transaction Log</h3>
            <div className="flex flex-wrap gap-2 md:ml-4">
              {['all', 'borrow', 'return', 'overdue'].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 ${
                    filter === f
                      ? 'bg-action text-white shadow-md '
                      : 'bg-subtle text-muted hover:text-ink '
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 md:ml-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                <input aria-label="Search member or book..." type="text" placeholder="Search member or book..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-subtle border border-line rounded-lg py-2 pl-8 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line w-40 sm:w-56 text-muted placeholder:text-muted" />
              </div>
              <button onClick={fetchTransactions} className="p-2 text-muted hover:text-link transition-colors">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-link" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="text-sm font-semibold text-muted tracking-normal border-b border-line">
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Book</th>
                    <th className="px-6 py-4">Borrowed</th>
                    <th className="px-6 py-4">Due</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="group border-b border-line hover:bg-info-soft hover:bg-subtle transition-all duration-200">
                      <td className="px-6 py-4">
                        <p className="font-bold text-sm text-ink">{t.member_name || '—'}</p>
                        <p className="text-sm font-semibold text-muted tracking-normal">{t.member_id || ''}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-muted max-w-[160px] truncate">
                        {t.book_title || '—'}
                      </td>
                      <td className="px-6 py-4 font-sans text-sm text-muted">
                        {t.borrow_date ? toUtcDate(t.borrow_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4 font-sans text-sm text-muted">
                        {t.due_date ? toUtcDate(t.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-sm font-semibold tracking-normal inline-block ${TYPE_STYLE[t.type] || 'bg-subtle text-muted'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-sm font-semibold tracking-normal inline-block ${STATUS_STYLE[t.status] || 'bg-subtle text-muted'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {['active', 'overdue'].includes(t.status) && (
                          <button
                            onClick={() => handleQuickReturn(t)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-success-soft text-success rounded-lg text-sm font-semibold tracking-normal hover:bg-success-soft transition-all duration-200"
                          >
                            <CheckCircle2 size={11} /> Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted text-sm font-semibold tracking-normal">
                        No transactions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
