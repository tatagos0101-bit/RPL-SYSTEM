import { useState } from 'react';
import { getCategoryReview, getCategoryMasters, resolveCategoryReview } from '../api/librarian';

export default function CategoryReview() {
  const [rows, setRows] = useState(null);
  const [masters, setMasters] = useState([]);
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  const load = async (skip = 0) => {
    setBusy(true);
    setError('');
    try {
      const [queue, options] = await Promise.all([getCategoryReview(skip), getCategoryMasters()]);
      setRows(queue.data);
      setMasters(options.data);
      setPage(skip);
      setChoices({});
    } catch {
      setError('Unable to load category review. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (raw) => {
    setBusy(true);
    setError('');
    try {
      await resolveCategoryReview(raw, choices[raw]);
      await load(page);
    } catch {
      setError('Unable to map this label. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-line bg-panel p-4 text-ink">
      <button type="button" onClick={() => load()} disabled={busy} className="font-semibold text-link">
        {busy ? 'Loading categories…' : 'Librarian category review'}
      </button>
      <p className="mt-2 text-sm text-muted">Unmatched labels appear under General until more than 10 titles share the exact label. Map them to a master category here.</p>
      {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
      {rows && <div className="mt-4 space-y-3">
        {rows.length === 0 && <p>No pending labels on this page.</p>}
        {rows.map((row) => <div key={row.raw_api_label} className="flex flex-col gap-2 border-t border-line pt-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1 break-words"><p>{row.raw_api_label}</p><p className="text-sm text-muted">{row.book_count} titles · Hidden label</p></div>
          <select aria-label={`Master category for ${row.raw_api_label}`} value={choices[row.raw_api_label] || ''}
            onChange={(event) => setChoices({ ...choices, [row.raw_api_label]: event.target.value })}
            className="min-w-0 rounded-lg border border-line bg-panel p-2 text-ink" disabled={busy}>
            <option value="">Choose master category</option>
            {masters.map((master) => <option key={master}>{master}</option>)}
          </select>
          <button type="button" disabled={busy || !choices[row.raw_api_label]} onClick={() => resolve(row.raw_api_label)}
            className="rounded-lg bg-action px-4 py-2 text-white disabled:opacity-50">Apply mapping</button>
        </div>)}
        <div className="flex gap-4">
          <button type="button" disabled={busy || page === 0} onClick={() => load(Math.max(0, page - 100))}>Previous labels</button>
          <button type="button" disabled={busy || rows.length < 100} onClick={() => load(page + 100)}>Next labels</button>
        </div>
      </div>}
    </section>
  );
}
