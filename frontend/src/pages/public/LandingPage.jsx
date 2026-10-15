import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Scan, Sparkles, QrCode, MapPin, Clock, Phone, Mail, ChevronRight, ChevronLeft, ArrowRight, X, BookOpen, LogIn, RefreshCw } from 'lucide-react';
import BookCard from '../../components/BookCard';
import { getBooks } from '../../api/books';
import { getStoredAuth } from '../../api/authRoutes';

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

const GenreRow = ({ genre, books, onSelect }) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => { checkScroll(); }, [books]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 520), behavior: 'smooth' });
    setTimeout(checkScroll, 350);
  };

  return (
    <div>
      <div className="px-4 md:px-8 lg:px-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div className="min-w-0">
          <h3 className="font-semibold tracking-normal text-ink rpl-subheading">
            {genre}
          </h3>
          <div className="h-1 w-12 bg-action bg-blue-500 mt-2 rounded-full" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button aria-label="Previous"
            onClick={() => scroll(-1)}
            disabled={!canScrollLeft}
            className="p-2 rounded-full border border-line text-muted hover:bg-action hover:border-line hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft size={16} />
          </button>
          <button aria-label="Next"
            onClick={() => scroll(1)}
            disabled={!canScrollRight}
            className="p-2 rounded-full border border-line text-muted hover:bg-action hover:border-line hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={16} />
          </button>
          <Link to="/browse"
            className="ml-1 text-sm font-semibold tracking-normal text-muted hover:text-link transition-colors flex items-center gap-1.5 border border-line px-4 py-2 rounded-full hover:border-line">
            View All <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 md:gap-5 px-4 md:px-8 lg:px-12 pb-4 overflow-x-auto no-scrollbar scroll-smooth"
      >
        {books.map((book, i) => (
          <div key={book.id} className="w-[120px] sm:w-[140px] md:w-[155px] flex-shrink-0 animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
            <BookCard book={{ ...book, name: book.title, available: book.copies_available > 0 }} onClick={() => onSelect(book)} />
          </div>
        ))}
      </div>
    </div>
  );
};

const LandingPage = () => {
  const { isLoggedIn, role } = getStoredAuth();
  const isLibrarian = isLoggedIn && role === 'librarian';
  const isMember = isLoggedIn && role === 'member';
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    getBooks({ limit: 100 })
      .then((res) => setBooks(res.data.items ?? res.data))
      .catch(() => {})
      .finally(() => setLoadingBooks(false));
  }, []);

  const booksByGenre = books.reduce((acc, book) => {
    const cat = book.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(book);
    return acc;
  }, {});

  const navigateBook = (dir) => {
    const idx = books.findIndex(b => b.id === selected?.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= books.length) return;
    setSlideDir(dir === 1 ? 'right' : 'left');
    setAnimKey(k => k + 1);
    setSelected(books[newIdx]);
  };

  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      const idx = books.findIndex(b => b.id === selected.id);
      if (e.key === 'ArrowRight' && idx < books.length - 1) {
        setSlideDir('right'); setAnimKey(k => k + 1); setSelected(books[idx + 1]);
      }
      if (e.key === 'ArrowLeft' && idx > 0) {
        setSlideDir('left'); setAnimKey(k => k + 1); setSelected(books[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, books]);

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

      {/* ── BOOK SHOWCASE ── */}
      <section className="rpl-collection bg-panel transition-colors duration-300">
        <div className="max-w-[1440px] mx-auto">
          <div className="px-4 md:px-8 lg:px-12 mb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-normal text-link mb-3">
                  Our Collection
                </p>
                <h2 className="font-semibold tracking-normal text-ink rpl-section-title">
                  Browse by Genre
                </h2>
              </div>
              <Link to="/browse"
                className="flex items-center gap-2 text-sm font-semibold tracking-normal text-link hover:text-link transition-colors">
                View Full Catalog <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {loadingBooks ? (
            <div className="flex items-center justify-center py-24">
              <RefreshCw size={28} className="animate-spin text-link" />
            </div>
          ) : (
            <div className="space-y-16">
              {Object.keys(booksByGenre).map((genre) => (
                <GenreRow key={genre} genre={genre} books={booksByGenre[genre]} onSelect={setSelected} />
              ))}
            </div>
          )}
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

      {/* ── BOOK DETAIL MODAL ── */}
      {selected && (() => {
        const currentIdx = books.findIndex(b => b.id === selected.id);
        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/70"
            onClick={() => setSelected(null)}
          >
            {/* Left arrow */}
            {currentIdx > 0 && (
              <button aria-label="Previous"
                onClick={(e) => { e.stopPropagation(); navigateBook(-1); }}
                className="absolute left-2 md:left-4 z-10 p-2 md:p-3 bg-panel hover:bg-panel rounded-full text-ink transition-all hidden sm:block"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <div
              className="max-w-3xl w-full bg-panel border border-line rounded-xl md:rounded-xl overflow-hidden shadow-sm max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => { touchStartX.current = e.clientX; }}
              onMouseUp={(e) => {
                if (touchStartX.current === null) return;
                const diff = touchStartX.current - e.clientX;
                touchStartX.current = null;
                if (Math.abs(diff) > 50) navigateBook(diff > 0 ? 1 : -1);
              }}
              onMouseLeave={() => { touchStartX.current = null; }}
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const diff = touchStartX.current - e.changedTouches[0].clientX;
                if (Math.abs(diff) > 50) navigateBook(diff > 0 ? 1 : -1);
              }}
            >
              <div key={animKey} className={`grid md:grid-cols-2 ${slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left-book'}`}>
                {/* Cover panel — compact fixed height on mobile, full-height panel on desktop */}
                <div className="relative h-52 sm:h-64 md:h-auto">
                  <img
                    src={selected.cover_url || selected.cover || 'https://via.placeholder.com/300x400?text=No+Cover'}
                    alt={selected.title}
                    className="w-full h-full object-cover object-top"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  {/* Title overlay — visible only on mobile */}
                  <div className="md:hidden absolute bottom-0 left-0 right-0 px-4 pb-4 pt-8">
                    <p className="text-sm font-semibold tracking-normal text-link mb-1">{selected.category}</p>
                    <h2 className="font-semibold tracking-normal leading-tight text-ink line-clamp-2 rpl-section-title">
                      {selected.title}
                    </h2>
                    <p className="text-link font-bold text-sm tracking-normal mt-0.5 truncate">{selected.author}</p>
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-full text-sm font-semibold tracking-normal ${
                      selected.copies_available === 0
                        ? 'bg-danger-soft text-danger'
                        : 'bg-success-soft text-success'
                    }`}>
                      {selected.copies_available === 0 ? 'Unavailable' : 'Available'}
                    </span>
                  </div>
                  {/* Page indicator */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/40 rounded-full">
                    <span className="text-sm font-semibold text-white tracking-normal">
                      {currentIdx + 1} / {books.length}
                    </span>
                  </div>
                </div>

                {/* Info panel */}
                <div className="p-5 md:p-10 flex flex-col justify-between relative">
                  <button aria-label="Close"
                    onClick={() => setSelected(null)}
                    className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-muted hover:text-ink hover:bg-subtle rounded-lg transition-all z-10"
                  >
                    <X size={20} />
                  </button>

                  <div>
                    {/* Full title block — desktop only (mobile shows over cover) */}
                    <div className="hidden md:block">
                      <p className="text-sm font-semibold tracking-normal text-link mb-3">
                        {selected.category}
                      </p>
                      <h2 className="font-semibold tracking-normal leading-none text-ink mb-2 rpl-section-title">
                        {selected.title}
                      </h2>
                      <p className="text-link font-bold text-sm tracking-normal mb-1">
                        {selected.author}
                      </p>
                      {selected.year && (
                        <p className="text-muted text-sm font-medium mb-5">
                          Published {selected.year}
                        </p>
                      )}
                    </div>

                    {/* Year on mobile */}
                    {selected.year && (
                      <p className="md:hidden text-muted text-sm font-medium mb-3 mt-1">
                        Published {selected.year}
                      </p>
                    )}

                    {selected.description && (
                      <p className="text-muted text-sm leading-relaxed mb-5 line-clamp-3 md:line-clamp-none">
                        {selected.description}
                      </p>
                    )}

                    {/* Availability badge */}
                    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl mb-5 ${
                      selected.copies_available === 0
                        ? 'bg-danger-soft bg-danger-soft border border-danger border-danger'
                        : 'bg-success-soft bg-success-soft border border-success border-success'
                    }`}>
                      <BookOpen size={14} className={selected.copies_available === 0 ? 'text-danger' : 'text-success text-success'} />
                      <span className={`text-sm font-semibold tracking-normal ${
                        selected.copies_available === 0
                          ? 'text-danger text-danger'
                          : 'text-success text-success'
                      }`}>
                        {selected.copies_available === 0 ? 'Currently checked out' : 'Available at library'}
                      </span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="space-y-2.5">
                    {!isLibrarian && <Link
                      to={isMember ? `/user/reservations?reserveBook=${selected.id}` : '/login'}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-action hover:bg-action-hover text-white rounded-xl font-semibold text-sm tracking-normal transition-all"
                    >
                      {isMember ? <BookOpen size={15} /> : <LogIn size={15} />}
                      {isMember ? 'Reserve Book' : 'Login to Reserve'}
                    </Link>}
                    <button
                      onClick={() => setSelected(null)}
                      className="w-full py-3 border border-line text-muted rounded-lg font-semibold text-sm tracking-normal hover:border-line transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>

              {/* Slider bar */}
              <div
                className="px-8 py-3 border-t border-line flex items-center gap-4"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="text-sm font-semibold text-muted tracking-normal tabular-nums shrink-0 w-12">
                  {currentIdx + 1} / {books.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={books.length - 1}
                  value={currentIdx >= 0 ? currentIdx : 0}
                  onChange={(e) => {
                    const targetIdx = parseInt(e.target.value);
                    if (targetIdx === currentIdx) return;
                    setSlideDir(targetIdx > currentIdx ? 'right' : 'left');
                    setAnimKey(k => k + 1);
                    setSelected(books[targetIdx]);
                  }}
                  className="flex-1 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Right arrow */}
            {currentIdx < books.length - 1 && (
              <button aria-label="Next"
                onClick={(e) => { e.stopPropagation(); navigateBook(1); }}
                className="absolute right-2 md:right-4 z-10 p-2 md:p-3 bg-panel hover:bg-panel rounded-full text-ink transition-all hidden sm:block"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>
        );
      })()}

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
