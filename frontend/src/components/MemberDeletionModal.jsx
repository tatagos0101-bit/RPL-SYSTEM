import { useRef, useState } from 'react';
import ModalFrame from './ModalFrame';
import { deleteMemberAccount, deleteMemberFace } from '../api/librarian';

export default function MemberDeletionModal({ user, kind, onClose, onSuccess }) {
  const account = kind === 'account';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const blocked = account && user.active_loans > 0;
  const title = account ? 'Delete Account' : 'Delete Face Data';
  const close = () => { if (!submitting.current) onClose(); };

  const submit = async event => {
    event.preventDefault();
    if (submitting.current || blocked || confirmation !== 'DELETE' || !password) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await (account ? deleteMemberAccount : deleteMemberFace)(user.id, password);
      setPassword('');
      setDone(true);
      onSuccess();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Deletion could not be confirmed. Refresh the member list before retrying.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <ModalFrame onClose={close} aria-label={title} className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-panel p-6">
        <h2 className="rpl-section-title font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm font-semibold text-ink">{user.name} · {user.member_id}</p>
        {done ? <>
          <p role="status" className="my-5 text-success">{account ? 'Account deleted. Completed history is retained without the member’s identity.' : 'Face data deleted. The member can enroll a new face.'}</p>
          <button onClick={close} className="rounded-lg bg-action px-4 py-3 text-white">Done</button>
        </> : <form onSubmit={submit}>
          <p className="my-4 text-sm text-muted">
            {account
              ? 'Permanently remove personal details, private ID/avatar uploads and face data, sign out the member, and cancel reservations. Completed loan and attendance history remains without their identity. This cannot be undone.'
              : 'Permanently remove all enrolled face templates and linked face snapshots, and sign out the member on all devices. Their account and library history remain. Password login remains available.'}
          </p>
          {blocked && <p role="alert" className="mb-4 text-danger">Return all outstanding books before deleting this account.</p>}
          {!blocked && <>
            <label className="block text-sm">Your librarian password
              <input type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={e => setPassword(e.target.value)}
                className="my-2 block w-full rounded-lg border border-line bg-panel p-3"/>
            </label>
            <label className="block text-sm">Type DELETE to confirm
              <input value={confirmation} required disabled={busy} autoComplete="off" onChange={e => setConfirmation(e.target.value)}
                className="my-2 block w-full rounded-lg border border-line bg-panel p-3"/>
            </label>
          </>}
          {error && <p role="alert" className="my-3 text-sm text-danger">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-line px-4 py-3">Cancel</button>
            {!blocked && <button type="submit" disabled={busy || confirmation !== 'DELETE' || !password}
              className="rounded-lg bg-red-700 px-4 py-3 text-white disabled:opacity-50">{busy ? 'Deleting…' : title}</button>}
          </div>
        </form>}
      </div>
    </ModalFrame>
  );
}
