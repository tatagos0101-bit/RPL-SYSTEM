import { acquisitionSources } from '../api/acquisitions';

export default function AcquisitionFields({ value, onChange, disabled = false, description = 'Applies to each new copy in this submission. Leave unverified details blank.' }) {
  const update = (key, text) => onChange({ ...value, [key]: text });
  const style = 'w-full rounded-lg border border-line bg-subtle px-3 py-2.5 text-base text-ink disabled:opacity-60';
  return <fieldset disabled={disabled} className="my-4 min-w-0 rounded-xl border border-line p-4">
    <legend className="px-2 text-base font-semibold">Acquisition details</legend>
    <p className="mb-4 text-sm text-muted">{description}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="min-w-0"><span className="mb-1 block text-sm text-muted">Acquisition source</span><select aria-label="Acquisition source" className={style} value={value.source || ''} onChange={event => update('source', event.target.value)}><option value="">Unknown</option>{Object.entries(acquisitionSources).filter(([key]) => key !== 'unknown').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {[
        ['acquired_on', 'Acquisition date', 'date'], ['party', 'Donor / supplier', 'text'],
        ['cost', 'Cost per copy', 'number'], ['currency', 'Currency (e.g. PHP)', 'text'], ['reference', 'Acquisition reference', 'text'],
      ].map(([key, label, type]) => <label key={key} className="min-w-0"><span className="mb-1 block text-sm text-muted">{label}</span><input className={style} type={type} value={value[key] ?? ''} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} maxLength={key === 'party' ? 180 : key === 'currency' ? 3 : 255} required={key === 'currency' && value.cost !== '' && value.cost != null} onChange={event => update(key, event.target.value)} /></label>)}
    </div>
  </fieldset>;
}
