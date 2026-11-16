import { useId } from 'react';
import { MAX_BOOK_DESCRIPTION_LENGTH } from '../api/bookMetadata';

export default function BookDescriptionField({ value = '', onChange, onlineDescription = '', disabled = false, lookedUp = false }) {
  const id = useId();
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-muted">Book description <span className="font-normal">(optional)</span></label>
      {onlineDescription && <button type="button" disabled={disabled} onClick={() => onChange(onlineDescription)} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-link disabled:opacity-50">Use online summary</button>}
    </div>
    <textarea id={id} name="description" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} maxLength={MAX_BOOK_DESCRIPTION_LENGTH} rows={3}
      aria-describedby={`${id}-help ${id}-count`} placeholder="Write a short summary or note about this book."
      className="block w-full min-w-0 resize-y rounded-lg border border-line bg-subtle px-4 py-3 text-base text-ink disabled:opacity-60" />
    <div className="flex flex-wrap justify-between gap-2 text-sm text-muted"><p id={`${id}-help`}>Visible in the public and member catalog. {lookedUp && !onlineDescription ? 'No online summary was found; you can write your own.' : 'You can write or edit the description yourself.'}</p><span id={`${id}-count`}>{value.length} / {MAX_BOOK_DESCRIPTION_LENGTH}</span></div>
  </div>;
}
