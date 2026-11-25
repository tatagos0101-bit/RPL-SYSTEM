import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Upload } from 'lucide-react';
import { idFileError, identityError, inspectIdentity } from '../api/identity';

export default function VerifiedIdUpload({ value, onChange, onSuggestions, disabled = false }) {
  const [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(event) {
    const selected = event.target.files?.[0]; generation.current += 1;
    onChange(null); setPreview(''); setFile(null); setError('');
    if (!selected) return;
    const validation = idFileError(selected);
    if (validation) { setError(validation); event.target.value = ''; return; }
    setFile(selected);
  }
  async function inspect() {
    if (!file || busy) return;
    const attempt = ++generation.current; setBusy(true); setError(''); onChange(null);
    try {
      const checked = await inspectIdentity(file);
      if (attempt !== generation.current) return;
      onChange(checked); onSuggestions?.(checked);
    } catch (failure) { if (attempt === generation.current) setError(identityError(failure)); }
    finally { if (attempt === generation.current) setBusy(false); }
  }
  return <section aria-label="Required photo ID" className="space-y-3 rounded-xl border border-line bg-subtle p-4">
    <h3 className="flex items-center gap-2 font-semibold"><Upload size={17} aria-hidden="true" /> Government photo ID <span className="text-danger">*</span></h3>
    <p className="text-sm text-muted">The applicant must be present. Upload the front of their original ID, with its name and portrait clearly visible. JPG, PNG or WEBP, up to 10 MB.</p>
    <p className="text-xs leading-5 text-muted">Supported checks: Philippine National ID, driver’s license, passport, UMID, PRC, Postal, SSS, GSIS, voter, senior citizen and PWD photo IDs. Blurry, unsupported or multi-portrait documents need desk assistance.</p>
    <input aria-label="Government photo ID" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={disabled || busy} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-action file:px-3 file:py-2 file:font-semibold file:text-white" />
    {preview && <img src={preview} alt="ID selected for librarian review" className="max-h-48 w-full rounded-lg object-contain" />}
    {file && <button type="button" onClick={inspect} disabled={disabled || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}{busy ? 'Checking ID…' : value ? 'Check ID again' : 'Check ID and read details'}</button>}
    {value && <div role="status" className="space-y-2 rounded-lg border border-line bg-panel p-3 text-sm"><p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={17} />Readable ID detected: {value.document_type.replaceAll('_', ' ')}</p><p className="text-muted">{value.message}</p><p className="text-muted">Review and correct the suggested name and address before saving. No ID number is copied into the member record.</p></div>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </section>;
}
