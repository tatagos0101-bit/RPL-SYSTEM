import useReadResource from '../../api/useReadResource';
import ModalFrame from '../../components/ModalFrame';
import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, RefreshCw, BookOpen, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import BookCard from '../../components/BookCard';
import { getCategories } from '../../api/books';
import { getStoredAuth } from '../../api/authRoutes';

const PublicBrowse = () => {
  // This role controls catalogue presentation; protected actions still verify
  // the session and role on the server.
  const { isLoggedIn, role } = getStoredAuth();
  const isLibrarian = isLoggedIn && role === 'librarian';
  const isMember = isLoggedIn && role === 'member';
  const categoryResource = useReadResource(getCategories);
  const categories = ['All', ...(categoryResource.data || []).map(item => item.category)];
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);

  const listing = useServerPage('/api/books', { search: searchQuery, category: activeCategory === 'All' ? '' : activeCategory });
  const { items: books, loading } = listing;
  const filtered = books;

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
    <div className="rpl-page rpl-public min-h-screen bg-panel text-ink pt-[calc(var(--rpl-header-height)+2rem)] pb-20 font-sans transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {categoryResource.error && <p role="alert" className="text-danger">Categories could not be loaded. <button onClick={categoryResource.retry}>Retry categories</button></p>}
          <PageControls {...listing} />

        {/* Header */}
        <div className="mb-10 border-b border-line pb-8">
          <span className="text-sm font-semibold tracking-normal text-link mb-3 block">
            Public catalog
          </span>
          <h1 className="font-semibold tracking-normal leading-none mb-4 rpl-title">
            Explore the collection
          </h1>
          <p className="text-muted font-medium max-w-2xl">
            Find books by title or author, explore categories, and check availability.
          </p>
        </div>

        {/* Filters + Search (sticky) */}
        <div className="flex flex-col lg:flex-row gap-4 mb-12 sticky top-[var(--rpl-header-height)] z-30 bg-panel py-4 -mx-6 md:-mx-12 px-6 md:px-12 border-b border-line">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold tracking-normal transition-all border flex-shrink-0 ${
                  activeCategory === cat
                    ? 'bg-action border-line border-line text-white shadow-md'
                    : 'bg-panel border-line text-muted hover:border-line hover:text-link hover:text-link'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-ink group-focus-within:text-link transition-colors" size={18} />
            <input
              type="text"
              aria-label="Search by title or author" placeholder="Search by title or author"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-subtle border border-line rounded-lg py-3.5 pl-14 pr-12 outline-none focus:ring-2 focus:ring-line transition-all font-medium text-muted placeholder:text-ink"
            />
            {searchQuery && (
              <button aria-label="Close"
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-ink hover:text-ink transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <RefreshCw size={28} className="animate-spin text-link" />
          </div>
        ) : (
          <>
            {/* Results count */}
            <p className="text-sm font-semibold tracking-normal text-muted mb-6">
              Showing {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              {activeCategory !== 'All' ? ` in ${activeCategory}` : ''}
            </p>

            {/* Grid */}
            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                {filtered.map((book) => (
                  <div key={book.id} className="transition-all duration-300">
                    <BookCard book={{ ...book, name: book.title }} onClick={() => setSelected(book)} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-32 text-center">
                <div className="w-20 h-20 bg-subtle rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search size={32} className="text-ink" />
                </div>
                <p className="text-2xl font-semibold tracking-normal text-ink">
                  No matches found
                </p>
                <button
                  onClick={() => { setActiveCategory('All'); setSearchQuery(''); }}
                  className="mt-4 text-sm font-semibold tracking-normal text-link underline underline-offset-4"
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
          <ModalFrame onClose={() => setSelected(null)}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70"
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
              className="max-w-3xl w-full bg-panel border border-line rounded-xl md:rounded-xl overflow-hidden shadow-sm max-h-[90vh] overflow-y-auto"
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
                    <span className={`px-3 py-1.5 rounded-full text-sm font-semibold tracking-normal ${
                      selected.availability_status === 'Not available'
                        ? 'bg-danger-soft text-danger'
                        : selected.availability_status === 'Limited'
                        ? 'bg-warning-soft text-warning'
                        : 'bg-success-soft text-success'
                    }`}>
                      {selected.availability_status}
                    </span>
                  </div>
                  {/* Page indicator */}
                  <div className="absolute bottom-5 right-5 px-2.5 py-1 bg-black/40 rounded-full">
                    <span className="text-sm font-semibold text-white tracking-normal">
                      {currentIdx + 1} / {filtered.length}
                    </span>
                  </div>
                </div>

                {/* Info panel */}
                <div className="p-5 md:p-10 flex flex-col justify-between relative">
                  <button aria-label="Close"
                    onClick={() => setSelected(null)}
                    className="absolute top-6 right-6 p-2 text-muted hover:text-ink hover:bg-subtle rounded-lg transition-all"
                  >
                    <X size={20} />
                  </button>

                  <div>
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
                      <p className="text-muted text-sm font-medium mb-6">
                        Published {selected.year}
                      </p>
                    )}

                    {selected.description && (
                      <p className="text-muted text-sm leading-relaxed mb-8">
                        {selected.description}
                      </p>
                    )}

                    {/* Availability badge */}
                    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl mb-8 ${
                      selected.availability_status === 'Unavailable'
                        ? 'bg-danger-soft bg-danger-soft border border-danger border-danger'
                        : selected.availability_status === 'Limited'
                        ? 'bg-warning-soft bg-warning-soft border border-warning border-warning'
                        : 'bg-success-soft bg-success-soft border border-success border-success'
                    }`}>
                      <BookOpen size={14} className={
                        selected.availability_status === 'Unavailable' ? 'text-danger' :
                        selected.availability_status === 'Limited' ? 'text-warning' :
                        'text-success text-success'
                      } />
                      <span className={`text-sm font-semibold tracking-normal ${
                        selected.availability_status === 'Unavailable'
                          ? 'text-danger text-danger'
                          : selected.availability_status === 'Limited'
                          ? 'text-warning text-warning'
                          : 'text-success text-success'
                      }`}>
                        {selected.availability_status === 'Unavailable' ? 'Currently checked out' :
                         selected.availability_status === 'Limited' ? 'Limited copies available' :
                        'Available at the library'}
                      </span>
                    </div>

                    {!isAvailable && !isLibrarian && (
                      <p className="text-sm font-bold leading-relaxed text-warning bg-warning-soft border border-warning rounded-xl px-4 py-3 mb-6">
                        Currently not available. Reserve now to join the queue. You'll be notified when it's your turn.
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="space-y-3">
                    {!isLibrarian && <Link
                      to={isMember ? `/user/reservations?reserveBook=${selected.id}` : reserveLoginPath(selected.id)}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-action hover:bg-action-hover text-white rounded-xl font-semibold text-sm tracking-normal transition-all"
                    >
                      {isMember ? <BookOpen size={15} /> : <LogIn size={15} />}
                      {isMember
                        ? (isAvailable ? 'Reserve Book' : 'Join Queue')
                        : (isAvailable ? 'Login to Reserve' : 'Login to Join Queue')}
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
              <button aria-label="Next"
                onClick={(e) => { e.stopPropagation(); navigateBook(1); }}
                className="absolute right-2 md:right-4 z-10 p-2 md:p-3 bg-panel hover:bg-panel rounded-full text-ink transition-all hidden sm:block"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </ModalFrame>
        );
      })()}
    </div>
  );
};

export default PublicBrowse;
