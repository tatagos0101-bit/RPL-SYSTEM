import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Scan, Sparkles, QrCode, MapPin, Clock, Phone, Mail, ChevronRight } from 'lucide-react';

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
    navigate('/browse');
  };

  return (
    <div className="rpl-page rpl-public rpl-landing min-h-screen min-w-0 [overflow-wrap:anywhere] bg-panel font-sans transition-colors duration-300">

      {/* Discovery keeps the existing search/navigation workflow. */}
      <section className="rpl-hero">
        <div className="rpl-hero-inner">
          <div>
            <h1 className="text-ink rpl-title">Discover your<br />next great read.</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
              Explore the Rizal Provincial Library collection, reserve a title, and make room for your next story.
            </p>
            <form onSubmit={handleSearch} className="rpl-hero-search">
              <div className="min-w-0 flex-1 flex items-center gap-3 px-4">
                <Search size={20} className="text-muted shrink-0" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search the library catalog" placeholder="Search by title or author"
                  className="min-w-0 w-full bg-transparent py-3 text-base text-ink" />
              </div>
              <button type="submit" className="rounded-lg bg-action px-7 py-3 text-base font-semibold text-white hover:bg-action-hover">Search</button>
            </form>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-semibold">
              <Link to="/browse" className="inline-flex items-center gap-2 text-link hover:underline">Browse collection <ChevronRight size={16} /></Link>
              <Link to="/login" className="text-muted hover:underline">Member login</Link>
            </div>
          </div>
          <img src="/RPL.png" alt="Rizal Provincial Library seal" className="rpl-hero-seal" />
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="rpl-service-strip py-8 bg-panel">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-ink text-center">
          {STATS.map((s, i) => (
            <div key={s.label} className="animate-fade-in-up group cursor-default" style={{ animationDelay: `${i * 80}ms` }}>
              <p className="text-3xl md:text-4xl font-semibold tracking-normal mb-1 transition-transform duration-200">{s.val}</p>
              <p className="text-sm font-semibold tracking-normal text-link">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="rpl-services py-14 px-6 bg-panel transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold tracking-normal text-link mb-3">
              Library services
            </p>
            <h2 className="font-semibold tracking-normal text-ink rpl-section-title">
              Your library, made accessible.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={f.title}
                className="animate-fade-in-up group bg-subtle rounded-xl p-6 md:p-10 border border-line hover:shadow-sm transition-all duration-300 hover:border-line"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center ${f.color} mb-6 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className="font-semibold tracking-normal text-ink mb-3 group-hover:text-link transition-colors duration-200 rpl-subheading">
                  {f.title}
                </h3>
                <p className="text-sm text-muted leading-relaxed font-medium">
                  {f.desc}
                </p>
                <div className="mt-6 h-0.5 w-0 group-hover:w-12 bg-info-soft rounded-full transition-all duration-500" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-panel text-ink py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1.2fr_auto] gap-10 mb-12">
            {/* Brand */}
            <div className="flex-1">
              <p className="rpl-brand mb-6"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
              <p className="text-ink text-sm leading-relaxed font-medium max-w-xs">
                Empowering the people of Rizal Province through modern, accessible, and technology-driven library services.
              </p>
            </div>

            {/* Location */}
            <div className="space-y-4">
              <p className="text-sm font-semibold tracking-normal text-ink mb-5">Location & Hours</p>
              <div className="flex items-start gap-3 text-sm text-ink font-medium">
                <MapPin size={15} className="text-link mt-0.5 flex-shrink-0" />
                <span>L. Wood Rd, Dolores,<br />Taytay, 1920 Rizal</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-ink font-medium">
                <Clock size={15} className="text-link flex-shrink-0" />
                <span>Mon – Fri &nbsp;|&nbsp; 8:00 AM – 5:00 PM</span>
              </div>
            </div>

            {/* Contact details supplied by the library */}
            <div className="space-y-4 min-w-0">
              <p className="text-sm font-semibold tracking-normal text-ink mb-5">Contact Us</p>
              <div className="flex items-start gap-3 text-sm font-medium">
                <Phone size={15} className="text-link mt-0.5 shrink-0" />
                <div><p className="text-muted mb-1">Telephone</p><a className="text-link hover:underline" href="tel:026587276">(02) 658-7276</a></div>
              </div>
              <div className="flex items-start gap-3 text-sm font-medium">
                <Mail size={15} className="text-link mt-0.5 shrink-0" />
                <div className="min-w-0"><p className="text-muted mb-1">Email</p><a className="text-link break-words hover:underline" href="mailto:provinciallibrary_rizal@yahoo.com">provinciallibrary_rizal@yahoo.com</a></div>
              </div>
            </div>

            {/* Links */}
            <div>
              <p className="text-sm font-semibold tracking-normal text-ink mb-5">Quick Links</p>
              <div className="space-y-3">
                {[
                  { to: '/browse', label: 'Browse Catalog' },
                  { to: '/login',  label: 'Member Login' },
                ].map((l) => (
                  <Link key={l.to} to={l.to}
                    className="group flex items-center gap-1.5 text-sm text-ink font-bold hover:text-link transition-all duration-200 tracking-normal hover:translate-x-1">
                    {l.label} <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-line pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm font-semibold tracking-normal text-muted">
              © 2025 Rizal Provincial Library · All Rights Reserved
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
