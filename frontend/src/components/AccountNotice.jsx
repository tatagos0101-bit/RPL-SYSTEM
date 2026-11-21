import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { ACCOUNT_NOTICE_UPDATED, accountNoticeStatus, accountNoticeTime, getMyAccountNotice, keepMyAccount, notifyAccountNoticeUpdated } from '../api/accountNotices';
import '../styles/account-notices.css';

export function NoticeDelivery({ notice }) {
  const channel = notice.delivery_channel === 'email' ? 'Email' : notice.delivery_channel === 'sms' ? 'SMS' : 'In-account notice';
  return <p className="account-notice-muted">{notice.delivery_status === 'accepted'
    ? `${channel} accepted by the provider. Inbox delivery is not confirmed.`
    : notice.delivery_status === 'in_app' ? 'Notice available inside the member’s account.'
      : `${channel} ${notice.delivery_status === 'pending' ? 'is pending' : 'delivery is unconfirmed'}. The notice is available inside the member’s account.`}</p>;
}

export default function AccountNotice({ notificationId, showResolved = false }) {
  const instance = useId();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [respondedTo, setRespondedTo] = useState(null);
  const submitting = useRef(false);
  const key = String(revision);
  useEffect(() => {
    const refresh = event => { if (event.detail?.source !== instance) setRevision(value => value + 1); };
    window.addEventListener(ACCOUNT_NOTICE_UPDATED, refresh);
    return () => window.removeEventListener(ACCOUNT_NOTICE_UPDATED, refresh);
  }, [instance]);
  useEffect(() => {
    const controller = new AbortController();
    getMyAccountNotice(controller.signal).then(({ data }) => {
      if (!controller.signal.aborted) setResult({ key, notice: data?.notice || null });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, failed: true }); });
    return () => controller.abort();
  }, [key]);
  const notice = result.key === key ? result.notice : null;
  const respond = async () => {
    if (!notice || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const { data } = await keepMyAccount(notice.id);
      setResult({ key, notice: data });
      setRespondedTo(data.id);
      notifyAccountNoticeUpdated(instance);
    } catch { setError('Keeping your account was not confirmed. Please try again or contact the library.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  if (result.key !== key) return notificationId ? <p role="status">Loading account notice…</p> : null;
  if (result.failed) return <section className="account-notice"><p role="alert">Account notice status could not be loaded.</p><button className="account-notice-button" onClick={() => setRevision(value => value + 1)}>Retry account notice</button></section>;
  if (!notice || (notificationId && String(notice.notification_id) !== String(notificationId))) return notificationId ? <p className="account-notice-muted">This message is not the current account review. Your profile shows any current notice.</p> : null;
  const pending = ['waiting', 'ready_for_review'].includes(notice.status);
  if (!pending && !showResolved && respondedTo !== notice.id) return null;
  return <section className="account-notice" aria-label="Membership check-in">
    <div className="account-notice-heading">{pending ? <Clock3 size={22} aria-hidden="true" /> : <CheckCircle2 size={22} aria-hidden="true" />}<h2>{pending ? 'We’d love to welcome you back' : accountNoticeStatus(notice.status)}</h2></div>
    {pending ? <>
      {!notificationId && <p>{notice.message}</p>}
      <p><strong>Please respond by {accountNoticeTime(notice.respond_by)} · Philippine time.</strong></p>
      <p className="account-notice-muted">Keeping your account stops this deletion review. You can also contact the librarian.</p>
      <button className="account-notice-button account-notice-primary" disabled={busy} onClick={respond}>{busy ? 'Saving…' : 'Keep my account'}</button>
    </> : <p role="status">{notice.status === 'cancelled' ? 'Your response or recent activity has stopped this deletion review. We look forward to seeing you at the library.' : 'This account review has ended.'}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
  </section>;
}
