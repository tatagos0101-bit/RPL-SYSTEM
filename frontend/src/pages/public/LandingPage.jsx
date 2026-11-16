import { useState } from 'react';
import { catalogSearchPath } from '../../api/catalogDiscovery';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Scan, Sparkles, QrCode, MapPin, Clock, Phone, Mail, ChevronRight, ArrowRight } from 'lucide-react';

const FEATURES = [
  {
    icon: <Scan size={26} />,
    color: 'text-link text-link',
    bg: 'bg-info-soft bg-info-soft',
    title: 'Biometric Face Entry',
    desc: 'Enrolled members can use facial verification at the entrance station. Ask library staff for assistance.',
  },
  {
    icon: <Sparkles size={26} />,
    color: 'text-link text-link',
    bg: 'bg-info-soft bg-info-soft',
    title: 'Reading recommendations',
    desc: 'Explore recommendations based on borrowing activity and your reading history.',
  },
  {
    icon: <QrCode size={26} />,
    color: 'text-success text-success',
    bg: 'bg-success-soft bg-success-soft',
    title: 'QR Scan Borrow & Return',
    desc: 'Library staff use book QR codes to help process borrowing and returns at the counter.',
  },
];

const STATS = [
  { val: 'Discover', label: 'Browse the collection' },
  { val: 'Reserve', label: 'Choose your next book' },
  { val: 'Borrow', label: 'Visit the library counter' },
  { val: 'Read', label: 'Keep track of your loans' },
];

const LandingPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(catalogSearchPath(searchQuery));
  };

  return (
    <div className="rpl-page rpl-public rpl-discovery rpl-landing min-h-screen min-w-0 font-sans">
      <main>
      <section className="discovery-hero" aria-labelledby="discovery-title">
        <picture className="discovery-hero-photo" aria-hidden="true">
          <source media="(max-width: 639px)" srcSet="/images/library-window-800.webp" />
          <img src="/images/library-window-1600.webp" alt="" width="1600" height="1068" fetchPriority="high" decoding="async" />
        </picture>
        <div className="discovery-container discovery-hero-copy discovery-enter">
          <h1 id="discovery-title">Discover your next<br />{' '}great read.</h1>
          <p className="discovery-hero-description">
            Explore the Rizal Provincial Library collection, reserve a title, and make room for your next story.
          </p>
          <form onSubmit={handleSearch} className="discovery-search">
            <div>
              <Search size={21} aria-hidden="true" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                maxLength={200} aria-label="Search the library catalog" placeholder="Search by title or author" />
            </div>
            <button type="submit">Search <ArrowRight size={18} aria-hidden="true" /></button>
          </form>
          <div className="discovery-hero-links">
            <Link to="/browse">Browse collection <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link to="/login">Member login</Link>
          </div>
        </div>
      </section>

      <section className="discovery-journey" aria-label="Your library journey">
        <div className="discovery-container discovery-journey-grid">
          {STATS.map((s) => (
            <div key={s.label} className="discovery-journey-step">
              <p>{s.val}</p>
              <p>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="discovery-services" aria-labelledby="discovery-services-title">
        <div className="discovery-container discovery-services-layout">
          <div className="discovery-service-photo discovery-reveal">
            <img src="/images/reading-room-1200.webp" alt="Sunlight across a quiet reading room and bookshelves" width="1200" height="800" loading="lazy" decoding="async" />
          </div>
          <div className="discovery-services-copy">
            <h2 id="discovery-services-title" className="discovery-reveal">Your library, made accessible.</h2>
            <div className="discovery-service-list">
              {FEATURES.map((f) => (
                <div key={f.title} className="discovery-service discovery-reveal">
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      </main>

      <footer className="discovery-footer">
        <div className="discovery-container">
          <div className="discovery-footer-grid">
            <div className="discovery-footer-brand">
              <p className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
              <p>Empowering the people of Rizal Province through modern, accessible, and technology-driven library services.</p>
            </div>
            <div>
              <h2>Location &amp; Hours</h2>
              <p className="discovery-contact"><MapPin size={19} aria-hidden="true" /><span>L. Wood Rd, Dolores,<br />Taytay, 1920 Rizal</span></p>
              <p className="discovery-contact"><Clock size={19} aria-hidden="true" /><span>Mon – Fri | 8:00 AM – 5:00 PM</span></p>
            </div>
            <div>
              <h2>Contact Us</h2>
              <div className="discovery-contact"><Phone size={19} aria-hidden="true" /><div><p className="discovery-contact-label">Telephone</p><a href="tel:026587276">(02) 658-7276</a></div></div>
              <div className="discovery-contact"><Mail size={19} aria-hidden="true" /><div><p className="discovery-contact-label">Email</p><a href="mailto:provinciallibrary_rizal@yahoo.com">provinciallibrary_rizal@yahoo.com</a></div></div>
            </div>
            <div>
              <h2>Quick Links</h2>
              <div className="discovery-footer-links">
                {[
                  { to: '/browse', label: 'Browse Catalog' },
                  { to: '/login', label: 'Member Login' },
                ].map((l) => (
                  <Link key={l.to} to={l.to}>{l.label} <ChevronRight size={16} aria-hidden="true" /></Link>
                ))}
              </div>
            </div>
          </div>
          <div className="discovery-footer-bottom">
            <p>© 2025 Rizal Provincial Library · All Rights Reserved</p>
            <div className="discovery-footer-legal">
              <Link to="/privacy-policy">Data Privacy</Link>
              <span className="discovery-photo-credits">Photos: <a href="https://unsplash.com/photos/library-interior-z_DkoUqgx6M" target="_blank" rel="noreferrer">Clay Banks</a> / <a href="https://unsplash.com/photos/a-library-with-books-on-shelves-Ud5MFQQV1F8" target="_blank" rel="noreferrer">Denise Jans</a>, Unsplash</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
