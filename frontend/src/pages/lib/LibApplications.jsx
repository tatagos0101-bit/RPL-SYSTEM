import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ModalFrame from '../../components/ModalFrame';
import { getApplications, reviewApplication } from '../../api/libraryWorkflows';
import { errorMessage } from '../../api/inventoryWrites';
import { parseApiDateTime } from '../../api/dateTime';

const RegisterMemberModal = lazy(() => import('./LibUsers').then(module => ({ default: module.RegisterMemberModal })));
const button = 'min-h-11 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-subtle disabled:opacity-50';
const control = 'mt-1 w-full rounded-lg border border-line bg-subtle px-3 py-3 text-base text-ink';
export default function LibApplications() {
  const [status, setStatus] = useState('pending'), [page, setPage] = useState(0), [data, setData] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [registration, setRegistration] = useState(null), [rejection, setRejection] = useState(null);
  const [reason, setReason] = useState('incomplete_details'), [notes, setNotes] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setData(null);
    getApplications({ status, skip: page * 25, limit: 25 }, controller.signal)
      .then(({ data: next }) => { if (!controller.signal.aborted) setData(next); })
      .catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)); });
    return () => controller.abort();
  }, [status, page, revision]);
  async function reject(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await reviewApplication(rejection.id, { decision: 'reject', reason, notes: notes.trim() || null }); setRejection(null); }
    catch (failure) { setError(`${errorMessage(failure)} Refresh the status before retrying if the outcome is uncertain.`); }
    finally { setBusy(false); setRevision(value => value + 1); }
  }
  return <main className="rpl-page min-h-screen px-4 py-8 text-ink sm:px-8"><div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-link">Librarian Terminal</p><h1 className="text-3xl font-semibold">Membership applications</h1></div><Link className={button} to="/librarian/users">Registered members</Link></div>
    <p className="mb-6 max-w-3xl text-sm text-muted">An application receipt is not a member account. When the applicant visits the library, inspect their original government photo ID and complete in-person registration to approve the application.</p>
    <label className="mb-6 block max-w-xs text-sm font-semibold">Application status<select aria-label="Application status" className={control} value={status} onChange={event => { setStatus(event.target.value); setPage(0); setError(''); }}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
    {error && <p role="alert" className="mb-4 rounded-lg bg-danger-soft p-3 text-danger">{error}</p>}
    {!data ? <p role="status">Loading applications...</p> : <><p className="mb-4 text-sm text-muted">{data.total} applications ? Page {page + 1}</p><div className="grid gap-4 lg:grid-cols-2">{data.items.map(row => <article key={row.id} className="min-w-0 space-y-3 rounded-xl border border-line bg-panel p-5"><h2 className="text-xl font-semibold">{row.name}</h2><p className="break-all text-sm text-muted">{row.receipt}</p><p className="break-words text-sm">{row.location}</p><p className="break-all text-sm">{row.email || 'No email - librarian handoff'}</p><p className="text-sm text-muted">Submitted {parseApiDateTime(row.submitted_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>{row.review_reason && <p className="text-sm">Review: {row.review_reason.replaceAll('_', ' ')}{row.review_notes && ` - ${row.review_notes}`}</p>}{row.status === 'pending' && <div className="flex flex-wrap gap-3"><button className={`${button} bg-action text-white`} onClick={() => { setRegistration(row); setError(''); }}>Register applicant in person</button><button className={button} onClick={() => { setRejection(row); setReason('incomplete_details'); setNotes(''); setError(''); }}>Reject application</button></div>}</article>)}</div>{!data.total && <p className="rounded-xl border border-line p-6 text-muted">No {status} applications.</p>}<nav className="mt-6 flex flex-wrap gap-3" aria-label="Application pages"><button className={button} disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous page</button><button className={button} disabled={(page + 1) * 25 >= data.total} onClick={() => setPage(value => value + 1)}>Next page</button><button className={button} onClick={() => { setError(''); setRevision(value => value + 1); }}>Refresh</button></nav></>}
    {registration && <Suspense fallback={<p role="status">Opening registration...</p>}><RegisterMemberModal application={registration} onClose={() => setRegistration(null)} onSuccess={() => setRevision(value => value + 1)} /></Suspense>}
    {rejection && <ModalFrame onClose={() => { if (!busy) setRejection(null); }} aria-label="Reject membership application" className="flex items-center justify-center bg-black/60 p-4"><section className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-line bg-panel p-5 text-ink sm:p-7"><div className="flex justify-between gap-4"><h2 className="text-2xl font-semibold">Review {rejection.name}</h2><button type="button" className={button} disabled={busy} onClick={() => setRejection(null)}>Close</button></div><form onSubmit={reject} className="space-y-4"><label className="block text-sm">Review reason<select aria-label="Review reason" className={control} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}>{[['incomplete_details', 'Incomplete details'], ['duplicate', 'Duplicate application / account'], ['ineligible', 'Not eligible'], ['other', 'Other']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block text-sm">Review notes (optional)<textarea className={control} rows="3" maxLength="1000" value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} /></label>{error && <p role="alert" className="text-danger">{error}</p>}<button disabled={busy} className={`${button} bg-action text-white`}>{busy ? 'Saving...' : 'Confirm rejection'}</button></form></section></ModalFrame>}
  </main>;
}
