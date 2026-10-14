import { SHOW_FINES } from '../../api/fineVisibility';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileText,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  getEntryLogs,
  getMonthlyReport,
  getTransactions,
} from '../../api/librarian';
import {
  buildCsv,
  buildPrintDocument,
  entryLogToReportRow,
  fetchAllPaginated,
  filterEntryLogs,
  filterTransactions,
  getReportFilename,
  transactionToReportRow,
} from '../../api/reports';

const TRANSACTION_COLUMNS = [
  { key: 'no', label: '#' },
  { key: 'member', label: 'Member' },
  { key: 'member_id', label: 'Member ID' },
  { key: 'book', label: 'Book' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'borrowed', label: 'Borrowed' },
  { key: 'due', label: 'Due' },
  { key: 'returned', label: 'Returned' },
  ...(SHOW_FINES ? [
  { key: 'fine', label: 'Fine' },
  ] : []),
];

const ENTRY_COLUMNS = [
  { key: 'no', label: '#' },
  { key: 'member', label: 'Member' },
  { key: 'member_id', label: 'Member ID' },
  { key: 'access', label: 'Access' },
  { key: 'time_in', label: 'Time In' },
  { key: 'time_out', label: 'Time Out' },
  { key: 'status', label: 'Status' },
  { key: 'note', label: 'Note' },
];

const today = new Date();
const DEFAULT_MONTH = today.getMonth() + 1;
const DEFAULT_YEAR = today.getFullYear();

const reportOptions = [
  { key: 'transactions', label: 'Borrow / Return Records' },
  { key: 'entries', label: 'Entry Gate Logs' },
];

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const LibReports = () => {
  const [reportType, setReportType] = useState('transactions');
  const [transactions, setTransactions] = useState([]);
  const [entryLogs, setEntryLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    query: '',
    startDate: '',
    endDate: '',
    type: 'all',
    status: 'all',
    access: 'all',
  });
  const [monthly, setMonthly] = useState({
    month: DEFAULT_MONTH,
    year: DEFAULT_YEAR,
  });

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [transactionRows, entryRows] = await Promise.all([
        fetchAllPaginated(({ skip, limit }) =>
          getTransactions({ skip, limit }).then((res) => res.data)
        ),
        fetchAllPaginated(({ skip, limit }) =>
          getEntryLogs({ skip, limit }).then((res) => res.data)
        ),
      ]);
      setTransactions(transactionRows);
      setEntryLogs(entryRows);
    } catch {
      setError('Reports could not be loaded. Please refresh or login again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const visibleTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters],
  );

  const visibleEntryLogs = useMemo(
    () => filterEntryLogs(entryLogs, filters),
    [entryLogs, filters],
  );

  const activeRows = useMemo(() => (
    reportType === 'transactions'
      ? visibleTransactions.map(transactionToReportRow)
      : visibleEntryLogs.map(entryLogToReportRow)
  ), [reportType, visibleEntryLogs, visibleTransactions]);

  const activeColumns = reportType === 'transactions' ? TRANSACTION_COLUMNS : ENTRY_COLUMNS;
  const activeTitle = reportType === 'transactions' ? 'Borrow / Return Records' : 'Entry Gate Logs';
  const activeFilename = reportType === 'transactions' ? 'borrow-return-records' : 'entry-logs';

  const reportSubtitle = useMemo(() => {
    const start = filters.startDate || 'first available record';
    const end = filters.endDate || 'latest available record';
    return `${start} to ${end} - ${activeRows.length} matching record${activeRows.length === 1 ? '' : 's'}`;
  }, [activeRows.length, filters.endDate, filters.startDate]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleCsvExport = () => {
    const csv = buildCsv(activeColumns, activeRows);
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      getReportFilename(activeFilename, filters),
    );
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      alert('Popup was blocked. Allow popups to print the report.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPrintDocument({
      title: activeTitle,
      subtitle: reportSubtitle,
      columns: activeColumns,
      rows: activeRows,
    }));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleMonthlyDownload = async () => {
    setMonthlyLoading(true);
    try {
      const res = await getMonthlyReport(monthly.month, monthly.year);
      downloadBlob(
        new Blob([res.data], { type: 'application/pdf' }),
        `monthly-circulation-${monthly.year}-${String(monthly.month).padStart(2, '0')}.pdf`,
      );
    } catch {
      setError('Monthly PDF could not be downloaded.');
    } finally {
      setMonthlyLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      query: '',
      startDate: '',
      endDate: '',
      type: 'all',
      status: 'all',
      access: 'all',
    });
  };

  const previewRows = activeRows.slice(0, 80);

  return (
    <div className="min-h-screen w-full bg-transparent px-4 py-6 pb-20 text-slate-900 dark:text-white sm:px-6 lg:px-8 2xl:px-10">
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.35em] text-blue-600 dark:text-blue-400">
            Librarian Terminal
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Reports
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">
            Print official borrower and return records, export CSV files, and review entry gate logs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadReports}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleCsvExport}
            disabled={loading || activeRows.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.38fr)]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {reportOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setReportType(option.key)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                  reportType === option.key
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200/50 dark:shadow-blue-900/40'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
                }`}
              >
                {option.key === 'transactions' ? <FileText size={14} /> : <ShieldCheck size={14} />}
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(2,minmax(160px,0.35fr))]">
            <label className="block">
              <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">
                Search
              </span>
              <span className="relative block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={filters.query}
                  onChange={(e) => updateFilter('query', e.target.value)}
                  placeholder="Member, ID, book, note..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-4 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </span>
            </label>
            <DateInput label="Start Date" value={filters.startDate} onChange={(value) => updateFilter('startDate', value)} />
            <DateInput label="End Date" value={filters.endDate} onChange={(value) => updateFilter('endDate', value)} />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {reportType === 'transactions' ? (
              <>
                <SelectInput
                  label="Record Type"
                  value={filters.type}
                  onChange={(value) => updateFilter('type', value)}
                  options={[
                    ['all', 'All types'],
                    ['borrow', 'Borrow only'],
                    ['return', 'Return only'],
                  ]}
                />
                <SelectInput
                  label="Status"
                  value={filters.status}
                  onChange={(value) => updateFilter('status', value)}
                  options={[
                    ['all', 'All status'],
                    ['active', 'Active'],
                    ['overdue', 'Overdue'],
                    ['returned', 'Returned'],
                  ]}
                />
              </>
            ) : (
              <SelectInput
                label="Access"
                value={filters.access}
                onChange={(value) => updateFilter('access', value)}
                options={[
                  ['all', 'All logs'],
                  ['granted', 'Granted'],
                  ['denied', 'Denied'],
                  ['inside', 'Still inside'],
                  ['out', 'Timed out'],
                ]}
              />
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="self-end rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <CalendarDays size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly PDF</p>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">Circulation summary</h2>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr] gap-3">
            <SelectInput
              label="Month"
              value={String(monthly.month)}
              onChange={(value) => setMonthly((current) => ({ ...current, month: Number(value) }))}
              options={Array.from({ length: 12 }, (_, index) => {
                const month = index + 1;
                return [String(month), new Date(2026, index, 1).toLocaleString('en-PH', { month: 'long' })];
              })}
            />
            <label className="block">
              <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">Year</span>
              <input
                type="number"
                min="2020"
                max="2100"
                value={monthly.year}
                onChange={(e) => setMonthly((current) => ({ ...current, year: Number(e.target.value) || DEFAULT_YEAR }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleMonthlyDownload}
            disabled={monthlyLoading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-200"
          >
            {monthlyLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            Download Monthly PDF
          </button>
        </aside>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Matching Records" value={activeRows.length} />
        <MetricCard label="Loaded Transactions" value={transactions.length} />
        <MetricCard label="Loaded Gate Logs" value={entryLogs.length} />
        <MetricCard label="Preview Rows" value={previewRows.length} />
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Preview</p>
            <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">{activeTitle}</h2>
          </div>
          <p className="text-xs font-bold text-slate-400">
            Showing {previewRows.length} of {activeRows.length} matching records
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-blue-600">
            <RefreshCw size={26} className="animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:border-slate-700 dark:text-slate-500">
                  {activeColumns.map((column) => (
                    <th key={column.key} className="px-5 py-4">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${reportType}-${row.no}`} className="border-b border-slate-50 text-xs hover:bg-blue-50/50 dark:border-slate-700 dark:hover:bg-slate-700/40">
                    {activeColumns.map((column) => (
                      <td key={column.key} className="px-5 py-4 font-semibold text-slate-600 dark:text-slate-300">
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr>
                    <td colSpan={activeColumns.length} className="px-5 py-14 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                      No matching records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

const DateInput = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    />
  </label>
);

const SelectInput = ({ label, value, onChange, options }) => (
  <label className="block min-w-[150px]">
    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    >
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>{optionLabel}</option>
      ))}
    </select>
  </label>
);

const MetricCard = ({ label, value }) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
    <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{value}</p>
    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
  </div>
);

export default LibReports;
