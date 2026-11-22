import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, LockKeyhole } from 'lucide-react';
import { PUBLIC_LIBRARIAN_NAV_LINKS } from '../../api/librarianNavigation';
import useLandingMotion from '../../components/public/useLandingMotion';
import '../../styles/librarian-welcome.css';

const DUST_MOTES = [0, 1, 2, 3, 4, 5];

export default function LibrarianLanding() {
  const pageRef = useRef(null);
  const location = useLocation();
  useLandingMotion(pageRef);

  return (
    <div ref={pageRef} className="rpl-page rpl-public rpl-discovery rpl-landing rpl-librarian-landing min-h-screen min-w-0">
      <nav aria-label="Librarian navigation" className="rpl-chrome rpl-header rpl-discovery-nav rpl-landing-nav fixed top-0 left-0 w-full z-50">
        <div className="rpl-header-leading">
          <Link to="/librarian" className="rpl-brand">
            <img src="/RPL.png" alt="" className="rpl-brand-logo" />
            <span>Rizal Provincial Library</span>
          </Link>
        </div>

        <div className="discovery-nav-links">
          {PUBLIC_LIBRARIAN_NAV_LINKS.map(link => (
            <Link key={link.to} to={link.to}
              aria-current={location.pathname.replace(/\/+$/, '') === link.to ? 'page' : undefined}>
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

      <main>
        <section className="discovery-hero" aria-labelledby="librarian-welcome-title">
          <picture className="discovery-hero-photo" aria-hidden="true">
            <source media="(max-width: 639px)" srcSet="/images/library-window-800.webp" />
            <img className="discovery-ambient" src="/images/library-window-1600.webp" alt=""
              width="1600" height="1068" fetchPriority="high" decoding="async" />
          </picture>
          <div className="discovery-hero-light discovery-ambient" aria-hidden="true" />
          <div className="discovery-hero-dust" aria-hidden="true">
            {DUST_MOTES.map(mote => <span key={mote} className="discovery-ambient" />)}
          </div>

          <div className="discovery-container discovery-hero-copy">
            <h1 id="librarian-welcome-title" className="discovery-enter">Librarian workspace</h1>
            <p className="discovery-hero-description discovery-enter">
              Sign in to access circulation, member records, reservations, inventory, reports, and daily library operations.
            </p>
            <div className="librarian-welcome-actions discovery-enter">
              <Link to="/librarian/login" className="librarian-welcome-button librarian-welcome-button-primary">
                Librarian Sign In
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
              <Link to="/browse" className="librarian-welcome-button librarian-welcome-button-secondary">
                <BookOpen size={20} aria-hidden="true" />
                Public Catalog
              </Link>
            </div>
          </div>
        </section>

        <section className="librarian-welcome-access" aria-labelledby="librarian-access-title">
          <div className="discovery-container librarian-welcome-access-copy discovery-reveal">
            <LockKeyhole size={28} strokeWidth={1.5} aria-hidden="true" />
            <h2 id="librarian-access-title">Staff Access</h2>
            <p>Staff tools stay locked until a librarian signs in.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
