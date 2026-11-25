import useReadResource from '../../api/useReadResource';
import ModalFrame from '../../components/ModalFrame';
import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X, RefreshCw, BookOpen, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import BookCover from '../../components/BookCover';
import BookShelf from '../../components/public/BookShelf';
import CatalogBookCard from '../../components/public/CatalogBookCard';
import LibrarianPublicNavbar from '../../components/public/LibrarianPublicNavbar';
import { getCategoryPreviews } from '../../api/books';
import { getStoredAuth } from '../../api/authRoutes';
import CatalogCategories from '../../components/public/CatalogCategories';
import { normalizeCatalogSearch } from '../../api/catalogDiscovery';

const PublicBrowse = ({ librarianPortal = false }) => {
  // This role controls catalogue presentation; protected actions still verify
  // the session and role on the server.
  const { isLoggedIn, role } = getStoredAuth();
  const isLibrarianView = librarianPortal || (isLoggedIn && role === 'librarian');
  const isMember = isLoggedIn && role === 'member';
  const categoryResource = useReadResource(getCategoryPreviews);
  const [activeCategory, setActiveCategory] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = Array.from(searchParams.get('q') || '').slice(0, 200).join('');
  const searchTerm = normalizeCatalogSearch(searchQuery);
  const setSearchQuery = (value) => {
    setSearchParams(previous => { const next = new URLSearchParams(previous); if (value) next.set('q', value); else next.delete('q'); return next; }, { replace: true });
  };
  const [selected, setSelected] = useState(null);
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);

  const listing = useServerPage('/api/books', { search: searchTerm, category: activeCategory }, null, 24);
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
    <div className="rpl-page rpl-public rpl-discovery rpl-catalog min-h-screen min-w-0 font-sans">
      {librarianPortal && <LibrarianPublicNavbar />}
      <main className="discovery-container catalog-content">
        <div className="catalog-search">
          <Search aria-hidden="true" size={20} />
          <input type="text" maxLength={200} aria-label="Search by title or author" placeholder="Search by title or author"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && (
            <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={18} /></button>
          )}
        </div>

        {categoryResource.error && <p role="alert" className="catalog-category-error text-danger">Categories could not be loaded. <button onClick={categoryResource.retry}>Retry categories</button></p>}

        <CatalogCategories categories={categoryResource.data || []} activeCategory={activeCategory}
          onSelect={setActiveCategory} />

        <div className="catalog-panel">
          <BookShelf resetKey={`${activeCategory}:${searchQuery}:${listing.page}`}
            heading={searchTerm ? `Results for “${searchTerm}”` : activeCategory === '' ? 'All books' : activeCategory}
            label={`${activeCategory === '' ? 'All books' : activeCategory} shelf`} controlsLabel="books"
            description={<p className="catalog-results-count">
              Showing {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              {activeCategory !== '' ? ` in ${activeCategory}` : ''}
            </p>}
            before={<div className="catalog-page-controls catalog-page-controls-top"><PageControls {...listing} /></div>}
            after={<div className="catalog-page-controls catalog-page-controls-bottom"><PageControls {...listing} /></div>}>
            {loading ? (
              <div className="catalog-shelf-state" role="status" aria-label="Loading books">
                <RefreshCw size={25} className="animate-spin text-link" />
              </div>
            ) : listing.error ? (
              <div className="catalog-shelf-state catalog-empty" role="status"><p>Books could not be loaded.</p><button type="button" onClick={listing.reload}>Retry books</button></div>
            ) : filtered.length > 0 ? filtered.map((book) => (
              <CatalogBookCard key={book.id} book={book} onClick={() => setSelected(book)} query={searchTerm} />
            )) : (
              <div className="catalog-shelf-state catalog-empty">
                <BookOpen size={34} strokeWidth={1.25} aria-hidden="true" />
                <p>No matches found</p>
                <button type="button" onClick={() => { setActiveCategory(''); setSearchQuery(''); }}>Reset all filters</button>
              </div>
            )}
          </BookShelf>
        </div>
      </main>

      {selected && (() => {
        const currentIdx = filtered.findIndex(b => b.id === selected.id);
        const isAvailable = (selected.copies_available ?? 0) > 0;
        return (
          <ModalFrame onClose={() => setSelected(null)} aria-label="Book details"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70"
            onClick={() => setSelected(null)}
          >
            <div
              className="relative max-w-3xl w-full h-[min(36rem,calc(100dvh_-_2rem))] min-h-0 bg-panel border border-line rounded-xl overflow-hidden shadow-sm"
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
              <button aria-label="Close book details" onClick={() => setSelected(null)}
                className="absolute top-3 right-3 z-20 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-line bg-panel text-muted transition-colors hover:text-ink">
                <X size={24} />
              </button>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-2/5 md:right-auto md:h-full md:w-1/2 landscape:right-auto landscape:h-full landscape:w-1/2">
                {currentIdx > 0 && <button aria-label="Previous book"
                  onClick={(e) => { e.stopPropagation(); navigateBook(-1); }}
                  className="pointer-events-auto absolute left-2 top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-ink transition-colors hover:bg-subtle">
                  <ChevronLeft size={28} />
                </button>}
                {currentIdx < filtered.length - 1 && <button aria-label="Next book"
                  onClick={(e) => { e.stopPropagation(); navigateBook(1); }}
                  className="pointer-events-auto absolute right-2 top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-ink transition-colors hover:bg-subtle">
                  <ChevronRight size={28} />
                </button>}
              </div>
              <div key={animKey} className={`grid h-full min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-2 md:grid-rows-1 landscape:grid-cols-2 landscape:grid-rows-1 ${slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left-book'}`}>
                {/* Cover panel */}
                <div className="relative min-h-0 min-w-0 overflow-hidden bg-subtle">
                  <BookCover src={selected.cover_url || selected.cover} alt={selected.title}
                    className="h-full w-full object-contain" iconSize={48} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 hidden sm:block">
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
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/40 rounded-full">
                    <span className="text-sm font-semibold text-white tracking-normal">
                      {currentIdx + 1} / {filtered.length}
                    </span>
                  </div>
                </div>

                {/* Info panel */}
                <div className="min-h-0 min-w-0 overflow-y-auto">
                  <div className="flex min-h-full flex-col justify-between gap-6 p-5 md:p-10">
                    <div>
                      <p className="pr-12 text-sm font-semibold tracking-normal text-link mb-3">
                        {selected.category}
                      </p>
                      <h2 className="pr-8 break-words font-semibold tracking-normal leading-none text-ink mb-2 rpl-section-title">
                        {selected.title}
                      </h2>
                      <p className="break-words text-link font-bold text-sm tracking-normal mb-1">
                        {selected.author}
                      </p>
                      {selected.year && (
                        <p className="text-muted text-sm font-medium mb-6">
                          Published {selected.year}
                        </p>
                      )}

                      {selected.description && (
                        <p className="whitespace-pre-wrap break-words text-muted text-sm leading-relaxed mb-8">
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

                      {selected.is_borrowable === false && <p className="mb-5 rounded-xl border border-line bg-info-soft p-4 text-sm text-link">Library use only. {selected.circulation_note || 'This title can be read at the library and cannot be borrowed or reserved.'}</p>}
                      {!isAvailable && !isLibrarianView && selected.is_borrowable !== false && (
                        <p className="text-sm font-bold leading-relaxed text-warning bg-warning-soft border border-warning rounded-xl px-4 py-3 mb-6">
                          Currently not available. Reserve now to join the queue. You'll be notified when it's your turn.
                        </p>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="space-y-3">
                      {!isLibrarianView && selected.is_borrowable !== false && <Link
                        to={isMember ? `/user/reservations?reserveBook=${selected.id}` : reserveLoginPath(selected.id)}
                        className="min-h-[44px] w-full flex items-center justify-center gap-2 py-4 bg-action hover:bg-action-hover text-white rounded-xl font-semibold text-sm tracking-normal transition-all"
                      >
                        {isMember ? <BookOpen size={15} /> : <LogIn size={15} />}
                        {isMember
                          ? (isAvailable ? 'Reserve Book' : 'Join Queue')
                          : (isAvailable ? 'Login to Reserve' : 'Login to Join Queue')}
                      </Link>}
                      <button
                        onClick={() => setSelected(null)}
                        className="min-h-[44px] w-full py-3 border border-line text-muted rounded-lg font-semibold text-sm tracking-normal hover:border-line transition-all"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </ModalFrame>
        );
      })()}
    </div>
  );
};

export default PublicBrowse;
