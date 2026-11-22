import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PUBLIC_LIBRARIAN_NAV_LINKS } from '../../api/librarianNavigation';
import '../../styles/librarian-welcome.css';

export default function LibrarianPublicNavbar() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '');
  const isLanding = pathname === '/librarian';

  useEffect(() => {
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [location.key]);

  return (
    <nav aria-label="Librarian navigation" className={`rpl-chrome rpl-header rpl-discovery-nav rpl-librarian-nav ${isLanding ? 'rpl-landing-nav' : 'rpl-catalog-nav'} fixed top-0 left-0 w-full z-50`}>
      <div className="rpl-header-leading">
        <Link to="/librarian" className="rpl-brand">
          <img src="/RPL.png" alt="" className="rpl-brand-logo" />
          <span>Rizal Provincial Library</span>
        </Link>
      </div>

      <div className="discovery-nav-links">
        {PUBLIC_LIBRARIAN_NAV_LINKS.map(link => (
          <Link key={link.to} to={link.to} aria-current={pathname === link.to ? 'page' : undefined}>
            {link.label}
          </Link>
        ))}
      </div>

      <div className="rpl-header-actions">
        <Link to="/librarian/login" className="librarian-welcome-sign-in">
          <span>Sign In</span>
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
