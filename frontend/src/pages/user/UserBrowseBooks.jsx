import useReadResource from '../../api/useReadResource';
import { Link } from 'react-router-dom';
import ModalFrame from '../../components/ModalFrame';
import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import { Search, BookOpen, Heart, Bookmark, XCircle, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import { getBook, getCategories, getTrendingShelf, getNewestShelf, getLovedShelf } from '../../api/books';
import { getReadingStats } from '../../api/user';
import { normalizeCatalogSearch } from '../../api/catalogDiscovery';
import BookShelf from '../../components/public/BookShelf';
import CatalogCategories from '../../components/public/CatalogCategories';
import CatalogSort from '../../components/public/CatalogSort';
import CatalogSection from '../../components/public/CatalogSection';
import MemberCatalogCard from '../../components/public/MemberCatalogCard';
import { recordBookView } from '../../api/bookInteractions';
import useBookRecommendations from '../../api/useBookRecommendations';
import { getReservations, cancelReservation as apiCancelReservation } from '../../api/reservations';
import {
  addReservationCartItem,
  loadReservationCart,
  saveReservationCart,
} from '../../api/reservationCart';
import BookCover from '../../components/BookCover';
import BorrowingCapacity from '../../components/BorrowingCapacity';
import useBorrowingCapacity from '../../api/useBorrowingCapacity';
import { loadPendingConfirmation } from '../../api/reservationCart';

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function UserBrowseBooks() {
  const allowance = useBorrowingCapacity();
  const categoryResource = useReadResource(getCategories);
  const historyResource = useReadResource(getReadingStats);
  const trendingResource = useReadResource(getTrendingShelf);
  const newestResource = useReadResource(getNewestShelf);
  const lovedResource = useReadResource(getLovedShelf);
  const hasBorrowed = (historyResource.data?.total_books_read || 0) > 0;
  const [reservations, setReservations] = useState([]);

  const [cart, setCart] = useState(() => loadReservationCart());
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const {
    recs, recLoading, recError, favorites, favoritesLoading, favoritesError,
    pendingFavorites, toggleFavorite, retryRecommendations, retryFavorites,
  } = useBookRecommendations(selected !== null || !hasBorrowed);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [sort, setSort] = useState('trending');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [modalShelf, setModalShelf] = useState(null);
  const searchTerm = normalizeCatalogSearch(search);
  const featured = activeCategory === null && !searchTerm;
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);
  const catalogHeadingRef = useRef(null);

  const listing = useServerPage('/api/books', { search: searchTerm, category: activeCategory || '', sort, favorites_only: favoritesOnly });
  const { items: books, loading } = listing;
  useEffect(() => {
    getReservations().then(({ data }) => setReservations(data)).catch(() => toast.error('Could not load reservations. Please reload to retry.'));
  }, []);

  const isDark = document.documentElement.classList.contains('dark');

  const addToCart = (book) => {
    if (loadPendingConfirmation()) return toast.info('Resolve your pending confirmation in My Reservations first.');
    if (!allowance.capacity || cart.length >= allowance.capacity.remaining_slots) {
      allowance.refreshCapacity();
      return toast.info('Your selection has reached the remaining book allowance. Return or cancel a book to free a slot.');
    }
    if (cart.find((c) => c.id === book.id) || reservations.find(r => r.book_id === book.id)) {
      return toast.info('Already in your reservations.', { position: 'bottom-right' });
    }
    const { items } = addReservationCartItem(cart, book);
    setCart(items);
    saveReservationCart(items);
    const available = (book.copies_available ?? 0) > 0;
    toast.success(
      available
        ? `"${book.title}" added to your selection. Confirm in My Reservations.`
        : `"${book.title}" added to your queue selection.`,
      { position: 'bottom-right' }
    );
  };

  const handleCancelReservation = async (bookId) => {
    const res = reservations.find(r => r.book_id === bookId);
    if (!res) return;
    try {
      await apiCancelReservation(res.id);
      setReservations(prev => prev.filter(r => r.id !== res.id));
      allowance.refreshCapacity();
      toast.success('Reservation cancelled.', { position: 'bottom-right' });
    } catch {
      toast.error('Failed to cancel reservation.', { position: 'bottom-right' });
    }
  };

  const filteredBooks = books;

  const openBook = useCallback((book) => {
    const requestId = ++detailRequest.current;
    setSelected(book);
    setDetailLoading(true);
    // Analytics never blocks browsing and never runs on render/hover.
    recordBookView(book.id).catch(() => {});
    getBook(book.id).then(({ data }) => {
      if (requestId === detailRequest.current) {
        setSelected(previous => previous?.id === book.id ? data : previous);
      }
    }).catch(() => {
      if (requestId === detailRequest.current) {
        toast.error('Could not load book details. Please try again.', { position: 'bottom-right' });
        setSelected(null);
      }
    }).finally(() => {
      if (requestId === detailRequest.current) setDetailLoading(false);
    });
  }, []);

  const selectBook = (book, shelf) => {
    setModalShelf(shelf);
    openBook(book);
  };
  const modalBooks = useMemo(() => {
    const source = modalShelf || filteredBooks;
    return selected && !source.some(book => book.id === selected.id) ? [selected, ...source] : source;
  }, [selected, filteredBooks, modalShelf]);

  const navigateBook = (dir) => {
    const idx = modalBooks.findIndex(b => b.id === selected?.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= modalBooks.length) return;
    setSlideDir(dir === 1 ? 'right' : 'left');
    setAnimKey(k => k + 1);
    openBook(modalBooks[newIdx]);
  };

  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const idx = modalBooks.findIndex(b => b.id === selected.id);
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'ArrowRight' && idx < modalBooks.length - 1) {
        setSlideDir('right'); setAnimKey(k => k + 1); openBook(modalBooks[idx + 1]);
      }
      if (e.key === 'ArrowLeft' && idx > 0) {
        setSlideDir('left'); setAnimKey(k => k + 1); openBook(modalBooks[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, modalBooks, openBook]);

  const favoriteProps = (book) => ({
    book, active: favorites.has(book.id), onToggle: async () => {
      await toggleFavorite(book.id);
      lovedResource.retry();
      if (sort === 'loved') listing.reload();
    },
    disabled: favoritesLoading || favoritesError || pendingFavorites.has(book.id),
  });

  const changeCatalogPage = (page) => {
    listing.setPage(page);
    catalogHeadingRef.current?.scrollIntoView({ block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  const trendingBooks = trendingResource.data?.items || [];
  const newestBooks = newestResource.data?.items || [];
  const lovedBooks = lovedResource.data?.items || [];
  const previewBooks = [...new Map([...trendingBooks, ...newestBooks, ...lovedBooks, ...books].map(book => [book.id, book])).values()];
  const showAll = (nextSort, onlyLoved = false) => {
    listing.setPage(0);
    setActiveCategory(''); setSearch(''); setSort(nextSort); setFavoritesOnly(onlyLoved);
    requestAnimationFrame(() => catalogHeadingRef.current?.scrollIntoView({ block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };
  const changeCategory = (value) => { listing.setPage(0); setActiveCategory(value); setSearch(''); setFavoritesOnly(false); };
  const renderBook = (book, shelf, query = '', badge) => <MemberCatalogCard key={book.id} book={book} query={query}
    onSelect={() => selectBook(book, shelf)} onAdd={() => addToCart(book)} onCancel={() => handleCancelReservation(book.id)}
    isInCart={cart.some(item => item.id === book.id)} isReserved={reservations.some(item => item.book_id === book.id)}
    favorite={<FavoriteButton {...favoriteProps(book)} />} badge={badge} />;

  return (
    <div className="rpl-page rpl-catalog rpl-member-catalog min-h-screen min-w-0 text-ink pb-16">
      <ToastContainer theme={isDark ? 'dark' : 'light'} />
      <main className="discovery-container catalog-content">
        <div className="catalog-member-heading">
          <div><p className="text-sm text-muted mb-1">Member library</p><h1 className="rpl-title">Browse <span className="text-link">Books</span></h1></div>
          {(cart.length > 0 || reservations.length > 0) && <Link to="/user/reservations"
            aria-label={`View My Reservations, ${cart.length + reservations.length} reserved`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-link transition-colors hover:bg-info-soft">
            <Bookmark size={16} aria-hidden="true" />{cart.length + reservations.length} reserved
          </Link>}
        </div>
        <div className="catalog-search">
          <Search aria-hidden="true" size={20} />
          <input type="text" maxLength={200} aria-label="Search by title or author" placeholder="Search by title or author" value={search}
            onChange={event => { listing.setPage(0); setSearch(event.target.value); if (activeCategory === null) setActiveCategory(''); }} />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={18} /></button>}
        </div>
        <div className="catalog-member-allowance"><BorrowingCapacity {...allowance} /><p>Books are not held until you confirm. Availability may change.</p></div>
        {categoryResource.error && <p role="alert" className="catalog-category-error text-danger">Categories could not be loaded. <button onClick={categoryResource.retry}>Retry categories</button></p>}
        <CatalogCategories categories={categoryResource.data || []} activeCategory={activeCategory} onSelect={changeCategory} books={previewBooks} featured headingLevel={2} />
        {favoritesError && <p role="status" className="catalog-category-error text-muted">Favorites could not be loaded. <button onClick={retryFavorites}>Retry favorites</button></p>}
        {featured ? <div className="catalog-panel catalog-featured">
          <div className="catalog-featured-heading">
            <h2>Featured</h2>
            <nav aria-label="Featured sections">Jump to
              {hasBorrowed && <a href="#member-recommended">Recommended for you</a>}
              <a href="#member-trending">Trending</a><a href="#member-new">What's new</a><a href="#member-loved">Books we love</a>
            </nav>
          </div>
          {historyResource.loading && <p role="status" className="text-sm text-muted">Loading your reading history...</p>}
          {historyResource.error && <p role="status" className="catalog-category-error text-muted">Reading history could not be loaded. <button onClick={historyResource.retry}>Retry reading history</button></p>}
          {hasBorrowed && <CatalogSection id="member-recommended" heading="Recommended for you" description="Based on your borrowing and reading interests."
            loading={recLoading} error={recError} onRetry={retryRecommendations} hasBooks={recs.length > 0}
            emptyMessage="No new suggestions yet. Explore the catalog and favorite books you enjoy.">
            {recs.map(book => renderBook(book, recs, '', recommendationBadge(book.source)))}
          </CatalogSection>}
          <CatalogSection id="member-trending" heading="Trending" description="Popular loans from the past 30 days, with new arrivals to explore."
            loading={trendingResource.loading} error={trendingResource.error} onRetry={trendingResource.retry} onSeeAll={() => showAll('trending')}
            hasBooks={trendingBooks.length > 0} emptyMessage="No books in the collection yet.">
            {trendingBooks.map(book => renderBook(book, trendingBooks))}
          </CatalogSection>
          <CatalogSection id="member-new" heading="What's new" description="The latest additions to the library."
            loading={newestResource.loading} error={newestResource.error} onRetry={newestResource.retry} onSeeAll={() => showAll('newest')}
            hasBooks={newestBooks.length > 0} emptyMessage="No new arrivals yet.">
            {newestBooks.map(book => renderBook(book, newestBooks, '', { label: 'New arrival' }))}
          </CatalogSection>
          <CatalogSection id="member-loved" heading="Books we love" description="Books saved to favorites by our reading community."
            loading={lovedResource.loading} error={lovedResource.error} onRetry={lovedResource.retry} onSeeAll={() => showAll('loved', true)}
            hasBooks={lovedBooks.length > 0} emptyMessage="No community favorites yet. Favorite a book to help build this shelf.">
            {lovedBooks.map(book => renderBook(book, lovedBooks))}
          </CatalogSection>
        </div> : <div ref={catalogHeadingRef} className="catalog-panel catalog-full-list">
          <BookShelf resetKey={`${activeCategory}:${searchTerm}:${sort}:${listing.page}`} heading={searchTerm ? `Results for “${searchTerm}”` : activeCategory || 'All books'}
            label={`${activeCategory || 'All books'} shelf`} description={<p className="catalog-results-count">{listing.total} {listing.total === 1 ? 'book' : 'books'}{favoritesOnly ? ' loved by readers' : ''}</p>}
            headingAction={<CatalogSort value={sort} onChange={value => { setSort(value); setFavoritesOnly(false); }} />}
            before={<nav aria-label="Catalog pages at top" className="catalog-page-controls catalog-page-controls-top"><PageControls {...listing} setPage={changeCatalogPage} /></nav>}
            after={<nav aria-label="Catalog pages at bottom" className="catalog-page-controls catalog-page-controls-bottom"><PageControls {...listing} setPage={changeCatalogPage} /></nav>}>
            {loading ? <div role="status" aria-label="Loading catalog" className="catalog-shelf-state"><RefreshCw className="animate-spin text-link" /></div>
              : listing.error ? <div role="status" className="catalog-shelf-state catalog-empty"><p>Books could not be loaded.</p><button onClick={listing.reload}>Retry books</button></div>
                : filteredBooks.length ? filteredBooks.map(book => renderBook(book, filteredBooks, searchTerm))
                  : <div className="catalog-shelf-state catalog-empty"><BookOpen size={34} aria-hidden="true" /><p>No books found</p><button onClick={() => { setSearch(''); setActiveCategory(''); setFavoritesOnly(false); }}>Reset filters</button></div>}
          </BookShelf>
        </div>}
      </main>

      {selected && (() => {
        const currentIdx = modalBooks.findIndex(b => b.id === selected.id);
        const isInCart = !!cart.find((c) => c.id === selected.id);
        const isReserved = !!reservations.find((r) => r.book_id === selected.id);
        const isAvailable = (selected.copies_available ?? 0) > 0;
        return (
          <ModalFrame onClose={() => setSelected(null)}
            role="dialog" aria-modal="true" aria-label="Book details"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70"
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
                <XCircle size={26} />
              </button>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-2/5 md:right-auto md:h-full md:w-1/2 landscape:right-auto landscape:h-full landscape:w-1/2">
                {currentIdx > 0 && <button
                  aria-label="Previous book" onClick={(e) => { e.stopPropagation(); navigateBook(-1); }}
                  className="pointer-events-auto absolute left-2 top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-ink transition-colors hover:bg-subtle">
                  <ChevronLeft size={28} />
                </button>}
                {currentIdx < modalBooks.length - 1 && <button
                  aria-label="Next book" onClick={(e) => { e.stopPropagation(); navigateBook(1); }}
                  className="pointer-events-auto absolute right-2 top-1/2 flex h-[44px] w-[44px] -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-ink transition-colors hover:bg-subtle">
                  <ChevronRight size={28} />
                </button>}
              </div>
              <div key={animKey} className={`grid h-full min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] md:grid-cols-2 md:grid-rows-1 landscape:grid-cols-2 landscape:grid-rows-1 ${slideDir === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left-book'}`}>
                <div className="relative min-h-0 min-w-0 overflow-hidden bg-subtle">
                  <BookCover src={selected.cover_url} alt={selected.title} className="h-full w-full object-contain" iconSize={48} />
                  {/* Page indicator */}
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/40 rounded-full">
                    <span className="text-sm font-semibold text-white tracking-normal">
                      {currentIdx + 1} / {modalBooks.length}
                    </span>
                  </div>
                </div>
                <div className="min-h-0 min-w-0 overflow-y-auto p-5 md:p-10 flex flex-col relative">
                  <div className="my-auto w-full shrink-0">
                    <span className={`inline-block mb-4 px-3 py-1 rounded-full text-sm font-semibold tracking-normal w-fit ${
                      selected.availability_status === 'Available'
                        ? 'bg-success-soft text-success'
                        : selected.availability_status === 'Limited'
                        ? 'bg-warning-soft text-warning'
                        : 'bg-danger-soft text-danger'
                    }`}>
                      {selected.availability_status === 'Available' ? `${selected.copies_available} Available` :
                       selected.availability_status === 'Limited' ? 'Limited Copies' :
                       'Not available'}
                    </span>
                    <h2 className="pr-8 font-semibold tracking-normal mb-2 leading-none text-ink rpl-section-title">
                      {selected.title}
                    </h2>
                    <p className="text-link font-bold text-sm tracking-normal mb-1">
                      {selected.author}
                    </p>
                    <p className="text-muted text-sm font-medium mb-5">
                      {selected.category} • {selected.year}
                    </p>
                    {selected.isbn && (
                      <p className="text-muted text-sm font-sans mb-5">ISBN: {selected.isbn}</p>
                    )}
                    {selected.description && <section className="mb-5"><h3 className="mb-2 font-semibold text-ink">About this book</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{selected.description}</p></section>}
                    <div className="mb-4"><FavoriteButton {...favoriteProps(selected)} showLabel /></div>
                    {detailLoading && <p role="status" className="mb-3 text-sm">Loading book details…</p>}
                    {!isAvailable && (
                      <p className="text-sm font-bold leading-relaxed text-warning bg-warning-soft border border-warning rounded-xl px-4 py-3 mb-5">
                        Currently not available. Reserve now to join the queue. You'll be notified when it's your turn.
                      </p>
                    )}
                    {isReserved ? (
                      <button
                        onClick={() => { handleCancelReservation(selected.id); setSelected(null); }}
                        className="w-full py-4 bg-danger-soft hover:bg-danger-soft rounded-lg font-semibold text-sm tracking-normal transition-all flex items-center justify-center gap-3 text-danger"
                      >
                        <X size={16} />
                        Cancel Reservation
                      </button>
                    ) : (
                      <button
                        onClick={() => { addToCart(selected); setSelected(null); }}
                        disabled={isInCart || detailLoading}
                        className={`w-full py-4 rounded-lg font-semibold text-sm tracking-normal transition-all  flex items-center justify-center gap-3 text-white ${
                          isInCart ? 'bg-emerald-700 cursor-default' : 'bg-action hover:bg-action-hover disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        <Bookmark size={16} />
                        {detailLoading ? 'Loading…' : isInCart ? 'Already In Selection' : isAvailable ? 'Reserve This Book' : 'Join Reservation Queue'}
                      </button>
                    )}
                  </div>
                </div>
              </div>


            </div>


          </ModalFrame>
        );
      })()}
    </div>
  );
}

// ─── CARD COMPONENTS ──────────────────────────────────────────────────────────

const recommendationBadge = (source) => ({
  collaborative: { label: 'For you', color: 'bg-violet-600' },
  content: { label: 'Your interests', color: 'bg-action' },
  popular: { label: 'Popular', color: 'bg-emerald-700' },
  new: { label: 'New arrival', color: 'bg-slate-700' },
}[source] ?? { label: 'Discover', color: 'bg-slate-700' });

const FavoriteButton = ({ book, active, disabled, onToggle, showLabel = false }) => (
  <button type="button" aria-pressed={active} disabled={disabled}
    aria-label={`${active ? 'Remove favorite' : 'Favorite'}: ${book.title}`}
    onClick={(event) => { event.stopPropagation(); onToggle(); }}
    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-panel px-2.5 py-2 text-danger shadow-sm border border-line disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500">
    <Heart size={18} fill={active ? 'currentColor' : 'none'} />
    {showLabel && <span className="text-sm font-semibold">{active ? 'Favorited' : 'Add to favorites'}</span>}
  </button>
);
