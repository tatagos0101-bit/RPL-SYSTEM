import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth } from '../api/auth';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api/librarian';
import { getLibrarianShellClasses } from '../api/librarianShell';
import { STAFF_LIBRARIAN_NAV_LINKS } from '../api/librarianNavigation';
import { parseApiDateTime } from '../api/dateTime';
import {
  BookOpen, PlusSquare, Users,
  LogOut, QrCode, FileText,
  Menu, X, ChevronRight, Sun, Moon, ShieldCheck,
  AlertTriangle, Bell, BookMarked,
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
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  );
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

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/librarian/login');
  };

  const close = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 via-blue-50/40 to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 font-sans transition-colors duration-300">

      {/* ── TOP NAVBAR ── */}
      <nav className={shellClasses.nav}>

        {/* Left: Hamburger */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className={shellClasses.hamburger}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Center: Title */}
        <button
          onClick={() => navigate('/librarian/home')}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 group"
        >
          <div className="w-8 h-8 bg-blue-600/10 dark:bg-white/10 rounded-xl p-1 overflow-hidden flex-shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-white/15 transition-colors duration-200">
            <img src="/logo.library.png" alt="RPL" className="w-full h-full object-contain transition-transform duration-500 group-hover:rotate-[20deg] group-hover:scale-110" />
          </div>
          <div className="leading-none hidden sm:block text-left">
            <p className="font-black italic uppercase tracking-tighter text-blue-700 dark:text-white text-base leading-none group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors duration-200">
              Rizal <span className="text-blue-500 dark:text-blue-400">Lib</span>
            </p>
            <p className="text-[8px] font-black text-blue-400/70 dark:text-slate-600 uppercase tracking-widest group-hover:text-blue-500 dark:group-hover:text-slate-400 transition-colors duration-200">
              Librarian Terminal
            </p>
          </div>
        </button>

        {/* Right: Theme toggle + Bell + Logout */}
        <div className="flex items-center gap-1 lg:ml-auto">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-blue-900/60 dark:text-slate-400 hover:text-blue-700 dark:hover:text-white hover:bg-blue-100 dark:hover:bg-white/10 transition-all"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((v) => !v)}
              className="relative p-2 rounded-xl text-blue-900/60 dark:text-slate-400 hover:text-blue-700 dark:hover:text-white hover:bg-blue-100 dark:hover:bg-white/10 transition-all"
              aria-label="Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown Panel */}
            {bellOpen && (
              <div className="fixed left-3 right-3 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-80 [overflow-wrap:anywhere] bg-white dark:bg-slate-900 border border-blue-100 dark:border-white/10 rounded-2xl shadow-2xl shadow-blue-200/30 dark:shadow-black/60 z-[100] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-blue-100 dark:border-white/10">
                  <p className="font-black uppercase text-[10px] tracking-widest text-blue-900 dark:text-white">
                    Notifications {unreadCount > 0 && <span className="text-rose-500">({unreadCount})</span>}
                  </p>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell size={24} className="mx-auto mb-2 text-blue-200 dark:text-slate-700" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 dark:text-slate-600">
                        No notifications
                      </p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-blue-50 dark:border-white/5 last:border-0 flex items-start gap-3 transition-colors ${
                          n.is_read
                            ? 'bg-transparent'
                            : 'bg-blue-50/60 dark:bg-blue-500/5'
                        }`}
                      >
                        {/* Dot indicator */}
                        <div className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-blue-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-blue-900 dark:text-slate-200 leading-snug">
                            {n.message}
                          </p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-blue-300 dark:text-slate-600 mt-0.5">
                            {timeAgo(n.created_at)}
                          </p>
                        </div>
                        {!n.is_read && (
                          <button
                            onClick={() => handleMarkRead(n.id)}
                            className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors mt-0.5"
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

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-blue-900/60 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
            aria-label="Logout"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      {/* ── OVERLAY ── */}
      <div
        className={shellClasses.overlay}
        onClick={close}
      />

      {/* ── SLIDE-IN SIDEBAR ── */}
      <aside
        className={shellClasses.sidebar}
      >
        {/* Glassmorphism panel */}
        <div className="h-full bg-white/90 dark:bg-slate-950/98 backdrop-blur-2xl border-r border-blue-100 dark:border-white/5 flex flex-col shadow-2xl shadow-blue-200/30 dark:shadow-black/60">

          {/* Sidebar Header */}
          <div className="px-5 py-4 border-b border-blue-100 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-100 dark:bg-white/10 rounded-xl p-1 overflow-hidden flex-shrink-0">
                <img src="/logo.library.png" alt="RPL" className="w-full h-full object-contain" />
              </div>
              <div className="leading-none">
                <p className="font-black italic uppercase tracking-tighter text-blue-700 dark:text-white text-lg leading-none">
                  Rizal <span className="text-blue-500 dark:text-blue-400">Lib</span>
                </p>
                <p className="text-[8px] font-black text-blue-400/60 dark:text-slate-600 uppercase tracking-widest mt-0.5">
                  Librarian Terminal
                </p>
              </div>
            </div>
            <button
              onClick={close}
              className="p-2 text-blue-400 dark:text-slate-500 hover:text-blue-700 dark:hover:text-white hover:bg-blue-100 dark:hover:bg-white/10 rounded-xl transition-all"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          {/* Staff Badge */}
          <div className="px-5 py-4 border-b border-blue-100 dark:border-white/5">
            <div className="flex items-center gap-3 px-3 py-3 bg-blue-50 dark:bg-white/5 rounded-2xl border border-blue-100 dark:border-white/5">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-blue-900 dark:text-white text-sm truncate">Librarian</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 dark:text-slate-500 mt-0.5">
                  Authorized Staff
                </p>
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
            <p className="text-[9px] font-black uppercase tracking-widest text-blue-300 dark:text-slate-600 px-4 mb-3">
              Navigation
            </p>
            {STAFF_LIBRARIAN_NAV_LINKS.map((link, i) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={close}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={`animate-slide-in-left group flex items-center gap-3 px-4 py-3.5 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all duration-200 relative overflow-hidden ${
                    active
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-300/40 dark:shadow-blue-900/50'
                      : 'text-blue-900/70 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-white/10 hover:text-blue-700 dark:hover:text-white hover:translate-x-1'
                  }`}
                >
                  {/* Active left bar */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white/60 rounded-full" />
                  )}
                  <span className={`transition-transform duration-200 group-hover:scale-110 ${active ? 'text-white' : 'text-blue-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400'}`}>
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

          {/* Bottom */}
          <div className="px-4 pb-6 border-t border-blue-100 dark:border-white/5 pt-4 space-y-1">
            <button
              onClick={toggleTheme}
              className="group w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest text-blue-400 dark:text-slate-500 hover:text-blue-700 dark:hover:text-white hover:bg-blue-100 dark:hover:bg-white/10 transition-all duration-200"
            >
              <span className="transition-transform duration-300 group-hover:rotate-12">
                {isDark ? <Sun size={17} /> : <Moon size={17} />}
              </span>
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              onClick={handleLogout}
              className="group w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-200"
            >
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                <LogOut size={17} />
              </span>
              Logout
            </button>
            <p className="text-[8px] font-black uppercase tracking-widest text-blue-200 dark:text-slate-700 text-center pt-3">
              RPL Librarian Terminal v1.0
            </p>
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
