import ModalFrame from '../../components/ModalFrame';
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trash2, Camera, AlertCircle, BookOpen, ChevronRight, Bell, Clock, CheckCircle2, Users, RefreshCw, X } from 'lucide-react';
import { getReservations, confirmReservations, cancelReservation } from '../../api/reservations';
import useBorrowingCapacity from '../../api/useBorrowingCapacity';
import BorrowingCapacity from '../../components/BorrowingCapacity';
import { getBook } from '../../api/books';
import {
  clearReservationCart,
  pendingConfirmationKey, loadPendingConfirmation,
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
  const allowance = useBorrowingCapacity();
  const [queueAccepted, setQueueAccepted] = useState({});
  const [pendingConfirmation, setPendingConfirmation] = useState(loadPendingConfirmation);

  // Cancellation confirmation
  const [cancellingId, setCancellingId] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchReservations = useCallback(() => {
    setLoadingReservations(true);
    getReservations()
      .then((res) => setWaitlist(res.data))
      .catch(() => setError('Could not load reservations. Please retry.'))
      .finally(() => setLoadingReservations(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchReservations, 0);
    return () => clearTimeout(id);
  }, [fetchReservations]);

  useEffect(() => {
    const reserveBook = searchParams.get('reserveBook');
    if (!reserveBook) return undefined;
    if (!allowance.capacity || pendingConfirmation) return undefined;

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
          if (prev.length >= allowance.capacity.remaining_slots) return prev;
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
  }, [searchParams, setSearchParams, allowance.capacity, pendingConfirmation]);

  const readyForPickup = waitlist.filter((w) => w.status === 'ready');
  const inQueue = waitlist.filter((w) => w.status === 'pending');

  const removeFromCart = (id) => {
    if (isConfirming || pendingConfirmation) return;
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
      allowance.refreshCapacity();
    } catch {
      setError('Failed to cancel reservation.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleConfirm = async () => {
    if (isConfirming || (cart.length === 0 && !pendingConfirmation)) return;
    setIsConfirming(true);
    setError('');
    try {
      const payload = pendingConfirmation || { request_id: crypto.randomUUID(), selections: cart.map(item => ({ book_id: item.id, accept_queue: Boolean(queueAccepted[item.id]) })) };
      localStorage.setItem(pendingConfirmationKey(), JSON.stringify(payload));
      setPendingConfirmation(payload);
      await confirmReservations(payload);
      setPendingConfirmation(null);
      setConfirmed(true);
      setCart([]);
      clearReservationCart();
      fetchReservations();
      allowance.refreshCapacity();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status >= 400 && err.response?.status < 500) {
        localStorage.removeItem(pendingConfirmationKey()); setPendingConfirmation(null);
        if (detail?.code === 'availability_changed') {
          const changed = new Set(detail.books.map(book => book.book_id));
          setCart(previous => { const next = previous.map(book => changed.has(book.id) ? { ...book, copies_available: 0 } : book); saveReservationCart(next); return next; });
        }
        allowance.refreshCapacity();
      }
      setError(typeof detail === 'string' ? detail : detail?.message || 'Confirmation outcome is unknown. Retry confirmation to retrieve the same batch safely.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="min-w-0 p-4 sm:p-6 md:p-10 pb-16">

      {/* Header */}
      <div className="animate-fade-in-up mb-10">
        <p className="text-sm font-semibold tracking-normal text-muted mb-2">
          Member Portal
        </p>
        <h1 className="font-semibold tracking-normal leading-none text-ink rpl-title">
          My <span className="text-link">Reservations</span>
        </h1>
      </div>

      <BorrowingCapacity {...allowance} />
      <p className="mb-4 text-sm text-muted">Books are not held until you confirm. Availability may change.</p>
      {error && <div role="alert" className="mb-4 text-danger text-sm">{error} <button type="button" className="underline" onClick={fetchReservations}>Reload reservations</button></div>}

      {/* ── PICKUP READY ALERT ── */}
      {readyForPickup.length > 0 && (
        <div className="mb-8">
          <div className="animate-fade-in-up delay-75 bg-success-soft border border-success rounded-xl p-6 text-ink relative overflow-hidden hover:shadow-sm transition-all duration-300">
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
              <div className="w-12 h-12 bg-panel rounded-xl flex items-center justify-center flex-shrink-0">
                <Bell size={22} className="animate-bounce" />
              </div>
              <div className="min-w-0 w-full flex-1">
                <p className="text-sm font-semibold tracking-normal text-success mb-1">
                  Ready for Pickup!
                </p>
                <h3 className="font-semibold tracking-normal leading-none mb-3 rpl-subheading">
                  {readyForPickup.length} book{readyForPickup.length > 1 ? 's' : ''} waiting at the desk
                </h3>
                <div className="space-y-3 mt-4">
                  {readyForPickup.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-panel rounded-xl p-3">
                      <div className="w-10 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-success-soft">
                        <BookCover src={item.cover_url} alt={item.book_title} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{item.book_title}</p>
                        <p className="text-success text-sm font-bold mt-0.5">
                          Prepare face scan at the counter..
                        </p>
                        {item.expires_at && <p className="text-sm text-muted">Collect by {parseApiDateTime(item.expires_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} (Philippine time)</p>}
                      </div>
                      <button
                        aria-label={`Cancel reservation for ${item.book_title}`}
                        onClick={() => setCancellingId(item.id)}
                        className="p-2 text-ink hover:text-ink hover:bg-panel rounded-lg transition-all"
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
        <div className="min-w-0 xl:col-span-2 space-y-8">

          {/* ── WAITLIST / QUEUE ── */}
          {loadingReservations ? (
            <div className="flex justify-center py-8">
              <RefreshCw size={22} className="animate-spin text-link" />
            </div>
          ) : inQueue.length > 0 && (
            <div>
              <h2 className="font-semibold tracking-normal text-ink mb-5 flex items-center gap-3 rpl-section-title">
                My Waitlist
                <div className="h-px flex-1 bg-subtle" />
              </h2>
              <div className="space-y-4">
                {inQueue.map((item, i) => (
                  <div key={item.id}
                    className="animate-fade-in-up group bg-panel rounded-xl border border-line p-4 sm:p-5 grid grid-cols-[3rem_minmax(0,1fr)] sm:flex items-center gap-3 sm:gap-5 shadow-sm hover:shadow-sm transition-all duration-200"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-subtle">
                      <BookCover src={item.cover_url} alt={item.book_title} className="w-full h-full object-cover transition-all duration-200" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink text-sm truncate">{item.book_title}</p>
                      <p className="text-sm text-muted font-medium">{item.book_author}</p>
                      {item.queue_position && (
                        <div className="flex items-center gap-3 mt-3">
                          <div className="flex-1 h-2 bg-subtle rounded-full overflow-hidden">
                            <div className="h-full bg-action rounded-full" style={{ width: `${Math.max(10, 100 - (item.queue_position - 1) * 20)}%` }} />
                          </div>
                          <span className="text-sm font-semibold tracking-normal text-muted flex-shrink-0">
                            #{item.queue_position} in line
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 flex flex-wrap sm:flex-col items-center sm:items-end justify-between gap-2 sm:flex-shrink-0 min-w-0">
                      {item.queue_position && (
                        <div className="flex items-center gap-1.5">
                          <Users size={12} className="text-link" />
                          <span className="text-sm font-semibold tracking-normal text-link">
                            #{item.queue_position}
                          </span>
                        </div>
                      )}
                      {item.expires_at && (
                        <div className="flex items-center gap-1.5">
                          <Clock size={11} className="text-muted" />
                          <span className="text-sm font-medium text-muted">
                            Expires {parseApiDateTime(item.expires_at).toLocaleDateString('en-PH')}
                          </span>
                        </div>
                      )}
                      <button
                        aria-label={`Cancel reservation for ${item.book_title}`}
                        onClick={() => setCancellingId(item.id)}
                        className="text-sm font-semibold tracking-normal text-danger hover:text-danger transition-colors"
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
            <h2 className="font-semibold tracking-normal text-ink mb-5 flex items-center gap-3 rpl-section-title">
              My Selection
              <div className="h-px flex-1 bg-subtle" />
              {cart.length > 0 && (
                <span className="text-sm font-semibold tracking-normal text-link">
                  {cart.length} book{cart.length > 1 ? 's' : ''}
                </span>
              )}
            </h2>

            {confirmed ? (
              <div className="bg-panel border border-line rounded-xl p-6 sm:p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-success-soft rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={32} className="text-success" />
                </div>
                <h3 className="font-semibold tracking-normal text-ink mb-2 rpl-subheading">
                  Reservation Confirmed!
                </h3>
                <p className="text-muted font-medium text-sm mb-8 max-w-sm mx-auto">
                  Your books are reserved. Ready books must be picked up within 24 hours; unavailable books stay on your waitlist until your turn.
                </p>
                <Link to="/user/browse"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-action hover:bg-action-hover text-white rounded-xl font-semibold text-sm tracking-normal transition-all">
                  Browse More <ChevronRight size={13} />
                </Link>
              </div>
            ) : cart.length === 0 ? (
              <div className="bg-panel border-2 border-dashed border-line rounded-xl py-20 text-center">
                <div className="w-14 h-14 bg-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen size={24} className="text-ink" />
                </div>
                <p className="text-muted font-semibold tracking-normal text-sm mb-4">
                  No books selected
                </p>
                <Link to="/user/browse"
                  className="text-link font-semibold text-sm tracking-normal hover:underline underline-offset-4">
                  Browse Books →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((book, i) => (
                  <div key={book.id}
                    className="animate-fade-in-up group bg-panel border border-line rounded-xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all duration-200"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="w-12 h-16 rounded-xl overflow-hidden bg-subtle flex-shrink-0">
                      {book.cover
                        ? <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><BookOpen size={16} className="text-muted" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-ink text-sm truncate">{book.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="inline-block max-w-full px-2.5 py-0.5 bg-info-soft text-link rounded-full text-sm font-semibold tracking-normal">
                          {book.category}
                        </span>
                        {(book.copies_available ?? 0) < 1 && (
                          <span className="inline-block max-w-full px-2.5 py-0.5 bg-warning-soft text-warning rounded-full text-sm font-semibold tracking-normal">
                            Queue
                          </span>
                        )}
                      </div>
                      {(book.copies_available ?? 0) < 1 && <label className="flex items-start gap-2 mt-2 text-sm">
                        <input type="checkbox" disabled={isConfirming || Boolean(pendingConfirmation)} checked={Boolean(queueAccepted[book.id])} onChange={event => setQueueAccepted(previous => ({ ...previous, [book.id]: event.target.checked }))} />
                        I agree to queue this title if unavailable.
                      </label>}
                    </div>
                    <button disabled={isConfirming || Boolean(pendingConfirmation)} aria-label={`Remove ${book.title} from selection`} onClick={() => removeFromCart(book.id)}
                      className="p-2.5 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-all duration-200 flex-shrink-0">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── SUMMARY SIDEBAR ── */}
        <div className="min-w-0 space-y-5">
          <div className="bg-panel border border-line rounded-xl p-5 md:p-7 shadow-sm xl:sticky xl:top-6">
            <h3 className="font-semibold tracking-normal text-ink mb-6 rpl-subheading">
              Summary
            </h3>

            <div className="space-y-4 mb-6">
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-bold text-muted tracking-normal">Selected</span>
                <span className="text-2xl font-semibold text-ink tracking-normal">{cart.length}</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-bold text-muted tracking-normal">Waitlist</span>
                <span className="text-2xl font-semibold text-ink tracking-normal">{inQueue.length}</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-bold text-muted tracking-normal">Ready</span>
                <span className={`text-2xl font-semibold tracking-normal ${readyForPickup.length > 0 ? 'text-success text-success' : 'text-ink '}`}>
                  {readyForPickup.length}
                </span>
              </div>
              <div className="h-px bg-subtle" />
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <span className="text-sm font-bold text-muted tracking-normal">Ready pickup</span>
                <span className="text-sm font-semibold text-success">Within 24 hrs</span>
              </div>
            </div>

            <div className="bg-warning-soft p-4 rounded-xl border border-warning flex gap-3 mb-6">
              <AlertCircle className="text-warning flex-shrink-0 mt-0.5" size={15} />
              <p className="text-sm text-warning font-medium leading-relaxed">
                Prepare face scan at the counter..
              </p>
            </div>

            <button
              onClick={handleConfirm}
              disabled={isConfirming || (!pendingConfirmation && (cart.length === 0 || confirmed || !allowance.capacity || cart.length > allowance.capacity.remaining_slots || cart.some(book => (book.copies_available ?? 0) < 1 && !queueAccepted[book.id])))}
              className="w-full px-3 py-4 bg-action hover:bg-action-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm tracking-normal shadow-sm transition-all flex justify-center items-center gap-2"
            >
              {isConfirming
                ? <div className="w-5 h-5 border-2 border-line border-t-transparent rounded-full animate-spin" />
                : <><Camera size={16} /> {pendingConfirmation ? 'Retry confirmation safely' : 'Confirm Reservation'}</>
              }
            </button>
          </div>

          {/* FaceID Notice */}
          <div className="bg-panel rounded-xl p-6 text-ink relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-info-soft rounded-full blur-2xl pointer-events-none" />
            <p className="text-sm font-semibold tracking-normal text-muted mb-2">Biometric Entry</p>
            <p className="text-sm font-bold text-ink leading-snug mb-3">
              Your Face ID will be used to confirm pickup at the desk.
            </p>
            <Link to="/user/profile"
              className="text-sm font-semibold tracking-normal text-link hover:underline underline-offset-4">
              Manage Face ID →
            </Link>
          </div>
        </div>
      </div>

      {/* ── CANCEL CONFIRMATION MODAL ── */}
      {cancellingId && (
        <ModalFrame onClose={() => { if (!isCancelling) setCancellingId(null); }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-panel rounded-xl border border-line shadow-sm w-full max-w-xs max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-8 animate-fade-in-up">
            <div className="w-16 h-16 bg-danger-soft rounded-full flex items-center justify-center mx-auto mb-5 text-danger">
              <AlertCircle size={32} />
            </div>
            <h3 className="font-semibold tracking-normal text-ink text-center mb-2 rpl-subheading">
              Cancel Reservation?
            </h3>
            <p className="text-muted font-medium text-sm text-center mb-8">
              Are you sure you want to cancel this reservation? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancellingId(null)}
                className="flex-1 py-3 rounded-lg bg-subtle text-muted font-semibold text-sm tracking-normal hover:bg-subtle transition-all"
              >
                No
              </button>
              <button
                onClick={handleCancelReservation}
                disabled={isCancelling}
                className="flex-1 py-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm tracking-normal transition-all disabled:opacity-60"
              >
                {isCancelling ? '...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}
