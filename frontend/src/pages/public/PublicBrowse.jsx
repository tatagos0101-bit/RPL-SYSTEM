import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, RefreshCw, BookOpen, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import BookCard from '../../components/BookCard';
import { getBooks, getCategories } from '../../api/books';
import { getStoredAuth } from '../../api/authRoutes';

const PublicBrowse = () => {
  // This role controls catalogue presentation; protected actions still verify
  // the session and role on the server.
  const { isLoggedIn, role } = getStoredAuth();
  const isLibrarian = isLoggedIn && role === 'librarian';
  const isMember = isLoggedIn && role === 'member';
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    Promise.all([getBooks({ limit: 1000 }), getCategories()])
      .then(([bRes, cRes]) => {
        setBooks(bRes.data.items ?? bRes.data);
        setCategories(['All', ...cRes.data.map((c) => c.category)]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = books.filter((book) => {
    const matchCat = activeCategory === 'All' || book.category === activeCategory;
    const matchSearch =
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const navigateBook = (dir) => {
    const idx = filtered.findIndex(b => b.id === selected?.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= filtered.length) return;
    setSlideDir(dir === 1 ? 'right' : 'left');
    setAnimKey(k => k + 1);
    setSelected(filtered[newIdx]);
  };

  const reserveLoginPath = (bookId) =>
    `/user/login?next=${encodeURIComponent(`/user/reservations?reserveBook=${bookId}`)}`;

  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      const idx = filtered.findIndex(b => b.id === selected.id);
      if (e.key === 'ArrowRight' && idx < filtered.length - 1) {
        setSlideDir('right'); setAnimKey(k => k + 1); setSelected(filtered[idx + 1]);
      }
      if (e.key === 'ArrowLeft' && idx > 0) {
        setSlideDir('left'); setAnimKey(k => k + 1); setSelected(filtered[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, filtered]);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-white pt-28 pb-20 font-sans transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 md:px-12">

        {/* Header */}
        <div className="mb-10 border-b border-slate-100 dark:border-slate-800 pb-8">
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-3 block">
            Digital Archive
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black italic uppercase tracking-tighter leading-none mb-4">
            Explore <span className="text-blue-600">Collection</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium max-w-2xl">
            Access thousands of curated volumes and historical documents from the Rizal Provincial Library system.
          </p>
        </div>

        {/* Filters + Search (sticky) */}
        <div className="flex flex-col lg:flex-row gap-4 mb-12 sticky top-[68px] z-30 bg-white/90 dark:bg-slate-950/90 backdrop-blur-lg py-4 -mx-6 md:-mx-12 px-6 md:px-12 border-b border-slate-100 dark:border-slate-800">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border flex-shrink-0 ${
                  activeCategory === cat
                    ? 'bg-slate-900 dark:bg-blue-600 border-slate-900 dark:border-blue-600 text-white shadow-md'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 group-focus-within:text-blue-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search by title, author, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-3.5 pl-14 pr-12 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <RefreshCw size={28} className="animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Results count */}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-6">
              Showing {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              {activeCategory !== 'All' ? ` in ${activeCategory}` : ''}
            </p>

            {/* Grid */}
            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {filtered.map((book) => (
                  <div key={book.id} className="transition-all duration-300 hover:-translate-y-1">
                    <BookCard book={{ ...book, name: book.title }} onClick={() => setSelected(book)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-32 text-center">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search size={32} className="text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-2xl font-black italic tracking-tighter uppercase text-slate-300 dark:text-slate-600">
                  No matches found
                </p>
                <button
                  onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
                  className="mt-4 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 underline underline-offset-4"
                >
                  Reset all filters
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── BOOK DETAIL MODAL ── */}
      {selected && (() => {
        const currentIdx = filtered.findIndex(b => b.id === selected.id);
        const isAvailable = (selected.copies_available ?? 0) > 0;
        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl"
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
              className="max-w-3xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[1.5rem] md:rounded-[3rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
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
                {/* Cover panel */}
                <div className="relative aspect-[3/4] md:aspect-auto">
                  <img
                    src={selected.cover_url || selected.cover || 'https://via.placeholder.com/300x400?text=No+Cover'}
                    alt={selected.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-5 left-5">
                    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      selected.availability_status === 'Not available'
                        ? 'bg-rose-500/90 text-white'
                        : selected.availability_status === 'Limited'
                        ? 'bg-amber-500/90 text-white'
                        : 'bg-emerald-500/90 text-white'
                    }`}>
                      {selected.availability_status}
                    </span>
                  </div>
                  {/* Page indicator */}
                  <div className="absolute bottom-5 right-5 px-2.5 py-1 bg-black/40 rounded-full backdrop-blur-sm">
                    <span className="text-[9px] font-black text-white/70 tracking-widest">
                      {currentIdx + 1} / {filtered.length}
                    </span>
                  </div>
                </div>

                {/* Info panel */}
                <div className="p-5 md:p-10 flex flex-col justify-between relative">
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-6 right-6 p-2 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"
                  >
                    <X size={20} />
                  </button>

                  <div>
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
                      <p className="text-slate-400 dark:text-slate-500 text-xs font-medium mb-6">
                        Published {selected.year}
                      </p>
                    )}

                    {selected.description && (
                      <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-8">
                        {selected.description}
                      </p>
                    )}

                    {/* Availability badge */}
                    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl mb-8 ${
                      selected.availability_status === 'Unavailable'
                        ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800'
                        : selected.availability_status === 'Limited'
                        ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800'
                        : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800'
                    }`}>
                      <BookOpen size={14} className={
                        selected.availability_status === 'Unavailable' ? 'text-rose-500' : 
                        selected.availability_status === 'Limited' ? 'text-amber-500' : 
                        'text-emerald-600 dark:text-emerald-400'
                      } />
                      <span className={`text-xs font-black uppercase tracking-widest ${
                        selected.availability_status === 'Unavailable'
                          ? 'text-rose-600 dark:text-rose-400'
                          : selected.availability_status === 'Limited'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {selected.availability_status === 'Unavailable' ? 'Currently checked out' : 
                         selected.availability_status === 'Limited' ? 'Limited copies available' : 
                        'Available at the library'}
                      </span>
                    </div>

                    {!isAvailable && !isLibrarian && (
                      <p className="text-xs font-bold leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl px-4 py-3 mb-6">
                        Currently not available. Reserve now to join the queue. You'll be notified when it's your turn.
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="space-y-3">
                    {!isLibrarian && <Link
                      to={isMember ? `/user/reservations?reserveBook=${selected.id}` : reserveLoginPath(selected.id)}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-[0.98]"
                    >
                      {isMember ? <BookOpen size={15} /> : <LogIn size={15} />}
                      {isMember
                        ? (isAvailable ? 'Reserve Book' : 'Join Queue')
                        : (isAvailable ? 'Login to Reserve' : 'Login to Join Queue')}
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
                  {currentIdx + 1} / {filtered.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={filtered.length - 1}
                  value={currentIdx >= 0 ? currentIdx : 0}
                  onChange={(e) => {
                    const targetIdx = parseInt(e.target.value);
                    if (targetIdx === currentIdx) return;
                    setSlideDir(targetIdx > currentIdx ? 'right' : 'left');
                    setAnimKey(k => k + 1);
                    setSelected(filtered[targetIdx]);
                  }}
                  className="flex-1 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Right arrow */}
            {currentIdx < filtered.length - 1 && (
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
    </div>
  );
};

export default PublicBrowse;
