import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { getAnalytics, reportError } from '../../api/reporting';
import { defaultFilters, reportHref, periodDates, formatReportValue } from '../../api/reportingFilters';
import ReportChart from '../../components/reporting/ReportChart';
import { buttonClass } from '../../components/reporting/ReportControls';
import RegisterMemberButton from '../../components/reporting/RegisterMemberButton';

const cards = [
  ['registered_patrons', 'Registered patrons', 'patrons', { date_scope: 'all' }, true],
  ['visits_today', 'Visits today', 'visits', {}, false],
  ['unique_visitors', 'Identified unique visitors', 'visits', {}, false],
  ['currently_borrowed', 'Currently borrowed books', 'circulation', { loan_status: 'outstanding' }, true],
  ['borrows', 'Books borrowed', 'circulation', { date_basis: 'borrowed' }, false],
  ['returns', 'Books returned', 'circulation', { date_basis: 'returned' }, false],
  ['overdue', 'Overdue books', 'circulation', { loan_status: 'overdue' }, true],
  ['titles', 'Catalog titles', 'inventory', {}, true],
  ['physical_copies', 'Physical copies held', 'collection', { date_scope: 'all', holdings: 'current' }, true],
  ['acquired_copies', 'Verified acquisitions', 'acquisitions', { date_scope: 'period' }, false],
];
export default function LibDashboard() {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const request = useRef(null);
  const load = useCallback(async () => {
    const filters = defaultFilters();
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try { const result = await getAnalytics(filters, controller.signal); if (!controller.signal.aborted) { setData(result); } }
    catch (err) { if (!controller.signal.aborted) setError(await reportError(err)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, []);
  useEffect(() => { load(); return () => request.current?.abort(); }, [load]);
  const chart = (section, id) => data?.sections[section]?.charts.find(c => c.id === id);
  const renderChart = (section, id) => chart(section, id) ? <ReportChart key={`${section}-${id}`} chart={chart(section, id)} /> : null;
  return <div className="rpl-page mx-auto w-full max-w-[1600px] space-y-6 p-4 text-ink sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-muted">Librarian workspace</p><h1 className="mt-1 rpl-title">Library analytics</h1><p className="mt-2 max-w-2xl text-muted">Understand attendance, circulation and collection use. Select a measure to explore its records.</p></div><div className="flex flex-wrap gap-2"><RegisterMemberButton onRegistered={load} /><Link className={buttonClass} to="/librarian/reports">Reporting center</Link></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>This month’s overview · Philippine time{data && ` · Updated ${formatReportValue(data.as_of)}`}. Use Reports to choose another period or download records.</p>
      <button className={buttonClass} onClick={load} disabled={busy}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />{busy ? 'Loading…' : 'Refresh overview'}</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-danger bg-danger-soft p-4 text-danger">{error} {data && 'Previously loaded values are shown below.'}</p>}
    {!data && busy && <p role="status" className="py-16 text-center text-muted">Loading library analytics…</p>}
    {data && <div className="space-y-6" aria-busy={busy}>
      <section aria-label="Library measures" className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-5">{cards.map(([key, label, category, filters, snapshot]) => {
        const comparison = data.comparisons[key];
        const period = key === 'visits_today' ? periodDates('today', new Date(data.as_of)) : data.filters;
        return <Link key={key} to={reportHref(period, category, filters)} className="min-w-0 rounded-xl border border-line bg-panel p-4 transition hover:border-link"><div className="flex items-start justify-between gap-2"><h2 className="text-sm font-medium text-muted">{label}</h2><ArrowUpRight size={16} className="shrink-0 text-link" /></div><p className="mt-3 text-3xl font-semibold tabular-nums">{formatReportValue(data.metrics[key])}</p><p className="mt-2 text-sm text-muted">{snapshot ? `As of ${formatReportValue(data.as_of)}` : `${period.start}–${period.end}`}</p>{comparison && <p className="mt-2 text-sm text-link">{comparison.delta == null ? 'Comparison unavailable' : comparison.percent == null ? 'No percentage baseline' : `${comparison.percent > 0 ? '+' : ''}${comparison.percent}% vs previous period`}</p>}</Link>;
      })}</section>
      <div className="grid gap-5 xl:grid-cols-2">{renderChart('visits', 'visitors')}{renderChart('circulation', 'comparison')}</div>
      <details className="rounded-xl border border-line bg-panel p-5"><summary className="cursor-pointer font-medium text-link">Previous-period visits and circulation trends</summary><div className="mt-4 grid gap-5 xl:grid-cols-3"><ReportChart chart={{ title: 'Previous-period visits', type: 'line', points: data.previous_visits }} />{renderChart('circulation', 'borrows')}{renderChart('circulation', 'returns')}</div></details>
      <section className="space-y-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-2xl font-semibold">Collection and demand</h2><Link className="text-link underline" to={reportHref(data.filters, 'collection')}>Explore collection</Link></div><p className="text-sm text-muted">Current catalog categories. Historical category-at-borrow is not recorded. Retired copies are separate from holdings.</p><div className="grid gap-5 xl:grid-cols-3">{renderChart('collection', 'statuses')}{renderChart('circulation', 'categories')}{renderChart('collection', 'category-titles')}</div><div className="grid gap-5 xl:grid-cols-2">{renderChart('collection', 'most')}{renderChart('collection', 'least')}</div></section>
      <section className="space-y-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-2xl font-semibold">Acquisitions</h2><Link className="text-link underline" to={reportHref(data.filters, 'acquisitions')}>Review and record acquisitions</Link></div><p className="text-sm text-muted">{data.metrics.new_catalog_titles} newly cataloged titles; {data.metrics.acquired_copies} copies with a verified acquisition date in this period. Catalog creation is not acquisition.</p><p className="rounded-lg bg-subtle p-3 text-sm">Coverage: {data.sections.acquisitions.summary.coverage_unknown_date} of {data.sections.acquisitions.summary.coverage_copies} copies have no acquisition date; {data.sections.acquisitions.summary.coverage_unknown_source} have unknown sources.</p><div className="grid gap-5 xl:grid-cols-2">{renderChart('acquisitions', 'source')}{renderChart('acquisitions', 'acquired')}</div></section>
      <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-xl border border-line bg-panel p-5"><h2 className="mb-4 text-xl font-semibold">Needs attention</h2><ul className="divide-y divide-line">{data.alerts.map(alert => <li key={alert.label}><Link className="flex items-center justify-between gap-4 py-3 text-link" to={alert.href}><span>{alert.label}</span><strong>{alert.count}</strong></Link></li>)}</ul></section><section className="rounded-xl border border-line bg-panel p-5"><h2 className="mb-4 text-xl font-semibold">Recent activity</h2><ul className="divide-y divide-line">{data.recent.slice(0, 6).map(row => <li key={row.id} className="py-3"><p className="text-sm font-medium">{row.label}</p><time className="text-sm text-muted" dateTime={row.at}>{formatReportValue(row.at)}</time></li>)}</ul>{!data.recent.length && <p className="text-muted">No recorded activity.</p>}</section></div>

    </div>}
  </div>;
}
