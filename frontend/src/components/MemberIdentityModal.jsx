import { useState } from 'react';
import ModalFrame from './ModalFrame';
import VerifiedIdUpload from './VerifiedIdUpload';
import { appendIdentityReview, identityError, verifyMemberIdentity } from '../api/identity';

export default function MemberIdentityModal({ user, onClose, onSuccess }) {
  const [document, setDocument] = useState(null), [checked, setChecked] = useState(false);
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  async function save(event) {
    event.preventDefault(); if (busy || !document || !checked) return;
    setBusy(true); setError('');
    try {
      const body = appendIdentityReview(new FormData(), document, checked);
      body.set('current_password', password);
      await verifyMemberIdentity(user.id, body); setPassword(''); setDocument(null); setDone(true); onSuccess();
    } catch (failure) { setError(identityError(failure)); } finally { setBusy(false); }
  }
  return <ModalFrame onClose={() => { if (!busy) onClose(); }} aria-label="Verify member identity" className="flex items-center justify-center bg-black/70 p-4"><section className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-line bg-panel p-5 text-ink sm:p-7"><div className="flex items-start justify-between gap-4"><h2 className="text-2xl font-semibold">Verify member ID in person</h2><button disabled={busy} onClick={onClose} className="rounded-lg border border-line px-3 py-2">Close</button></div><p className="font-semibold">{user.name} · {user.member_id}</p>
    {done ? <p role="status" className="text-success">ID verified. The member can now enroll their face online from Profile.</p> : <form onSubmit={save} className="space-y-4"><p className="text-sm text-muted">This enables online face enrollment. It does not change the member’s verified name or enroll a facial template.</p><VerifiedIdUpload value={document} onChange={value => { setDocument(value); setChecked(false); }} disabled={busy} /><label className="flex items-start gap-3 text-sm"><input required type="checkbox" checked={checked} disabled={busy || !document} onChange={event => setChecked(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" />I inspected the original ID and its validity/security features, compared its portrait with the member present, and confirmed it matches this account’s name.</label><label className="block text-sm">Your librarian password<input required type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-line bg-subtle px-4 py-3" /></label>{error && <p role="alert" className="text-sm text-danger">{error}</p>}<button disabled={busy || !document || !checked} className="rounded-lg bg-action px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Confirm ID verification'}</button></form>}
  </section></ModalFrame>;
}
