import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trash2, Camera, AlertCircle, BookOpen, ChevronRight, Bell, Clock, CheckCircle2, Users, RefreshCw, X } from 'lucide-react';
import { getReservations, createReservation, cancelReservation } from '../../api/reservations';
import { getBook } from '../../api/books';
import {
  RESERVATION_CART_KEY,
  addReservationCartItem,
  loadReservationCart,
  saveReservationCart,
} from '../../api/reservationCart';
import { parseApiDateTime } from '../../api/dateTime';
import BookCover from '../../components/BookCover';

export default function UserReservations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cart, setCart] = useState(() => loadReservationCart());
  const [waitlist, setWaitlist] = useState([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [loadingReservations, setLoadingReservations] = useState(true);
  
  // Cancellation confirmation
  const [cancellingId, setCancellingId] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchReservations = useCallback(() => {
    setLoadingReservations(true);
    getReservations()
      .then((res) => setWaitlist(res.data))
      .catch(() => {})
      .finally(() => setLoadingReservations(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchReservations, 0);
    return () => clearTimeout(id);
  }, [fetchReservations]);

  useEffect(() => {
    const reserveBook = searchParams.get('reserveBook');
    if (!reserveBook) return undefined;

    const bookId = Number(reserveBook);
    const clearReserveParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete('reserveBook');
      setSearchParams(next, { replace: true });
    };

    if (!Number.isInteger(bookId) || bookId < 1) {
      clearReserveParam();
      return undefined;
    }

    let cancelled = false;
    getBook(bookId)
      .then((res) => {
        if (cancelled) return;
        setCart((prev) => {
          const { items } = addReservationCartItem(prev, res.data);
          saveReservationCart(items);
          return items;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError('Selected book could not be loaded. Please browse books again.');
        }
      })
      .finally(() => {
        if (!cancelled) clearReserveParam();
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const readyForPickup = waitlist.filter((w) => w.status === 'ready');
  const inQueue = waitlist.filter((w) => w.status === 'pending');

  const removeFromCart = (id) => {
    const next = cart.filter((c) => c.id !== id);
    setCart(next);
    saveReservationCart(next);
  };

  const handleCancelReservation = async () => {
    if (!cancellingId) return;
    setIsCancelling(true);
    try {
      await cancelReservation(cancellingId);
      setWaitlist(prev => prev.filter(r => r.id !== cancellingId));
      setCancellingId(null);
    } catch {
      setError('Failed to cancel reservation.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirm = async () => {
    if (cart.length === 0) return;
    setIsConfirming(true);
    setError('');
    try {
      await Promise.all(cart.map((item) => createReservation(item.id)));
      setConfirmed(true);
      setCart([]);
      localStorage.removeItem(RESERVATION_CART_KEY);
      fetchReservations();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to confirm reservations. Some books may already be reserved.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="p-6 md:p-10 pb-16">

      {/* Header */}
      <div className="animate-fade-in-up mb-10">
        <p className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-400 dark:text-slate-500 mb-2">
          Member Portal
        </p>
        <h1 className="text-4xl sm:text-5xl font-black italic uppercase tracking-tighter leading-none text-slate-900 dark:text-white">
          My <span className="text-blue-600">Reservations</span>
        </h1>
      </div>

      {/* ── PICKUP READY ALERT ── */}
      {readyForPickup.length > 0 && (
        <div className="mb-8">
          <div className="animate-fade-in-up delay-75 bg-emerald-600 rounded-[2rem] p-6 text-white relative overflow-hidden hover:shadow-xl transition-all duration-300">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Bell size={22} className="animate-bounce" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-200 mb-1">
                  Ready for Pickup!
                </p>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter leading-none mb-3">
                  {readyForPickup.length} book{readyForPickup.length > 1 ? 's' : ''} waiting at the desk
                </h3>
                <div className="space-y-3 mt-4">
                  {readyForPickup.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-white/10 rounded-2xl p-3">
                      <div className="w-10 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-emerald-700/30">
                        <BookCover src={item.cover_url} alt={item.book_title} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-sm truncate">{item.book_title}</p>
                        <p className="text-emerald-200 text-[10px] font-bold mt-0.5">
                          Prepare face scan at the counter..
                        </p>
                      </div>
                      <button 
                        onClick={() => setCancellingId(item.id)}
                        className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">

          {/* ── WAITLIST / QUEUE ── */}
          {loadingReservations ? (
            <div className="flex justify-center py-8">
              <RefreshCw size={22} className="animate-spin text-blue-600" />
            </div>
          ) : inQueue.length > 0 && (
            <div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white mb-5 flex items-center gap-3">
                My Waitlist
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              </h2>
              <div className="space-y-4">
                {inQueue.map((item, i) => (
                  <div key={item.id}
                    className="animate-fade-in-up group bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-5 shadow-sm hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-slate-200 dark:bg-slate-700">
                      <BookCover src={item.cover_url} alt={item.book_title} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{item.book_title}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{item.book_author}</p>
                      {item.queue_position && (
                        <div className="flex items-center gap-3 mt-3">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.max(10, 100 - (item.queue_position - 1) * 20)}%` }} />
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex-shrink-0">
                            #{item.queue_position} in line
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0 min-w-0">
                      {item.queue_position && (
                        <div className="flex items-center gap-1.5">
                          <Users size={12} className="text-blue-600 dark:text-blue-400" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                            #{item.queue_position}
                          </span>
                        </div>
                      )}
                      {item.expires_at && (
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} className="text-slate-400" />
                          <span className="text-[9px] font-medium text-slate-400">
                            Expires {parseApiDateTime(item.expires_at).toLocaleDateString('en-PH')}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => setCancellingId(item.id)}
                        className="text-[9px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MY SELECTION (CART) ── */}
          <div>
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white mb-5 flex items-center gap-3">
              My Selection
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              {cart.length > 0 && (
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                  {cart.length} book{cart.length > 1 ? 's' : ''}
                </span>
              )}
            </h2>

            {confirmed ? (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2.5rem] p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white mb-2">
                  Reservation Confirmed!
                </h3>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mb-8 max-w-sm mx-auto">
                  Your books are reserved. Ready books must be picked up within 24 hours; unavailable books stay on your waitlist until your turn.
                </p>
                <Link to="/user/browse"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all">
                  Browse More <ChevronRight size={13} />
                </Link>
              </div>
            ) : cart.length === 0 ? (
              <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2.5rem] py-20 text-center">
                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen size={24} className="text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest text-xs mb-4">
                  No books selected
                </p>
                <Link to="/user/browse"
                  className="text-blue-600 dark:text-blue-400 font-black text-[10px] uppercase tracking-widest hover:underline underline-offset-4">
                  Browse Books →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {error && <p className="text-rose-500 text-xs font-bold text-center">{error}</p>}
                {cart.map((book, i) => (
                  <div key={book.id}
                    className="animate-fade-in-up group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2rem] p-4 flex items-center gap-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 flex-shrink-0">
                      {book.cover
                        ? <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><BookOpen size={16} className="text-slate-400" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{book.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="inline-block px-2.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-[9px] font-black uppercase tracking-widest">
                          {book.category}
                        </span>
                        {(book.copies_available ?? 0) < 1 && (
                          <span className="inline-block px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-[9px] font-black uppercase tracking-widest">
                            Queue
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeFromCart(book.id)}
                      className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all duration-200 flex-shrink-0">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── SUMMARY SIDEBAR ── */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2.5rem] p-5 md:p-7 shadow-sm xl:sticky xl:top-6">
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white mb-6">
              Summary
            </h3>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Selected</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{cart.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Waitlist</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{inQueue.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ready</span>
                <span className={`text-2xl font-black tracking-tighter ${readyForPickup.length > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                  {readyForPickup.length}
                </span>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-700" />
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ready pickup</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">Within 24 hrs</span>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800 flex gap-3 mb-6">
              <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={15} />
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                Prepare face scan at the counter..
              </p>
            </div>

            <button
              onClick={handleConfirm}
              disabled={cart.length === 0 || isConfirming || confirmed}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-200 dark:shadow-blue-900/40 transition-all flex justify-center items-center gap-2 active:scale-[0.98]"
            >
              {isConfirming
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Camera size={16} /> Confirm Reservation</>
              }
            </button>
          </div>

          {/* FaceID Notice */}
          <div className="bg-slate-950 dark:bg-black rounded-[2rem] p-6 text-white relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2">Biometric Entry</p>
            <p className="text-sm font-bold text-white leading-snug mb-3">
              Your Face ID will be used to confirm pickup at the desk.
            </p>
            <Link to="/user/profile"
              className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:underline underline-offset-4">
              Manage Face ID →
            </Link>
          </div>
        </div>
      </div>

      {/* ── CANCEL CONFIRMATION MODAL ── */}
      {cancellingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-xs p-8 animate-fade-in-up">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-5 text-rose-600">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white text-center mb-2">
              Cancel Reservation?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-xs text-center mb-8">
              Are you sure you want to cancel this reservation? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancellingId(null)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                No
              </button>
              <button
                onClick={handleCancelReservation}
                disabled={isCancelling}
                className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-[10px] tracking-widest transition-all active:scale-95 disabled:opacity-60"
              >
                {isCancelling ? '...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
