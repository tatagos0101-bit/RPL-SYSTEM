import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { idFileError, identityError, inspectIdentity } from '../api/identity';

const idTypes = [
  ['tin_id', 'BIR / TIN photo ID'], ['national_id', 'Philippine National ID'],
  ['drivers_license', "Driver’s license"], ['passport', 'Passport'], ['umid', 'UMID'],
  ['prc', 'PRC ID'], ['postal_id', 'Postal ID'], ['sss', 'SSS ID'], ['gsis', 'GSIS ID'],
  ['voters_id', 'Voter’s ID'], ['senior_citizen', 'Senior citizen ID'], ['pwd', 'PWD ID'],
];

export default function VerifiedIdUpload({ value, onChange, onSuggestions, disabled = false }) {
  const [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [manualAllowed, setManualAllowed] = useState(false), [manualOpen, setManualOpen] = useState(false);
  const [documentType, setDocumentType] = useState(''), [password, setPassword] = useState('');
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
    setManualAllowed(false); setManualOpen(false); setDocumentType(''); setPassword('');
    if (!selected) return;
    const validation = idFileError(selected);
    if (validation) { setError(validation); event.target.value = ''; return; }
    setFile(selected);
  }
  async function inspect(manual = false) {
    if (!file || busy) return;
    if (manual && (!documentType || !password)) return;
    const attempt = ++generation.current; setBusy(true); setError(''); onChange(null);
    try {
      const checked = await inspectIdentity(file, manual ? { documentType, password } : null);
      if (attempt !== generation.current) return;
      onChange(checked); onSuggestions?.(checked); setManualOpen(false); setManualAllowed(false);
    } catch (failure) {
      if (attempt === generation.current) {
        setError(identityError(failure));
        if (!manual) setManualAllowed(failure.response?.data?.manual_review_allowed === true);
      }
    } finally { if (attempt === generation.current) { setBusy(false); setPassword(''); } }
  }
  return <section aria-label="Required photo ID" className="space-y-3 rounded-xl border border-line bg-subtle p-4">
    <h3 className="flex items-center gap-2 font-semibold"><Upload size={17} aria-hidden="true" /> Government photo ID <span className="text-danger">*</span></h3>
    <p className="text-sm text-muted">The applicant must be present. Upload the front of their original ID, with its name and portrait clearly visible. JPG, PNG or WEBP, up to 10 MB.</p>
    <p className="text-xs leading-5 text-muted">Supported checks: Philippine National ID, BIR/TIN photo ID (physical or digital), driver’s license, passport, UMID, PRC, Postal, SSS, GSIS, voter, senior citizen and PWD photo IDs. Include the complete front with its readable name, issuer and portrait. A tax form or a card without a usable portrait cannot be used for face comparison.</p>
    <input aria-label="Government photo ID" type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={disabled || busy} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-action file:px-3 file:py-2 file:font-semibold file:text-white" />
    {preview && <img src={preview} alt="ID selected for librarian review" className="max-h-48 w-full rounded-lg object-contain" />}
    {file && <button type="button" onClick={() => inspect()} disabled={disabled || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}{busy ? 'Checking ID…' : value ? 'Check ID again' : 'Check ID and read details'}</button>}
    {value && <div role="status" className="space-y-2 rounded-lg border border-line bg-panel p-3 text-sm"><p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 size={17} />{value.review_method === 'librarian_manual' ? 'Portrait checked — librarian review required' : `Readable ID detected: ${value.document_type.replaceAll('_', ' ')}`}</p><p className="text-muted">{value.message}</p><p className="text-muted">{value.review_method === 'librarian_manual' ? 'Check the name and address against the original ID before saving.' : 'Review and correct the suggested name and address before saving.'} No ID number is copied into the member record.</p></div>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {manualAllowed && !value && !manualOpen && <div className="space-y-2 rounded-lg border border-line bg-panel p-3 text-sm"><p className="text-muted">If the original photo ID is valid but its text cannot be read automatically, a librarian can inspect it in person. A readable portrait is still required.</p><button type="button" disabled={disabled || busy} onClick={() => setManualOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-action px-4 py-2 font-semibold text-white disabled:opacity-50"><ShieldCheck size={17} />Review original ID manually</button></div>}
    {manualAllowed && manualOpen && !value && <div className="space-y-3 rounded-lg border border-line bg-panel p-3 text-sm"><h4 className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} />Librarian review of original ID</h4><p className="leading-6 text-muted">The member must be present. Check the complete original ID, its issuer, name, validity and security features, and compare the portrait with the member. This does not approve a face scan or authenticate the issuing authority.</p><label className="block">Original ID type<select aria-label="Original ID type" value={documentType} disabled={disabled || busy} onChange={event => setDocumentType(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-subtle px-3 py-3"><option value="">Choose the ID presented</option>{idTypes.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block">Password to authorize manual ID review<input type="password" autoComplete="current-password" value={password} disabled={disabled || busy} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-subtle px-3 py-3" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || busy || !documentType || !password} onClick={() => inspect(true)} className="min-h-11 rounded-lg bg-action px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Checking portrait…' : 'Check portrait for manual review'}</button><button type="button" disabled={disabled || busy} onClick={() => { setManualOpen(false); setPassword(''); }} className="min-h-11 rounded-lg border border-line px-4 py-2">Cancel manual review</button></div><p className="text-xs leading-5 text-muted">After the portrait check, confirm the in-person inspection below to save. Online enrollment will still require matching ID portraits and a live face that passes the camera security checks.</p></div>}
  </section>;
}
