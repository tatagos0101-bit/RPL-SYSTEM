import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { queryReport, getReportingMetadata, exportReport, downloadReport, reportError } from '../../api/reporting';
import { filtersFromSearch, defaultFilters, formatReportValue } from '../../api/reportingFilters';
import ReportControls, { buttonClass, controlClass, Field } from '../../components/reporting/ReportControls';
import { CalendarDays, Download, FileText, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { ReportTable } from '../../components/reporting/ReportResults';
import AcquisitionEditor from '../../components/reporting/AcquisitionEditor';
import { getMonthlyReport } from '../../api/librarian';

export default function LibReports() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const [draft, setDraft] = useState(() => filtersFromSearch(search));
  const [result, setResult] = useState(null), [metadata, setMetadata] = useState(null);
  const [page, setPage] = useState(0), [pageSize, setPageSize] = useState(25);
  const [busy, setBusy] = useState(false), [exporting, setExporting] = useState(false), [error, setError] = useState(''), [exportStatus, setExportStatus] = useState('');
  const [pendingFilters, setPendingFilters] = useState(false);
  const scope = 'all';
  const [monthlyPeriod, setMonthlyPeriod] = useState(() => defaultFilters().start.slice(0, 7));
  const request = useRef(null), download = useRef(null);
  const load = useCallback(async (filters, nextPage = 0, size = 25, context = null) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setResult(null); setExportStatus('');
    try { const data = await queryReport({ filters, page: nextPage, page_size: size, context }, controller.signal); if (!controller.signal.aborted) { setResult(data); setPage(nextPage); setPageSize(size); } }
    catch (err) { if (!controller.signal.aborted) { setError(await reportError(err)); if (err.response?.status === 409) setResult(null); } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => { const filters = filtersFromSearch(search); setDraft(filters); setPendingFilters(false); load(filters); return () => request.current?.abort(); }, [search, load]);
  useEffect(() => { const controller = new AbortController(); getReportingMetadata(controller.signal).then(setMetadata).catch(async err => { if (!controller.signal.aborted) setError(await reportError(err)); }); return () => { controller.abort(); download.current?.abort(); }; }, []);
  function apply(filters = draft) {
    setResult(null); setPendingFilters(false);
    const next = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value != null));
    if (next.toString() === search) load(filters); else setParams(next);
  }
  async function exportData(format) {
    const controller = new AbortController(); download.current = controller; setExporting(true); setError(''); setExportStatus('Preparing export…');
    // Open synchronously so a user-initiated print preview is not popup-blocked.
    const printWindow = format === 'print' ? window.open('', '_blank') : null;
    if (printWindow) { printWindow.opener = null; printWindow.document.body.textContent = 'Preparing print preview…'; }
    try {
      const response = await exportReport({ filters: result.filters, context: result.context, page, page_size: pageSize, scope, format }, controller.signal);
      if (format === 'print' && printWindow) { const html = await response.data.text(); printWindow.document.open(); printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); printWindow.print(); }
      else downloadReport(response.data, `RPL-${result.filters.category}-${result.filters.start}-${scope}.${{ csv: 'zip', xlsx: 'xlsx', pdf: 'pdf', print: 'html' }[format]}`);
      setExportStatus('Export ready.');
    } catch (err) { printWindow?.close(); if (controller.signal.aborted) setExportStatus('Export cancelled.'); else { setError(await reportError(err)); setExportStatus(''); if (err.response?.status === 409) setResult(null); } }
    finally { setExporting(false); }
  }
  async function monthlyPdf() {
    setExporting(true); setError('');
    try { const [year, month] = monthlyPeriod.split('-').map(Number); const response = await getMonthlyReport(month, year); downloadReport(response.data, `RPL-Monthly-${monthlyPeriod}.pdf`); }
    catch (err) { setError(await reportError(err)); } finally { setExporting(false); }
  }
  const disabled = busy || exporting || pendingFilters || !result;
  const changeFilters = filters => { setDraft(filters); setPendingFilters(true); };
  const chooseCategory = category => {
    const filters = { ...defaultFilters(category), start: draft.start, end: draft.end, period: draft.period };
    setDraft(filters); apply(filters);
  };
  return <div className="rpl-page min-h-screen w-full bg-transparent px-4 py-6 pb-20 text-ink sm:px-6 lg:px-8 2xl:px-10">
    <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="mb-2 text-sm font-semibold text-link">Librarian Terminal</p><h1 className="font-semibold text-ink rpl-title">Reports</h1><p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-muted">Filter library records, review matching information, and download or print the results.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={busy || exporting} onClick={() => apply()}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />Refresh</button>
        <button className={`${buttonClass} !border-success !bg-success-soft !text-success`} disabled={disabled} onClick={() => exportData('csv')}><Download size={14} />CSV</button>
        <button className={buttonClass} disabled={disabled} onClick={() => exportData('xlsx')}>Excel</button>
        <button className={buttonClass} disabled={disabled} onClick={() => exportData('pdf')}>PDF</button>
        <button className={`${buttonClass} !bg-action !text-white`} disabled={disabled} onClick={() => exportData('print')}><Printer size={14} />Print</button>
      </div>
    </header>
    {error && <p role="alert" className="mb-5 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
    <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.38fr)]">
      <div className="min-w-0 rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {[['circulation', 'Borrow / Return Records', <FileText size={14} />], ['visits', 'Entry Gate Logs', <ShieldCheck size={14} />]].map(([key, label, icon]) => <button key={key} type="button" onClick={() => chooseCategory(key)} disabled={busy || exporting} aria-pressed={draft.category === key} className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${draft.category === key ? 'bg-action text-white shadow-sm' : 'bg-subtle text-muted hover:text-ink'}`}>{icon}{label}</button>)}
        </div>
        <ReportControls compact value={draft} onChange={changeFilters} metadata={metadata} busy={busy || exporting} onApply={() => apply()} onReset={() => { const filters = defaultFilters(draft.category); setDraft(filters); apply(filters); }} />
      </div>
      <aside className="min-w-0 rounded-xl border border-line bg-panel p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-info-soft text-link"><CalendarDays size={18} /></div><div><p className="text-sm font-semibold text-muted">Monthly PDF</p><h2 className="font-semibold text-ink rpl-section-title">Monthly library report</h2></div></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Month"><select className={controlClass} value={monthlyPeriod.slice(5)} onChange={e => setMonthlyPeriod(`${monthlyPeriod.slice(0, 4)}-${e.target.value}`)}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, '0')}>{new Date(2026, index, 1).toLocaleString('en-PH', { month: 'long' })}</option>)}</select></Field>
          <Field label="Year"><input className={controlClass} type="number" min="2020" max="2100" value={monthlyPeriod.slice(0, 4)} onChange={e => setMonthlyPeriod(`${e.target.value}-${monthlyPeriod.slice(5)}`)} /></Field>
        </div>
        <button className={`${buttonClass} mt-4 w-full !text-link`} disabled={exporting || !/^\d{4}-\d{2}$/.test(monthlyPeriod)} onClick={monthlyPdf}><Download size={14} />Download Monthly PDF</button>
        <p className="mt-3 text-sm text-muted">Usage, circulation, patrons, collection, acquisitions and inventory, organized into sections with summaries and full records. Month and year apply to this PDF; the other filters apply to the preview.</p>
      </aside>
    </section>
    {pendingFilters && <p role="status" className="mb-4 text-sm text-muted">Filters changed. Select Apply filters to update the preview and downloads.</p>}
    {exportStatus && <p role="status" className="mb-4 text-sm text-muted">{exportStatus}</p>}
    {exporting && <button className={`${buttonClass} mb-4`} onClick={() => download.current?.abort()}>Cancel export</button>}
    {draft.category === 'acquisitions' && <AcquisitionEditor onSaved={() => apply()} />}
    <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ['Matching Records', result?.total?.toLocaleString() ?? '—'],
        ['Preview Rows', result?.rows.length ?? '—'],
        ['Start Date', result?.filters.start ?? '—'],
        ['End Date', result?.filters.end ?? '—'],
      ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-line bg-panel p-4 shadow-sm sm:p-5"><p className="break-words text-xl font-semibold text-ink sm:text-2xl">{value}</p><p className="mt-1 text-sm font-semibold text-muted">{label}</p></div>)}
    </section>
    <section className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
      <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-muted">Preview</p><h2 className="font-semibold text-ink rpl-section-title">{result?.title || 'Matching records'}</h2></div><p className="text-sm text-muted">{result ? `Updated ${formatReportValue(result.as_of)} · Philippine time` : 'Loading matching records…'}</p></div>
      {busy && <p role="status" className="p-12 text-center text-link">Loading report…</p>}
      {result && <ReportTable result={result} page={page} pageSize={pageSize} busy={busy || exporting || pendingFilters} onPage={next => load(result.filters, next, pageSize, result.context)} onSize={size => load(result.filters, 0, size, result.context)} onSort={key => { const filters = { ...result.filters, sort: key, direction: result.filters.sort === key && result.filters.direction === 'asc' ? 'desc' : 'asc' }; setDraft(filters); apply(filters); }} />}
    </section>
    <p className="mt-3 text-sm text-muted">Downloads include all matching records, up to {metadata?.max_export_rows?.toLocaleString() || '20,000'}. CSV downloads include a separate filter metadata file in a ZIP. Refresh the preview if records change.</p>
  </div>;
}
