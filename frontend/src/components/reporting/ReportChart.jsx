import { useEffect, useId, useRef, useState } from 'react';
import { formatReportValue } from '../../api/reportingFilters';
import { reportChartLayout } from '../../api/reportChartLayout';

const palette = ['var(--rpl-chart-1, var(--rpl-link))', 'var(--rpl-chart-2, var(--rpl-success))', 'var(--rpl-chart-3, var(--rpl-warning))', 'var(--rpl-chart-4, var(--rpl-muted))', 'var(--rpl-chart-5, var(--rpl-danger))'];
export default function ReportChart({ chart, variant }) {
  const id = useId();
  const [active, setActive] = useState(null);
  const container = useRef(null);
  const [width, setWidth] = useState(660);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(container.current); return () => observer.disconnect(); }, []);
  const points = chart.points || [];
  const staff = variant === 'staff';
  const grouped = chart.type === 'grouped';
  const valueLabel = chart.value_label || 'Number of records';
  const groupLabel = chart.group_label || (grouped ? 'Date' : 'Category / period');
  const max = Math.max(1, ...points.flatMap(p => grouped ? [p.borrowed, p.returned] : [p.value]));
  const total = points.reduce((sum, p) => sum + (p.value || 0), 0);
  const horizontal = chart.type === 'bar' && !points.some(p => /^\d{4}-\d\d-\d\d$/.test(p.label));
  const text = p => `${p.label}: ${grouped ? `${p.borrowed} books borrowed, ${p.returned} books returned` : `${valueLabel}: ${formatReportValue(p.value)}`}`;
  const { canvasWidth, canvasHeight, fontSize, plotLeft, plotRight, plotTop, plotBottom, labelLines, ticks } = reportChartLayout(width, max, points.map(p => p.label));
  const step = (plotRight - plotLeft) / Math.max(1, points.length);
  const x = i => plotLeft + (i + .5) * step;
  const y = value => plotBottom - (value || 0) / max * (plotBottom - plotTop);
  return <section ref={container} className={staff ? 'staff-report-chart' : 'min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-5'} data-chart-type={chart.type} data-chart-layout={horizontal ? 'horizontal' : undefined} aria-labelledby={id}>
    <h2 id={id} className="text-xl font-semibold text-ink">{chart.title}</h2>
    {!grouped && <p className="mt-1 text-xs text-muted">{valueLabel}</p>}
    {grouped && <p className="mt-2 flex flex-wrap gap-4 text-sm"><span className={`text-link ${staff ? 'staff-chart-legend' : ''}`}>{staff ? 'Borrowed' : '● Borrowed'}</span><span className={`text-success ${staff ? 'staff-chart-legend' : ''}`}>{staff ? 'Returned' : '■ Returned'}</span></p>}
    {!points.length ? <p className="py-12 text-center text-muted">No matching records.</p> : <>
      {horizontal ? <ol className="my-5 space-y-3">{points.map((p, i) => <li key={i} className="text-sm"><div className="mb-1 flex items-start justify-between gap-4"><span>{p.label}</span><strong className="tabular-nums">{formatReportValue(p.value)}</strong></div><svg viewBox="0 0 100 3" preserveAspectRatio={staff ? 'none' : undefined} className="w-full" role="img" aria-label={text(p)} tabIndex="0" onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(i)}><title>{text(p)}</title><rect width="100" height="3" fill="var(--rpl-subtle)" /><rect width={(p.value || 0) / max * 100} height="3" fill="var(--rpl-link)" /></svg></li>)}</ol> : <svg viewBox={chart.type === 'donut' ? '25 0 210 210' : `0 0 ${canvasWidth} ${canvasHeight}`} className={chart.type === 'donut' ? 'mx-auto mt-4 h-44 w-44 overflow-visible' : 'mt-4 h-auto w-full overflow-visible'} role="group" aria-label={`${chart.title}. Tap or focus a point for its value; the data table follows.`}>
        {chart.type === 'donut' ? <>
          <circle cx="130" cy="105" r="72" fill="none" stroke="var(--rpl-line)" strokeWidth="25" />
          {points.map((p, i) => { const length = total ? p.value / total * 100 : 0; const start = total ? points.slice(0, i).reduce((sum, point) => sum + point.value, 0) / total * 100 : 0;
            return <circle key={i} cx="130" cy="105" r="72" pathLength="100" fill="none" stroke={palette[i % palette.length]} strokeWidth="25" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 130 105)" tabIndex="0" role="img" aria-label={text(p)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(i)}><title>{text(p)}</title></circle>;
          })}
          <text x="130" y="111" textAnchor="middle" fill="var(--rpl-ink)" fontSize="24">{formatReportValue(total)}</text>
        </> : <>
          {[...new Set([0, Math.ceil(max / 2), max])].map(value => <g key={value}><line x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} stroke="var(--rpl-line)" /><text x={plotLeft - 8} y={y(value) + 4} textAnchor="end" fontSize={fontSize} fill="var(--rpl-muted)">{value}</text></g>)}
          {staff && grouped && <>
            <polyline points={points.map((p, i) => `${x(i)},${y(p.borrowed)}`).join(' ')} fill="none" stroke="var(--rpl-link)" strokeWidth="3" />
            <polyline points={points.map((p, i) => `${x(i)},${y(p.returned)}`).join(' ')} fill="none" stroke="var(--rpl-success)" strokeWidth="3" strokeDasharray="8 5" />
          </>}
          {chart.type === 'line' && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--rpl-link)" strokeWidth="3" />}
          {active != null && points[active] && <line x1={x(active)} x2={x(active)} y1={plotTop} y2={plotBottom} stroke="var(--rpl-muted)" strokeDasharray="3 4" opacity=".5" pointerEvents="none" />}
          {points.map((p, i) => <g key={i} tabIndex="0" role="img" aria-label={text(p)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onClick={() => setActive(i)}>
            <title>{text(p)}</title>
            <rect x={x(i) - step / 2} y={plotTop} width={step} height={plotBottom - plotTop} fill="transparent" aria-hidden="true" />
            {chart.type === 'line' ? <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--rpl-link)" /> : grouped ? staff ? <>
              <circle cx={x(i)} cy={y(p.borrowed)} r="4" fill="var(--rpl-link)" />
              <rect x={x(i) - 4} y={y(p.returned) - 4} width="8" height="8" fill="var(--rpl-success)" />
            </> : <>
              <rect x={x(i) - step * .4} y={y(p.borrowed)} width={step * .35} height={plotBottom - y(p.borrowed)} fill="var(--rpl-link)" />
              <rect x={x(i) + step * .05} y={y(p.returned)} width={step * .35} height={plotBottom - y(p.returned)} fill="var(--rpl-success)" />
            </> : <rect x={x(i) - step * .35} y={y(p.value)} width={step * .7} height={plotBottom - y(p.value)} fill="var(--rpl-link)" />}
            {ticks.includes(i) && <text x={x(i)} y={plotBottom + 22} textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize={fontSize} fill="var(--rpl-muted)">{labelLines[i].map((line, index) => <tspan key={index} x={x(i)} dy={index ? 15 : 0}>{line}</tspan>)}</text>}
          </g>)}
        </>}
      </svg>}
      {chart.type === 'donut' && <ul className="my-4 space-y-2 text-sm">{points.map((p, i) => <li key={i} className="flex justify-between gap-3"><span><span aria-hidden="true" style={{ color: palette[i % palette.length] }}>■ </span>{p.label}</span><strong>{formatReportValue(p.value)}</strong></li>)}</ul>}
      <p className="min-h-10 text-sm text-muted" aria-live="polite">{active != null && points[active] ? text(points[active]) : `Tap, focus, or point to a chart mark to read ${grouped ? 'the numbers of books borrowed and returned' : valueLabel.toLowerCase()}.`}</p>
      <details className="mt-2 text-sm"><summary className="cursor-pointer text-link">View chart data ({points.length} intervals / groups)</summary><div className="mt-3 max-h-64 overflow-auto" tabIndex="0" role="region" aria-label={`${chart.title} data`}><table className="w-full text-left"><thead><tr><th className="p-2">{groupLabel}</th>{grouped ? <><th className="p-2">Number of books borrowed</th><th className="p-2">Number of books returned</th></> : <th className="p-2">{valueLabel}</th>}</tr></thead><tbody>{points.map((p, i) => <tr key={i} className="border-t border-line"><th className="p-2 font-normal">{p.label}</th>{grouped ? <><td className="p-2">{p.borrowed}</td><td className="p-2">{p.returned}</td></> : <td className="p-2">{formatReportValue(p.value)}</td>}</tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
