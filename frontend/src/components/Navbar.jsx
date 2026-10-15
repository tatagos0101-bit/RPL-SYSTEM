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
      <nav className="rpl-chrome rpl-header fixed top-0 left-0 w-full z-50">

        {/* Left: Hamburger + Logo */}
        <div className="rpl-header-leading">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 text-muted hover:bg-info-soft rounded-lg transition-all"
            aria-label="Open menu" aria-expanded={isOpen} aria-controls="public-navigation"
          >
            <Menu size={26} />
          </button>

          <Link to={getHomePath()} onClick={() => setIsOpen(false)} className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></Link>
        </div>

        {/* Right: Theme toggle + Auth button */}
        <div className="rpl-header-actions">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-lg text-muted hover:bg-subtle transition-all"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {isLoggedIn ? (
            <Link
              to={userRole === 'librarian' ? '/librarian/home' : '/user/profile'}
              className="flex items-center gap-2 p-1.5 pr-4 bg-action rounded-full text-white shadow-md transition-all hover:bg-action"
            >
              <div className="w-7 h-7 bg-panel text-link rounded-full flex items-center justify-center">
                <User size={16} />
              </div>
              <span className="text-sm font-semibold tracking-normal hidden sm:block">
                {userRole === 'librarian' ? 'Staff Hub' : 'My ID'}
              </span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-5 py-2.5 bg-action hover:bg-action-hover text-white rounded-full text-sm font-semibold tracking-normal transition-all shadow-md"
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
          className="fixed inset-0 bg-black/60 z-[60]"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SLIDE-OUT SIDEBAR */}
      <div id="public-navigation" inert={!isOpen} className={`fixed top-0 left-0 h-full w-80 rpl-drawer overflow-y-auto bg-panel z-[70] transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-400 ease-in-out p-8 shadow-sm border-r border-line `}>

        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold tracking-normal text-ink rpl-section-title">
              {userRole === 'librarian' ? 'Management' : 'Navigation'}
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
            className="p-2 bg-subtle rounded-lg hover:text-danger text-muted transition-all"
          >
            <X size={22} />
          </button>
        </div>

        <ul className="space-y-2">
          <SideLink to={getHomePath()} icon={<Home size={18} />} label="Dashboard Home" onClick={() => setIsOpen(false)} />
          {!hideCurrentCatalog && <SideLink to="/browse" icon={<LayoutGrid size={18} />} label="Public Catalog" onClick={() => setIsOpen(false)} />}

          {isLoggedIn && (
            <>
              <div className="h-px bg-subtle my-4" />

              {userRole === 'librarian' ? (
                <>
                  <p className="text-sm font-semibold text-link tracking-normal ml-4 mb-2">Staff Terminal</p>
                  {/* Dashboard Home already links to the staff dashboard. */}
                  <SideLink to="/entry-station" icon={<Camera size={18} />} label="Entrance Station" onClick={() => setIsOpen(false)} />
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-link tracking-normal ml-4 mb-2">Member Portal</p>
                  <SideLink to="/user/home" icon={<BookOpen size={18} />} label="My Loans & Reports" onClick={() => setIsOpen(false)} />
                  <SideLink to="/user/profile" icon={<User size={18} />} label="Security Profile" onClick={() => setIsOpen(false)} />
                  <SideLink to="/user/browse" icon={<LayoutGrid size={18} />} label="Member Browse" onClick={() => setIsOpen(false)} />
                </>
              )}

              <button
                onClick={handleLogout}
                className="w-full mt-8 p-4 flex items-center gap-4 text-danger font-semibold text-sm hover:bg-danger-soft rounded-lg transition-all border border-transparent hover:border-danger"
              >
                <LogOut size={18} /> Logout
              </button>
            </>
          )}
        </ul>

        <div className="mt-8 border-t border-line pt-5">
          <p className="text-sm font-semibold tracking-normal text-ink">
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
      className="flex items-center gap-4 p-3.5 text-muted font-bold hover:bg-info-soft hover:text-link rounded-xl transition-all text-sm tracking-normal border border-transparent hover:border-line"
    >
      {icon} {label}
    </Link>
  </li>
);

export default Navbar;
