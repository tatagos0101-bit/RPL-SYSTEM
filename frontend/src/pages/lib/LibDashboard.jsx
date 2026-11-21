import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ArrowUpRight, BookOpen, Users, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { getAnalytics, reportError } from '../../api/reporting';
import { defaultFilters, reportHref, periodDates, formatReportValue } from '../../api/reportingFilters';
import ReportChart from '../../components/reporting/ReportChart';
import { buttonClass } from '../../components/reporting/ReportControls';
import RegisterMemberButton from '../../components/reporting/RegisterMemberButton';

const cards = [
  ['titles', 'Catalog titles', 'inventory', {}, true],
  ['registered_patrons', 'Registered patrons', 'patrons', { date_scope: 'all' }, true],
  ['currently_borrowed', 'Currently borrowed books', 'circulation', { loan_status: 'outstanding' }, true],
  ['overdue', 'Overdue books', 'circulation', { loan_status: 'overdue' }, true],
  ['visits_today', 'Visits today', 'visits', {}, false],
  ['unique_visitors', 'Identified unique visitors', 'visits', {}, false],
  ['borrows', 'Books borrowed', 'circulation', { date_basis: 'borrowed' }, false],
  ['returns', 'Books returned', 'circulation', { date_basis: 'returned' }, false],
  ['physical_copies', 'Physical copies held', 'collection', { date_scope: 'all', holdings: 'current' }, true],
];
const metricIcons = {
  titles: <BookOpen size={18} />,
  registered_patrons: <Users size={18} />,
  currently_borrowed: <ArrowLeftRight size={18} />,
  overdue: <AlertTriangle size={18} />,
};
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
  const renderChart = (section, id) => chart(section, id) ? <ReportChart key={`${section}-${id}`} chart={chart(section, id)} variant="staff" /> : null;
  return <div className="staff-page staff-dashboard">
    <header className="staff-page-header">
      <div><h1>Dashboard</h1><p>Understand attendance, circulation and collection use. Select a measure to explore its records.</p></div>
      <div className="staff-page-actions"><RegisterMemberButton onRegistered={load} /><Link className={buttonClass} to="/librarian/reports">Reporting center</Link></div>
    </header>
    <div className="staff-overview-meta">
      <p>This month’s overview · Philippine time{data && ` · Updated ${formatReportValue(data.as_of)}`}. Use Reports to choose another period or download records.</p>
      <button className={`${buttonClass} staff-action`} onClick={load} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />{busy ? 'Loading…' : 'Refresh overview'}</button>
    </div>
    {error && <p role="alert" className="mb-5 rounded-xl border border-danger bg-danger-soft p-4 text-danger">{error} {data && 'Previously loaded values are shown below.'}</p>}
    {!data && busy && <p role="status" className="py-16 text-center text-muted">Loading library analytics…</p>}
    {data && <div className="staff-dashboard-content" aria-busy={busy}>
      <section aria-label="Library measures" className="staff-metrics">{cards.map(([key, label, category, filters, snapshot]) => {
        const comparison = data.comparisons[key];
        const period = key === 'visits_today' ? periodDates('today', new Date(data.as_of)) : data.filters;
        return <Link key={key} to={reportHref(period, category, filters)} className="staff-metric" data-metric={key}>
          <div className="staff-metric-heading">{metricIcons[key] && <span className="staff-metric-icon" aria-hidden="true">{metricIcons[key]}</span>}<h2>{label}</h2><ArrowUpRight size={14} aria-hidden="true" /></div>
          <p className="staff-metric-value">{formatReportValue(data.metrics[key])}</p>
          <p className="staff-metric-scope">{snapshot ? `As of ${formatReportValue(data.as_of)}` : `${period.start}–${period.end}`}</p>
          {comparison && <p className="staff-metric-comparison">{comparison.delta == null ? 'Comparison unavailable' : comparison.percent == null ? 'No percentage baseline' : `${comparison.percent > 0 ? '+' : ''}${comparison.percent}% vs previous period`}</p>}
        </Link>;
      })}</section>
      <div className="staff-chart-grid staff-chart-grid-featured">{renderChart('circulation', 'comparison')}{renderChart('collection', 'statuses')}</div>
      <div className="staff-chart-grid staff-chart-grid-activity">
        <section className="staff-panel"><h2>Recent activity</h2><div className="staff-activity-heading" aria-hidden="true"><span>Event</span><span>Recorded</span></div><ul className="staff-activity-list">{data.recent.slice(0, 6).map(row => <li key={row.id}><p>{row.label}</p><time dateTime={row.at}>{formatReportValue(row.at)}</time></li>)}</ul>{!data.recent.length && <p className="mt-4 text-muted">No recorded activity.</p>}</section>
        {renderChart('collection', 'most')}
      </div>
      <section className="staff-section">
        <div className="staff-section-heading"><h2 className="staff-section-title">Collection and demand</h2><Link to={reportHref(data.filters, 'collection')}>Explore collection</Link></div>
        <p>Current catalog categories. Historical category-at-borrow is not recorded. Retired copies are separate from holdings.</p>
        <div className="staff-chart-grid">{renderChart('visits', 'visitors')}{renderChart('circulation', 'categories')}</div>
        <div className="staff-chart-grid">{renderChart('collection', 'category-titles')}{renderChart('collection', 'least')}</div>
      </section>
      <details className="staff-panel staff-trends"><summary>Previous-period visits and circulation trends</summary><div className="staff-chart-grid"><ReportChart chart={{ title: 'Previous-period visits', type: 'line', points: data.previous_visits }} variant="staff" />{renderChart('circulation', 'borrows')}{renderChart('circulation', 'returns')}</div></details>
      <section className="staff-panel"><h2>Needs attention</h2><ul className="staff-attention-list">{data.alerts.map(alert => <li key={alert.label}><Link to={alert.href}><span>{alert.label}</span><strong>{alert.count}</strong></Link></li>)}</ul></section>
    </div>}
  </div>;
}
