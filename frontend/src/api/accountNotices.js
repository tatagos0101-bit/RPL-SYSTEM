import client from './client';
import { parseApiDateTime } from './dateTime';

export const getAccountNotices = (params, signal) => client.get('/api/librarian/account-notices', { params, signal });
export const getMemberAccountNotice = (id, signal) => client.get(`/api/librarian/member/${id}/account-notice`, { signal });
export const sendAccountNotice = (id, password) => client.post(`/api/librarian/member/${id}/account-notice`, { current_password: password });
export const checkAccountActivity = () => client.post('/api/librarian/account-notices/check', {});
export const recordAccountReply = id => client.post(`/api/librarian/account-notices/${id}/record-reply`, {});
export const approveAccountDeletion = (id, password) => client.post(`/api/librarian/account-notices/${id}/approve`, { current_password: password });
export const getMyAccountNotice = signal => client.get('/api/user/account-notice', { signal });
export const keepMyAccount = id => client.post(`/api/user/account-notices/${id}/keep`, {});
export const ACCOUNT_NOTICE_UPDATED = 'rpl:account-notice-updated';
export const notifyAccountNoticeUpdated = source => window.dispatchEvent(new CustomEvent(ACCOUNT_NOTICE_UPDATED, { detail: { source } }));

const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
export function accountNoticeTime(value) {
  if (!value) return 'Not recorded';
  const date = parseApiDateTime(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : dateFormat.format(date);
}
export const accountNoticeStatus = status => ({ waiting: 'Waiting for member response', ready_for_review: 'Ready for librarian approval', cancelled: 'Account kept active', deleted: 'Account deleted' })[status] || 'Account review';
