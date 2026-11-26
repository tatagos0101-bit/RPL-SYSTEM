import { returnConditions, inspectionRemarks } from '../api/returnInspection';

const field = 'mt-1 block w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-base text-ink';
export default function ReturnInspection({ value = {}, onChange, disabled }) {
  const update = patch => onChange({ condition_fee: '0', inspection_notes: '', ...value, ...patch });
  const chooseRemark = ['damaged', 'lost'].includes(value.return_condition);
  const fixedRemark = Object.values(inspectionRemarks[value.return_condition] || {})[0];
  return <fieldset disabled={disabled} className="mt-4 space-y-4 rounded-xl border border-line bg-subtle p-4">
    <legend className="px-1 font-semibold">Librarian inspection</legend>
    <p className="text-sm text-muted">Inspect this physical copy before accepting it. For a lost copy, record the member’s report instead. Charges below are assessments; payment is handled at the desk.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="min-w-0 text-sm font-medium">Book condition<select aria-label="Book condition" className={field} value={value.return_condition || ''} onChange={event => update({ return_condition: event.target.value, inspection_reason: Object.keys(inspectionRemarks[event.target.value] || {})[0] || '', inspection_confirmed: false, condition_fee: '0' })}>
        <option value="">Choose after inspection</option>{Object.entries(returnConditions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <div className="min-w-0 text-sm font-medium">{chooseRemark ? <label>Inspection remark<select aria-label="Inspection remark" className={field} value={value.inspection_reason || ''} onChange={event => update({ inspection_reason: event.target.value, inspection_confirmed: false })}>
        {Object.entries(inspectionRemarks[value.return_condition]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label> : <><span>Inspection remark</span><p className={`${field} font-normal`} aria-live="polite">{fixedRemark || 'Choose a condition first'}</p></>}</div>
    </div>
    {['damaged', 'lost'].includes(value.return_condition) && <label className="block text-sm font-medium">Librarian-assessed damage / loss charge (PHP)<input className={field} type="number" min="0" max="999999.99" step="0.01" value={value.condition_fee ?? '0'} onChange={event => update({ condition_fee: event.target.value })} /><span className="mt-1 block font-normal text-muted">Enter 0 when no charge is assessed. The existing late fee is calculated separately.</span></label>}
    <label className="block text-sm font-medium">Additional inspection notes {value.inspection_reason === 'other' ? '(required)' : '(optional)'}<textarea className={field} rows="2" maxLength="1000" value={value.inspection_notes || ''} onChange={event => update({ inspection_notes: event.target.value })} /></label>
    <label className="flex items-start gap-3 text-sm font-medium"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-amber-700" checked={!!value.inspection_confirmed} onChange={event => update({ inspection_confirmed: event.target.checked })} />{value.return_condition === 'lost' ? 'I reviewed the reported loss and the assessment above.' : 'I inspected this copy and confirm the condition and assessment above.'}</label>
  </fieldset>;
}
