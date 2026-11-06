import { useEffect, useId, useRef, useState } from 'react';
import { formatReportValue } from '../../api/reportingFilters';

const palette = ['var(--rpl-link)', 'var(--rpl-success)', 'var(--rpl-warning)', 'var(--rpl-muted)', 'var(--rpl-danger)'];
export default function ReportChart({ chart }) {
  const id = useId();
  const [active, setActive] = useState(null);
  const container = useRef(null);
  const [width, setWidth] = useState(660);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(container.current); return () => observer.disconnect(); }, []);
  const points = chart.points || [];
  const grouped = chart.type === 'grouped';
  const max = Math.max(1, ...points.flatMap(p => grouped ? [p.borrowed, p.returned] : [p.value]));
  const total = points.reduce((sum, p) => sum + (p.value || 0), 0);
  const labelSize = 14 * 660 / Math.max(280, width);
  const horizontal = chart.type === 'bar' && !points.some(p => /^\d{4}-\d\d-\d\d$/.test(p.label));
  const text = p => `${p.label}: ${grouped ? `${p.borrowed} borrowed, ${p.returned} returned` : formatReportValue(p.value)}`;
  const plotLeft = Math.max(44, (String(max).length * 9 + 10) * 660 / Math.max(280, width));
  const x = i => plotLeft + (i + .5) * (628 - plotLeft) / Math.max(1, points.length);
  const y = value => 180 - (value || 0) / max * 145;
  return <section ref={container} className="min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-5" aria-labelledby={id}>
    <h2 id={id} className="text-xl font-semibold text-ink">{chart.title}</h2>
    {grouped && <p className="mt-2 flex flex-wrap gap-4 text-sm"><span className="text-link">● Borrowed</span><span className="text-success">■ Returned</span></p>}
    {!points.length ? <p className="py-12 text-center text-muted">No matching records.</p> : <>
      {horizontal ? <ol className="my-5 space-y-3">{points.map((p, i) => <li key={i} className="text-sm"><div className="mb-1 flex items-start justify-between gap-4"><span>{p.label}</span><strong className="tabular-nums">{formatReportValue(p.value)}</strong></div><svg viewBox="0 0 100 3" className="w-full" role="img" aria-label={text(p)} tabIndex="0" onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}><title>{text(p)}</title><rect width="100" height="3" fill="var(--rpl-subtle)" /><rect width={(p.value || 0) / max * 100} height="3" fill="var(--rpl-link)" /></svg></li>)}</ol> : <svg viewBox={chart.type === 'donut' ? '25 0 210 210' : '0 0 660 220'} className={chart.type === 'donut' ? 'mx-auto mt-4 h-44 w-44 overflow-visible' : 'mt-4 w-full overflow-visible'} role="group" aria-label={`${chart.title}. Focus a point for its value; the data table follows.`}>
        {chart.type === 'donut' ? <>
          <circle cx="130" cy="105" r="72" fill="none" stroke="var(--rpl-line)" strokeWidth="25" />
          {points.map((p, i) => { const length = total ? p.value / total * 100 : 0; const start = total ? points.slice(0, i).reduce((sum, point) => sum + point.value, 0) / total * 100 : 0;
            return <circle key={i} cx="130" cy="105" r="72" pathLength="100" fill="none" stroke={palette[i % palette.length]} strokeWidth="25" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 130 105)" tabIndex="0" role="img" aria-label={text(p)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}><title>{text(p)}</title></circle>;
          })}
          <text x="130" y="111" textAnchor="middle" fill="var(--rpl-ink)" fontSize="24">{formatReportValue(total)}</text>
        </> : <>
          {[...new Set([0, Math.ceil(max / 2), max])].map(value => <g key={value}><line x1={plotLeft} x2="628" y1={y(value)} y2={y(value)} stroke="var(--rpl-line)" /><text x={plotLeft - 8} y={y(value) + 4} textAnchor="end" fontSize={labelSize} fill="var(--rpl-muted)">{value}</text></g>)}
          {chart.type === 'line' && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--rpl-link)" strokeWidth="3" />}
          {points.map((p, i) => <g key={i} tabIndex="0" role="img" aria-label={text(p)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <title>{text(p)}</title>
            {chart.type === 'line' ? <circle cx={x(i)} cy={y(p.value)} r="4" fill="var(--rpl-link)" /> : grouped ? <>
              <rect x={x(i) - 200 / points.length} y={y(p.borrowed)} width={180 / points.length} height={180 - y(p.borrowed)} fill="var(--rpl-link)" />
              <rect x={x(i) + 20 / points.length} y={y(p.returned)} width={180 / points.length} height={180 - y(p.returned)} fill="var(--rpl-success)" />
            </> : <rect x={x(i) - 180 / points.length} y={y(p.value)} width={360 / points.length} height={180 - y(p.value)} fill="var(--rpl-link)" />}
            {(i % Math.max(1, Math.ceil(points.length / (width < 450 ? 3 : 5))) === 0) && <text x={x(i)} y="210" textAnchor="middle" fontSize={labelSize} fill="var(--rpl-muted)">{String(p.label).slice(0, 10)}</text>}
          </g>)}
        </>}
      </svg>}
      {chart.type === 'donut' && <ul className="my-4 space-y-2 text-sm">{points.map((p, i) => <li key={i} className="flex justify-between gap-3"><span><span aria-hidden="true" style={{ color: palette[i % palette.length] }}>■ </span>{p.label}</span><strong>{formatReportValue(p.value)}</strong></li>)}</ul>}
      <p className="min-h-10 text-sm text-muted" aria-live="polite">{active != null && points[active] ? text(points[active]) : 'Focus or point to a chart mark to read its value.'}</p>
      <details className="mt-2 text-sm"><summary className="cursor-pointer text-link">View chart data ({points.length} intervals / groups)</summary><div className="mt-3 max-h-64 overflow-auto" tabIndex="0" role="region" aria-label={`${chart.title} data`}><table className="w-full text-left"><thead><tr><th className="p-2">Period / group</th>{grouped ? <><th className="p-2">Borrowed</th><th className="p-2">Returned</th></> : <th className="p-2">Count</th>}</tr></thead><tbody>{points.map((p, i) => <tr key={i} className="border-t border-line"><th className="p-2 font-normal">{p.label}</th>{grouped ? <><td className="p-2">{p.borrowed}</td><td className="p-2">{p.returned}</td></> : <td className="p-2">{formatReportValue(p.value)}</td>}</tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
