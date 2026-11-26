import { useCallback, useEffect, useState } from 'react';
import ModalFrame from './ModalFrame';
import BorrowingTerms from './BorrowingTerms';
import { accountReasons, getAccountability, recordAccountAction } from '../api/libraryWorkflows';
import { errorMessage } from '../api/inventoryWrites';
import { parseApiDateTime } from '../api/dateTime';

const button = 'min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-subtle disabled:opacity-50';
const control = 'mt-1 w-full rounded-lg border border-line bg-panel p-3 text-base text-ink';
const date = value => value ? parseApiDateTime(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : '—';
export function AccountabilityContent({ memberId, librarian = false, onChanged, onBusyChange }) {
  const [data, setData] = useState(null), [skip, setSkip] = useState(0), [revision, setRevision] = useState(0);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [action, setAction] = useState('warning'), [reason, setReason] = useState('librarian_review'), [notes, setNotes] = useState(''), [approved, setApproved] = useState(false);
  const load = useCallback(signal => getAccountability(librarian ? memberId : null, skip, signal).then(({ data: next }) => { if (!signal.aborted) setData(next); }).catch(failure => { if (!signal.aborted) setError(errorMessage(failure)); }), [librarian, memberId, skip]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort(); }, [load, revision]);
  async function submit(event) {
    event.preventDefault(); if (busy || !approved) return;
    setBusy(true); setError(''); setNotice('');
    onBusyChange?.(true);
    try { await recordAccountAction(memberId, { action, reason, notes: notes.trim() || null }); setApproved(false); setNotes(''); setNotice('Librarian decision recorded.'); setRevision(value => value + 1); onChanged?.(); }
    catch (failure) { setError(errorMessage(failure)); setRevision(value => value + 1); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <div className="space-y-5">
    {error && <p role="alert" className="text-sm text-danger">{error} <button type="button" className="underline" onClick={() => { setError(''); setRevision(value => value + 1); }}>Reload records</button></p>}
    {notice && <p role="status" className="text-success">{notice}</p>}
    {!data ? <p role="status">{error ? 'Borrowing records are unavailable.' : 'Loading borrowing records…'}</p> : <>
      <p className="text-sm font-semibold">Account: <span className={data.status === 'active' ? 'text-success' : 'text-danger'}>{data.is_blacklisted ? 'Blacklisted' : data.status}</span></p>
      <p className="rounded-xl bg-subtle p-4 text-sm"><strong>{data.current_overdue}</strong> currently overdue · <strong>{data.total}</strong> loan records with late returns, damage, loss or assessed charges.</p>
      <p className="text-sm text-muted">{data.note}</p>
      <p className="rounded-xl border border-line p-4 text-sm font-semibold text-link">Current overdue fines: PHP {Number(data.current_overdue_fine || 0).toFixed(2)}. Calculated per completed overdue day until return or closure.</p>
      {data.records.map(row => <article key={row.transaction_id} className="space-y-2 rounded-xl border border-line p-4 text-sm"><h3 className="text-base font-semibold">{row.title}</h3><p className="break-all text-muted">Loan #{row.transaction_id} · {row.copy_qr || 'Legacy copy'}</p><p>Borrowed {date(row.borrow_date)} · Due {date(row.due_date)} · {row.condition === 'lost' ? 'Reported lost' : 'Returned'} {date(row.return_date)}</p><p>Condition: {row.condition || 'Not recorded'} · Remark: {row.remark?.replaceAll('_', ' ') || 'Not recorded'}</p>{row.notes && <p className="whitespace-pre-wrap break-words">{row.notes}</p>}<p className="font-semibold text-link">{row.is_outstanding ? "Current late fee" : "Assessed charges"}: PHP {Number(row.is_outstanding ? row.current_late_fee : row.assessed_charges).toFixed(2)}</p>{row.inspected_by_id && <p className="text-muted">Recorded by librarian #{row.inspected_by_id} · {date(row.inspected_at)}</p>}</article>)}
      {!data.total && <p className="text-sm text-muted">No accountability issues recorded.</p>}
      <nav className="flex flex-wrap gap-3" aria-label="Accountability record pages"><button className={button} disabled={skip === 0} onClick={() => setSkip(value => Math.max(0, value - 25))}>Previous records</button><button className={button} disabled={skip + 25 >= data.total} onClick={() => setSkip(value => value + 25)}>Next records</button></nav>
      {data.actions.length > 0 && <section className="space-y-3 border-t border-line pt-5"><h3 className="text-lg font-semibold">Account review history</h3><p className="text-xs text-muted">Showing the latest {data.actions.length} of {data.actions_total} recorded actions.</p>{data.actions.map(item => <div key={item.id} className="rounded-lg bg-subtle p-3 text-sm"><p className="font-semibold">{item.action} · {accountReasons[item.reason] || item.reason}</p>{item.notes && <p className="mt-1 whitespace-pre-wrap break-words">{item.notes}</p>}<p className="mt-1 text-muted">Librarian #{item.actor_id} · {date(item.created_at)}</p></div>)}</section>}
    </>}
    {librarian && data && <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-subtle p-4"><h3 className="text-lg font-semibold">Librarian-approved action</h3><p className="text-sm text-muted">Fees do not automatically restrict an account. Reactivation removes suspension and blacklisting; overdue-book rules still apply.</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Action<select aria-label="Action" className={control} value={action} disabled={busy} onChange={event => { setAction(event.target.value); setApproved(false); }}><option value="warning">Send account warning</option><option value="suspend">Suspend account</option><option value="blacklist">Blacklist account</option><option value="reactivate">Reactivate account</option></select></label><label className="text-sm font-medium">Reason<select aria-label="Reason" className={control} value={reason} disabled={busy} onChange={event => { setReason(event.target.value); setApproved(false); }}>{Object.entries(accountReasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><label className="block text-sm font-medium">Note for the member (optional)<textarea rows="3" maxLength="1000" className={control} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} /></label><label className="flex items-start gap-3 text-sm"><input required type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)} />I reviewed the member’s records and approve this action.</label><button className={button + ' bg-action text-white'} disabled={busy || !approved}>{busy ? 'Recording…' : 'Confirm account action'}</button></form>}
    {!librarian && <details className="rounded-xl border border-line p-4"><summary className="cursor-pointer font-semibold text-link">Borrower terms and conditions</summary><div className="mt-4"><BorrowingTerms /></div></details>}
  </div>;
}
export function AccountabilityDisclosure() {
  const [open, setOpen] = useState(false);
  return <details className="rounded-xl border border-line bg-panel p-5" onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-lg font-semibold text-link">Borrowing record, charges and terms</summary>{open && <div className="mt-5"><AccountabilityContent /></div>}</details>;
}
export default function MemberAccountability({ user, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) onClose(); };
  return <ModalFrame onClose={close} aria-label="Borrower accountability and restrictions" className="flex items-center justify-center bg-black/60 p-3 sm:p-5"><section className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-panel p-5 text-ink sm:p-7"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-sm text-muted">Borrowing record and restrictions</p><h2 className="text-2xl font-semibold">{user.name}</h2><p className="text-sm text-link">{user.member_id}</p></div><button className={button} onClick={close} disabled={busy}>Close</button></div><AccountabilityContent memberId={user.id} librarian onChanged={onChanged} onBusyChange={setBusy} /></section></ModalFrame>;
}
