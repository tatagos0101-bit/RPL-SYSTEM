import { useState } from 'react';
import { updateProfile } from '../api/user';
import ContactVerification from './ContactVerification';

export default function EmailContact({ profile, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(profile.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { data } = await updateProfile({ email, current_password: password });
      setEditing(false);
      onUpdated(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not update your email. Check the address and try again.');
    } finally { setPassword(''); setBusy(false); }
  };
  return <div className="space-y-3">
    <p className="break-all text-ink">Email: {profile.email || 'Not set'}</p>
    {editing ? <form onSubmit={save} className="space-y-3 rounded-lg border border-line p-3">
      <label className="block text-ink">New email
        <input type="email" required maxLength={180} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-subtle p-3 text-ink" />
      </label>
      <label className="block text-ink">Current password to change email
        <input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}
          className="mt-2 w-full rounded-lg border border-line bg-subtle p-3 text-ink" />
      </label>
      <p className="text-sm text-muted">Verify the new address before using it for password recovery.</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex flex-wrap gap-4">
        <button disabled={busy} className="rounded-lg bg-action px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save email'}</button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setPassword(''); }} className="text-muted">Cancel</button>
      </div>
    </form> : <>
      <button type="button" className="text-sm font-semibold text-link" onClick={() => { setEmail(profile.email || ''); setError(''); setEditing(true); }}>Change email</button>
      <ContactVerification key={profile.email} channel="email" contact={profile.email} verified={profile.email_verified}
        onVerified={() => onUpdated({ ...profile, email_verified: true })} />
    </>}
  </div>;
}
