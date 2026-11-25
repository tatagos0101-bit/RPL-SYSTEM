import { useCallback, useEffect, useState } from 'react';
import ModalFrame from './ModalFrame';
import BookAcquisitionDialog from './BookAcquisitionDialog';
import { getBookAcquisitions, acquisitionSources } from '../api/acquisitions';
import { updateCopyCondition } from '../api/libraryWorkflows';
import { errorMessage } from '../api/inventoryWrites';

const button = 'min-h-11 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-subtle disabled:opacity-50';
const input = 'mt-1 block w-full rounded-lg border border-line bg-subtle px-3 py-3 text-base text-ink';
export default function BookCopyManagement({ book, onClose, onSaved }) {
  const [data, setData] = useState(null), [page, setPage] = useState(0), [revision, setRevision] = useState(0);
  const [sources, setSources] = useState(false), [selected, setSelected] = useState(null);
  const [condition, setCondition] = useState('good'), [reason, setReason] = useState('stock_inspection'), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useCallback(signal => getBookAcquisitions(book.id, page * 25, signal).then(next => { if (!signal.aborted) setData(next); }).catch(failure => { if (!signal.aborted) setError(errorMessage(failure)); }), [book.id, page]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load, revision]);
  async function save(event) {
    event.preventDefault(); if (busy || !notes.trim()) return;
    setBusy(true); setError('');
    try { await updateCopyCondition(selected.id, { condition, reason, notes: notes.trim() }); setSelected(null); setRevision(value => value + 1); onSaved(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <ModalFrame onClose={() => { if (!busy) onClose(); }} aria-label="Physical copies and acquisition sources" className="flex items-center justify-center bg-black/60 p-4"><section className="max-h-[90dvh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl border border-line bg-panel p-5 text-ink sm:p-7"><header className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Copies, condition & sources</h2><p className="mt-2 text-sm text-muted">{book.title}</p></div><button className={button} disabled={busy} onClick={onClose}>Close</button></header>
    {error && <p role="alert" className="text-danger">{error} <button className="underline" onClick={() => setRevision(value => value + 1)}>Reload</button></p>}
    <p className="text-sm text-muted">Damaged and lost copies stay unavailable. Inspect borrowed copies through Return Books. A stock inspection can restore a repaired or found copy while preserving its QR identity and loan history.</p>
    <button className={`${button} bg-action text-white`} onClick={() => setSources(true)}>Record donated / purchased sources</button>
    {selected ? <form onSubmit={save} className="space-y-4 rounded-xl border border-line p-4"><h3 className="font-semibold">Inspect copy {selected.copy_number}</h3><p className="break-all font-mono text-sm">{selected.qr_code}</p><label className="block text-sm">Condition<select aria-label="Condition" className={input} value={condition} onChange={event => setCondition(event.target.value)} disabled={busy}><option value="good">Good — available</option><option value="worn">Normal wear — available</option><option value="damaged">Damaged — unavailable</option><option value="lost">Lost — unavailable</option></select></label><label className="block text-sm">Stock remark<select aria-label="Stock remark" className={input} value={reason} onChange={event => setReason(event.target.value)} disabled={busy}><option value="stock_inspection">Stock inspection</option><option value="repaired">Repaired</option><option value="found">Found</option><option value="other">Other</option></select></label><label className="block text-sm">Inspection details<textarea required maxLength="1000" rows="3" className={input} value={notes} onChange={event => setNotes(event.target.value)} disabled={busy} /></label><div className="flex gap-3"><button className={`${button} bg-action text-white`} disabled={busy || !notes.trim()}>{busy ? 'Saving…' : 'Save inspection'}</button><button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></form> : !data ? <p role="status">Loading copies…</p> : <><div className="space-y-3">{data.items.map(copy => <article key={copy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4"><div className="min-w-0"><h3 className="font-semibold">Copy {copy.copy_number} · {copy.status}</h3><p className="break-all font-mono text-xs text-muted">{copy.qr_code}</p><p className="mt-2 text-sm">Condition: {copy.condition || 'Not recorded'} · Source: {acquisitionSources[copy.source || 'unknown']}</p></div><button className={button} disabled={['borrowed', 'retired'].includes(copy.status)} onClick={() => { setSelected(copy); setCondition(copy.condition || 'good'); setNotes(''); setReason('stock_inspection'); setError(''); }}>Inspect copy</button></article>)}</div><nav className="flex flex-wrap gap-3" aria-label="Physical copy pages"><button className={button} disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span className="self-center text-sm">{data.total} copies · Page {page + 1}</span><button className={button} disabled={(page + 1) * 25 >= data.total} onClick={() => setPage(value => value + 1)}>Next</button></nav></>}
    {sources && <BookAcquisitionDialog book={book} onClose={() => setSources(false)} onSaved={() => { setRevision(value => value + 1); onSaved(); }} />}
  </section></ModalFrame>;
}
