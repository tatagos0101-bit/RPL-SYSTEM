import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bell, CheckCheck } from 'lucide-react';
import { getNotification, listNotifications, readAllNotifications, readNotification } from '../api/notifications';
import { notificationBase, notificationContext, notificationHref, notifyNotificationsUpdated, NOTIFICATIONS_UPDATED } from '../api/notificationLinks';
import { parseApiDateTime } from '../api/dateTime';
import '../styles/notifications.css';
import AccountNotice from '../components/AccountNotice';

const pageSize = 20;
const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
const timestamp = value => {
  const date = parseApiDateTime(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : dateFormat.format(date);
};

export default function NotificationsPage({ role }) {
  const { notificationId } = useParams();
  const [search, setSearch] = useSearchParams();
  const page = Math.min(1000000, Math.max(1, Math.floor(Number(search.get('page')) || 1)));
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState({});
  const [marking, setMarking] = useState(false);
  const requestKey = `${role}:${notificationId || 'list'}:${page}:${revision}`;
  const current = result.key === requestKey;
  const data = current ? result.data : null;
  const base = notificationBase(role);

  useEffect(() => {
    const changed = event => { if (event.detail?.role === role && event.detail.source !== 'page') setRevision(value => value + 1); };
    window.addEventListener(NOTIFICATIONS_UPDATED, changed);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED, changed);
  }, [role]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = notificationId
          ? await getNotification(role, notificationId, controller.signal)
          : await listNotifications(role, { skip: (page - 1) * pageSize, limit: pageSize + 1 }, controller.signal);
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, data: response.data });
        if (notificationId && !response.data.is_read) {
          try {
            await readNotification(role, notificationId, controller.signal);
            if (controller.signal.aborted) return;
            setResult({ key: requestKey, data: { ...response.data, is_read: true } });
            notifyNotificationsUpdated(role, 'page');
          } catch {
            if (!controller.signal.aborted) setResult({ key: requestKey, data: response.data,
              readError: 'The message is open, but marking it as read was not confirmed.' });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key: requestKey,
          error: error.response?.status === 404 ? 'This notification is unavailable or does not belong to this account.' : 'Notifications could not be loaded. Please try again.' });
      }
    };
    load();
    return () => controller.abort();
  }, [role, notificationId, page, requestKey]);

  const markAll = async () => {
    setMarking(true);
    try {
      await readAllNotifications(role);
      notifyNotificationsUpdated(role, 'page');
      setResult(previous => previous.key === requestKey && Array.isArray(previous.data)
        ? { ...previous, data: previous.data.map(item => ({ ...item, is_read: true })), readError: '' } : previous);
    } catch {
      setResult(previous => previous.key === requestKey ? { ...previous, readError: 'Marking notifications as read was not confirmed. Please try again.' } : previous);
    } finally { setMarking(false); }
  };
  const context = notificationId && data ? notificationContext(data, role) : null;
  const items = Array.isArray(data) ? data.slice(0, pageSize) : [];

  return <div className={`notification-page ${role === 'librarian' ? 'staff-page' : ''}`}>
    <header className="notification-heading"><div><p className="notification-eyebrow">{role === 'librarian' ? 'Librarian workspace' : 'Member account'}</p><h1>Notifications</h1><p>Library updates and their full details.</p></div>
      {!notificationId && items.some(item => !item.is_read) && <button onClick={markAll} disabled={marking}><CheckCheck size={17} />{marking ? 'Saving…' : 'Mark all read'}</button>}</header>
    {notificationId && <Link className="notification-back" to={base}><ArrowLeft size={17} />All notifications</Link>}
    {!current && <p role="status" className="notification-empty">Loading notifications…</p>}
    {current && result.error && <div role="alert" className="notification-alert">{result.error}<button onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
    {current && result.readError && <div role="alert" className="notification-alert">{result.readError}<button disabled={marking} onClick={() => notificationId ? setRevision(value => value + 1) : markAll()}>Retry</button></div>}
    {context && <article className="notification-detail" aria-label="Notification details">
      <div className="notification-detail-meta"><span>{data.is_read ? 'Read' : 'Unread'}</span><time dateTime={data.created_at}>{timestamp(data.created_at)} · Philippine time</time></div>
      <h2>{context.title}</h2>
      {(data.book_title || data.member_name) && <dl>{data.book_title && <div><dt>Book</dt><dd>{data.book_title}</dd></div>}{role === 'librarian' && data.member_name && <div><dt>Member</dt><dd>{data.member_name}</dd></div>}</dl>}
      <p className="notification-message">{data.message}</p>
      {role === 'member' && data.type === 'account_inactivity' && <AccountNotice notificationId={notificationId} showResolved />}
      {context.to && <Link className="notification-related" to={context.to}>{context.label}<ArrowRight size={17} /></Link>}
    </article>}
    {!notificationId && current && !result.error && <>
      <div className="notification-list">{items.length ? items.map(item => <Link key={item.id} to={notificationHref(role, item.id)} className={`notification-item ${item.is_read ? '' : 'is-unread'}`}>
        <span className="notification-symbol"><Bell size={19} /></span><div><h2>{notificationContext(item, role).title}</h2><p>{item.message}</p><time dateTime={item.created_at}>{timestamp(item.created_at)}{!item.is_read && ' · Unread'}</time></div><ArrowRight size={18} aria-hidden="true" />
      </Link>) : <div className="notification-empty"><Bell size={30} /><p>{page > 1 ? 'No notifications on this page.' : 'No notifications yet.'}</p></div>}</div>
      <nav className="notification-paging" aria-label="Notification pages"><span>Page {page}</span><button disabled={page === 1} onClick={() => setSearch({ page: String(page - 1) })}>Previous page</button><button disabled={!Array.isArray(data) || data.length <= pageSize} onClick={() => setSearch({ page: String(page + 1) })}>Next page</button></nav>
    </>}
  </div>;
}
