import { cloneElement, useId } from 'react';
import { categories, periodNames, periodDates, defaultFilters } from '../../api/reportingFilters';
export const controlClass = 'w-full min-w-0 rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink';
export const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50';
export function Field({ label, children }) { const id = useId(); return <div className="min-w-0"><label htmlFor={id} className="mb-1 block text-sm font-medium text-muted">{label}</label>{cloneElement(children, { id })}</div>; }
export function PeriodControls({ value, onChange, compact = false }) {
  const dateScope = ['patrons', 'collection', 'acquisitions'].includes(value.category) ? { date_scope: 'period' } : {};
  const change = (key, text) => onChange({ ...value, [key]: text, ...(['start', 'end'].includes(key) ? { period: 'custom', ...dateScope } : {}) });
  return <>
    <Field label="Period"><select className={controlClass} value={value.period} onChange={e => onChange({ ...value, ...dateScope, ...(e.target.value === 'custom' ? { period: 'custom' } : periodDates(e.target.value)) })}>{Object.entries(periodNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="From (Philippine time)"><input className={controlClass} type="date" required value={value.start} onChange={e => change('start', e.target.value)} /></Field>
    <Field label="Through"><input className={controlClass} type="date" required min={value.start} value={value.end} onChange={e => change('end', e.target.value)} /></Field>
    {!compact && <Field label="Chart grouping"><select className={controlClass} value={value.group} onChange={e => change('group', e.target.value)}>{['day', 'week', 'month', 'year'].map(key => <option key={key} value={key}>{key[0].toUpperCase() + key.slice(1)}</option>)}</select></Field>}
  </>;
}
export default function ReportControls({ value, onChange, metadata, onApply, onReset, busy, compact = false }) {
  const c = value.category;
  const set = (key, val) => onChange({ ...value, [key]: ['year_from', 'year_to', 'recorded_by'].includes(key) ? (val === '' ? null : Number(val)) : val });
  const input = (key, label, type = 'text') => <Field key={key} label={label}><input type={type} className={controlClass} value={value[key] ?? ''} onChange={e => set(key, e.target.value)} /></Field>;
  const select = (key, label, options) => <Field key={key} label={label}><select className={controlClass} value={value[key] ?? ''} onChange={e => set(key, e.target.value)}>{options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field>;
  const book = ['circulation', 'collection', 'acquisitions', 'inventory'].includes(c);
  return <form onSubmit={e => { e.preventDefault(); onApply(); }} className={compact ? '' : 'rounded-xl border border-line bg-panel p-4 sm:p-5'}>
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${compact ? '' : 'xl:grid-cols-5'}`}>
      <Field label="Report category"><select className={controlClass} value={c} onChange={e => onChange({ ...defaultFilters(e.target.value), start: value.start, end: value.end, period: value.period, group: value.group })}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <PeriodControls value={value} onChange={onChange} compact={compact} />
      {compact && input('query', 'Search matching records')}
    </div>
    <details className="mt-4"><summary className="cursor-pointer font-medium text-link">Filters for {categories[c].toLowerCase()}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {!compact && input('query', 'Search matching records')}
      {book && <>{select('book_category', 'Catalog category', [['', 'All categories'], ...(metadata?.book_categories || []).filter(Boolean).map(v => [v, v])])}{input('author', 'Author contains')}{input('year_from', 'Publication year from', 'number')}{input('year_to', 'Publication year through', 'number')}{input('isbn', 'ISBN contains')}{input('shelf', 'Shelf contains')}{input('qr', 'Exact QR code')}</>}
      {['visits', 'patrons', 'circulation'].includes(c) && input('member_id', 'Exact member ID')}
      {c === 'circulation' && <>{select('date_basis', 'Date basis', [['activity', 'Borrowing or return activity'], ['borrowed', 'Borrow date'], ['returned', 'Return date'], ['due', 'Due date']])}{select('loan_status', 'Loan status', [['', 'All matching loans'], ['outstanding', 'Currently outstanding (snapshot)'], ['overdue', 'Currently overdue (snapshot)'], ['returned', 'Returned'], ['on-time', 'On-time return'], ['late', 'Late return']])}</>}
      {c === 'patrons' && <>{select('account_status', 'Account status', [['', 'All statuses'], ['active', 'Active'], ['suspended', 'Suspended']])}{select('participation', 'Period participation', [['', 'All patrons'], ['borrowed', 'Borrowed during period'], ['visited', 'Visited during period'], ['neither', 'No recorded visit or borrow in period']])}</>}
      {['patrons', 'collection', 'acquisitions'].includes(c) && select('date_scope', c === 'patrons' ? 'Registration scope' : c === 'collection' ? 'Catalog creation scope' : 'Acquisition date scope', [['period', 'Selected period'], ['all', 'All recorded dates'], ...(c === 'acquisitions' ? [['unknown', 'Unknown date only']] : [])])}
      {c === 'collection' && select('copy_status', 'Copy status', [['', 'All statuses'], ...['available', 'borrowed', 'damaged', 'lost', 'retired'].map(v => [v, v])])}
      {c === 'collection' && select('holdings', 'Holdings', [['all', 'Include retired and titles without copies'], ['current', 'Current physical holdings only']])}
      {c === 'acquisitions' && <>{select('source', 'Acquisition source', [['', 'All sources'], ['purchased', 'Purchased'], ['donated', 'Donated'], ['other', 'Other'], ['unknown', 'Unknown']])}{input('party', 'Donor / supplier contains')}{select('recorded_by', 'Recording staff', [['', 'All staff'], ...(metadata?.staff || []).map(s => [s.id, s.label])])}</>}
    </div></details>
    <div className="mt-5 flex flex-wrap gap-2"><button disabled={busy} className={`${buttonClass} !bg-action !text-white`}>{busy ? 'Loading…' : 'Apply filters'}</button><button type="button" className={buttonClass} disabled={busy} onClick={onReset}>Reset filters</button></div>
  </form>;
}
