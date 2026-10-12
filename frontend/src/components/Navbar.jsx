import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, User, BookOpen, LayoutGrid, Camera, Home, Sun, Moon, LogIn } from 'lucide-react';
import { clearAuth } from '../api/auth';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  );
  const navigate = useNavigate();
  const location = useLocation();

  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const userRole = localStorage.getItem('userRole');
  const hideCurrentCatalog = isLoggedIn && userRole === 'librarian' && location.pathname.replace(/\/+$/, '') === '/browse';

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleLogout = () => {
    clearAuth();
    setIsOpen(false);
    navigate(userRole === 'librarian' ? '/librarian/login' : '/user/login');
  };

  const getHomePath = () => {
    if (!isLoggedIn) return '/';
    return userRole === 'librarian' ? '/librarian/home' : '/user/home';
  };

  return (
    <>
      {/* TOP NAV */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-white/90 dark:bg-slate-950/90 backdrop-blur-lg border-b border-slate-200/60 dark:border-slate-800/60 shadow-sm px-3 sm:px-6 py-3 flex justify-between items-center gap-2 font-sans transition-colors duration-300">

        {/* Left: Hamburger + Logo */}
        <div className="min-w-0 flex items-center gap-1 sm:gap-3">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 rounded-xl transition-all"
            aria-label="Open menu"
          >
            <Menu size={26} />
          </button>

          <Link to={getHomePath()} onClick={() => setIsOpen(false)} className="group min-w-0 flex items-center gap-2 sm:gap-3">
            <img src="/logo.library.png" alt="Rizal Provincial Library" className="w-9 h-9 object-contain transition-transform duration-500 group-hover:rotate-[20deg] group-hover:scale-110" />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-black text-slate-900 dark:text-white tracking-tighter uppercase italic group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
                Rizal <span className="text-blue-600">Lib</span>
              </span>
              <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 tracking-[0.3em] uppercase group-hover:text-blue-400 dark:group-hover:text-blue-500 transition-colors duration-200">Provincial Portal</span>
            </div>
          </Link>
        </div>

        {/* Right: Theme toggle + Auth button */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {isLoggedIn ? (
            <Link
              to={userRole === 'librarian' ? '/librarian/home' : '/user/profile'}
              className="flex items-center gap-2 p-1.5 pr-4 bg-slate-900 dark:bg-slate-700 rounded-full text-white shadow-md transition-all hover:bg-blue-600 dark:hover:bg-blue-600 active:scale-95"
            >
              <div className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center">
                <User size={16} />
              </div>
              <span className="text-xs font-black uppercase tracking-widest hidden sm:block">
                {userRole === 'librarian' ? 'Staff Hub' : 'My ID'}
              </span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-md hover:shadow-blue-300/40 dark:hover:shadow-blue-900/60 active:scale-95"
            >
              <LogIn size={15} />
              <span className="hidden sm:block">Sign In</span>
            </Link>
          )}
        </div>
      </nav>

      {/* OVERLAY */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 dark:bg-black/50 backdrop-blur-sm z-[60]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SLIDE-OUT SIDEBAR */}
      <div className={`fixed top-0 left-0 h-full w-80 bg-white dark:bg-slate-900 z-[70] transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-400 ease-in-out p-8 shadow-2xl border-r border-slate-200 dark:border-slate-800`}>

        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3">
            <img src="/logo.library.png" alt="Logo" className="w-8 h-8 object-contain" />
            <h2 className="font-black italic text-xl tracking-tighter uppercase text-slate-900 dark:text-white">
              {userRole === 'librarian' ? 'Management' : 'Navigation'}
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl hover:text-red-500 dark:text-slate-400 transition-all"
          >
            <X size={22} />
          </button>
        </div>

        <ul className="space-y-2">
          <SideLink to={getHomePath()} icon={<Home size={18} />} label="Dashboard Home" onClick={() => setIsOpen(false)} />
          {!hideCurrentCatalog && <SideLink to="/browse" icon={<LayoutGrid size={18} />} label="Public Catalog" onClick={() => setIsOpen(false)} />}

          {isLoggedIn && (
            <>
              <div className="h-px bg-slate-200 dark:bg-slate-700 my-4" />

              {userRole === 'librarian' ? (
                <>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-4 mb-2">Staff Terminal</p>
                  {/* Dashboard Home already links to the staff dashboard. */}
                  <SideLink to="/entry-station" icon={<Camera size={18} />} label="Entrance Station" onClick={() => setIsOpen(false)} />
                </>
              ) : (
                <>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest ml-4 mb-2">Member Portal</p>
                  <SideLink to="/user/home" icon={<BookOpen size={18} />} label="My Loans & Reports" onClick={() => setIsOpen(false)} />
                  <SideLink to="/user/profile" icon={<User size={18} />} label="Security Profile" onClick={() => setIsOpen(false)} />
                  <SideLink to="/user/browse" icon={<LayoutGrid size={18} />} label="Member Browse" onClick={() => setIsOpen(false)} />
                </>
              )}

              <button
                onClick={handleLogout}
                className="w-full mt-8 p-4 flex items-center gap-4 text-rose-500 font-black uppercase text-xs hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-2xl transition-all border border-transparent hover:border-rose-100 dark:hover:border-rose-900"
              >
                <LogOut size={18} /> Logout
              </button>
            </>
          )}
        </ul>

        <div className="absolute bottom-8 left-8 right-8 opacity-20">
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-900 dark:text-white">
            Rizal Provincial Library v1.0
          </p>
        </div>
      </div>
    </>
  );
};

const SideLink = ({ to, icon, label, onClick }) => (
  <li>
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-4 p-3.5 text-slate-600 dark:text-slate-400 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-2xl transition-all uppercase text-xs tracking-widest border border-transparent hover:border-blue-100 dark:hover:border-blue-900"
    >
      {icon} {label}
    </Link>
  </li>
);

export default Navbar;
