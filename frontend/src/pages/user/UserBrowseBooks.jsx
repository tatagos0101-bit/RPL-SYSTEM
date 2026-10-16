import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import { Search, Sparkles, Heart, Bookmark, XCircle, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import { getBook, getBooks, getCategories } from '../../api/books';
import { recordBookView } from '../../api/bookInteractions';
import useBookRecommendations from '../../api/useBookRecommendations';
import { getReservations, cancelReservation as apiCancelReservation } from '../../api/reservations';
import {
  addReservationCartItem,
  loadReservationCart,
  saveReservationCart,
} from '../../api/reservationCart';
import BookCover from '../../components/BookCover';

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function UserBrowseBooks() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState([]);

  const [cart, setCart] = useState(() => loadReservationCart());
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);
  const {
    recs, recLoading, recError, favorites, favoritesLoading, favoritesError,
    pendingFavorites, toggleFavorite, retryRecommendations, retryFavorites,
  } = useBookRecommendations(selected !== null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);

  const fetchData = () => {
    Promise.all([
      getBooks({ limit: 1000 }),
      getCategories(),
      getReservations()
    ])
      .then(([bRes, cRes, resRes]) => {
        setBooks(bRes.data.items ?? bRes.data);
        setCategories(['All', ...cRes.data.map((c) => c.category)]);
        setReservations(resRes.data);
      })
      .catch(() => toast.error('Failed to load books.', { position: 'bottom-right' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isDark = document.documentElement.classList.contains('dark');

  const addToCart = (book) => {
    if (cart.find((c) => c.id === book.id) || reservations.find(r => r.book_id === book.id)) {
      return toast.info('Already in your reservations.', { position: 'bottom-right' });
    }
    const { items } = addReservationCartItem(cart, book);
    setCart(items);
    saveReservationCart(items);
    const available = (book.copies_available ?? 0) > 0;
    toast.success(
      available
        ? `"${book.title}" added to reservations!`
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
      toast.success('Reservation cancelled.', { position: 'bottom-right' });
    } catch {
      toast.error('Failed to cancel reservation.', { position: 'bottom-right' });
    }
  };

  const filteredBooks = useMemo(() => books.filter((b) => {
    const matchCat = activeCategory === 'All' || b.category === activeCategory;
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [books, activeCategory, search]);

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

  const modalBooks = useMemo(() => selected && !filteredBooks.some(book => book.id === selected.id)
    ? [selected, ...filteredBooks] : filteredBooks, [selected, filteredBooks]);

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
    book, active: favorites.has(book.id), onToggle: () => toggleFavorite(book.id),
    disabled: favoritesLoading || favoritesError || pendingFavorites.has(book.id),
  });

  return (
    <div className="rpl-page min-h-screen bg-subtle text-ink pb-16 transition-colors duration-300">
      <ToastContainer theme={isDark ? 'dark' : 'light'} />

      {/* ── HEADER ── */}
      <div className="animate-fade-in-up px-4 sm:px-6 md:px-10 pt-5 pb-4 border-b border-line">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold tracking-normal text-muted mb-2">
              Member Terminal
            </p>
            <h1 className="rpl-title text-ink">
              Browse <span className="text-link">Books</span>
            </h1>
          </div>

          {(cart.length > 0 || reservations.length > 0) && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-info-soft border border-line rounded-xl">
              <Bookmark size={14} className="text-link" />
              <span className="text-sm font-semibold tracking-normal text-link">
                {cart.length + reservations.length} reserved
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 px-4 sm:px-6 md:px-10 pt-5 space-y-8">
        <section aria-labelledby="recommendations-title" className="min-w-0">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-info-soft text-link">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 id="recommendations-title" className="rpl-section-title text-ink">Recommended for you</h2>
              <p className="text-sm text-muted mt-1">
                Discover your next read, using favorites, book views, and borrowing activity.
              </p>
            </div>
          </div>
          {recLoading ? (
            <div role="status" aria-label="Loading recommendations" className="flex gap-4 overflow-hidden">
              {[0, 1, 2, 3].map(item => <div key={item} className="h-64 w-40 shrink-0 animate-pulse rounded-xl border border-line bg-panel" />)}
            </div>
          ) : recError ? (
            <div role="status" className="rounded-lg border border-line p-4 text-sm">
              <p>Recommendations are unavailable. You can still browse all books below.</p>
              <button onClick={retryRecommendations} className="mt-2 text-link underline">Retry recommendations</button>
            </div>
          ) : recs.length === 0 ? (
            <p className="rounded-lg bg-panel p-4 text-sm text-muted">No new suggestions yet. Explore the catalog and favorite books you enjoy.</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-3" aria-label="Recommended books">
              {recs.map(book => (
                <SmallBookCard key={book.id} book={book}
                  onSelect={() => openBook(book)} onAdd={() => addToCart(book)}
                  onCancel={() => handleCancelReservation(book.id)}
                  isInCart={cart.some(item => item.id === book.id)}
                  isReserved={reservations.some(item => item.book_id === book.id)}
                  favorite={<FavoriteButton {...favoriteProps(book)} />}
                  badge={recommendationBadge(book.source)} />
              ))}
            </div>
          )}
        </section>
        {favoritesError && (
          <p role="status" className="text-sm text-muted">
            Favorites could not be loaded. <button onClick={retryFavorites} className="underline text-link">Retry favorites</button>
          </p>
        )}

          {/* ── DIVIDER ── */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-subtle" />
            <span className="text-sm font-semibold tracking-normal text-muted">All Books</span>
            <div className="h-px flex-1 bg-subtle" />
          </div>

          {/* ── FILTER & SEARCH ── */}
          <div className="animate-fade-in-up delay-200 flex flex-col lg:flex-row gap-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 border flex-shrink-0  ${
                    activeCategory === cat
                      ? 'bg-action border-line text-white shadow-md '
                      : 'bg-panel border-line text-muted hover:text-ink dark:hover:text-white hover:border-line '
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input
                type="text" aria-label="Search title or author..."
                placeholder="Search title or author..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-panel border border-line rounded-lg py-3 pl-11 pr-4 outline-none focus:border-line text-base font-medium text-ink placeholder:text-muted transition-all"
              />
            </div>
          </div>

          {/* ── BOOK GRID ── */}
          {loading ? (
            <div role="status" aria-label="Loading catalog" className="flex justify-center py-16"><RefreshCw className="animate-spin text-link" /></div>
          ) : filteredBooks.length > 0 ? (
            <div className="animate-fade-in-up delay-300 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredBooks.map((book) => {
                const isInCart = !!cart.find((c) => c.id === book.id);
                const isReserved = !!reservations.find((r) => r.book_id === book.id);
                return (
                  <BigBookCard
                    key={book.id}
                    book={book}
                    onSelect={() => openBook(book)}
                    onAdd={() => addToCart(book)}
                    onCancel={() => handleCancelReservation(book.id)}
                    favorite={<FavoriteButton {...favoriteProps(book)} />}
                    isInCart={isInCart}
                    isReserved={isReserved}
                  />
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-muted font-semibold tracking-normal text-sm mb-3">No books found</p>
              <button onClick={() => { setActiveCategory('All'); setSearch(''); }}
                className="text-sm font-semibold tracking-normal text-link underline underline-offset-4">
                Reset filters
              </button>
            </div>
          )}
      </div>

      {/* ── BOOK DETAIL MODAL ── */}
      {selected && (() => {
        const currentIdx = modalBooks.findIndex(b => b.id === selected.id);
        const isInCart = !!cart.find((c) => c.id === selected.id);
        const isReserved = !!reservations.find((r) => r.book_id === selected.id);
        const isAvailable = (selected.copies_available ?? 0) > 0;
        return (
          <div
            role="dialog" aria-modal="true" aria-label="Book details"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70"
            onClick={() => setSelected(null)}
          >
            {/* Left arrow */}
            {currentIdx > 0 && (
              <button
                aria-label="Previous book" onClick={(e) => { e.stopPropagation(); navigateBook(-1); }}
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
                <div className="aspect-[3/4] md:aspect-auto bg-subtle relative">
                  <BookCover src={selected.cover_url} alt={selected.title} iconSize={48} />
                  {/* Page indicator */}
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/40 rounded-full">
                    <span className="text-sm font-semibold text-white tracking-normal">
                      {currentIdx + 1} / {modalBooks.length}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 p-5 md:p-10 flex flex-col justify-center relative">
                  <button aria-label="Close book details" onClick={() => setSelected(null)}
                    className="absolute top-6 right-6 text-muted hover:text-ink transition-colors">
                    <XCircle size={26} />
                  </button>
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

              {/* Slider bar */}
              <div
                className="px-8 py-3 border-t border-line flex items-center gap-4"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="text-sm font-semibold text-muted tracking-normal tabular-nums shrink-0 w-12">
                  {currentIdx + 1} / {modalBooks.length}
                </span>
                <input
                  type="range" aria-label="Browse book details"
                  min={0}
                  max={modalBooks.length - 1}
                  value={currentIdx >= 0 ? currentIdx : 0}
                  onChange={(e) => {
                    const targetIdx = parseInt(e.target.value);
                    if (targetIdx === currentIdx) return;
                    setSlideDir(targetIdx > currentIdx ? 'right' : 'left');
                    setAnimKey(k => k + 1);
                    openBook(modalBooks[targetIdx]);
                  }}
                  className="min-w-0 w-full flex-1 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Right arrow */}
            {currentIdx < modalBooks.length - 1 && (
              <button
                aria-label="Next book" onClick={(e) => { e.stopPropagation(); navigateBook(1); }}
                className="absolute right-2 md:right-4 z-10 p-2 md:p-3 bg-panel hover:bg-panel rounded-full text-ink transition-all hidden sm:block"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── CARD COMPONENTS ──────────────────────────────────────────────────────────

const SmallBookCard = ({ book, onSelect, onAdd, onCancel, isInCart, isReserved, badge, favorite }) => {
  const available = (book.copies_available ?? 0) > 0;
  return (
    <div
      className="flex-none w-40 min-w-0 group cursor-pointer transition-transform duration-200"
    >
      <div className={`relative aspect-[2/3] rounded-xl overflow-hidden border transition-all duration-300 shadow-md mb-3 ${
        'border-line group-hover:border-line group-hover:shadow-sm '
      }`}>
        <BookCover src={book.cover_url} alt={book.title} className="w-full h-full object-cover transition-transform duration-500" iconSize={24} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute top-2 left-2">
          <span className={`px-2 py-1 ${badge.color} rounded-lg text-sm font-semibold tracking-normal text-white`}>
            {badge.label}
          </span>
        </div>
        <button aria-label={`View details for ${book.title}`} onClick={onSelect} className="absolute inset-0 focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-inset" />
        <div className="absolute top-10 right-2">{favorite}</div>
        {isReserved ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="absolute bottom-2 left-2 right-2 py-2 rounded-lg text-sm font-semibold tracking-normal transition-all bg-danger-soft hover:bg-danger-soft text-danger"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={isInCart}
            className={`absolute bottom-2 left-2 right-2 py-2 rounded-lg text-sm font-semibold tracking-normal transition-all ${
              isInCart
                ? 'bg-success-soft text-success cursor-default'
                : available
                ? 'bg-info-soft hover:bg-info-soft text-link'
                : 'bg-warning-soft hover:bg-warning-soft text-warning'
            }`}
          >
            {isInCart ? 'In Selection' : available ? 'Reserve' : 'Join Queue'}
          </button>
        )}
      </div>
      <button onClick={onSelect} className="w-full min-w-0 text-left text-sm font-bold text-ink line-clamp-2 leading-tight break-words">{book.title}</button>
      <p className="text-sm text-muted font-medium mt-0.5">{book.author}</p>
      <p className="mt-1 text-sm leading-snug text-link break-words">{book.reason}</p>
    </div>
  );
};

const BigBookCard = ({ book, onSelect, onAdd, onCancel, isInCart, isReserved, favorite }) => {
  const available = (book.copies_available ?? 0) > 0;
  return (
    <div className="min-w-0 group transition-transform duration-200 ">
      <div className={`relative aspect-[2/3] rounded-xl overflow-hidden border transition-all duration-300 mb-3 ${
        'border-line group-hover:border-line shadow-sm group-hover:shadow-sm '
      }`}>
        <BookCover src={book.cover_url} alt={book.title} className="w-full h-full object-cover transition-transform duration-500" iconSize={24} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {book.availability_status === 'Unavailable' && !isReserved && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-danger-soft rounded-lg">
            <p className="text-sm font-semibold text-ink">Unavailable</p>
          </div>
        )}
        {book.availability_status === 'Limited' && !isReserved && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-warning-soft rounded-lg">
            <p className="text-sm font-semibold text-ink">Limited</p>
          </div>
        )}
        <button aria-label={`View details for ${book.title}`} onClick={onSelect} className="absolute inset-0 focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-inset" />
        <div className="absolute top-10 right-2">{favorite}</div>
        {isReserved ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="absolute bottom-0 left-0 right-0 p-3 font-semibold text-sm tracking-normal transition-all bg-rose-600 text-white"
          >
            Cancel Reservation
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={isInCart}
            className={`absolute bottom-0 left-0 right-0 p-3 font-semibold text-sm tracking-normal transition-all ${
              isInCart
                ? 'bg-success-soft text-success cursor-default'
                : available
                ? 'bg-action hover:bg-action-hover text-white'
                : 'bg-warning-soft hover:bg-warning-soft text-warning'
            }`}
          >
            {isInCart ? 'In Selection' : available ? 'Reserve' : 'Join Queue'}
          </button>
        )}
      </div>
      <button onClick={onSelect} className="w-full min-w-0 text-left text-sm font-bold text-ink line-clamp-2 leading-tight break-words">{book.title}</button>
      <p className="text-sm text-muted font-medium mt-0.5 truncate">{book.author}</p>
      <p className="text-sm text-muted font-semibold tracking-normal mt-0.5">{book.category}</p>
    </div>
  );
};

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
