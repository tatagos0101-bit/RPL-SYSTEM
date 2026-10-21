import useReadResource from '../../api/useReadResource';
import useServerPage from '../../api/useServerPage';
import PageControls from '../../components/PageControls';
import FineContent from '../../components/FineContent';
import { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import {
  Search, BookOpen, CheckCircle2, ArrowDownLeft, ArrowUpRight,
  Zap, X, ScanFace, QrCode, RefreshCw, CheckCircle,
  User, ChevronRight, ArrowLeft, RotateCcw, AlertCircle,
  Plus, Trash2, Package, IdCard, Keyboard,
} from 'lucide-react';
import BookCover from '../../components/BookCover';
import { borrowBook, returnBook, getMemberReservations, getMemberActiveLoans, getMembers } from '../../api/librarian';
import { faceLookup } from '../../api/auth';
import { getBookByScan, getLoanPolicy } from '../../api/books';
import { addScannedBookCartItem, cartItemKey, scanResultToCartItem } from '../../api/bookCopyScan';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import { findManualMemberMatch, memberToSessionIdentity } from '../../api/manualMemberLookup';
import BorrowingCapacity from '../../components/BorrowingCapacity';
import useBorrowingCapacity from '../../api/useBorrowingCapacity';

// ─── STATUS STYLES ─────────────────────────────────────────────────────────────

const TYPE_STYLE = {
  borrow: 'bg-info-soft bg-info-soft text-link text-link',
  return: 'bg-success-soft bg-success-soft text-success text-success',
};
const STATUS_STYLE = {
  active:   'bg-subtle text-muted ',
  returned: 'bg-success-soft bg-success-soft text-success text-success',
  overdue:  'bg-danger-soft bg-danger-soft text-danger text-danger',
};

// ─── BOOK CART ITEM ────────────────────────────────────────────────────────────

const CartItem = ({ book, result, onRemove }) => {
  const hasResult = result !== undefined;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
      hasResult
        ? result.success
          ? 'bg-success-soft border-success'
          : 'bg-danger-soft border-danger'
        : 'bg-panel border-line'
    }`}>
      <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 shadow bg-subtle">
        <BookCover src={book.cover_url} alt={book.title} iconSize={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink text-sm leading-tight truncate">{book.title}</p>
        <p className="text-muted text-sm font-medium truncate">{book.author}</p>
        {(book.copy_number || book.copy_qr) && (
          <p className="text-link text-sm font-semibold tracking-normal mt-0.5 truncate">
            {book.copy_number ? `Copy ${book.copy_number}` : 'Copy QR'} {book.copy_qr ? `- ${book.copy_qr}` : ''}
          </p>
        )}
        {hasResult && (
          result.success ? (
            <p className="text-success text-sm font-semibold tracking-normal mt-0.5">Done</p>
          ) : (
            <p className="text-danger text-sm font-medium mt-0.5 truncate">{result.error}</p>
          )
        )}
      </div>
      {hasResult ? (
        result.success
          ? <CheckCircle size={16} className="text-success flex-shrink-0" />
          : <AlertCircle size={16} className="text-danger flex-shrink-0" />
      ) : (
        onRemove && (
          <button aria-label="Remove"
            onClick={() => onRemove(cartItemKey(book))}
            className="p-1.5 text-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-all"
          >
            <Trash2 size={13} />
          </button>
        )
      )}
    </div>
  );
};

// ─── QUICK SCAN MODAL ──────────────────────────────────────────────────────────

const STEPS = ['face', 'books', 'return-select', 'confirm', 'done'];

const QuickScanModal = ({ onClose, onCommit }) => {
  const dialogRef = useRef(null);
  const webcamRef = useRef(null);
  const qrInputRef = useRef(null);

  // ── Face step
  const [step, setStep]                 = useState('face');
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceFound, setFaceFound]       = useState(false);
  const [faceError, setFaceError]       = useState('');
  const [foundMember, setFoundMember]   = useState(null);
  const allowance = useBorrowingCapacity(foundMember?.user_id ?? null);
  const [lookupMethod, setLookupMethod] = useState('face'); // 'face' | 'manual'
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');

  // ── Books step
  const [bookCart, setBookCart]           = useState([]);   // confirmed books
  const [memberReservations, setMemberReservations] = useState([]);
  const [qrInput, setQrInput]             = useState('');
  const [qrLoading, setQrLoading]         = useState(false);
  const [qrError, setQrError]             = useState('');
  const [lastFound, setLastFound]         = useState(null); // book just scanned, not yet added

  // ── Session mode selection
  const [sessionMode, setSessionMode]   = useState(null);  // 'borrow' | 'return'
  const [activeLoans, setActiveLoans]   = useState([]);
  const [loansLoading, setLoansLoading] = useState(false);
  const [selectedLoanIds, setSelectedLoanIds] = useState(new Set());

  // ── Confirm / processing step
  const [action, setAction]         = useState('borrow');
  const [processing, setProcessing] = useState(false);
  const [results, setResults]       = useState([]);   // per-book results
  const [confirmError, setConfirmError] = useState('');
  const [lookupError, setLookupError] = useState('');

  // Native top-layer dialog keeps scanner content above navigation and traps focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    const containFocus = (event) => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener('keydown', containFocus);
    return () => {
      dialog.removeEventListener('keydown', containFocus);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  // Focus QR input when entering books step
  useEffect(() => {
    if (step === 'books') {
      setTimeout(() => qrInputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Handlers

  const applyFoundMember = useCallback(async (member) => {
    setFoundMember(member);
    setFaceFound(true);
    setFaceError('');
    setManualError('');
    setLookupError('');
    try {
      const resvRes = await getMemberReservations(member.user_id);
      setMemberReservations(resvRes.data);
    } catch {
      setMemberReservations([]);
      setLookupError('Reservations could not be loaded. Retry member lookup before borrowing.');
    }
  }, []);

  const handleFaceScan = useCallback(async () => {
    if (!webcamRef.current) return;
    setFaceScanning(true);
    setFaceError('');
    setManualError('');
    try {
      const image = webcamRef.current.getScreenshot();
      if (!image) throw new Error('Could not capture image');
      const res = await faceLookup(image);

      // Handle guidance hints returned as matched=false
      if (!res.data.matched) {
        if (res.data.message === 'too_dark') {
          setFaceError('Too dark — please improve the lighting and try again.');
        } else if (res.data.message === 'too_far') {
          setFaceError('Move closer to the camera and try again.');
        } else if (res.data.message === 'no_face') {
          setFaceError('No face detected. Position the member in front of the camera.');
        } else {
          setFaceError('Face not recognized. Please try again or use Manual ID.');
        }
        return;
      }

      await applyFoundMember(res.data);
    } catch (err) {
      setFaceError(err.response?.data?.detail || 'Face scan failed. Try again or use Manual ID.');
    } finally {
      setFaceScanning(false);
    }
  }, [applyFoundMember]);

  // Auto-trigger face scan on mount.
  useEffect(() => {
    const t = setTimeout(() => handleFaceScan(), 800);
    return () => clearTimeout(t);
  }, [handleFaceScan]);

  const handleManualLookup = async (event) => {
    event.preventDefault();
    const identifier = manualIdentifier.trim();
    if (!identifier) {
      setManualError('Enter a Member ID, email, phone, or numeric user ID.');
      return;
    }

    setManualLoading(true);
    setManualError('');
    setFaceError('');
    try {
      const res = await getMembers({ search: identifier, limit: 10 });
      const match = findManualMemberMatch(res.data, identifier);
      if (!match) {
        setManualError('No exact member match found. Use the full Member ID, exact email, phone, or numeric user ID.');
        return;
      }

      await applyFoundMember(memberToSessionIdentity(match));
    } catch (err) {
      setManualError(err.response?.data?.detail || 'Member lookup failed. Please try again.');
    } finally {
      setManualLoading(false);
    }
  };

  const handleSelectMode = async (mode) => {
    setSessionMode(mode);
    setAction(mode);
    if (mode === 'return') {
      setLoansLoading(true);
      setLookupError('');
      try {
        const res = await getMemberActiveLoans(foundMember.user_id);
        setActiveLoans(res.data);
        // Pre-select all loans by default
        setSelectedLoanIds(new Set(res.data.map((l) => l.transaction_id)));
      } catch {
        setActiveLoans([]);
        setLookupError('Loans could not be loaded. Retry loading loans before recording a return.');
      } finally {
        setLoansLoading(false);
      }
      setStep('return-select');
    } else {
      setStep('books');
    }
  };

  const handleQrLookup = async () => {
    if (!qrInput.trim()) return;
    setQrLoading(true);
    setQrError('');
    setLastFound(null);
    try {
      const res = await getBookByScan(qrInput.trim());
      setLastFound(scanResultToCartItem(res.data));
    } catch (err) {
      setQrError(err.response?.data?.detail || 'Book not found for this QR code.');
    } finally {
      setQrLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!lastFound) return;
    if (action === 'borrow' && !lastFound.can_borrow) {
      setQrError(lastFound.scan_message || 'This copy is not available for borrowing.');
      return;
    }
    const next = addScannedBookCartItem(bookCart, lastFound);
    if (!next.added) {
      setQrError(next.error);
      setLastFound(null);
      setQrInput('');
      return;
    }
    setBookCart(next.items);
    setLastFound(null);
    setQrInput('');
    setQrError('');
    setTimeout(() => qrInputRef.current?.focus(), 100);
  };

  const handleRemoveFromCart = (itemKey) => {
    setBookCart((prev) => prev.filter((b) => cartItemKey(b) !== itemKey));
  };

  const handleConfirmAll = async () => {
    if (!foundMember || bookCart.length === 0) return;
    setProcessing(true);
    setConfirmError('');
    const res = [];
    for (const book of bookCart) {
      try {
        if (action === 'borrow') {
          await borrowBook(foundMember.user_id, book.id, book.copy_id);
        } else {
          await returnBook(foundMember.user_id, book.id, book.copy_id);
        }
        res.push({ book, success: true, error: null });
      } catch (err) {
        const detail = err.response?.data?.detail;
        if (!err.response || err.response.status >= 500) {
          try {
            const { data: loans } = await getMemberActiveLoans(foundMember.user_id);
            const active = loans.some(loan => loan.book_id === book.id && (!book.copy_id || loan.copy_id === book.copy_id));
            if (action === 'borrow' && active) { res.push({ book, success: true, error: null }); continue; }
          } catch { /* Keep outcome unknown until staff can verify the ledger. */ }
          res.push({ book, success: false, error: 'Outcome unknown. Check this member’s loan history before retrying this item.' });
          for (const remaining of bookCart.slice(res.length)) {
            res.push({ book: remaining, success: false, error: 'Not attempted because the previous outcome needs verification.' });
          }
          break;
        }
        res.push({ book, success: false, error: typeof detail === 'string' ? detail : detail?.message || 'Transaction failed' });
      }
    }
    setResults(res);
    allowance.refreshCapacity();
    setProcessing(false);
    setStep('done');
    onCommit();
  };

  const resetToFace = () => {
    setStep('face');
    setFaceScanning(false);
    setFaceFound(false);
    setFaceError('');
    setFoundMember(null);
    setLookupMethod('face');
    setManualIdentifier('');
    setManualLoading(false);
    setManualError('');
    setBookCart([]);
    setMemberReservations([]);
    setQrInput('');
    setQrLoading(false);
    setQrError('');
    setLastFound(null);
    setResults([]);
    setConfirmError('');
    setSessionMode(null);
    setActiveLoans([]);
    setLoansLoading(false);
    setSelectedLoanIds(new Set());
    setAction('borrow');
  };

  const loanPolicy = useReadResource(getLoanPolicy);
  const dueDate = loanPolicy.data ? toUtcDate(loanPolicy.data.preview_due_date) : null;

  const successCount = results.filter((r) => r.success).length;
  const failCount    = results.filter((r) => !r.success).length;

  return (
    <dialog ref={dialogRef} aria-label="Quick Scan Session" className="rpl-scan-dialog"
      onCancel={(event) => { event.preventDefault(); if (!processing) onClose(); }}>
        {lookupError && <p role="alert" className="p-4 text-danger">{lookupError} <button className="underline" onClick={() => sessionMode === 'return' ? handleSelectMode('return') : applyFoundMember(foundMember)}>Retry loading</button></p>}
      <div className="w-full">

        {/* ── DONE SCREEN ── */}
        {step === 'done' && (
          <div className="rpl-scan-frame">
            <div className="rpl-scan-heading flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-success-soft rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={15} className="text-success" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-normal text-muted">Session Complete</p>
                  <p className="text-sm font-semibold text-ink">
                    {successCount} of {results.length} book{results.length !== 1 ? 's' : ''} processed
                  </p>
                </div>
              </div>
              <button aria-label="Close" onClick={onClose} className="p-2.5 text-muted hover:text-ink hover:bg-panel rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="rpl-scan-body p-4 sm:p-8">
              {/* Member row */}
              <div className="flex items-center gap-3 px-4 py-3 bg-panel border border-line rounded-xl mb-5">
                <div className="w-9 h-9 bg-info-soft rounded-xl flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-link" />
                </div>
                <div>
                  <p className="font-semibold text-ink text-sm">{foundMember?.name}</p>
                  <p className="text-link text-sm font-semibold tracking-normal">{foundMember?.member_id}</p>
                </div>
                <span className={`ml-auto px-3 py-1 rounded-full text-sm font-semibold tracking-normal border ${
                  action === 'borrow'
                    ? 'bg-info-soft border-line text-link'
                    : 'bg-success-soft border-success text-success'
                }`}>
                  {action}
                </span>
              </div>

              {/* Per-book results */}
              <div className="space-y-2.5 mb-6 max-h-64 overflow-y-auto pr-1">
                {results.map((r) => (
                    <CartItem key={cartItemKey(r.book)} book={r.book} result={r} />
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-4 bg-success-soft border border-success rounded-xl text-center">
                  <p className="text-2xl font-semibold text-success">{successCount}</p>
                  <p className="text-sm font-semibold tracking-normal text-success mt-0.5">Successful</p>
                </div>
                <div className={`p-4 border rounded-xl text-center ${failCount > 0 ? 'bg-danger-soft border-danger' : 'bg-subtle border-line'}`}>
                  <p className={`text-2xl font-semibold ${failCount > 0 ? 'text-danger' : 'text-muted'}`}>{failCount}</p>
                  <p className={`text-sm font-semibold tracking-normal mt-0.5 ${failCount > 0 ? 'text-danger' : 'text-muted'}`}>Needs review</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={resetToFace}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-panel hover:bg-panel border border-line rounded-lg font-semibold text-sm tracking-normal transition-all text-muted hover:text-ink"
                >
                  <RotateCcw size={13} /> New Session
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-action hover:bg-blue-500 rounded-lg font-semibold text-sm tracking-normal transition-all text-white"
                >
                  <X size={13} /> Close
                </button>
              </div>
            </div>
          </div>
        )}

        {step !== 'done' && (
          <div className="rpl-scan-frame">

            {/* Modal Header */}
            <div className="rpl-scan-heading flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-line">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-info-soft rounded-xl flex items-center justify-center">
                  <Zap size={15} className="text-link" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-normal text-muted">Quick Scan Session</p>
                  <p className="text-sm font-semibold text-ink">
                    {step === 'face'          && 'Step 1 — Identify Member'}
                    {step === 'books'         && 'Step 2 — Scan Books'}
                    {step === 'return-select' && 'Step 2 — Select Books to Return'}
                    {step === 'confirm'       && 'Step 3 — Review & Confirm'}
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-3">
                {/* Cart badge (books step) */}
                {step === 'books' && bookCart.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-info-soft border border-line rounded-xl">
                    <Package size={12} className="text-link" />
                    <span className="text-sm font-semibold text-link">{bookCart.length} book{bookCart.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {/* Step indicators */}
                {(['face', sessionMode === 'return' ? 'return-select' : 'books', 'confirm']).map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      step === s ? 'bg-blue-400 scale-125' :
                      STEPS.indexOf(step) > STEPS.indexOf(s) ? 'bg-emerald-500' : 'bg-subtle'
                    }`} />
                    {i < 2 && <div className={`w-6 h-px transition-all duration-300 ${STEPS.indexOf(step) > STEPS.indexOf(s) ? 'bg-emerald-500' : 'bg-subtle'}`} />}
                  </div>
                ))}
              </div>

              <button aria-label="Close" onClick={onClose} className="p-2.5 text-muted hover:text-ink hover:bg-panel rounded-lg transition-all">
                <X size={18} />
              </button>
            </div>

            {/* ── STEP 1: FACE SCAN ── */}
            {step === 'face' && (
              <div className="rpl-scan-body p-4 sm:p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center [&>div]:min-w-0">
                  {/* Camera view */}
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-line">
                    {lookupMethod === 'face' ? (
                      <>
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          onUserMediaError={() => {
                            setFaceError('Camera unavailable. Use Manual ID for this session.');
                            setLookupMethod('manual');
                          }}
                          className="absolute inset-0 w-full h-full object-cover opacity-80"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className={`w-44 h-52 border-2 rounded-[50%] transition-all duration-500 ${
                            faceScanning ? 'border-line shadow-sm' :
                            faceFound ? 'border-success shadow-sm' :
                            'border-line'
                          }`} />
                        </div>
                        <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-line rounded-tl-lg pointer-events-none" />
                        <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-line rounded-tr-lg pointer-events-none" />
                        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-line rounded-bl-lg pointer-events-none" />
                        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-line rounded-br-lg pointer-events-none" />
                        {faceFound && (
                          <div className="absolute inset-0 bg-success-soft flex items-center justify-center z-20">
                            <div className="text-center">
                              <CheckCircle size={40} className="text-success mx-auto mb-2" />
                              <p className="text-success font-semibold text-sm tracking-normal">Face Matched</p>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-panel px-6 text-center">
                        <div className="w-16 h-16 rounded-xl bg-info-soft border border-line flex items-center justify-center mb-4">
                          <IdCard size={30} className="text-link" />
                        </div>
                        <p className="text-sm font-semibold tracking-normal text-link mb-2">Manual Member Lookup</p>
                        <p className="text-sm text-muted font-medium leading-relaxed max-w-xs">
                          Use this when Face ID or the camera is unavailable. Verify the member before continuing.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right panel */}
                  <div>
                    {!faceFound ? (
                      <div className="text-center md:text-left">
                        <div className="grid grid-cols-2 gap-2 p-1 bg-panel border border-line rounded-xl mb-6">
                          <button
                            type="button"
                            onClick={() => {
                              setLookupMethod('face');
                              setManualError('');
                            }}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold tracking-normal transition-all ${
                              lookupMethod === 'face'
                                ? 'bg-action text-white shadow-sm '
                                : 'text-muted hover:text-ink hover:bg-panel'
                            }`}
                          >
                            <ScanFace size={13} /> Face Scan
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLookupMethod('manual');
                              setFaceError('');
                            }}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold tracking-normal transition-all ${
                              lookupMethod === 'manual'
                                ? 'bg-action text-white shadow-sm '
                                : 'text-muted hover:text-ink hover:bg-panel'
                            }`}
                          >
                            <Keyboard size={13} /> Manual ID
                          </button>
                        </div>

                        <div className={lookupMethod === 'face' ? '' : 'hidden'}>
                        <ScanFace size={40} className={`mb-4 mx-auto md:mx-0 transition-colors duration-300 ${faceScanning ? 'text-link' : 'text-muted'}`} />
                        <h3 className="font-semibold tracking-normal text-ink mb-2 rpl-subheading">Face Scan</h3>
                        <p className="text-muted text-sm font-medium mb-6 leading-relaxed">
                          Position the member in front of the camera. The system will identify them using their registered Face ID.
                        </p>
                        {faceError && (
                          <div className="flex items-start gap-2 p-3 bg-danger-soft border border-danger rounded-xl mb-4">
                            <AlertCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-danger font-medium">{faceError}</p>
                          </div>
                        )}
                        <button
                          onClick={handleFaceScan}
                          disabled={faceScanning}
                          className="group w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-action hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-sm tracking-normal transition-all text-white shadow-sm"
                        >
                          {faceScanning
                            ? <><RefreshCw size={15} className="animate-spin" /> Scanning…</>
                            : <><ScanFace size={15} /> Begin Face Scan</>
                          }
                        </button>
                        </div>

                        {lookupMethod === 'manual' && (
                          <form onSubmit={handleManualLookup} className="space-y-4">
                            <IdCard size={40} className="mb-4 mx-auto md:mx-0 text-link" />
                            <div>
                              <h3 className="font-semibold tracking-normal text-ink mb-2 rpl-subheading">Manual ID</h3>
                              <p className="text-muted text-sm font-medium mb-5 leading-relaxed">
                                Enter the member's full Member ID, exact email, phone, or numeric user ID. Verify their identity before continuing.
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold tracking-normal text-muted mb-2">
                                Member Identifier
                              </label>
                              <input aria-label="Member Identifier"
                                type="text"
                                value={manualIdentifier}
                                onChange={(e) => {
                                  setManualIdentifier(e.target.value);
                                  setManualError('');
                                }}
                                placeholder="RPL-00007 or member@email.com"
                                className="w-full bg-panel border border-line rounded-lg py-3.5 px-4 text-ink font-sans text-base outline-none focus:border-line placeholder:text-muted"
                              />
                            </div>
                            {manualError && (
                              <div className="flex items-start gap-2 p-3 bg-danger-soft border border-danger rounded-xl">
                                <AlertCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-danger font-medium">{manualError}</p>
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={manualLoading}
                              className="group w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-action hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-sm tracking-normal transition-all text-white shadow-sm"
                            >
                              {manualLoading
                                ? <><RefreshCw size={15} className="animate-spin" /> Searching...</>
                                : <><Search size={15} /> Find Member</>
                              }
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <div className="animate-fade-in-up">
                        <p className="text-sm font-semibold tracking-normal text-success mb-4">Member Identified</p>
                        <div className="bg-panel border border-line rounded-xl p-5 mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-info-soft border border-line rounded-xl flex items-center justify-center flex-shrink-0">
                              <User size={24} className="text-link" />
                            </div>
                            <div>
                              <p className="font-semibold text-ink text-lg leading-none">{foundMember?.name}</p>
                              <p className="text-link font-semibold text-sm tracking-normal mt-1">{foundMember?.member_id}</p>
                              <p className="text-muted text-sm font-medium mt-0.5">{foundMember?.role}</p>
                            </div>
                          </div>
                        </div>
                        <BorrowingCapacity {...allowance} />
                        <p className="text-sm font-semibold tracking-normal text-muted mb-3">What would you like to do?</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleSelectMode('borrow')}
                            className="group flex flex-col items-center gap-2 px-4 py-4 bg-info-soft hover:bg-info-soft border-2 border-line hover:border-line rounded-lg font-semibold text-sm tracking-normal transition-all text-link"
                          >
                            <ArrowUpRight size={20} className="text-link" />
                            Borrow Books
                          </button>
                          <button
                            onClick={() => handleSelectMode('return')}
                            className="group flex flex-col items-center gap-2 px-4 py-4 bg-success-soft hover:bg-success-soft border-2 border-success hover:border-success rounded-lg font-semibold text-sm tracking-normal transition-all text-success"
                          >
                            <ArrowDownLeft size={20} className="text-success" />
                            Return Books
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: BOOKS (multi-scan) ── */}
            {step === 'books' && (
              <div className="rpl-scan-body p-4 sm:p-8">
                {/* Member badge */}
                <div className="flex items-center gap-2 mb-5 px-3 py-2.5 bg-panel rounded-xl border border-line">
                  <User size={13} className="text-link flex-shrink-0" />
                  <span className="text-sm font-bold text-ink">{foundMember?.name}</span>
                  <span className="text-sm font-semibold text-muted ml-auto">{foundMember?.member_id}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 [&>div]:min-w-0">
                  {/* Left — QR scanner */}
                  <div>
                    <p className="text-sm font-semibold tracking-normal text-muted mb-3">Scan Book QR Code</p>

                    {/* QR input box */}
                    <div className="bg-subtle rounded-xl border border-line p-6 mb-4">
                      <QrCode size={32} className={`mx-auto mb-4 transition-colors duration-300 ${lastFound ? 'text-success' : 'text-muted'}`} />
                      <input aria-label="QR Code / Book ID"
                        ref={qrInputRef}
                        type="text"
                        placeholder="QR Code / Book ID"
                        value={qrInput}
                        onChange={(e) => { setQrInput(e.target.value); setLastFound(null); setQrError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleQrLookup()}
                        className="w-full bg-panel border border-line rounded-lg py-3 px-4 text-ink font-sans text-base outline-none focus:border-line placeholder:text-muted text-center"
                      />
                      {qrError && (
                        <div className="flex items-start gap-2 p-3 bg-danger-soft border border-danger rounded-xl mt-3">
                          <AlertCircle size={13} className="text-danger mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-danger font-medium">{qrError}</p>
                        </div>
                      )}
                    </div>

                    {/* Scanned book preview */}
                    {lastFound && (
                      <div className="animate-fade-in-up bg-panel border border-line rounded-xl p-4 mb-4">
                        <p className="text-sm font-semibold tracking-normal text-success mb-3">
                          {lastFound.copy_id ? 'Physical Copy Found' : 'Legacy Book QR Found'}
                        </p>
                        <div className="flex gap-3 items-start mb-3">
                          <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0 shadow bg-subtle">
                            <BookCover src={lastFound.cover_url} alt={lastFound.title} iconSize={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-ink text-sm leading-tight">{lastFound.title}</p>
                            <p className="text-link text-sm font-bold mt-0.5">{lastFound.author}</p>
                            {(lastFound.copy_number || lastFound.copy_qr) && (
                              <p className="text-sm font-semibold tracking-normal text-muted mt-1 truncate">
                                {lastFound.copy_number ? `Copy ${lastFound.copy_number}` : 'Copy'} {lastFound.copy_qr ? `- ${lastFound.copy_qr}` : ''}
                              </p>
                            )}
                            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-sm font-semibold tracking-normal border ${
                              lastFound.can_borrow
                                ? 'bg-success-soft text-success border-success'
                                : 'bg-danger-soft text-danger border-danger'
                            }`}>
                              {lastFound.can_borrow ? 'Available' : (lastFound.copy_status || 'Unavailable')}
                            </span>
                            {lastFound.scan_message && (
                              <p className="text-sm text-muted font-medium mt-1">{lastFound.scan_message}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleAddToCart}
                          disabled={action === 'borrow' && !lastFound.can_borrow}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-action hover:bg-blue-500 disabled:bg-subtle disabled:text-muted disabled:cursor-not-allowed rounded-lg font-semibold text-sm tracking-normal transition-all text-white"
                        >
                          <Plus size={13} /> Add to Session
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleQrLookup}
                      disabled={qrLoading || !qrInput.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-subtle hover:bg-subtle disabled:opacity-50 disabled:cursor-not-allowed border border-line rounded-lg font-semibold text-sm tracking-normal transition-all text-ink"
                    >
                      {qrLoading
                        ? <><RefreshCw size={13} className="animate-spin" /> Looking up…</>
                        : <><QrCode size={13} /> Find Book</>
                      }
                    </button>
                  </div>

                  {/* Right — Reservations + Cart */}
                  <div className="flex flex-col gap-4">

                    {/* Member's active reservations */}
                    {memberReservations.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold tracking-normal text-warning mb-2">
                          Reserved Books ({memberReservations.length})
                        </p>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {memberReservations.map((r) => {
                            const alreadyInCart = bookCart.some((b) => b.id === r.book_id);
                            return (
                              <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                r.status === 'ready'
                                  ? 'bg-success-soft border-success'
                                  : 'bg-warning-soft border-warning'
                              }`}>
                                <div className="w-8 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-subtle">
                                  <BookCover src={r.cover_url} alt={r.book_title} iconSize={12} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-ink text-sm leading-tight truncate">{r.book_title}</p>
                                  <span className={`text-sm font-semibold tracking-normal ${
                                    r.status === 'ready' ? 'text-success' : 'text-warning'
                                  }`}>
                                    {r.status === 'ready' ? 'Ready for pickup' : `Queue #${r.queue_position}`}
                                  </span>
                                </div>
                                {!alreadyInCart ? (
                                  <button
                                    onClick={() => {
                                      setBookCart((prev) => [...prev, {
                                        id: r.book_id,
                                        title: r.book_title,
                                        author: r.book_author,
                                        cover_url: r.cover_url,
                                        qr_code: r.book_qr,
                                        copies_available: r.status === 'ready' ? 1 : 0,
                                      }]);
                                    }}
                                    className="p-1.5 bg-info-soft hover:bg-info-soft border border-line rounded-lg transition-all flex-shrink-0"
                                    title="Add to session"
                                  >
                                    <Plus size={11} className="text-link" />
                                  </button>
                                ) : (
                                  <CheckCircle size={14} className="text-success flex-shrink-0" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Session cart */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold tracking-normal text-muted">Session Cart</p>
                        {bookCart.length > 0 && (
                          <span className="px-2 py-0.5 bg-info-soft border border-line text-link rounded-full text-sm font-semibold">{bookCart.length}</span>
                        )}
                      </div>

                      {bookCart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 border border-dashed border-line rounded-xl text-center">
                          <Package size={24} className="text-muted mb-2" />
                          <p className="text-sm font-semibold tracking-normal text-muted">No books yet</p>
                          <p className="text-sm text-muted mt-1 font-medium">Scan a QR code or add from reservations</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 mb-4">
                          {bookCart.map((b) => (
                            <CartItem key={cartItemKey(b)} book={b} onRemove={handleRemoveFromCart} />
                          ))}
                        </div>
                      )}

                      {bookCart.length > 0 && (
                        <button
                          onClick={() => setStep('confirm')}
                          className="group w-full flex items-center justify-center gap-2 py-3.5 bg-action hover:bg-blue-500 rounded-lg font-semibold text-sm tracking-normal transition-all text-white shadow-sm"
                        >
                          Proceed to Confirm ({bookCart.length})
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Back */}
                <div className="mt-5 pt-4 border-t border-line flex items-center justify-between">
                  <button
                    onClick={() => { setStep('face'); setFaceFound(false); setFoundMember(null); }}
                    className="flex items-center gap-2 text-sm font-semibold tracking-normal text-muted hover:text-muted transition-colors"
                  >
                    <ArrowLeft size={11} /> Back to Face Scan
                  </button>
                  {bookCart.length === 0 && (
                    <p className="text-sm text-muted font-medium">Scan at least one book to continue</p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2B: RETURN — SELECT ACTIVE LOANS ── */}
            {step === 'return-select' && (
              <div className="rpl-scan-body p-4 sm:p-8 animate-fade-in-up">
                {/* Member badge */}
                <div className="flex items-center gap-2 mb-5 px-3 py-2.5 bg-panel rounded-xl border border-line">
                  <User size={13} className="text-link flex-shrink-0" />
                  <span className="text-sm font-bold text-ink">{foundMember?.name}</span>
                  <span className="text-sm font-semibold text-muted ml-auto">{foundMember?.member_id}</span>
                </div>

                {loansLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <RefreshCw size={28} className="animate-spin text-link mb-3" />
                    <p className="text-sm font-semibold tracking-normal text-muted">Loading active loans…</p>
                  </div>
                ) : activeLoans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BookOpen size={32} className="text-muted mb-3" />
                    <p className="text-sm font-semibold text-muted">No active loans</p>
                    <p className="text-sm text-muted font-medium mt-1">This member has no books currently borrowed.</p>
                    <button
                      onClick={() => { setSessionMode(null); setStep('face'); }}
                      className="mt-5 flex items-center gap-2 text-sm font-semibold tracking-normal text-muted hover:text-ink transition-colors"
                    >
                      <ArrowLeft size={11} /> Go Back
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold tracking-normal text-success mb-3">
                      Active Loans ({activeLoans.length}) — select books to return
                    </p>
                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 mb-5">
                      {activeLoans.map((loan) => {
                        const selected = selectedLoanIds.has(loan.transaction_id);
                        const isOverdue = loan.status === 'overdue';
                        return (
                          <button
                            key={loan.transaction_id}
                            onClick={() => setSelectedLoanIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(loan.transaction_id)) next.delete(loan.transaction_id);
                              else next.add(loan.transaction_id);
                              return next;
                            })}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all duration-200 text-left ${
                              selected
                                ? 'bg-success-soft border-success'
                                : 'bg-panel border-line hover:border-line'
                            }`}
                          >
                            <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 shadow bg-subtle">
                              <BookCover src={loan.cover_url} alt={loan.book_title} iconSize={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-ink text-sm leading-tight truncate">{loan.book_title}</p>
                              <p className="text-muted text-sm font-medium truncate">{loan.book_author}</p>
                              {(loan.copy_number || loan.copy_qr) && (
                                <p className="text-link text-sm font-semibold tracking-normal mt-0.5 truncate">
                                  {loan.copy_number ? `Copy ${loan.copy_number}` : 'Copy QR'} {loan.copy_qr ? `- ${loan.copy_qr}` : ''}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-sm font-semibold tracking-normal px-1.5 py-0.5 rounded-full border ${
                                  isOverdue
                                    ? 'bg-danger-soft border-danger text-danger'
                                    : loan.days_left <= 3
                                    ? 'bg-warning-soft border-warning text-warning'
                                    : 'bg-subtle border-line text-muted'
                                }`}>
                                  {isOverdue ? `Overdue ${Math.abs(loan.days_left)}d` : `${loan.days_left}d left`}
                                </span>
                                <FineContent>
                                {isOverdue && loan.fine_amount > 0 && (
                                  <span className="text-sm font-semibold text-danger">₱{Number(loan.fine_amount).toFixed(2)} fine</span>
                                )}
                                </FineContent>
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                              selected ? 'bg-emerald-500 border-success' : 'border-line'
                            }`}>
                              {selected && <CheckCircle2 size={12} className="text-white" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => { setSessionMode(null); setStep('face'); setFaceFound(false); setFoundMember(null); }}
                        className="flex items-center gap-2 px-4 py-3 bg-panel hover:bg-panel border border-line rounded-lg font-semibold text-sm tracking-normal transition-all text-muted hover:text-ink"
                      >
                        <ArrowLeft size={13} /> Back
                      </button>
                      <button
                        disabled={selectedLoanIds.size === 0}
                        onClick={() => {
                          const selected = activeLoans.filter((l) => selectedLoanIds.has(l.transaction_id));
                          setBookCart(selected.map((l) => ({
                            id: l.book_id,
                            title: l.book_title,
                            author: l.book_author,
                            cover_url: l.cover_url,
                            copy_id: l.copy_id,
                            copy_number: l.copy_number,
                            copy_qr: l.copy_qr,
                            copy_status: 'borrowed',
                            scan_qr_type: l.copy_id ? 'copy' : 'book',
                            can_borrow: false,
                          })));
                          setStep('confirm');
                        }}
                        className="group flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-semibold text-sm tracking-normal transition-all text-white shadow-sm"
                      >
                        <CheckCircle2 size={14} /> Return Selected ({selectedLoanIds.size})
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STEP 3: CONFIRM ── */}
            {step === 'confirm' && (
              <div className="rpl-scan-body p-4 sm:p-8 animate-fade-in-up">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 [&>div]:min-w-0">
                  {/* Left — book list */}
                  <div>
                    <p className="text-sm font-semibold tracking-normal text-muted mb-4">
                      Books in Session ({bookCart.length})
                    </p>

                    {/* Member */}
                    <div className="flex items-center gap-3 p-3 bg-panel border border-line rounded-xl mb-3">
                      <div className="w-9 h-9 bg-info-soft rounded-xl flex items-center justify-center flex-shrink-0">
                        <User size={16} className="text-link" />
                      </div>
                      <div>
                        <p className="font-semibold text-ink text-sm">{foundMember?.name}</p>
                        <p className="text-link text-sm font-semibold tracking-normal">{foundMember?.member_id}</p>
                      </div>
                      <CheckCircle size={15} className="text-success ml-auto flex-shrink-0" />
                    </div>

                    {/* Book list */}
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {bookCart.map((b) => {
                        const reservation = memberReservations.find((r) => r.book_id === b.id);
                        return (
                          <div key={cartItemKey(b)}>
                            <CartItem book={b} />
                            {reservation && (
                              <div className="ml-3 mt-0.5 mb-1">
                                <span className={`text-sm font-semibold tracking-normal ${
                                  reservation.status === 'ready' ? 'text-success' : 'text-warning'
                                }`}>
                                  ★ Reservation will be fulfilled
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right — action + confirm */}
                  <div className="flex flex-col justify-between">
                    <div>
                      {/* Show toggle only when mode was not pre-selected (manual path) */}
                      {!sessionMode ? (
                        <>
                          <p className="text-sm font-semibold tracking-normal text-muted mb-4">Select Action</p>
                          <div className="grid grid-cols-2 gap-3 mb-6">
                            <button onClick={() => setAction('borrow')}
                              className={`flex flex-col items-center gap-3 p-5 rounded-lg border-2 transition-all duration-200 ${
                                action === 'borrow'
                                  ? 'bg-info-soft border-line text-link shadow-sm '
                                  : 'bg-panel border-line text-muted hover:border-line hover:text-ink'
                              }`}
                            >
                              <ArrowUpRight size={24} className={action === 'borrow' ? 'text-link' : ''} />
                              <div>
                                <p className="font-semibold text-sm tracking-normal">Borrow</p>
                                <p className="text-sm font-medium opacity-70 mt-0.5">Check out books</p>
                              </div>
                            </button>
                            <button onClick={() => setAction('return')}
                              className={`flex flex-col items-center gap-3 p-5 rounded-lg border-2 transition-all duration-200 ${
                                action === 'return'
                                  ? 'bg-success-soft border-success text-success shadow-sm shadow-emerald-900/30'
                                  : 'bg-panel border-line text-muted hover:border-line hover:text-ink'
                              }`}
                            >
                              <ArrowDownLeft size={24} className={action === 'return' ? 'text-success' : ''} />
                              <div>
                                <p className="font-semibold text-sm tracking-normal">Return</p>
                                <p className="text-sm font-medium opacity-70 mt-0.5">Check in books</p>
                              </div>
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className={`flex items-center gap-3 p-4 rounded-xl border-2 mb-6 ${
                          sessionMode === 'borrow'
                            ? 'bg-info-soft border-line'
                            : 'bg-success-soft border-success'
                        }`}>
                          {sessionMode === 'borrow'
                            ? <ArrowUpRight size={20} className="text-link flex-shrink-0" />
                            : <ArrowDownLeft size={20} className="text-success flex-shrink-0" />
                          }
                          <div>
                            <p className={`font-semibold text-sm tracking-normal ${sessionMode === 'borrow' ? 'text-link' : 'text-success'}`}>
                              {sessionMode === 'borrow' ? 'Borrow Session' : 'Return Session'}
                            </p>
                            <p className="text-sm text-muted font-medium mt-0.5">
                              {sessionMode === 'borrow' ? 'Checking out books' : 'Returning selected books'}
                            </p>
                          </div>
                        </div>
                      )}

                      {action === 'borrow' && (
                        <div className="p-4 bg-info-soft border border-line rounded-xl mb-4">
                          <p className="text-sm font-semibold tracking-normal text-link mb-1">Loan Period</p>
                          <p className="text-sm font-bold text-ink">
                            {loanPolicy.data ? <>{loanPolicy.data.loan_days} days — due <span className="text-link">{dueDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })}</span></> : 'Loan policy unavailable'}
                          </p>
                          <FineContent>
                          {loanPolicy.data && <p className="text-sm text-muted font-medium mt-0.5">₱{loanPolicy.data.fine_per_day}/day fine after due date · applies to all {bookCart.length} book{bookCart.length !== 1 ? 's' : ''}</p>}
                          </FineContent>
                          {loanPolicy.error && <p role="alert">Could not load loan policy. <button onClick={loanPolicy.retry}>Retry loan policy</button></p>}
                        </div>
                      )}
                      {action === 'return' && (
                        <div className="p-4 bg-success-soft border border-success rounded-xl mb-4">
                          <p className="text-sm font-semibold tracking-normal text-success mb-1">Return Note</p>
                          <FineContent>
                          <p className="text-sm font-bold text-ink">Fines calculated automatically for each book.</p>
                          </FineContent>
                          <p className="text-sm text-muted font-medium mt-0.5">All {bookCart.length} book{bookCart.length !== 1 ? 's' : ''} will be marked available immediately.</p>
                        </div>
                      )}

                      {confirmError && (
                        <div className="flex items-start gap-2 p-3 bg-danger-soft border border-danger rounded-xl mb-3">
                          <AlertCircle size={14} className="text-danger mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-danger font-medium">{confirmError}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(sessionMode === 'return' ? 'return-select' : 'books')}
                        className="flex items-center gap-2 px-5 py-3.5 bg-panel hover:bg-panel border border-line rounded-lg font-semibold text-sm tracking-normal transition-all text-muted hover:text-ink"
                      >
                        <ArrowLeft size={13} /> Back
                      </button>
                      <button
                        onClick={handleConfirmAll}
                        disabled={processing || (action === 'borrow' && !loanPolicy.data)}
                        className={`group flex-1 flex items-center justify-center gap-3 py-3.5 rounded-lg font-semibold text-sm tracking-normal transition-all text-white shadow-sm disabled:opacity-60 ${
                          action === 'borrow'
                            ? 'bg-action hover:bg-blue-500 '
                            : 'bg-emerald-700 hover:bg-emerald-800 shadow-emerald-900/40'
                        }`}
                      >
                        {processing
                          ? <><RefreshCw size={15} className="animate-spin" /> Processing…</>
                          : <><CheckCircle2 size={15} /> Confirm {action === 'borrow' ? 'Borrow' : 'Return'} All ({bookCart.length})</>
                        }
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-line flex justify-center">
                  <button onClick={resetToFace}
                    className="flex items-center gap-2 text-sm font-semibold tracking-normal text-muted hover:text-muted transition-colors">
                    <RotateCcw size={11} /> Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function LibBorrowReturn() {
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [showScanner, setShowScanner]   = useState(false);

  const listing = useServerPage('/api/transactions', { search,
    type: ['borrow', 'return'].includes(filter) ? filter : '',
    status: ['active', 'overdue', 'returned'].includes(filter) ? filter : '' }, '/api/transactions/count');
  const { items: filtered, loading, reload: fetchTransactions } = listing;

  const handleCommit = () => fetchTransactions();

  const handleQuickReturn = (tx) => {
    if (!window.confirm(`Return "${tx.book_title}" for ${tx.member_name}?`)) return;
    returnBook(tx.user_id, tx.book_id, tx.copy_id)
      .then(() => fetchTransactions())
      .catch((err) => alert(err.response?.data?.detail || 'Return failed.'));
  };

  const totalBorrowed = listing.totals.borrowed ?? 0;
  const totalReturned = listing.totals.returned ?? 0;
  const totalOverdue  = listing.totals.overdue ?? 0;

  return (
    <div className="rpl-page min-h-screen bg-transparent pb-20 font-sans text-ink transition-colors duration-300">

      {showScanner && (
        <QuickScanModal
          onClose={() => setShowScanner(false)}
          onCommit={handleCommit}
        />
      )}

      <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">

        {/* ── HEADER ── */}
        <div className="animate-fade-in-up flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <p className="text-sm font-semibold tracking-normal text-link mb-1">
              Librarian Terminal
            </p>
            <h1 className="font-semibold tracking-normal leading-none rpl-title">
              Borrow / <span className="text-link">Return</span>
            </h1>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="group flex items-center gap-3 px-7 py-4 bg-action hover:bg-action-hover text-white rounded-lg font-semibold text-sm tracking-normal transition-all duration-200 shadow-sm flex-shrink-0"
          >
            <Zap size={16} className="transition-transform duration-200" />
            Quick Scan Session
          </button>
        </div>

        {/* ── HOW IT WORKS STRIP ── */}
        <div className="animate-fade-in-up delay-75 bg-info-soft border border-line rounded-xl px-6 py-4 mb-7 flex flex-col sm:flex-row items-center gap-4">
          <p className="text-sm font-semibold tracking-normal text-link flex-shrink-0">Quick Scan Flow</p>
          <div className="flex items-center gap-3 flex-1 flex-wrap justify-center sm:justify-start">
            {[
              { icon: <ScanFace size={14} />,    label: 'Face or ID' },
              { icon: <Package size={14} />,     label: 'Add Books (1+)' },
              { icon: <CheckCircle2 size={14} />, label: 'Confirm All' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-panel rounded-xl border border-line text-link">
                  {s.icon}
                  <span className="text-sm font-semibold tracking-normal">{s.label}</span>
                </div>
                {i < 2 && <ChevronRight size={12} className="text-link flex-shrink-0" />}
              </div>
            ))}
          </div>
          <button onClick={() => setShowScanner(true)}
            className="text-sm font-semibold tracking-normal text-link hover:underline underline-offset-4 flex-shrink-0">
            Start →
          </button>
        </div>

        {/* ── SUMMARY TILES ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-7 animate-fade-in-up delay-100">
          {[
            { label: 'Total Borrowed', val: totalBorrowed, icon: <ArrowUpRight size={16} />, color: 'text-link text-link',    bg: 'bg-info-soft bg-info-soft border-line border-line' },
            { label: 'Returned',       val: totalReturned, icon: <ArrowDownLeft size={16} />, color: 'text-success text-success', bg: 'bg-success-soft bg-success-soft border-success border-success' },
            { label: 'Overdue',        val: totalOverdue,  icon: <BookOpen size={16} />,       color: 'text-danger text-danger',      bg: 'bg-danger-soft bg-danger-soft border-danger border-danger' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border rounded-xl sm:rounded-xl p-3 sm:p-5 flex flex-col sm:flex-row items-center sm:gap-4 gap-1 hover:shadow-md transition-all duration-200 cursor-default`}>
              <div className={`${s.color} flex-shrink-0`}>{s.icon}</div>
              <div className="text-center sm:text-left min-w-0">
                <p className="text-xl sm:text-2xl font-semibold tracking-normal text-ink">{s.val}</p>
                <p className={`text-sm sm:text-sm font-semibold tracking-normal leading-tight ${s.color}`}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <PageControls {...listing} />
        {/* ── TRANSACTION TABLE ── */}
        <div className="animate-fade-in-up delay-200 bg-panel border border-line rounded-xl overflow-hidden shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-line">
            <h3 className="font-semibold tracking-normal text-ink rpl-subheading">Transaction Log</h3>
            <div className="flex flex-wrap gap-2 md:ml-4">
              {['all', 'borrow', 'return', 'overdue'].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold tracking-normal transition-all duration-200 ${
                    filter === f
                      ? 'bg-action text-white shadow-md '
                      : 'bg-subtle text-muted hover:text-ink '
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 md:ml-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                <input aria-label="Search member or book..." type="text" placeholder="Search member or book..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-subtle border border-line rounded-lg py-2 pl-8 pr-4 text-base font-medium outline-none focus:ring-2 focus:ring-line w-40 sm:w-56 text-muted placeholder:text-muted" />
              </div>
              <button onClick={fetchTransactions} className="p-2 text-muted hover:text-link transition-colors">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-link" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[900px]">
                <thead>
                  <tr className="text-sm font-semibold text-muted tracking-normal border-b border-line">
                    <th className="px-6 py-4">Member</th>
                    <th className="px-6 py-4">Book</th>
                    <th className="px-6 py-4">Borrowed</th>
                    <th className="px-6 py-4">Due</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="group border-b border-line hover:bg-info-soft hover:bg-subtle transition-all duration-200">
                      <td className="px-6 py-4">
                        <p className="font-bold text-sm text-ink">{t.member_name || '—'}</p>
                        <p className="text-sm font-semibold text-muted tracking-normal">{t.member_id || ''}</p>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-muted max-w-[160px] truncate">
                        {t.book_title || '—'}
                      </td>
                      <td className="px-6 py-4 font-sans text-sm text-muted">
                        {t.borrow_date ? toUtcDate(t.borrow_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4 font-sans text-sm text-muted">
                        {t.due_date ? toUtcDate(t.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-sm font-semibold tracking-normal inline-block ${TYPE_STYLE[t.type] || 'bg-subtle text-muted'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-sm font-semibold tracking-normal inline-block ${STATUS_STYLE[t.status] || 'bg-subtle text-muted'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {t.status === 'active' && (
                          <button
                            onClick={() => handleQuickReturn(t)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-success-soft text-success rounded-lg text-sm font-semibold tracking-normal hover:bg-success-soft transition-all duration-200"
                          >
                            <CheckCircle2 size={11} /> Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted text-sm font-semibold tracking-normal">
                        No transactions found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
