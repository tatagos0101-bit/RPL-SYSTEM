import FineContent from './FineContent';
import { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth } from '../api/auth';
import { isPasswordChangePath } from '../api/authRoutes';
import { getNotifications, markNotificationRead, markAllNotificationsRead, getFines } from '../api/user';
import { parseApiDateTime } from '../api/dateTime';
import {
  LayoutDashboard, BookOpen, Bookmark, User,
  LogOut, Menu, X, ChevronRight, Sun, Moon,
  Bell, AlertTriangle, BookMarked, CheckCheck,
} from 'lucide-react';

const NAV_LINKS = [
  { to: '/user/home',         icon: <LayoutDashboard size={18} />, label: 'Dashboard'       },
  { to: '/user/browse',       icon: <BookOpen size={18} />,        label: 'Browse Books'    },
  { to: '/user/reservations', icon: <Bookmark size={18} />,        label: 'My Reservations' },
  { to: '/user/profile',      icon: <User size={18} />,            label: 'Profile'         },
];

const NOTIF_ICONS = {
  reservation_ready: <BookMarked size={14} className="text-link" />,
  default:           <Bell size={14} className="text-muted" />,
};

const timeAgo = (dateStr) => {
  const diff = Date.now() - parseApiDateTime(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const UserLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  );
  const [notifOpen, setNotifOpen]     = useState(false);
  const [notifs, setNotifs]           = useState([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [headerError, setHeaderError] = useState('');
  const [headerVersion, setHeaderVersion] = useState(0);
  const notifRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const changingPassword = isPasswordChangePath(location.pathname);

  // Restricted sessions may only retrieve their profile or change their password.
  useEffect(() => {
    if (changingPassword) return;
    let cancelled = false;
    Promise.allSettled([
      getNotifications().then(r => { if (!cancelled) setNotifs(r.data); }),
      getFines().then(r => { if (!cancelled) setOverdueCount(r.data.overdue_loans?.length || 0); }),
    ]).then(results => {
      if (!cancelled) setHeaderError(results.some(result => result.status === 'rejected') ? 'Notifications or overdue status could not be loaded.' : '');
    });
    return () => { cancelled = true; };
  }, [changingPassword, headerVersion]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifs.filter((n) => !n.is_read).length;

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setHeaderError('');
    } catch { setHeaderError('Notification update was not confirmed. Reload and try again.'); }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setHeaderError('');
    } catch { setHeaderError('Notification update was not confirmed. Reload and try again.'); }
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await clearAuth();
      navigate('/user/login');
    } catch {
      setLogoutError('Sign out could not be confirmed. Please try Sign out again.');
    }
  };

  const close = () => setSidebarOpen(false);

  return (
    <div className="rpl-page min-h-screen flex flex-col bg-subtle font-sans transition-colors duration-300">
      {logoutError && <p role="alert" className="p-3 bg-panel text-danger">{logoutError}</p>}
      {headerError && <p role="alert" className="p-3 bg-panel text-danger">{headerError} <button className="underline" onClick={() => setHeaderVersion(value => value + 1)}>Retry loading</button></p>}

      {/* ── TOP BAR (always visible, theme-aware) ── */}
      <header className="rpl-chrome rpl-header sticky top-0 z-40">

        {/* Left: Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-muted hover:text-ink hover:bg-panel rounded-lg transition-all"
          aria-label="Open menu" aria-expanded={sidebarOpen} aria-controls="member-navigation"
        >
          <Menu size={22} />
        </button>

        <Link to="/user/home" onClick={close} className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></Link>

        {/* Right: Overdue alert + Notification bell + Theme toggle + Sign out */}
        <div className="rpl-header-actions">

          {/* Overdue warning pill */}
          {overdueCount > 0 && (
            <Link
              to="/user/home"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-danger-soft text-danger hover:bg-danger-soft rounded-xl text-sm font-semibold tracking-normal transition-all"
              title={`${overdueCount} overdue book${overdueCount > 1 ? 's' : ''}`}
            >
              <AlertTriangle size={13} />
              <span>{overdueCount} overdue</span>
            </Link>
          )}

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 text-muted hover:text-ink hover:bg-panel rounded-lg transition-all"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 text-white text-sm font-semibold rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="fixed left-3 right-3 top-[var(--rpl-header-height)] sm:absolute sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-80 [overflow-wrap:anywhere] bg-panel border border-line rounded-xl shadow-sm overflow-hidden z-50">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                  <p className="text-sm font-semibold tracking-normal text-ink">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 text-sm font-semibold tracking-normal text-link hover:text-link transition-colors"
                    >
                      <CheckCheck size={11} /> Mark all read
                    </button>
                  )}
                </div>

                {/* Overdue alert row */}
                {overdueCount > 0 && (
                  <Link
                    to="/user/home"
                    onClick={() => setNotifOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 bg-danger-soft border-b border-danger hover:bg-danger-soft transition-colors"
                  >
                    <AlertTriangle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-danger leading-snug">
                        {overdueCount} book{overdueCount > 1 ? 's' : ''} overdue
                      </p>
                      <FineContent>
                      <p className="text-sm text-danger font-medium">Fines are accruing — return immediately</p>
                      </FineContent>
                    </div>
                  </Link>
                )}

                {/* Notification items */}
                <div className="max-h-72 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted font-medium">No notifications yet</p>
                  ) : (
                    notifs.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-line last:border-0 hover:bg-panel transition-colors ${
                          !n.is_read ? 'bg-info-soft' : ''
                        }`}
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          {NOTIF_ICONS[n.type] ?? NOTIF_ICONS.default}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${n.is_read ? 'text-muted' : 'text-ink font-semibold'}`}>
                            {n.message}
                          </p>
                          <p className="text-sm text-muted font-medium mt-0.5">{timeAgo(n.created_at)}</p>
                        </div>
                        {!n.is_read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 text-muted hover:text-ink hover:bg-panel rounded-lg transition-all"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 text-danger hover:text-ink hover:bg-danger-soft rounded-lg font-semibold text-sm tracking-normal transition-all"
            aria-label="Sign out"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* ── DRAWER OVERLAY ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50"
          onClick={close}
        />
      )}

      {/* ── SLIDE-IN DRAWER (theme-aware) ── */}
      <div id="member-navigation" inert={!sidebarOpen} className={`rpl-drawer fixed top-0 left-0 h-full w-72 z-60 transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
        style={{ zIndex: 60 }}
      >
        <div className="h-full bg-panel flex flex-col border-r border-line">

          {/* Drawer Header */}
          <div className="px-5 py-4 border-b border-line flex items-center justify-between">
            <p className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
            <button
              onClick={close}
              aria-label="Close menu"
              className="p-2 text-muted hover:text-ink hover:bg-panel rounded-lg transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* User Badge */}
          <div className="px-5 py-4 border-b border-line">
            <div className="flex items-center gap-3 px-3 py-3 bg-panel rounded-xl">
              <div className="w-10 h-10 bg-action rounded-xl flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-ink text-sm truncate">{localStorage.getItem('userName') || 'Member'}</p>
                <p className="text-sm font-semibold tracking-normal text-muted mt-0.5">
                  Verified Member
                </p>
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
            <p className="text-sm font-semibold tracking-normal text-muted px-4 mb-3">
              Navigation
            </p>
            {NAV_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  aria-current={active ? 'page' : undefined}
                  to={link.to}
                  onClick={close}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-semibold text-sm tracking-normal transition-all ${
                    active
                      ? 'bg-action text-white shadow-sm '
                      : 'text-muted hover:text-white hover:bg-panel'
                  }`}
                  style={!active ? {} : {}}
                >
                  <span className={active ? 'text-white' : 'text-muted'}>
                    {link.icon}
                  </span>
                  <span className="flex-1">{link.label}</span>
                  {active && <ChevronRight size={12} />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="px-4 pb-6 border-t border-line pt-4 space-y-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-semibold text-sm tracking-normal text-muted hover:text-ink hover:bg-panel transition-all"
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-semibold text-sm tracking-normal text-danger hover:bg-danger-soft transition-all"
            >
              <LogOut size={17} /> Logout
            </button>
            <p className="text-sm font-semibold tracking-normal text-muted text-center pt-3">
              RPL Member account v1.0
            </p>
          </div>
        </div>
      </div>

      {/* ── PAGE CONTENT ── */}
      <main className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <Outlet />
      </main>
    </div>
  );
};

export default UserLayout;
