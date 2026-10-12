import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Scan, Sparkles, QrCode, MapPin, Clock, Phone, ChevronRight, ChevronLeft, ArrowRight, X, BookOpen, LogIn, RefreshCw } from 'lucide-react';
import BookCard from '../../components/BookCard';
import { getBooks } from '../../api/books';
import { getStoredAuth } from '../../api/authRoutes';

const FEATURES = [
  {
    icon: <Scan size={26} />,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    title: 'Biometric Face Entry',
    desc: 'Walk into the library with just your face. Our kiosk verifies your identity in under 2 seconds — no card, no ID needed.',
  },
  {
    icon: <Sparkles size={26} />,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    title: 'AI Recommendations',
    desc: 'Our AI studies your borrowing history and reading patterns to suggest books you\'ll actually want to read next.',
  },
  {
    icon: <QrCode size={26} />,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    title: 'QR Scan Borrow & Return',
    desc: 'Every book has a QR code. Scan at the counter to borrow, scan again to return. No paperwork, no waiting.',
  },
];

const STATS = [
  { val: '7,000+', label: 'Books Available' },
  { val: '< 2s',   label: 'Face Scan Entry' },
  { val: '100%',   label: 'QR Scan Accuracy' },
  { val: '≥ 90%',  label: 'Face Recognition' },
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
          <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">
            {genre}
          </h3>
          <div className="h-1 w-12 bg-blue-600 dark:bg-blue-500 mt-2 rounded-full" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => scroll(-1)}
            disabled={!canScrollLeft}
            className="p-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-blue-600 hover:border-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:border-blue-600 dark:hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scroll(1)}
            disabled={!canScrollRight}
            className="p-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-blue-600 hover:border-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:border-blue-600 dark:hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={16} />
          </button>
          <Link to="/browse"
            className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-full hover:border-blue-400 dark:hover:border-blue-600">
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
    <div className="min-h-screen min-w-0 [overflow-wrap:anywhere] bg-white dark:bg-slate-950 font-sans transition-colors duration-300">

      {/* ── HERO ── */}
      <section className="relative pt-36 pb-28 px-6 overflow-hidden bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-950">
        {/* Soft background accents */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 dark:bg-blue-600/8 blur-[120px] rounded-full -z-10 translate-x-1/3 -translate-y-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-300/10 dark:bg-indigo-700/10 blur-[100px] rounded-full -z-10 -translate-x-1/4 translate-y-1/4 pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <span className="animate-fade-in inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full text-[10px] font-black uppercase tracking-[0.3em] mb-8 border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors duration-200">
            Rizal Province · Calabarzon
          </span>

          {/* Seal */}
          <div className="animate-fade-in delay-75 flex justify-center mb-7">
            <div className="w-[88px] h-[88px] rounded-full bg-white dark:bg-slate-800 shadow-2xl shadow-blue-100/60 dark:shadow-black/50 ring-4 ring-white dark:ring-slate-700 flex items-center justify-center overflow-hidden p-1.5 hover:scale-110 hover:shadow-blue-200/80 dark:hover:shadow-blue-900/60 transition-all duration-300 animate-float">
              <img src="/logo.library.png" alt="Rizal Provincial Library" className="w-full h-full object-contain" />
            </div>
          </div>

          <p className="animate-fade-in delay-100 text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500 mb-5">
            Rizal Provincial Library
          </p>

          <h1 className="animate-fade-in-up delay-150 text-[clamp(2.25rem,11vw,3rem)] sm:text-6xl md:text-8xl font-black italic uppercase tracking-tighter leading-[0.95] text-slate-900 dark:text-white mb-6">
            Your Story <br />
            <span className="text-blue-600 dark:text-blue-500">Starts Here.</span>
          </h1>

          <p className="animate-fade-in-up delay-200 text-slate-500 dark:text-slate-400 text-lg md:text-xl mb-12 max-w-2xl mx-auto font-medium leading-relaxed">
            Browse <span className="font-black text-slate-800 dark:text-slate-200">7,000+ books</span>, reserve titles online, and enter the library using your face — the Rizal Province digital library portal.
          </p>

          {/* Search */}
          <form
            onSubmit={handleSearch}
            className="animate-fade-in-up delay-300 flex flex-col md:flex-row gap-3 p-2.5 bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-[0_20px_60px_rgba(37,99,235,0.10)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-slate-200 dark:border-slate-700 max-w-2xl mx-auto mb-8 hover:shadow-[0_24px_70px_rgba(37,99,235,0.15)] transition-shadow duration-300"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3 px-4">
              <Search size={17} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, author, or genre..."
                className="min-w-0 w-full flex-1 bg-transparent py-3 outline-none text-slate-700 dark:text-slate-200 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-600 text-sm"
              />
            </div>
            <button
              type="submit"
              className="group px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 hover:shadow-lg hover:shadow-blue-300/40 dark:hover:shadow-blue-900/60"
            >
              Search
            </button>
          </form>

          {/* CTAs */}
          <div className="animate-fade-in-up delay-400 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/browse"
              className="group flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 dark:hover:bg-blue-600 dark:hover:text-white transition-all shadow-lg hover:shadow-blue-300/40 dark:hover:shadow-blue-900/60 hover:-translate-y-0.5">
              Browse Collection <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
            <Link to="/login"
              className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full font-black uppercase text-[10px] tracking-widest hover:border-blue-600 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-all hover:-translate-y-0.5">
              Member Login
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="py-12 bg-blue-600">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-white text-center">
          {STATS.map((s, i) => (
            <div key={s.label} className="animate-fade-in-up group cursor-default" style={{ animationDelay: `${i * 80}ms` }}>
              <p className="text-3xl md:text-4xl font-black tracking-tighter italic mb-1 group-hover:scale-110 transition-transform duration-200">{s.val}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 px-6 bg-white dark:bg-slate-950 transition-colors duration-300">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-3">
              What Makes Us Different
            </p>
            <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">
              A Smarter Way <br /> to Use the Library.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={f.title}
                className="animate-fade-in-up group bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] p-6 md:p-10 border border-slate-100 dark:border-slate-800 hover:shadow-xl hover:shadow-slate-100 dark:hover:shadow-black/30 transition-all duration-300 hover:-translate-y-2 hover:border-blue-100 dark:hover:border-slate-700"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`w-12 h-12 ${f.bg} rounded-2xl flex items-center justify-center ${f.color} mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-black italic uppercase tracking-tighter text-slate-900 dark:text-white mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
                  {f.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                  {f.desc}
                </p>
                <div className="mt-6 h-0.5 w-0 group-hover:w-12 bg-blue-600/40 rounded-full transition-all duration-500" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOOK SHOWCASE ── */}
      <section className="py-20 bg-slate-100 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-full">
          <div className="px-4 md:px-8 lg:px-12 mb-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-3">
                  Our Collection
                </p>
                <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">
                  Browse by Genre
                </h2>
              </div>
              <Link to="/browse"
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
                View Full Catalog <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {loadingBooks ? (
            <div className="flex items-center justify-center py-24">
              <RefreshCw size={28} className="animate-spin text-blue-600" />
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

      {/* ── BOOK DETAIL MODAL ── */}
      {selected && (() => {
        const currentIdx = books.findIndex(b => b.id === selected.id);
        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xl"
            onClick={() => setSelected(null)}
          >
            {/* Left arrow */}
            {currentIdx > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateBook(-1); }}
                className="absolute left-2 md:left-4 z-10 p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-sm hidden sm:block"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            <div
              className="max-w-3xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl md:rounded-[3rem] overflow-hidden shadow-2xl max-h-[92vh] overflow-y-auto"
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
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-300 mb-1">{selected.category}</p>
                    <h2 className="text-lg font-black italic uppercase tracking-tighter leading-tight text-white line-clamp-2">
                      {selected.title}
                    </h2>
                    <p className="text-blue-300 font-bold text-xs uppercase tracking-wider mt-0.5 truncate">{selected.author}</p>
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      selected.copies_available === 0
                        ? 'bg-rose-500/90 text-white'
                        : 'bg-emerald-500/90 text-white'
                    }`}>
                      {selected.copies_available === 0 ? 'Unavailable' : 'Available'}
                    </span>
                  </div>
                  {/* Page indicator */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/40 rounded-full backdrop-blur-sm">
                    <span className="text-[9px] font-black text-white/70 tracking-widest">
                      {currentIdx + 1} / {books.length}
                    </span>
                  </div>
                </div>

                {/* Info panel */}
                <div className="p-5 md:p-10 flex flex-col justify-between relative">
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all z-10"
                  >
                    <X size={20} />
                  </button>

                  <div>
                    {/* Full title block — desktop only (mobile shows over cover) */}
                    <div className="hidden md:block">
                      <p className="text-[9px] font-black uppercase tracking-[0.35em] text-blue-600 dark:text-blue-400 mb-3">
                        {selected.category}
                      </p>
                      <h2 className="text-3xl font-black italic uppercase tracking-tighter leading-none text-slate-900 dark:text-white mb-2">
                        {selected.title}
                      </h2>
                      <p className="text-blue-600 dark:text-blue-400 font-bold text-sm uppercase tracking-wider mb-1">
                        {selected.author}
                      </p>
                      {selected.year && (
                        <p className="text-slate-400 dark:text-slate-500 text-xs font-medium mb-5">
                          Published {selected.year}
                        </p>
                      )}
                    </div>

                    {/* Year on mobile */}
                    {selected.year && (
                      <p className="md:hidden text-slate-400 dark:text-slate-500 text-xs font-medium mb-3 mt-1">
                        Published {selected.year}
                      </p>
                    )}

                    {selected.description && (
                      <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-5 line-clamp-3 md:line-clamp-none">
                        {selected.description}
                      </p>
                    )}

                    {/* Availability badge */}
                    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl mb-5 ${
                      selected.copies_available === 0
                        ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800'
                    }`}>
                      <BookOpen size={14} className={selected.copies_available === 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'} />
                      <span className={`text-xs font-black uppercase tracking-widest ${
                        selected.copies_available === 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {selected.copies_available === 0 ? 'Currently checked out' : 'Available at library'}
                      </span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="space-y-2.5">
                    {!isLibrarian && <Link
                      to={isMember ? `/user/reservations?reserveBook=${selected.id}` : '/login'}
                      className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-[0.98]"
                    >
                      {isMember ? <BookOpen size={15} /> : <LogIn size={15} />}
                      {isMember ? 'Reserve Book' : 'Login to Reserve'}
                    </Link>}
                    <button
                      onClick={() => setSelected(null)}
                      className="w-full py-3 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>

              {/* Slider bar */}
              <div
                className="px-8 py-3 border-t border-slate-200 dark:border-white/5 flex items-center gap-4"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 tracking-widest tabular-nums shrink-0 w-12">
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
              <button
                onClick={(e) => { e.stopPropagation(); navigateBook(1); }}
                className="absolute right-2 md:right-4 z-10 p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur-sm hidden sm:block"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>
        );
      })()}

      {/* ── FOOTER ── */}
      <footer className="bg-black text-white py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between gap-12 mb-12">
            {/* Brand */}
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center overflow-hidden p-1">
                  <img src="/logo.library.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <p className="font-black italic uppercase tracking-tighter text-xl leading-none">
                    Rizal <span className="text-blue-400">Lib</span>
                  </p>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Provincial Portal</p>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed font-medium max-w-xs">
                Empowering the people of Rizal Province through modern, accessible, and technology-driven library services.
              </p>
            </div>

            {/* Location */}
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-5">Location & Hours</p>
              <div className="flex items-start gap-3 text-sm text-slate-400 font-medium">
                <MapPin size={15} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <span>Taytay Municipal Compound,<br />Taytay, Rizal, Philippines</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400 font-medium">
                <Clock size={15} className="text-blue-400 flex-shrink-0" />
                <span>Mon – Fri &nbsp;|&nbsp; 8:00 AM – 5:00 PM</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-400 font-medium">
                <Phone size={15} className="text-blue-400 flex-shrink-0" />
                <span>(02) 8570-7777</span>
              </div>
            </div>

            {/* Links */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 mb-5">Quick Links</p>
              <div className="space-y-3">
                {[
                  { to: '/browse', label: 'Browse Catalog' },
                  { to: '/login',  label: 'Member Login' },
                ].map((l) => (
                  <Link key={l.to} to={l.to}
                    className="group flex items-center gap-1.5 text-sm text-slate-400 font-bold hover:text-blue-400 transition-all duration-200 uppercase tracking-widest hover:translate-x-1">
                    {l.label} <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-700">
              © 2025 Rizal Provincial Library · All Rights Reserved
            </p>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-700">
              Powered by RPL Digital Services
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
