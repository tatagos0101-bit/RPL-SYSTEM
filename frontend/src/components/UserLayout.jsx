import { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth } from '../api/auth';
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
  reservation_ready: <BookMarked size={14} className="text-blue-400" />,
  default:           <Bell size={14} className="text-slate-400" />,
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
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  );
  const [notifOpen, setNotifOpen]     = useState(false);
  const [notifs, setNotifs]           = useState([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const notifRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Load notifications + overdue count on mount
  useEffect(() => {
    getNotifications().then((r) => setNotifs(r.data)).catch(() => {});
    getFines().then((r) => setOverdueCount(r.data.overdue_loans?.length || 0)).catch(() => {});
  }, []);

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
    await markNotificationRead(id).catch(() => {});
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => {});
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/user/login');
  };

  const close = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900 font-sans transition-colors duration-300">

      {/* ── TOP BAR (always visible, always dark) ── */}
      <header className="sticky top-0 z-40 w-full bg-slate-950 border-b border-white/5 px-5 py-3.5 flex items-center justify-between flex-shrink-0">

        {/* Left: Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>

        {/* Center: Logo */}
        <Link to="/user/home" onClick={close} className="group flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
          <div className="w-8 h-8 bg-white/10 rounded-xl p-1 overflow-hidden flex-shrink-0 group-hover:bg-white/20 transition-colors duration-200">
            <img src="/logo.library.png" alt="RPL" className="w-full h-full object-contain transition-transform duration-500 group-hover:rotate-[20deg] group-hover:scale-110" />
          </div>
          <div className="leading-none hidden sm:block">
            <p className="font-black italic uppercase tracking-tighter text-white text-base leading-none group-hover:text-blue-300 transition-colors duration-200">
              Rizal <span className="text-blue-400">Lib</span>
            </p>
            <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest group-hover:text-slate-400 transition-colors duration-200">
              Member Terminal
            </p>
          </div>
        </Link>

        {/* Right: Overdue alert + Notification bell + Theme toggle + Sign out */}
        <div className="flex items-center gap-1">

          {/* Overdue warning pill */}
          {overdueCount > 0 && (
            <Link
              to="/user/home"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
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
              className="relative p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {notifOpen && (
              <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-80 [overflow-wrap:anywhere] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
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
                    className="flex items-start gap-3 px-4 py-3 bg-rose-950/60 border-b border-rose-900/40 hover:bg-rose-950 transition-colors"
                  >
                    <AlertTriangle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-rose-300 leading-snug">
                        {overdueCount} book{overdueCount > 1 ? 's' : ''} overdue
                      </p>
                      <p className="text-[10px] text-rose-500/80 font-medium">Fines are accruing — return immediately</p>
                    </div>
                  </Link>
                )}

                {/* Notification items */}
                <div className="max-h-72 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-slate-500 font-medium">No notifications yet</p>
                  ) : (
                    notifs.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleMarkRead(n.id)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors ${
                          !n.is_read ? 'bg-blue-950/30' : ''
                        }`}
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          {NOTIF_ICONS[n.type] ?? NOTIF_ICONS.default}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-snug ${n.is_read ? 'text-slate-400' : 'text-slate-200 font-semibold'}`}>
                            {n.message}
                          </p>
                          <p className="text-[10px] text-slate-600 font-medium mt-0.5">{timeAgo(n.created_at)}</p>
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
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 text-rose-400 hover:text-white hover:bg-rose-500/20 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
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
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          onClick={close}
        />
      )}

      {/* ── SLIDE-IN DRAWER (always dark, no theme change) ── */}
      <div className={`fixed top-0 left-0 h-full w-72 z-60 transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
        style={{ zIndex: 60 }}
      >
        <div className="h-full bg-slate-950 flex flex-col border-r border-white/5">

          {/* Drawer Header */}
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/10 rounded-xl p-1 overflow-hidden flex-shrink-0">
                <img src="/logo.library.png" alt="RPL" className="w-full h-full object-contain" />
              </div>
              <div className="leading-none">
                <p className="font-black italic uppercase tracking-tighter text-white text-lg leading-none">
                  Rizal <span className="text-blue-400">Lib</span>
                </p>
                <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mt-0.5">
                  Member Terminal
                </p>
              </div>
            </div>
            <button
              onClick={close}
              aria-label="Close menu"
              className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* User Badge */}
          <div className="px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-3 px-3 py-3 bg-white/5 rounded-2xl">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <User size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white text-sm truncate">{localStorage.getItem('userName') || 'Member'}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">
                  Verified Member
                </p>
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 px-4 mb-3">
              Navigation
            </p>
            {NAV_LINKS.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={close}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                      : 'text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                  style={!active ? {} : {}}
                >
                  <span className={active ? 'text-white' : 'text-slate-500'}>
                    {link.icon}
                  </span>
                  <span className="flex-1">{link.label}</span>
                  {active && <ChevronRight size={12} />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="px-4 pb-6 border-t border-white/5 pt-4 space-y-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest text-slate-500 hover:text-white hover:bg-white/10 transition-all"
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest text-rose-500 hover:bg-rose-500/10 transition-all"
            >
              <LogOut size={17} /> Logout
            </button>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-700 text-center pt-3">
              RPL Member Terminal v1.0
            </p>
          </div>
        </div>
      </div>

      {/* ── PAGE CONTENT ── */}
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
};

export default UserLayout;
