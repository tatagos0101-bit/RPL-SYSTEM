import { useState } from 'react';
import ModalFrame from '../ModalFrame';
import { getAcquisition, saveAcquisition, previewAcquisitions, applyAcquisitions, reportError, downloadReport } from '../../api/reporting';
import { buttonClass, controlClass, Field } from './ReportControls';

export default function AcquisitionEditor({ onSaved }) {
  const [mode, setMode] = useState(null), [copyId, setCopyId] = useState('');
  const [record, setRecord] = useState(null), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const close = () => { if (!busy) { setMode(null); setRecord(null); setPreview(null); setError(''); } };
  async function run(action) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (err) { setError(await reportError(err)); } finally { setBusy(false); }
  }
  const field = (key, label, type = 'text') => <Field label={label} key={key}><input className={controlClass} type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '.01' : undefined} maxLength={key === 'currency' ? 3 : 255} value={record[key] ?? ''} onChange={e => setRecord({ ...record, [key]: e.target.value || null })} /></Field>;
  return <>
    <div className="flex flex-wrap items-center gap-3"><button className={buttonClass} onClick={() => setMode('edit')}>Record acquisition</button><button className={buttonClass} onClick={() => setMode('import')}>Import acquisition metadata</button><span role="status" className="text-sm text-success">{message}</span></div>
    {mode && <ModalFrame onClose={close} aria-label={mode === 'edit' ? 'Record acquisition' : 'Import acquisition metadata'} className="flex items-center justify-center bg-black/60 p-4">
      <section className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl border border-line bg-panel p-5 text-ink sm:p-6">
        <div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-semibold">{mode === 'edit' ? 'Record acquisition' : 'Import acquisition metadata'}</h2><button className={buttonClass} disabled={busy} onClick={close}>Close</button></div>
        <p className="my-4 text-sm text-muted">Attach verified information to existing physical copies. This does not create stock or change QR identities. Leave unknown fields blank.</p>
        {error && <p role="alert" className="my-3 rounded-lg bg-danger-soft p-3 text-danger">{error}</p>}
        {mode === 'edit' ? <>
          <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); run(async () => setRecord(await getAcquisition(copyId))); }}><Field label="Physical copy ID"><input required type="number" min="1" className={controlClass} value={copyId} onChange={e => { setCopyId(e.target.value); setRecord(null); }} /></Field><button className={buttonClass} disabled={busy}>Look up copy</button></form>
          {record && <form onSubmit={e => { e.preventDefault(); run(async () => {
            const { copy_qr: _qr, title: _title, ...body } = record;
            await saveAcquisition(body); setRecord(null); setMode(null); setMessage('Acquisition metadata saved.'); onSaved();
          }); }}>
            <p className="mb-4 rounded-lg bg-subtle p-3 font-medium">{record.title} · {record.copy_qr} · Copy #{record.copy_id}</p>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Source"><select className={controlClass} value={record.source || ''} onChange={e => setRecord({ ...record, source: e.target.value || null })}><option value="">Unknown</option><option value="purchased">Purchased</option><option value="donated">Donated</option><option value="other">Other</option></select></Field>{field('acquired_on', 'Verified acquisition date', 'date')}{field('party', 'Verified donor / supplier')}{field('reference', 'Supporting reference')}{field('cost', 'Recorded cost', 'number')}{field('currency', 'Currency (e.g. PHP)')}</div>
            <button disabled={busy} className={`${buttonClass} mt-5 !bg-action !text-white`}>{busy ? 'Saving…' : 'Save acquisition metadata'}</button>
          </form>}
        </> : <>
          <button className={buttonClass} onClick={() => downloadReport(new Blob(['copy_id,source,acquired_on,party,cost,currency,reference\r\n'], { type: 'text/csv' }), 'RPL-acquisitions-template.csv')}>Download CSV template</button>
          <p className="my-3 text-sm text-muted">CSV or XLSX, up to 500 rows / 1 MB. Sources: purchased, donated, other, or blank. Dates: YYYY-MM-DD. Import replaces the listed copies’ acquisition fields; blank cells clear existing values.</p>
          <Field label="Choose file to validate"><input type="file" accept=".csv,.xlsx" disabled={busy} className={controlClass} onChange={e => { const file = e.target.files?.[0]; setPreview(null); if (file) run(async () => setPreview(await previewAcquisitions(file))); }} /></Field>
          {preview && <><p className="my-4 font-medium">{preview.rows.length} validated rows. Review before applying.</p><div className="max-h-72 overflow-auto" tabIndex="0" role="region" aria-label="Acquisition import preview"><table className="w-full text-left text-sm"><thead><tr>{['Copy', 'Source', 'Date', 'Donor / supplier', 'Cost', 'Reference'].map(c => <th key={c} className="p-2">{c}</th>)}</tr></thead><tbody>{preview.rows.map(r => <tr key={r.copy_id} className="border-t border-line">{[r.copy_id, r.source, r.acquired_on, r.party, r.cost != null ? `${r.cost} ${r.currency}` : null, r.reference].map((v, i) => <td key={i} className="p-2">{v ?? 'Unknown'}</td>)}</tr>)}</tbody></table></div><button className={`${buttonClass} mt-5 !bg-action !text-white`} disabled={busy} onClick={() => run(async () => { await applyAcquisitions({ rows: preview.rows, preview_token: preview.preview_token }); setPreview(null); setMode(null); setMessage('Acquisition import applied.'); onSaved(); })}>{busy ? 'Applying…' : `Apply ${preview.rows.length} acquisition records`}</button></>}
        </>}
      </section>
    </ModalFrame>}
  </>;
}
