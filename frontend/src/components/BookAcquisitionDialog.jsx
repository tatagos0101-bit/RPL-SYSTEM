import { useCallback, useEffect, useState } from 'react';
import ModalFrame from './ModalFrame';
import AcquisitionFields from './AcquisitionFields';
import { getBookAcquisitions, acquisitionSources, acquisitionPayload, emptyAcquisition } from '../api/acquisitions';
import { getAcquisition, saveAcquisition, reportError } from '../api/reporting';

const button = 'rounded-lg border border-line bg-subtle px-3 py-2 text-sm font-semibold disabled:opacity-50';
export default function BookAcquisitionDialog({ book, onClose, onSaved }) {
  const [page, setPage] = useState(0), [data, setData] = useState(null), [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const load = useCallback(async (signal) => {
    setBusy(true); setError(''); setData(null);
    try { const result = await getBookAcquisitions(book.id, page * 25, signal); if (!signal?.aborted) setData(result); }
    catch (failure) { if (!signal?.aborted) setError(await reportError(failure)); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, [book.id, page]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load]);
  const edit = async id => {
    setBusy(true); setError(''); setMessage('');
    try { setRecord(await getAcquisition(id)); } catch (failure) { setError(await reportError(failure)); } finally { setBusy(false); }
  };
  const save = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const fields = acquisitionPayload(record) || Object.fromEntries(Object.keys(emptyAcquisition()).map(key => [key, null]));
      await saveAcquisition({ ...fields, copy_id: record.copy_id, expected_version: record.expected_version });
      setRecord(null); setMessage('Acquisition details saved. Reports use the same record.'); onSaved(); await load();
    } catch (failure) { setError(await reportError(failure)); } finally { setBusy(false); }
  };
  return <ModalFrame onClose={() => { if (!busy) onClose(); }} aria-label="Book acquisitions" className="flex items-center justify-center bg-black/60 p-4">
    <section className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-panel p-5 text-ink sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Copy acquisitions</h2><p className="mt-1 text-sm text-muted">{book.title}</p></div><button className={button} disabled={busy} onClick={onClose}>Close</button></header>
      <p className="mb-4 text-sm text-muted">Record sources per physical copy. A title can contain both donated and purchased copies. Missing details stay Unknown; retired copies retain their history.</p>
      {error && <p role="alert" className="mb-3 text-danger">{error} <button className={button} disabled={busy} onClick={() => record ? edit(record.copy_id) : load()}>Reload</button></p>}
      {message && <p role="status" className="mb-3 text-success">{message}</p>}
      {busy && <p role="status">Loading…</p>}
      {record ? <form onSubmit={save}><p className="font-medium">Copy #{record.copy_id} · {record.copy_qr}</p><AcquisitionFields value={record} onChange={setRecord} disabled={busy} description="Applies only to this physical copy. Saving does not change inventory quantity or its QR identity." /><div className="flex gap-3"><button className={`${button} !bg-action !text-white`} disabled={busy}>Save acquisition details</button><button type="button" className={button} disabled={busy} onClick={() => setRecord(null)}>Back to copies</button></div></form> : data && <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Copy / QR', 'Status', 'Source', 'Action'].map(label => <th key={label} className="border-b border-line p-3">{label}</th>)}</tr></thead><tbody>{data.items.map(copy => <tr key={copy.id} className="border-b border-line"><td className="p-3">{copy.copy_number}<span className="block break-all text-muted">{copy.qr_code}</span></td><td className="p-3">{copy.status}</td><td className="p-3">{acquisitionSources[copy.source || 'unknown']}</td><td className="p-3"><button className={button} disabled={busy} onClick={() => edit(copy.id)} aria-label={`Edit acquisition for copy ${copy.copy_number}`}>Edit source</button></td></tr>)}</tbody></table></div>
        {!data.total && <p className="py-5 text-muted">No physical copies recorded for this title.</p>}
        <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Copy pages"><button className={button} disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className="text-sm">{data.total} copies · Page {page + 1}</span><button className={button} disabled={busy || (page + 1) * 25 >= data.total} onClick={() => setPage(page + 1)}>Next</button></nav>
      </>}
    </section>
  </ModalFrame>;
}
