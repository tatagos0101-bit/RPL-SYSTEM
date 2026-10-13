import { useState, useEffect, useRef } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import { Search, Sparkles, TrendingUp, Bookmark, XCircle, Info, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';
import 'react-toastify/dist/ReactToastify.css';
import { getBooks, getCategories } from '../../api/books';
import { getRecommendations } from '../../api/user';
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
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState([]);

  const [cart, setCart] = useState(() => loadReservationCart());
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [slideDir, setSlideDir] = useState('right');
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);

  const fetchData = () => {
    Promise.all([
      getBooks({ limit: 1000 }), 
      getCategories(), 
      getRecommendations(10),
      getReservations()
    ])
      .then(([bRes, cRes, rRes, resRes]) => {
        setBooks(bRes.data.items ?? bRes.data);
        setCategories(['All', ...cRes.data.map((c) => c.category)]);
        setRecs(rRes.data);
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

  const filteredBooks = books.filter((b) => {
    const matchCat = activeCategory === 'All' || b.category === activeCategory;
    const matchSearch =
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.author.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const navigateBook = (dir) => {
    const idx = filteredBooks.findIndex(b => b.id === selected?.id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= filteredBooks.length) return;
    setSlideDir(dir === 1 ? 'right' : 'left');
    setAnimKey(k => k + 1);
    setSelected(filteredBooks[newIdx]);
  };

  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      const idx = filteredBooks.findIndex(b => b.id === selected.id);
      if (e.key === 'ArrowRight' && idx < filteredBooks.length - 1) {
        setSlideDir('right'); setAnimKey(k => k + 1); setSelected(filteredBooks[idx + 1]);
      }
      if (e.key === 'ArrowLeft' && idx > 0) {
        setSlideDir('left'); setAnimKey(k => k + 1); setSelected(filteredBooks[idx - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, filteredBooks]);

  const recBadge = recs[0]?.reason?.startsWith('Because')
    ? { label: 'AI Pick', color: 'bg-violet-600', accentColor: 'text-violet-600 dark:text-violet-400', accentBg: 'bg-violet-50 dark:bg-violet-900/20', icon: <Sparkles size={18} />, headline: recs[0]?.reason || 'Recommended for you', type: 'personalized' }
    : { label: 'Trending', color: 'bg-emerald-600', accentColor: 'text-emerald-600 dark:text-emerald-400', accentBg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: <TrendingUp size={18} />, headline: 'Trending this month', type: 'trending' };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-white pb-16 transition-colors duration-300">
      <ToastContainer theme={isDark ? 'dark' : 'light'} />

      {/* ── HEADER ── */}
      <div className="animate-fade-in-up px-6 md:px-10 pt-10 pb-8 border-b border-slate-200 dark:border-white/5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-400 dark:text-slate-600 mb-2">
              Member Terminal
            </p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter leading-none text-slate-900 dark:text-white">
              Browse <span className="text-blue-600 dark:text-blue-500">Books</span>
            </h1>
          </div>

          {(cart.length > 0 || reservations.length > 0) && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-600/15 border border-blue-200 dark:border-blue-500/30 rounded-2xl">
              <Bookmark size={14} className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                {cart.length + reservations.length} reserved
              </span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw size={28} className="animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="px-6 md:px-10 pt-8 space-y-12">

          {/* ── RECOMMENDATIONS ── */}
          {recs.length > 0 && (
            <section className="animate-fade-in-up delay-100">
              <div className="flex items-center gap-3 mb-5">
                <div className={`w-8 h-8 ${recBadge.accentBg} rounded-xl flex items-center justify-center ${recBadge.accentColor}`}>
                  {recBadge.icon}
                </div>
                <div>
                  <h2 className="text-xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">
                    {recBadge.headline}
                  </h2>
                  <p className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${recBadge.accentColor}`}>
                    {recBadge.type === 'personalized' ? 'Based on your reading history' : 'Most borrowed this month'}
                  </p>
                </div>
                {recBadge.type === 'trending' && (
                  <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                    <Info size={12} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      New user view
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {recs.map((book) => {
                  const isInCart = !!cart.find((c) => c.id === book.id);
                  const isReserved = !!reservations.find((r) => r.book_id === book.id);
                  return (
                    <SmallBookCard
                      key={book.id}
                      book={book}
                      onSelect={() => setSelected(book)}
                      onAdd={() => addToCart(book)}
                      onCancel={() => handleCancelReservation(book.id)}
                      isInCart={isInCart}
                      isReserved={isReserved}
                      badge={{ label: recBadge.label, color: recBadge.color }}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* ── DIVIDER ── */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">All Books</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-white/5" />
          </div>

          {/* ── FILTER & SEARCH ── */}
          <div className="animate-fade-in-up delay-200 flex flex-col lg:flex-row gap-4">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-200 border flex-shrink-0 active:scale-95 ${
                    activeCategory === cat
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                      : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:border-blue-400 dark:hover:border-blue-500/50 hover:-translate-y-0.5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600" size={16} />
              <input
                type="text"
                placeholder="Search title or author..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl py-3 pl-11 pr-4 outline-none focus:border-blue-500 text-sm font-medium text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-all"
              />
            </div>
          </div>

          {/* ── BOOK GRID ── */}
          {filteredBooks.length > 0 ? (
            <div className="animate-fade-in-up delay-300 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredBooks.map((book) => {
                const isInCart = !!cart.find((c) => c.id === book.id);
                const isReserved = !!reservations.find((r) => r.book_id === book.id);
                return (
                  <BigBookCard
                    key={book.id}
                    book={book}
                    onSelect={() => setSelected(book)}
                    onAdd={() => addToCart(book)}
                    onCancel={() => handleCancelReservation(book.id)}
                    isInCart={isInCart}
                    isReserved={isReserved}
                  />
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest text-sm mb-3">No books found</p>
              <button onClick={() => { setActiveCategory('All'); setSearch(''); }}
                className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 underline underline-offset-4">
                Reset filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BOOK DETAIL MODAL ── */}
      {selected && (() => {
        const currentIdx = filteredBooks.findIndex(b => b.id === selected.id);
        const isInCart = !!cart.find((c) => c.id === selected.id);
        const isReserved = !!reservations.find((r) => r.book_id === selected.id);
        const isAvailable = (selected.copies_available ?? 0) > 0;
        return (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 dark:bg-black/90 backdrop-blur-xl"
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
                <div className="aspect-[3/4] md:aspect-auto bg-slate-100 dark:bg-slate-800 relative">
                  <BookCover src={selected.cover_url} alt={selected.title} iconSize={48} />
                  {/* Page indicator */}
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/40 rounded-full backdrop-blur-sm">
                    <span className="text-[9px] font-black text-white/70 tracking-widest">
                      {currentIdx + 1} / {filteredBooks.length}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 p-5 md:p-10 flex flex-col justify-center relative">
                  <button onClick={() => setSelected(null)}
                    className="absolute top-6 right-6 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <XCircle size={26} />
                  </button>
                  <span className={`inline-block mb-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest w-fit ${
                    selected.availability_status === 'Available'
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                      : selected.availability_status === 'Limited'
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                      : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                  }`}>
                    {selected.availability_status === 'Available' ? `${selected.copies_available} Available` : 
                     selected.availability_status === 'Limited' ? 'Limited Copies' : 
                     'Not available'}
                  </span>
                  <h2 className="text-2xl sm:text-3xl pr-8 font-black italic uppercase tracking-tighter mb-2 leading-none text-slate-900 dark:text-white">
                    {selected.title}
                  </h2>
                  <p className="text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest mb-1">
                    {selected.author}
                  </p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs font-medium mb-5">
                    {selected.category} • {selected.year}
                  </p>
                  {selected.isbn && (
                    <p className="text-slate-400 dark:text-slate-500 text-xs font-mono mb-5">ISBN: {selected.isbn}</p>
                  )}
                  {!isAvailable && (
                    <p className="text-xs font-bold leading-relaxed text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl px-4 py-3 mb-5">
                      Currently not available. Reserve now to join the queue. You'll be notified when it's your turn.
                    </p>
                  )}
                  {isReserved ? (
                    <button
                      onClick={() => { handleCancelReservation(selected.id); setSelected(null); }}
                      className="w-full py-4 bg-rose-600 hover:bg-rose-500 rounded-2xl font-black uppercase text-sm tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-white"
                    >
                      <X size={16} />
                      Cancel Reservation
                    </button>
                  ) : (
                    <button
                      onClick={() => { addToCart(selected); setSelected(null); }}
                      disabled={isInCart}
                      className={`w-full py-4 rounded-2xl font-black uppercase text-sm tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-white ${
                        isInCart ? 'bg-emerald-600 cursor-default' : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                    >
                      <Bookmark size={16} />
                      {isInCart ? 'Already In Selection' : isAvailable ? 'Reserve This Book' : 'Join Reservation Queue'}
                    </button>
                  )}
                </div>
              </div>

              {/* Slider bar */}
              <div
                className="px-8 py-3 border-t border-slate-200 dark:border-white/5 flex items-center gap-4"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 tracking-widest tabular-nums shrink-0 w-12">
                  {currentIdx + 1} / {filteredBooks.length}
                </span>
                <input
                  type="range"
                  min={0}
                  max={filteredBooks.length - 1}
                  value={currentIdx >= 0 ? currentIdx : 0}
                  onChange={(e) => {
                    const targetIdx = parseInt(e.target.value);
                    if (targetIdx === currentIdx) return;
                    setSlideDir(targetIdx > currentIdx ? 'right' : 'left');
                    setAnimKey(k => k + 1);
                    setSelected(filteredBooks[targetIdx]);
                  }}
                  className="min-w-0 w-full flex-1 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Right arrow */}
            {currentIdx < filteredBooks.length - 1 && (
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
}

// ─── CARD COMPONENTS ──────────────────────────────────────────────────────────

const SmallBookCard = ({ book, onSelect, onAdd, onCancel, isInCart, isReserved, badge }) => {
  const available = (book.copies_available ?? 0) > 0;
  return (
    <div
      className="flex-none w-40 group cursor-pointer transition-transform duration-200 hover:-translate-y-1.5"
      onClick={onSelect}
    >
      <div className={`relative aspect-[2/3] rounded-3xl overflow-hidden border transition-all duration-300 shadow-md mb-3 ${
        'border-slate-200 dark:border-white/10 group-hover:border-blue-500 group-hover:shadow-xl group-hover:shadow-blue-200/60 dark:group-hover:shadow-blue-900/50'
      }`}>
        <BookCover src={book.cover_url} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" iconSize={24} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute top-2 left-2">
          <span className={`px-2 py-1 ${badge.color} rounded-lg text-[9px] font-black uppercase tracking-wider text-white`}>
            {badge.label}
          </span>
        </div>
        {isReserved ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="absolute bottom-2 left-2 right-2 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all bg-rose-600/80 hover:bg-rose-600 text-white"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={isInCart}
            className={`absolute bottom-2 left-2 right-2 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
              isInCart
                ? 'bg-emerald-600/80 text-white cursor-default'
                : available
                ? 'bg-blue-600/80 hover:bg-blue-600 text-white'
                : 'bg-amber-600/90 hover:bg-amber-600 text-white'
            }`}
          >
            {isInCart ? 'In Selection' : available ? 'Reserve' : 'Join Queue'}
          </button>
        )}
      </div>
      <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">{book.title}</p>
      <p className="text-[10px] text-slate-500 font-medium mt-0.5">{book.author}</p>
    </div>
  );
};

const BigBookCard = ({ book, onSelect, onAdd, onCancel, isInCart, isReserved }) => {
  const available = (book.copies_available ?? 0) > 0;
  return (
    <div className="group cursor-pointer transition-transform duration-200 hover:-translate-y-2" onClick={onSelect}>
      <div className={`relative aspect-[2/3] rounded-3xl overflow-hidden border transition-all duration-300 mb-3 ${
        'border-slate-200 dark:border-white/10 group-hover:border-blue-500 shadow-sm group-hover:shadow-xl group-hover:shadow-blue-200/60 dark:group-hover:shadow-blue-900/50'
      }`}>
        <BookCover src={book.cover_url} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" iconSize={24} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {book.availability_status === 'Unavailable' && !isReserved && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-rose-600/90 rounded-lg">
            <p className="text-[8px] font-black uppercase text-white">Unavailable</p>
          </div>
        )}
        {book.availability_status === 'Limited' && !isReserved && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-amber-600/90 rounded-lg">
            <p className="text-[8px] font-black uppercase text-white">Limited</p>
          </div>
        )}
        {isReserved ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="absolute bottom-0 left-0 right-0 p-3 font-black uppercase text-[9px] tracking-wider transition-all opacity-0 group-hover:opacity-100 bg-rose-600 text-white"
          >
            Cancel Reservation
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={isInCart}
            className={`absolute bottom-0 left-0 right-0 p-3 font-black uppercase text-[9px] tracking-wider transition-all opacity-0 group-hover:opacity-100 ${
              isInCart
                ? 'bg-emerald-600 text-white cursor-default'
                : available
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {isInCart ? 'In Selection' : available ? 'Reserve' : 'Join Queue'}
          </button>
        )}
      </div>
      <p className="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-tight">{book.title}</p>
      <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">{book.author}</p>
      <p className="text-[9px] text-slate-400 dark:text-slate-700 font-black uppercase tracking-widest mt-0.5">{book.category}</p>
    </div>
  );
};
