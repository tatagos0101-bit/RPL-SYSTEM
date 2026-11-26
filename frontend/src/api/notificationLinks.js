export const NOTIFICATIONS_UPDATED = 'rpl:notifications-updated';

export function notificationBase(role) {
  if (role === 'member') return '/user/notifications';
  if (role === 'librarian') return '/librarian/notifications';
  throw new Error('Unsupported notification role');
}

export function notificationHref(role, id) {
  const base = notificationBase(role);
  return /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id)) ? `${base}/${id}` : base;
}

export function notificationContext(notification, role) {
  notificationBase(role);
  const staff = role === 'librarian';
  if (notification.type === 'account_inactivity') {
    return { title: 'A friendly membership check-in', to: staff ? '/librarian/users' : '/user/profile', label: staff ? 'Review member accounts' : 'Review my account notice' };
  }
  if (['reservation', 'reservation_ready'].includes(notification.type)) {
    return { title: notification.type === 'reservation_ready' ? 'Reservation ready for pickup' : 'Reservation update',
      to: staff ? '/librarian/reservations' : '/user/reservations', label: staff ? 'Open reservations' : 'Open My Reservations' };
  }
  if (notification.type === 'report') {
    return { title: 'Loan issue reported', to: staff ? '/librarian/borrow-return' : '/user/home',
      label: staff ? 'Open Borrow / Return' : 'View my borrowed books' };
  }
  if (['overdue_email_sent', 'overdue_email_unknown'].includes(notification.type)) {
    return { title: 'Overdue book reminder', to: staff ? '/librarian/due-books' : '/user/home#borrowed-books',
      label: staff ? 'Open Due Books' : 'View my borrowed books' };
  }
  return { title: 'Library notification' };
}

export function notifyNotificationsUpdated(role, source = 'header') {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED, { detail: { role, source } }));
}
