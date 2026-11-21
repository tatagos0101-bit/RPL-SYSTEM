import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/librarian';
import { getLibrarianShellClasses } from '../api/librarianShell';
import { STAFF_LIBRARIAN_NAV_LINKS } from '../api/librarianNavigation';
import { parseApiDateTime } from '../api/dateTime';
import { isPasswordChangePath } from '../api/authRoutes';
import { notificationHref, notifyNotificationsUpdated, NOTIFICATIONS_UPDATED } from '../api/notificationLinks';
import {
  BookOpen, PlusSquare, Users, LayoutDashboard, ArrowLeftRight,
  QrCode, FileText,
  Menu, X, ChevronRight, ShieldCheck,
  AlertTriangle, Bell, BookMarked, Settings,
} from 'lucide-react';

const NAV_ICONS = {
  home: <LayoutDashboard size={18} />,
  inventory: <BookOpen size={18} />,
  'borrow-return': <ArrowLeftRight size={18} />,
  reservations: <BookMarked size={18} />,
  'due-books': <AlertTriangle size={18} />,
  reports: <FileText size={18} />,
  users: <Users size={18} />,
  'add-book': <PlusSquare size={18} />,
  'qr-bulk': <QrCode size={18} />,
  'public-catalog': <BookOpen size={18} />,
};

const LibLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const bellRef = useRef(null);
  const headerRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const changingPassword = isPasswordChangePath(location.pathname);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const shellClasses = getLibrarianShellClasses(sidebarOpen);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await getNotifications();
      setNotifications(res.data);
    } catch {
      // silently fail — don't interrupt the UI
    }
  }, []);

  useEffect(() => {
    const changed = event => { if (event.detail?.role === 'librarian' && !changingPassword) fetchNotifications(); };
    window.addEventListener(NOTIFICATIONS_UPDATED, changed);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED, changed);
  }, [fetchNotifications, changingPassword]);

  useEffect(() => {
    if (changingPassword) return;
    const initialId = setTimeout(fetchNotifications, 0);
    const id = setInterval(fetchNotifications, 30_000);
    return () => {
      clearTimeout(initialId);
      clearInterval(id);
    };
  }, [fetchNotifications, changingPassword]);

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    updateNow();
    const id = setInterval(updateNow, 60_000);
    return () => clearInterval(id);
  }, []);

  // Close bell dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkRead = async (id) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    notifyNotificationsUpdated('librarian');
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    notifyNotificationsUpdated('librarian');
  };

  const timeAgo = (isoStr) => {
    const parsed = parseApiDateTime(isoStr).getTime();
    const baseMs = nowMs || parsed;
    const diff = baseMs - parsed;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const close = () => setSidebarOpen(false);

  useEffect(() => {
    const header = headerRef.current;
    const measureHeader = () => header.style.setProperty('--staff-header-measured-height', `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measureHeader);
    observer.observe(header);
    measureHeader();
    return () => observer.disconnect();
  }, []);

  const labels = { home: 'Dashboard', reports: 'Reports & Analytics' };
  const currentLink = STAFF_LIBRARIAN_NAV_LINKS.find(link => link.to === location.pathname);
  const pageTitle = currentLink ? labels[currentLink.key] || currentLink.label : 'Librarian workspace';
  const navGroups = [
    ['Workspace', ['home', 'inventory', 'users']],
    ['Circulation', ['borrow-return', 'reservations', 'due-books']],
    ['Library management', ['reports', 'add-book', 'qr-bulk', 'public-catalog']],
  ];

  return (
    <div className="rpl-staff min-h-screen">
      <nav ref={headerRef} className="staff-header" aria-label="Workspace header">
        <div className="staff-header-leading">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className={`staff-menu-toggle ${shellClasses.hamburger}`}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'} aria-expanded={sidebarOpen} aria-controls="staff-navigation"
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <p className="staff-route-title">{pageTitle}</p>
        </div>
        <button onClick={() => navigate('/librarian/home')} className="staff-header-brand"><img src="/RPL.png" alt="" /><span>Rizal Provincial Library</span></button>
        {/* Notifications */}
        <div className="rpl-header-actions">
          {/* Notification Bell */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((v) => !v)}
              className="staff-notification-button"
              aria-label="Notifications" aria-expanded={bellOpen} aria-controls="staff-notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-700 text-white text-sm font-semibold rounded-full flex items-center justify-center px-0.5 leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Panel */}
            {bellOpen && (
              <div id="staff-notifications" className="staff-notifications fixed left-3 right-3 top-[var(--rpl-header-height)] sm:absolute sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-80 [overflow-wrap:anywhere] bg-panel border border-line rounded-xl shadow-sm z-[100] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                  <p className="font-semibold text-sm tracking-normal text-link text-ink">
                    Notifications {unreadCount > 0 && <span className="text-danger">({unreadCount})</span>}
                  </p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-sm font-semibold tracking-normal text-link hover:text-link transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell size={24} className="mx-auto mb-2 text-link text-muted" />
                      <p className="text-sm font-semibold tracking-normal text-link text-muted">
                        No notifications
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-line border-line last:border-0 flex items-start gap-3 transition-colors ${
                          n.is_read
                            ? 'bg-transparent'
                            : 'bg-info-soft bg-info-soft'
                        }`}
                      >
                        {/* Dot indicator */}
                        <div className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-blue-500'}`} />
                        <Link to={notificationHref('librarian', n.id)} onClick={() => setBellOpen(false)} className="group flex-1 min-w-0">
                          <p className="text-sm text-link leading-snug group-hover:underline group-focus-visible:underline">
                            {n.message}
                          </p>
                          <p className="text-sm font-normal text-muted mt-0.5">
                            {timeAgo(n.created_at)}
                          </p>
                        </Link>
                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkRead(n.id)}
                            aria-label="Mark notification as read"
                            className="flex-shrink-0 text-sm font-semibold tracking-normal text-link hover:text-link transition-colors mt-0.5"
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <Link to="/librarian/notifications" onClick={() => setBellOpen(false)} className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-link">View all notifications</Link>
              </div>
            )}
          </div>

        </div>
      </nav>

      <div className={`staff-overlay ${shellClasses.overlay}`} onClick={close} />
      <aside id="staff-navigation" aria-label="Librarian navigation" inert={!sidebarOpen} className={`rpl-drawer staff-sidebar ${shellClasses.sidebar}`}>
        <div className="staff-sidebar-inner">
          <div className="staff-sidebar-brand">
            <p><img src="/RPL.png" alt="" /><span>Rizal Provincial<br />Library</span></p>
            <button onClick={close} className="staff-drawer-close" aria-label="Close menu"><X size={20} /></button>
          </div>
          <nav className="staff-navigation" aria-label="Librarian pages">
            {navGroups.map(([group, keys]) => <div className="staff-nav-group" key={group}>
              <p className="staff-nav-label">{group}</p>
              {keys.map(key => STAFF_LIBRARIAN_NAV_LINKS.find(link => link.key === key)).map(link => {
                const active = location.pathname === link.to;
                return <Link key={link.to} aria-current={active ? 'page' : undefined} to={link.to} onClick={close} className={`staff-nav-link ${active ? 'is-active' : ''}`}>
                  <span aria-hidden="true">{NAV_ICONS[link.key] || <BookOpen size={18} />}</span>
                  <span>{labels[link.key] || link.label}</span>
                  {active && <ChevronRight size={13} aria-hidden="true" />}
                </Link>;
              })}
            </div>)}
          </nav>
          <div className="staff-sidebar-bottom">
            <Link to="/librarian/settings" onClick={close} aria-current={location.pathname === '/librarian/settings' ? 'page' : undefined} className={`staff-nav-link ${location.pathname === '/librarian/settings' ? 'is-active' : ''}`}><Settings size={18} aria-hidden="true" /><span>Settings</span></Link>
            <div className="staff-identity"><span><ShieldCheck size={19} aria-hidden="true" /></span><p>Librarian<small>Authorized Staff</small></p></div>
          </div>
        </div>
      </aside>
      <main className={`staff-main ${shellClasses.main}`}><Outlet /></main>
    </div>
  );
};

export default LibLayout;
