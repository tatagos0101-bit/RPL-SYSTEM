export default function CirculationEligibilityField({ value, onChange, disabled = false }) {
  return <fieldset disabled={disabled} className="my-5 space-y-3 rounded-xl border border-line bg-subtle p-4"><legend className="px-2 font-semibold">Borrowing eligibility</legend>
    <label className="block text-sm font-medium">Circulation rule<select aria-label="Circulation rule" className="mt-1 w-full rounded-lg border border-line bg-panel p-3 text-base text-ink" value={value.is_borrowable === false ? 'reference' : 'circulating'} onChange={event => onChange({ ...value, is_borrowable: event.target.value === 'circulating' })}><option value="circulating">Can be borrowed</option><option value="reference">Library use only / reference</option></select></label>
    <label className="block text-sm font-medium">Catalog note (optional)<input maxLength="500" className="mt-1 w-full rounded-lg border border-line bg-panel p-3 text-base text-ink" value={value.circulation_note || ''} onChange={event => onChange({ ...value, circulation_note: event.target.value })} placeholder="For example: Reference desk use only" /></label>
    <p className="text-sm text-muted">Library-use-only titles cannot be borrowed or reserved. Changing an existing title to library use only cancels its open reservations and notifies those members. Existing loans remain in the return workflow.</p>
  </fieldset>;
}
