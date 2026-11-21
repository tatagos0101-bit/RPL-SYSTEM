import { useEffect, useRef, useState } from 'react';
import { Clock3, RefreshCw, X } from 'lucide-react';
import ModalFrame from './ModalFrame';
import { accountNoticeStatus, accountNoticeTime, checkAccountActivity, getAccountNotices, getMemberAccountNotice, recordAccountReply, sendAccountNotice } from '../api/accountNotices';
import { NoticeDelivery } from './AccountNotice';
import '../styles/account-notices.css';

const failure = (error, fallback) => typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : fallback;

export default function AccountActivityReview({ user, onClose, onChanged, onDeleteNow, onApprove }) {
  const [revision, setRevision] = useState(0), [result, setResult] = useState({});
  const [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submitting = useRef(false), key = `${user.id}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    getMemberAccountNotice(user.id, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: failure(error, 'Account activity could not be loaded.') }); });
    return () => controller.abort();
  }, [key, user.id]);
  const current = result.key === key, data = current ? result.data : null, notice = data?.notice;
  const pending = notice && ['waiting', 'ready_for_review'].includes(notice.status);
  const close = () => { if (!submitting.current) onClose(); };
  const act = async send => {
    if (submitting.current || (send && !password)) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      if (send) await sendAccountNotice(user.id, password);
      else await recordAccountReply(notice.id);
      setPassword(''); setRevision(value => value + 1); onChanged();
    } catch (error) { setError(failure(error, send ? 'Sending the notice was not confirmed. Refresh before retrying.' : 'Recording the reply was not confirmed. Please try again.')); }
    finally { submitting.current = false; setBusy(false); }
  };
  const checkedUser = { ...user, active_loans: data ? (data.has_outstanding_loans ? Math.max(1, user.active_loans || 0) : 0) : user.active_loans };
  return <ModalFrame onClose={close} aria-label="Account activity review" className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 p-4">
    <section className="account-review-panel">
      <header className="account-notice-heading"><Clock3 size={22} aria-hidden="true" /><h2>Account activity review</h2><button className="account-notice-close" aria-label="Close account review" disabled={busy} onClick={close}><X size={20} /></button></header>
      <p><strong>{user.name}</strong> · {user.member_id}</p>
      <p className="account-notice-muted">After six months without recorded activity, members receive a friendly notice and three days to respond. Deletion always needs librarian approval.</p>
      {!current && <p role="status">Loading account activity…</p>}
      {current && result.error && <div role="alert"><p>{result.error}</p><button className="account-notice-button" onClick={() => setRevision(value => value + 1)}>Retry activity review</button></div>}
      {data && <>
        <dl className="account-notice-facts"><div><dt>Last recorded activity</dt><dd>{accountNoticeTime(data.last_activity_at)}{data.inactive_days != null && ` · ${data.inactive_days} days ago`}</dd></div><div><dt>Review status</dt><dd>{notice ? accountNoticeStatus(notice.status) : data.eligible ? 'Eligible for a three-day notice' : data.last_activity_at ? 'No inactivity notice needed' : 'Not enough dated history for automatic review'}</dd></div></dl>
        {data.has_outstanding_loans && <p role="alert" className="account-notice-warning">Return outstanding books before sending an inactivity notice or deleting this account.</p>}
        {notice && <section className="account-notice-message"><h3>{accountNoticeStatus(notice.status)}</h3><p>{notice.message}</p><p><strong>Reply deadline: {accountNoticeTime(notice.respond_by)} · Philippine time</strong></p><NoticeDelivery notice={notice} /></section>}
        {!pending && data.eligible && <form onSubmit={event => { event.preventDefault(); act(true); }} className="account-notice-form"><label>Your librarian password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} /></label><button className="account-notice-button account-notice-primary" disabled={busy || !password}>{busy ? 'Sending…' : 'Send three-day notice'}</button></form>}
        {pending && <div className="account-notice-actions"><button className="account-notice-button" disabled={busy} onClick={() => act(false)}>Record member reply</button>{notice.status === 'ready_for_review' && <button className="account-notice-button account-notice-primary" disabled={busy || data.has_outstanding_loans} onClick={() => onApprove(checkedUser, notice.id)}>Review deletion approval</button>}</div>}
      </>}
      {error && <p role="alert" className="text-danger">{error}</p>}
      <footer className="account-notice-actions account-notice-footer"><button className="account-notice-button" disabled={busy} onClick={close}>Close</button><button className="account-notice-button text-danger" disabled={busy} onClick={() => onDeleteNow(checkedUser)}>Delete account now</button></footer>
    </section>
  </ModalFrame>;
}

export function AccountNoticeQueue({ onReview, revision: parentRevision = 0 }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1), [status, setStatus] = useState('pending');
  const [revision, setRevision] = useState(0), [result, setResult] = useState({}), [checking, setChecking] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const running = useRef(false), key = `${status}:${page}:${revision}:${parentRevision}`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    getAccountNotices({ status, skip: (page - 1) * 20, limit: 20 }, controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, error: 'Account notices could not be loaded.' }); });
    return () => controller.abort();
  }, [open, key, status, page]);
  const check = async () => {
    if (running.current) return;
    running.current = true; setChecking(true); setError(''); setMessage('');
    try {
      const { data } = await checkAccountActivity();
      setMessage(`Activity checked. ${data.created || 0} new account notice${data.created === 1 ? '' : 's'} created.`);
      setOpen(true); setPage(1); setRevision(value => value + 1);
    } catch { setError('Activity check was not confirmed. Refresh notices before trying again.'); }
    finally { running.current = false; setChecking(false); }
  };
  const data = result.key === key ? result.data : null;
  return <section className="account-notice account-review-queue" aria-label="Inactive account review">
    <div className="account-notice-heading"><Clock3 size={22} aria-hidden="true" /><div><h2>Inactive account review</h2><p className="account-notice-muted">Six-month activity check · Three-day response window · Librarian approval</p></div><div className="account-notice-actions"><button className="account-notice-button" aria-expanded={open} onClick={() => { setOpen(value => !value); setRevision(value => value + 1); }}>{open ? 'Hide notices' : 'Review notices'}</button><button className="account-notice-button" disabled={checking} onClick={check}><RefreshCw size={15} className={checking ? 'animate-spin' : ''} />{checking ? 'Checking…' : 'Check activity'}</button></div></div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-danger">{error}</p>}
    {open && <>
      <label className="account-notice-filter">Notice status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="pending">Pending reviews</option><option value="ready_for_review">Ready for approval</option></select></label>
      {!data && result.key !== key && <p role="status">Loading account notices…</p>}
      {result.key === key && result.error && <div role="alert"><p>{result.error}</p><button className="account-notice-button" onClick={() => setRevision(value => value + 1)}>Retry notices</button></div>}
      {data && <><div className="account-notice-list">{data.items?.length ? data.items.map(notice => <article key={notice.id}><div><h3>{notice.member_name}</h3><p className="account-notice-muted">{accountNoticeStatus(notice.status)} · {accountNoticeTime(notice.respond_by)}</p><NoticeDelivery notice={notice} /></div><button className="account-notice-button" onClick={() => onReview({ id: notice.user_id, name: notice.member_name, member_id: notice.member_id, active_loans: notice.has_outstanding_loans ? 1 : 0 })}>Review {notice.member_name}</button></article>) : <p>No pending account notices in this view.</p>}</div><nav className="account-notice-actions" aria-label="Account notice pages"><span>{data.total} notices · Page {page}</span><button className="account-notice-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous notices</button><button className="account-notice-button" disabled={page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>Next notices</button></nav></>}
    </>}
  </section>;
}
