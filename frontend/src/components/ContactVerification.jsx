import { useEffect, useRef, useState } from 'react';
import { requestContactCode, confirmContactCode } from '../api/user';

export default function ContactVerification({ channel, verified, contact, onVerified }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const label = 'email';

  if (verified) return <p className="px-3 text-sm text-success">Verified {label} · available for password recovery</p>;
  if (!contact) return <p className="px-3 text-sm text-muted">Add a {label} before verifying it for password recovery.</p>;

  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (sent) {
        await confirmContactCode(channel, code);
        setCode('');
        if (active.current) onVerified();
      } else {
        const { data } = await requestContactCode(channel, password);
        setSent(true);
        setMessage(data.message);
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Unable to verify. Please try again.');
    } finally {
      setPassword('');
      setBusy(false);
      pending.current = false;
    }
  };

  return (
    <div className="px-3 pb-3 text-sm">
      {!open ? <button type="button" onClick={() => setOpen(true)} className="font-semibold text-link">Verify {label} for password recovery</button> : (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-3">
          <p className="text-muted">{sent ? 'Enter the six-digit code sent to your saved contact.' : `Send a verification code to your saved ${label}. Confirm your current password first.`}</p>
          {sent ? <input aria-label={`${label} verification code`} type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
            required className="w-full rounded-lg border border-line bg-subtle p-3 text-ink" /> :
            <input aria-label={`Current password for ${label} verification`} type="password" autoComplete="current-password"
              value={password} onChange={event => setPassword(event.target.value)} required
              className="w-full rounded-lg border border-line bg-subtle p-3 text-ink" />}
          {message && <p role="status" className="text-muted">{message}</p>}
          {error && <p role="alert" className="text-danger">{error}</p>}
          <div className="flex flex-wrap gap-4">
            <button disabled={busy} className="rounded-lg bg-action px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : sent ? 'Confirm code' : 'Send code'}</button>
            {sent && <button type="button" disabled={busy} className="text-link" onClick={() => { setSent(false); setCode(''); setMessage('Wait at least one minute before sending another code.'); }}>Send another code</button>}
            <button type="button" disabled={busy} className="text-muted" onClick={() => { setOpen(false); setPassword(''); setCode(''); setError(''); }}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
}
