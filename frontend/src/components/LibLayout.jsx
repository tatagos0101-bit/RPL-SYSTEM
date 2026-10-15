import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/librarian';
import { getLibrarianShellClasses } from '../api/librarianShell';
import { STAFF_LIBRARIAN_NAV_LINKS } from '../api/librarianNavigation';
import { parseApiDateTime } from '../api/dateTime';
import {
  BookOpen, PlusSquare, Users,
  QrCode, FileText,
  Menu, X, ChevronRight, ShieldCheck,
  AlertTriangle, Bell, BookMarked, Settings,
} from 'lucide-react';

const NAV_ICONS = {
  home: <BookOpen size={18} />,
  inventory: <BookOpen size={18} />,
  'borrow-return': <BookMarked size={18} />,
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
  const location = useLocation();
  const navigate = useNavigate();

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
    const initialId = setTimeout(fetchNotifications, 0);
    const id = setInterval(fetchNotifications, 30_000);
    return () => {
      clearTimeout(initialId);
      clearInterval(id);
    };
  }, [fetchNotifications]);

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
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
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

  return (
    <div className="rpl-page min-h-screen flex flex-col bg-subtle font-sans transition-colors duration-300">

      {/* ── TOP NAVBAR ── */}
      <nav className="rpl-chrome rpl-header sticky top-0 z-40">

        {/* Left: Hamburger */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className={shellClasses.hamburger}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'} aria-expanded={sidebarOpen} aria-controls="staff-navigation"
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <button onClick={() => navigate('/librarian/home')} className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></button>

        {/* Notifications */}
        <div className="rpl-header-actions">
          {/* Notification Bell */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((v) => !v)}
              className="relative p-2 rounded-lg text-link text-muted hover:text-link hover:text-ink hover:bg-info-soft hover:bg-panel transition-all"
              aria-label="Notifications"
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
              <div className="fixed left-3 right-3 top-[var(--rpl-header-height)] sm:absolute sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-80 [overflow-wrap:anywhere] bg-panel border border-line rounded-xl shadow-sm z-[100] overflow-hidden">
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
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-link text-ink leading-snug">
                            {n.message}
                          </p>
                          <p className="text-sm font-semibold tracking-normal text-link text-muted mt-0.5">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkRead(n.id)}
                            className="flex-shrink-0 text-sm font-semibold tracking-normal text-link hover:text-link transition-colors mt-0.5"
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </nav>

      {/* ── OVERLAY ── */}
      <div
        className={shellClasses.overlay}
        onClick={close}
      />

      {/* ── SLIDE-IN SIDEBAR ── */}
      <aside
        id="staff-navigation" inert={!sidebarOpen} className={`rpl-drawer ${shellClasses.sidebar}`}
      >
        {/* Opaque navigation panel */}
        <div className="h-full bg-panel border-r border-line flex flex-col shadow-sm">

          {/* Sidebar Header */}
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <p className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
            <button
              onClick={close}
              className="p-2 text-link text-muted hover:text-link hover:text-ink hover:bg-info-soft hover:bg-panel rounded-lg transition-all"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          {/* Staff Badge */}
          <div className="px-5 py-4 border-b border-line">
            <div className="flex items-center gap-3 px-3 py-3 bg-info-soft bg-panel rounded-xl border border-line">
              <div className="w-10 h-10 bg-action rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-link text-ink text-sm truncate">Librarian</p>
                <p className="text-sm font-semibold tracking-normal text-link text-muted mt-0.5">
                  Authorized Staff
                </p>
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
            <p className="text-sm font-semibold tracking-normal text-link text-muted px-4 mb-3">
              Navigation
            </p>
            {STAFF_LIBRARIAN_NAV_LINKS.filter((link) => link.key !== 'settings').map((link, i) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  aria-current={active ? 'page' : undefined}
                  to={link.to}
                  onClick={close}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={`animate-slide-in-left group flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm tracking-normal transition-all duration-200 relative overflow-hidden ${
                    active
                      ? 'bg-action text-white shadow-sm '
                      : 'text-link text-muted hover:bg-info-soft hover:bg-panel hover:text-link hover:translate-x-1'
                  }`}
                >
                  {/* Active left bar */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-panel rounded-full" />
                  )}
                  <span className={`transition-transform duration-200 ${active ? 'text-white' : 'text-link text-muted group-hover:text-link group-hover:text-link'}`}>
                    {NAV_ICONS[link.key] || <BookOpen size={18} />}
                  </span>
                  <span className="flex-1">{link.label}</span>
                  <ChevronRight
                    size={12}
                    className={`transition-all duration-200 ${active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 group-hover:opacity-60 group-hover:translate-x-0'}`}
                  />
                </Link>
              );
            })}
          </nav>

          {/* Settings stays below the navigation divider. */}
          <div className="shrink-0 px-4 pb-6 border-t border-line pt-4">
            <Link
              to="/librarian/settings"
              onClick={close}
              aria-current={location.pathname === '/librarian/settings' ? 'page' : undefined}
              className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm tracking-normal transition-all duration-200 ${
                location.pathname === '/librarian/settings'
                  ? 'bg-action text-white shadow-sm '
                  : 'text-link text-muted hover:bg-info-soft hover:bg-panel hover:text-link'
              }`}
            >
              <Settings size={18} />
              <span className="flex-1">Settings</span>
              <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </aside>

      {/* ── PAGE CONTENT ── */}
      <main className={shellClasses.main}>
        <Outlet />
      </main>
    </div>
  );
};

export default LibLayout;
