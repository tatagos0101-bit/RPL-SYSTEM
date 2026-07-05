import { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import {
  Search, BookOpen, CheckCircle2, ArrowDownLeft, ArrowUpRight,
  Zap, X, ScanFace, QrCode, RefreshCw, CheckCircle,
  User, ChevronRight, ArrowLeft, RotateCcw, AlertCircle,
  Plus, Trash2, Package, IdCard, Keyboard,
} from 'lucide-react';
import BookCover from '../../components/BookCover';
import { getTransactions, borrowBook, returnBook, getMemberReservations, getMemberActiveLoans, getMembers } from '../../api/librarian';
import { faceLookup } from '../../api/auth';
import { getBookByScan } from '../../api/books';
import { addScannedBookCartItem, cartItemKey, scanResultToCartItem } from '../../api/bookCopyScan';
import { parseApiDateTime as toUtcDate } from '../../api/dateTime';
import { findManualMemberMatch, memberToSessionIdentity } from '../../api/manualMemberLookup';

// ─── STATUS STYLES ─────────────────────────────────────────────────────────────

const TYPE_STYLE = {
  borrow: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  return: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
};
const STATUS_STYLE = {
  active:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  returned: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  overdue:  'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
};

// ─── BOOK CART ITEM ────────────────────────────────────────────────────────────

const CartItem = ({ book, result, onRemove }) => {
  const hasResult = result !== undefined;
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all duration-300 ${
      hasResult
        ? result.success
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-rose-500/10 border-rose-500/30'
        : 'bg-white/5 border-white/10'
    }`}>
      <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 shadow bg-slate-800">
        <BookCover src={book.cover_url} alt={book.title} iconSize={14} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-black text-white text-xs leading-tight truncate">{book.title}</p>
        <p className="text-slate-400 text-[10px] font-medium truncate">{book.author}</p>
        {(book.copy_number || book.copy_qr) && (
          <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mt-0.5 truncate">
            {book.copy_number ? `Copy ${book.copy_number}` : 'Copy QR'} {book.copy_qr ? `- ${book.copy_qr}` : ''}
          </p>
        )}
        {hasResult && (
          result.success ? (
            <p className="text-emerald-400 text-[9px] font-black uppercase tracking-widest mt-0.5">Done</p>
          ) : (
            <p className="text-rose-400 text-[9px] font-medium mt-0.5 truncate">{result.error}</p>
          )
        )}
      </div>
      {hasResult ? (
        result.success
          ? <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
          : <AlertCircle size={16} className="text-rose-400 flex-shrink-0" />
      ) : (
        onRemove && (
          <button
            onClick={() => onRemove(cartItemKey(book))}
            className="p-1.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
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
  const webcamRef = useRef(null);
  const qrInputRef = useRef(null);

  // ── Face step
  const [step, setStep]                 = useState('face');
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceFound, setFaceFound]       = useState(false);
  const [faceError, setFaceError]       = useState('');
  const [foundMember, setFoundMember]   = useState(null);
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
    try {
      const resvRes = await getMemberReservations(member.user_id);
      setMemberReservations(resvRes.data);
    } catch {
      setMemberReservations([]);
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

      if (match.status !== 'active') {
        setManualError('This member is suspended. Reactivate the account before borrow/return transactions.');
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
      try {
        const res = await getMemberActiveLoans(foundMember.user_id);
        setActiveLoans(res.data);
        // Pre-select all loans by default
        setSelectedLoanIds(new Set(res.data.map((l) => l.transaction_id)));
      } catch {
        setActiveLoans([]);
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
        res.push({ book, success: false, error: err.response?.data?.detail || 'Transaction failed' });
      }
    }
    setResults(res);
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

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);

  const successCount = results.filter((r) => r.success).length;
  const failCount    = results.filter((r) => !r.success).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div className="w-full max-w-4xl animate-scale-in">

        {/* ── DONE SCREEN ── */}
        {step === 'done' && (
          <div className="bg-slate-950 border border-white/10 rounded-[1.5rem] sm:rounded-[2.5rem] overflow-y-auto max-h-[90vh] shadow-2xl">
            <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-600/20 rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={15} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Session Complete</p>
                  <p className="text-sm font-black text-white">
                    {successCount} of {results.length} book{results.length !== 1 ? 's' : ''} processed
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-8">
              {/* Member row */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl mb-5">
                <div className="w-9 h-9 bg-blue-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-blue-400" />
                </div>
                <div>
                  <p className="font-black text-white text-sm">{foundMember?.name}</p>
                  <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest">{foundMember?.member_id}</p>
                </div>
                <span className={`ml-auto px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                  action === 'borrow'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
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
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
                  <p className="text-2xl font-black text-emerald-400">{successCount}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mt-0.5">Successful</p>
                </div>
                <div className={`p-4 border rounded-2xl text-center ${failCount > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-slate-800/50 border-slate-700'}`}>
                  <p className={`text-2xl font-black ${failCount > 0 ? 'text-rose-400' : 'text-slate-600'}`}>{failCount}</p>
                  <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${failCount > 0 ? 'text-rose-500' : 'text-slate-600'}`}>Failed</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={resetToFace}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-slate-400 hover:text-white"
                >
                  <RotateCcw size={13} /> New Session
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-white"
                >
                  <X size={13} /> Close
                </button>
              </div>
            </div>
          </div>
        )}

        {step !== 'done' && (
          <div className="bg-slate-950 border border-white/10 rounded-[1.5rem] sm:rounded-[2.5rem] overflow-y-auto max-h-[90vh] shadow-2xl">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-blue-600/20 rounded-xl flex items-center justify-center">
                  <Zap size={15} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Quick Scan Session</p>
                  <p className="text-sm font-black text-white">
                    {step === 'face'          && 'Step 1 — Identify Member'}
                    {step === 'books'         && 'Step 2 — Scan Books'}
                    {step === 'return-select' && 'Step 2 — Select Books to Return'}
                    {step === 'confirm'       && 'Step 3 — Review & Confirm'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Cart badge (books step) */}
                {step === 'books' && bookCart.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-xl">
                    <Package size={12} className="text-blue-400" />
                    <span className="text-[10px] font-black text-blue-300">{bookCart.length} book{bookCart.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {/* Step indicators */}
                {(['face', sessionMode === 'return' ? 'return-select' : 'books', 'confirm']).map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      step === s ? 'bg-blue-400 scale-125' :
                      STEPS.indexOf(step) > STEPS.indexOf(s) ? 'bg-emerald-500' : 'bg-slate-700'
                    }`} />
                    {i < 2 && <div className={`w-6 h-px transition-all duration-300 ${STEPS.indexOf(step) > STEPS.indexOf(s) ? 'bg-emerald-500' : 'bg-slate-700'}`} />}
                  </div>
                ))}
              </div>

              <button onClick={onClose} className="p-2.5 text-slate-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>

            {/* ── STEP 1: FACE SCAN ── */}
            {step === 'face' && (
              <div className="p-4 sm:p-8">
                <div className="grid md:grid-cols-2 gap-6 items-center">
                  {/* Camera view */}
                  <div className="relative aspect-video bg-black rounded-[2rem] overflow-hidden border border-white/10">
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
                            faceScanning ? 'border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.4)]' :
                            faceFound ? 'border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.4)]' :
                            'border-white/20'
                          }`} />
                        </div>
                        <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-blue-500 rounded-tl-lg pointer-events-none" />
                        <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-blue-500 rounded-tr-lg pointer-events-none" />
                        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-blue-500 rounded-bl-lg pointer-events-none" />
                        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-blue-500 rounded-br-lg pointer-events-none" />
                        {faceFound && (
                          <div className="absolute inset-0 bg-emerald-600/20 backdrop-blur-[2px] flex items-center justify-center z-20">
                            <div className="text-center">
                              <CheckCircle size={40} className="text-emerald-400 mx-auto mb-2" />
                              <p className="text-emerald-300 font-black text-[10px] uppercase tracking-widest">Face Matched</p>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 px-6 text-center">
                        <div className="w-16 h-16 rounded-3xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-4">
                          <IdCard size={30} className="text-blue-400" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Manual Member Lookup</p>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-xs">
                          Use this when Face ID or the camera is unavailable. Verify the member before continuing.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right panel */}
                  <div>
                    {!faceFound ? (
                      <div className="text-center md:text-left">
                        <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-white/10 rounded-2xl mb-6">
                          <button
                            type="button"
                            onClick={() => {
                              setLookupMethod('face');
                              setManualError('');
                            }}
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              lookupMethod === 'face'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
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
                            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              lookupMethod === 'manual'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                            }`}
                          >
                            <Keyboard size={13} /> Manual ID
                          </button>
                        </div>

                        <div className={lookupMethod === 'face' ? '' : 'hidden'}>
                        <ScanFace size={40} className={`mb-4 mx-auto md:mx-0 transition-colors duration-300 ${faceScanning ? 'text-blue-400' : 'text-slate-600'}`} />
                        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-2">Face Scan</h3>
                        <p className="text-slate-400 text-sm font-medium mb-6 leading-relaxed">
                          Position the member in front of the camera. The system will identify them using their registered Face ID.
                        </p>
                        {faceError && (
                          <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-4">
                            <AlertCircle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-rose-300 font-medium">{faceError}</p>
                          </div>
                        )}
                        <button
                          onClick={handleFaceScan}
                          disabled={faceScanning}
                          className="group w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black uppercase text-xs tracking-widest transition-all text-white shadow-lg shadow-blue-900/40 active:scale-95"
                        >
                          {faceScanning
                            ? <><RefreshCw size={15} className="animate-spin" /> Scanning…</>
                            : <><ScanFace size={15} /> Begin Face Scan</>
                          }
                        </button>
                        </div>

                        {lookupMethod === 'manual' && (
                          <form onSubmit={handleManualLookup} className="space-y-4">
                            <IdCard size={40} className="mb-4 mx-auto md:mx-0 text-blue-400" />
                            <div>
                              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white mb-2">Manual ID</h3>
                              <p className="text-slate-400 text-sm font-medium mb-5 leading-relaxed">
                                Enter the member's full Member ID, exact email, phone, or numeric user ID. Verify their identity before continuing.
                              </p>
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                Member Identifier
                              </label>
                              <input
                                type="text"
                                value={manualIdentifier}
                                onChange={(e) => {
                                  setManualIdentifier(e.target.value);
                                  setManualError('');
                                }}
                                placeholder="RPL-00007 or member@email.com"
                                className="w-full bg-white/10 border border-white/20 rounded-2xl py-3.5 px-4 text-white font-mono text-sm outline-none focus:border-blue-500 placeholder:text-slate-600"
                              />
                            </div>
                            {manualError && (
                              <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl">
                                <AlertCircle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-rose-300 font-medium">{manualError}</p>
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={manualLoading}
                              className="group w-full md:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black uppercase text-xs tracking-widest transition-all text-white shadow-lg shadow-blue-900/40 active:scale-95"
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-4">Member Identified</p>
                        <div className="bg-white/5 border border-white/10 rounded-[1.5rem] p-5 mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center flex-shrink-0">
                              <User size={24} className="text-blue-400" />
                            </div>
                            <div>
                              <p className="font-black text-white text-lg leading-none">{foundMember?.name}</p>
                              <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest mt-1">{foundMember?.member_id}</p>
                              <p className="text-slate-500 text-[9px] font-medium mt-0.5">{foundMember?.role}</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">What would you like to do?</p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => handleSelectMode('borrow')}
                            className="group flex flex-col items-center gap-2 px-4 py-4 bg-blue-600/20 hover:bg-blue-600/40 border-2 border-blue-500/50 hover:border-blue-400 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-blue-300 active:scale-95"
                          >
                            <ArrowUpRight size={20} className="text-blue-400" />
                            Borrow Books
                          </button>
                          <button
                            onClick={() => handleSelectMode('return')}
                            className="group flex flex-col items-center gap-2 px-4 py-4 bg-emerald-600/20 hover:bg-emerald-600/40 border-2 border-emerald-500/50 hover:border-emerald-400 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-emerald-300 active:scale-95"
                          >
                            <ArrowDownLeft size={20} className="text-emerald-400" />
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
              <div className="p-4 sm:p-8">
                {/* Member badge */}
                <div className="flex items-center gap-2 mb-5 px-3 py-2.5 bg-white/5 rounded-xl border border-white/10">
                  <User size={13} className="text-blue-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-slate-300">{foundMember?.name}</span>
                  <span className="text-[9px] font-black text-slate-500 ml-auto">{foundMember?.member_id}</span>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left — QR scanner */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Scan Book QR Code</p>

                    {/* QR input box */}
                    <div className="bg-black rounded-[1.5rem] border border-white/10 p-6 mb-4">
                      <QrCode size={32} className={`mx-auto mb-4 transition-colors duration-300 ${lastFound ? 'text-emerald-400' : 'text-slate-600'}`} />
                      <input
                        ref={qrInputRef}
                        type="text"
                        placeholder="QR Code / Book ID"
                        value={qrInput}
                        onChange={(e) => { setQrInput(e.target.value); setLastFound(null); setQrError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleQrLookup()}
                        className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 px-4 text-white font-mono text-sm outline-none focus:border-blue-500 placeholder:text-slate-600 text-center"
                      />
                      {qrError && (
                        <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl mt-3">
                          <AlertCircle size={13} className="text-rose-400 mt-0.5 flex-shrink-0" />
                          <p className="text-[11px] text-rose-300 font-medium">{qrError}</p>
                        </div>
                      )}
                    </div>

                    {/* Scanned book preview */}
                    {lastFound && (
                      <div className="animate-fade-in-up bg-white/5 border border-white/10 rounded-[1.5rem] p-4 mb-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-3">
                          {lastFound.copy_id ? 'Physical Copy Found' : 'Legacy Book QR Found'}
                        </p>
                        <div className="flex gap-3 items-start mb-3">
                          <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0 shadow bg-slate-800">
                            <BookCover src={lastFound.cover_url} alt={lastFound.title} iconSize={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-white text-sm leading-tight">{lastFound.title}</p>
                            <p className="text-blue-400 text-[11px] font-bold mt-0.5">{lastFound.author}</p>
                            {(lastFound.copy_number || lastFound.copy_qr) && (
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1 truncate">
                                {lastFound.copy_number ? `Copy ${lastFound.copy_number}` : 'Copy'} {lastFound.copy_qr ? `- ${lastFound.copy_qr}` : ''}
                              </p>
                            )}
                            <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                              lastFound.can_borrow
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            }`}>
                              {lastFound.can_borrow ? 'Available' : (lastFound.copy_status || 'Unavailable')}
                            </span>
                            {lastFound.scan_message && (
                              <p className="text-[10px] text-slate-500 font-medium mt-1">{lastFound.scan_message}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleAddToCart}
                          disabled={action === 'borrow' && !lastFound.can_borrow}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed rounded-xl font-black uppercase text-[10px] tracking-widest transition-all text-white active:scale-95"
                        >
                          <Plus size={13} /> Add to Session
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleQrLookup}
                      disabled={qrLoading || !qrInput.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-slate-300 active:scale-95"
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-400 mb-2">
                          Reserved Books ({memberReservations.length})
                        </p>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {memberReservations.map((r) => {
                            const alreadyInCart = bookCart.some((b) => b.id === r.book_id);
                            return (
                              <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-2xl border transition-all ${
                                r.status === 'ready'
                                  ? 'bg-emerald-500/10 border-emerald-500/30'
                                  : 'bg-amber-500/10 border-amber-500/20'
                              }`}>
                                <div className="w-8 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
                                  <BookCover src={r.cover_url} alt={r.book_title} iconSize={12} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-black text-white text-[11px] leading-tight truncate">{r.book_title}</p>
                                  <span className={`text-[8px] font-black uppercase tracking-widest ${
                                    r.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'
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
                                    className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg transition-all flex-shrink-0"
                                    title="Add to session"
                                  >
                                    <Plus size={11} className="text-blue-400" />
                                  </button>
                                ) : (
                                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
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
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Session Cart</p>
                        {bookCart.length > 0 && (
                          <span className="px-2 py-0.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-full text-[9px] font-black">{bookCart.length}</span>
                        )}
                      </div>

                      {bookCart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 border border-dashed border-white/10 rounded-[1.5rem] text-center">
                          <Package size={24} className="text-slate-700 mb-2" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">No books yet</p>
                          <p className="text-[10px] text-slate-700 mt-1 font-medium">Scan a QR code or add from reservations</p>
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
                          className="group w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black uppercase text-xs tracking-widest transition-all text-white shadow-lg active:scale-95"
                        >
                          Proceed to Confirm ({bookCart.length})
                          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Back */}
                <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between">
                  <button
                    onClick={() => { setStep('face'); setFaceFound(false); setFoundMember(null); }}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    <ArrowLeft size={11} /> Back to Face Scan
                  </button>
                  {bookCart.length === 0 && (
                    <p className="text-[9px] text-slate-700 font-medium">Scan at least one book to continue</p>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2B: RETURN — SELECT ACTIVE LOANS ── */}
            {step === 'return-select' && (
              <div className="p-4 sm:p-8 animate-fade-in-up">
                {/* Member badge */}
                <div className="flex items-center gap-2 mb-5 px-3 py-2.5 bg-white/5 rounded-xl border border-white/10">
                  <User size={13} className="text-blue-400 flex-shrink-0" />
                  <span className="text-xs font-bold text-slate-300">{foundMember?.name}</span>
                  <span className="text-[9px] font-black text-slate-500 ml-auto">{foundMember?.member_id}</span>
                </div>

                {loansLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <RefreshCw size={28} className="animate-spin text-blue-400 mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Loading active loans…</p>
                  </div>
                ) : activeLoans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BookOpen size={32} className="text-slate-700 mb-3" />
                    <p className="text-sm font-black text-slate-400">No active loans</p>
                    <p className="text-[10px] text-slate-600 font-medium mt-1">This member has no books currently borrowed.</p>
                    <button
                      onClick={() => { setSessionMode(null); setStep('face'); }}
                      className="mt-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <ArrowLeft size={11} /> Go Back
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-3">
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
                            className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all duration-200 text-left ${
                              selected
                                ? 'bg-emerald-500/15 border-emerald-500/60'
                                : 'bg-white/5 border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 shadow bg-slate-800">
                              <BookCover src={loan.cover_url} alt={loan.book_title} iconSize={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-black text-white text-xs leading-tight truncate">{loan.book_title}</p>
                              <p className="text-slate-400 text-[10px] font-medium truncate">{loan.book_author}</p>
                              {(loan.copy_number || loan.copy_qr) && (
                                <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest mt-0.5 truncate">
                                  {loan.copy_number ? `Copy ${loan.copy_number}` : 'Copy QR'} {loan.copy_qr ? `- ${loan.copy_qr}` : ''}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
                                  isOverdue
                                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                                    : loan.days_left <= 3
                                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                                    : 'bg-slate-700 border-slate-600 text-slate-400'
                                }`}>
                                  {isOverdue ? `Overdue ${Math.abs(loan.days_left)}d` : `${loan.days_left}d left`}
                                </span>
                                {isOverdue && loan.fine_amount > 0 && (
                                  <span className="text-[8px] font-black text-rose-400">₱{Number(loan.fine_amount).toFixed(2)} fine</span>
                                )}
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                              selected ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'
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
                        className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-slate-400 hover:text-white"
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
                        className="group flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black uppercase text-xs tracking-widest transition-all text-white shadow-lg active:scale-95"
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
              <div className="p-4 sm:p-8 animate-fade-in-up">
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Left — book list */}
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4">
                      Books in Session ({bookCart.length})
                    </p>

                    {/* Member */}
                    <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl mb-3">
                      <div className="w-9 h-9 bg-blue-600/20 rounded-xl flex items-center justify-center flex-shrink-0">
                        <User size={16} className="text-blue-400" />
                      </div>
                      <div>
                        <p className="font-black text-white text-sm">{foundMember?.name}</p>
                        <p className="text-blue-400 text-[9px] font-black uppercase tracking-widest">{foundMember?.member_id}</p>
                      </div>
                      <CheckCircle size={15} className="text-emerald-400 ml-auto flex-shrink-0" />
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
                                <span className={`text-[8px] font-black uppercase tracking-widest ${
                                  reservation.status === 'ready' ? 'text-emerald-400' : 'text-amber-400'
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
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4">Select Action</p>
                          <div className="grid grid-cols-2 gap-3 mb-6">
                            <button onClick={() => setAction('borrow')}
                              className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 ${
                                action === 'borrow'
                                  ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-lg shadow-blue-900/30'
                                  : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/30 hover:text-slate-300'
                              }`}
                            >
                              <ArrowUpRight size={24} className={action === 'borrow' ? 'text-blue-400' : ''} />
                              <div>
                                <p className="font-black uppercase text-[10px] tracking-widest">Borrow</p>
                                <p className="text-[9px] font-medium opacity-70 mt-0.5">Check out books</p>
                              </div>
                            </button>
                            <button onClick={() => setAction('return')}
                              className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 ${
                                action === 'return'
                                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-900/30'
                                  : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/30 hover:text-slate-300'
                              }`}
                            >
                              <ArrowDownLeft size={24} className={action === 'return' ? 'text-emerald-400' : ''} />
                              <div>
                                <p className="font-black uppercase text-[10px] tracking-widest">Return</p>
                                <p className="text-[9px] font-medium opacity-70 mt-0.5">Check in books</p>
                              </div>
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className={`flex items-center gap-3 p-4 rounded-2xl border-2 mb-6 ${
                          sessionMode === 'borrow'
                            ? 'bg-blue-600/20 border-blue-500/50'
                            : 'bg-emerald-600/20 border-emerald-500/50'
                        }`}>
                          {sessionMode === 'borrow'
                            ? <ArrowUpRight size={20} className="text-blue-400 flex-shrink-0" />
                            : <ArrowDownLeft size={20} className="text-emerald-400 flex-shrink-0" />
                          }
                          <div>
                            <p className={`font-black uppercase text-[10px] tracking-widest ${sessionMode === 'borrow' ? 'text-blue-300' : 'text-emerald-300'}`}>
                              {sessionMode === 'borrow' ? 'Borrow Session' : 'Return Session'}
                            </p>
                            <p className="text-[9px] text-slate-500 font-medium mt-0.5">
                              {sessionMode === 'borrow' ? 'Checking out books' : 'Returning selected books'}
                            </p>
                          </div>
                        </div>
                      )}

                      {action === 'borrow' && (
                        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl mb-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Loan Period</p>
                          <p className="text-sm font-bold text-white">
                            14 days — due <span className="text-blue-300">{dueDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </p>
                          <p className="text-[9px] text-slate-500 font-medium mt-0.5">₱5/day fine after due date · applies to all {bookCart.length} book{bookCart.length !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                      {action === 'return' && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Return Note</p>
                          <p className="text-sm font-bold text-white">Fines calculated automatically for each book.</p>
                          <p className="text-[9px] text-slate-500 font-medium mt-0.5">All {bookCart.length} book{bookCart.length !== 1 ? 's' : ''} will be marked available immediately.</p>
                        </div>
                      )}

                      {confirmError && (
                        <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl mb-3">
                          <AlertCircle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-rose-300 font-medium">{confirmError}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(sessionMode === 'return' ? 'return-select' : 'books')}
                        className="flex items-center gap-2 px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all text-slate-400 hover:text-white"
                      >
                        <ArrowLeft size={13} /> Back
                      </button>
                      <button
                        onClick={handleConfirmAll}
                        disabled={processing}
                        className={`group flex-1 flex items-center justify-center gap-3 py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all text-white shadow-lg active:scale-95 disabled:opacity-60 ${
                          action === 'borrow'
                            ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'
                            : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40'
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

                <div className="mt-6 pt-5 border-t border-white/5 flex justify-center">
                  <button onClick={resetToFace}
                    className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-400 transition-colors">
                    <RotateCcw size={11} /> Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function LibBorrowReturn() {
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState('all');
  const [showScanner, setShowScanner]   = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]           = useState(true);

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    getTransactions({ limit: 100 })
      .then((res) => setTransactions(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchTransactions, 0);
    return () => clearTimeout(id);
  }, [fetchTransactions]);

  const filtered = transactions.filter((t) => {
    const matchSearch =
      (t.member_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.book_title  || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ||
      t.type   === filter ||
      t.status === filter;
    return matchSearch && matchFilter;
  });

  const handleCommit = () => fetchTransactions();

  const handleQuickReturn = (tx) => {
    if (!window.confirm(`Return "${tx.book_title}" for ${tx.member_name}?`)) return;
    returnBook(tx.user_id, tx.book_id, tx.copy_id)
      .then(() => fetchTransactions())
      .catch((err) => alert(err.response?.data?.detail || 'Return failed.'));
  };

  const totalBorrowed = transactions.filter((t) => t.type === 'borrow').length;
  const totalReturned = transactions.filter((t) => t.type === 'return').length;
  const totalOverdue  = transactions.filter((t) => t.status === 'overdue').length;

  return (
    <div className="min-h-screen bg-transparent pb-20 font-sans text-slate-900 dark:text-white transition-colors duration-300">

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
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-600 dark:text-blue-400 mb-1">
              Librarian Terminal
            </p>
            <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none">
              Borrow / <span className="text-blue-600">Return</span>
            </h1>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="group flex items-center gap-3 px-7 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-200 shadow-xl shadow-blue-200 dark:shadow-blue-900/60 active:scale-95 hover:-translate-y-0.5 flex-shrink-0"
          >
            <Zap size={16} className="group-hover:scale-125 group-hover:rotate-12 transition-transform duration-200" />
            Quick Scan Session
          </button>
        </div>

        {/* ── HOW IT WORKS STRIP ── */}
        <div className="animate-fade-in-up delay-75 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-[2rem] px-6 py-4 mb-7 flex flex-col sm:flex-row items-center gap-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400 flex-shrink-0">Quick Scan Flow</p>
          <div className="flex items-center gap-3 flex-1 flex-wrap justify-center sm:justify-start">
            {[
              { icon: <ScanFace size={14} />,    label: 'Face or ID' },
              { icon: <Package size={14} />,     label: 'Add Books (1+)' },
              { icon: <CheckCircle2 size={14} />, label: 'Confirm All' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-blue-100 dark:border-slate-700 text-blue-600 dark:text-blue-400">
                  {s.icon}
                  <span className="text-[9px] font-black uppercase tracking-widest">{s.label}</span>
                </div>
                {i < 2 && <ChevronRight size={12} className="text-blue-300 dark:text-blue-700 flex-shrink-0" />}
              </div>
            ))}
          </div>
          <button onClick={() => setShowScanner(true)}
            className="text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 flex-shrink-0">
            Start →
          </button>
        </div>

        {/* ── SUMMARY TILES ── */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-7 animate-fade-in-up delay-100">
          {[
            { label: 'Total Borrowed', val: totalBorrowed, icon: <ArrowUpRight size={16} />, color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800' },
            { label: 'Returned',       val: totalReturned, icon: <ArrowDownLeft size={16} />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' },
            { label: 'Overdue',        val: totalOverdue,  icon: <BookOpen size={16} />,       color: 'text-rose-600 dark:text-rose-400',      bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border rounded-[1.5rem] sm:rounded-[2rem] p-3 sm:p-5 flex flex-col sm:flex-row items-center sm:gap-4 gap-1 hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default`}>
              <div className={`${s.color} flex-shrink-0`}>{s.icon}</div>
              <div className="text-center sm:text-left min-w-0">
                <p className="text-xl sm:text-2xl font-black tracking-tighter text-slate-900 dark:text-white">{s.val}</p>
                <p className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest leading-tight ${s.color}`}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── TRANSACTION TABLE ── */}
        <div className="animate-fade-in-up delay-200 bg-white/80 dark:bg-slate-900 backdrop-blur-sm border border-blue-100 dark:border-slate-800 rounded-[2rem] overflow-hidden shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 px-6 py-5 border-b border-blue-50 dark:border-slate-800">
            <h3 className="font-black italic uppercase tracking-tighter text-lg text-slate-900 dark:text-white">Transaction Log</h3>
            <div className="flex flex-wrap gap-2 md:ml-4">
              {['all', 'borrow', 'return', 'overdue'].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 ${
                    filter === f
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 md:ml-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input type="text" placeholder="Search member or book..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-8 pr-4 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 w-40 sm:w-56 text-slate-700 dark:text-slate-200 placeholder:text-slate-400" />
              </div>
              <button onClick={fetchTransactions} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[640px]">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest border-b border-blue-50 dark:border-slate-800">
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
                    <tr key={t.id} className="group border-b border-blue-50 dark:border-slate-800 hover:bg-blue-50/60 dark:hover:bg-slate-800/60 transition-all duration-200">
                      <td className="px-6 py-4">
                        <p className="font-bold text-xs text-slate-900 dark:text-white">{t.member_name || '—'}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.member_id || ''}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[160px] truncate">
                        {t.book_title || '—'}
                      </td>
                      <td className="px-6 py-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {t.borrow_date ? toUtcDate(t.borrow_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        {t.due_date ? toUtcDate(t.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest inline-block ${TYPE_STYLE[t.type] || 'bg-slate-100 text-slate-500'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest inline-block ${STATUS_STYLE[t.status] || 'bg-slate-100 text-slate-500'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {t.status === 'active' && (
                          <button
                            onClick={() => handleQuickReturn(t)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all duration-200 active:scale-95"
                          >
                            <CheckCircle2 size={11} /> Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-xs font-black uppercase tracking-widest">
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
