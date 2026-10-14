import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  Shield, XCircle, UserX,
  ArrowLeft, Clock, LogIn, LogOut, Wifi, WifiOff, RefreshCw,
  LockKeyhole,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStoredAuth, homeForRole } from '../../api/authRoutes';
import { parseApiDateTime } from '../../api/dateTime';
import { faceBoxToStyle, summarizeFaceResults } from '../../api/entryFaceOverlay';
import { isQuietWalkThroughMessage, shouldLoadEntryStationLogsOnMount } from '../../api/entryStationState';
import {
  clearStoredEntryStationPin,
  entryStationFaceAuth,
  getEntryStationLogs,
  getStoredEntryStationPin,
  storeEntryStationPin,
} from '../../api/entryStation';

// ── Tunables ──────────────────────────────────────────────────────────────────
const POLL_INTERVAL    = 1000;   // ms between poll attempts (actual rate limited by request time)
const RESULT_HOLD_TIME = 2500;   // ms to show the result overlay
const UNKNOWN_COOLDOWN = 10000;  // ms before "Not Recognized" fires again
const UNKNOWN_CONFIRM_FRAMES = 2; // consecutive unknown frames required before showing overlay
const LOG_REFRESH_MS   = 10000;  // ms between attendance log refreshes

const EntryGate = () => {
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }
    const { isLoggedIn, role } = getStoredAuth();
    navigate(isLoggedIn ? homeForRole(role) : '/', { replace: true });
  };
  const webcamRef    = useRef(null);
  const pollRef      = useRef(null);       // setInterval handle
  const isPendingRef = useRef(false);      // true while a face-scan request is in flight
  const cooldownRef  = useRef({});         // { userId | 'unknown': lastShownTimestamp }
  const unknownStreakRef = useRef(0);      // consecutive not_recognized responses
  const nextAllowedRef = useRef(0);        // rate-limit backoff timestamp
  const nextLogAllowedRef = useRef(0);     // backoff timestamp for log refresh
  const resultTimeoutRef = useRef(null);
  const faceResultTimeoutRef = useRef(null);
  const initialStationPinRef = useRef(getStoredEntryStationPin());

  const [scanResult,    setScanResult]    = useState(null);
  const [faceResults,   setFaceResults]   = useState([]);
  const [recentEntries, setRecentEntries] = useState([]);
  const [loadingLogs,   setLoadingLogs]   = useState(() => shouldLoadEntryStationLogsOnMount(initialStationPinRef.current));
  const [isOnline,      setIsOnline]      = useState(true);
  const [scanError,     setScanError]     = useState(false);
  const [now,           setNow]           = useState(new Date());
  const [stationPin,    setStationPin]    = useState(() => initialStationPinRef.current);
  const [pinInput,      setPinInput]      = useState('');
  const [pinError,      setPinError]      = useState('');
  const [unlocked,      setUnlocked]      = useState(() => shouldLoadEntryStationLogsOnMount(initialStationPinRef.current));

  // ── Live clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => {
    clearTimeout(resultTimeoutRef.current);
    clearTimeout(faceResultTimeoutRef.current);
  }, []);

  // ── Load today's entry logs from the public kiosk endpoint ─────────────────
  // Uses /api/kiosk/entry-logs — no JWT required, no 401 redirect risk.
  const refreshLogs = useCallback(async () => {
    if (!unlocked || !stationPin) {
      setLoadingLogs(false);
      return;
    }
    if (Date.now() < nextLogAllowedRef.current) return;
    try {
      const res = await getEntryStationLogs(stationPin, 30);
      setRecentEntries(res.data);
      setIsOnline(true);
    } catch (err) {
      setIsOnline(false);
      if (err.response?.status === 403) {
        clearStoredEntryStationPin();
        setStationPin('');
        setUnlocked(false);
        setPinError('Enter the station PIN again.');
      }
      nextLogAllowedRef.current = Date.now() + 5000;
    } finally {
      setLoadingLogs(false);
    }
  }, [stationPin, unlocked]);

  // Auto-refresh log on interval
  useEffect(() => {
    refreshLogs();
    const t = setInterval(refreshLogs, LOG_REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshLogs]);

  // ── Show result overlay briefly, then clear ────────────────────────────────
  const showResult = useCallback((result) => {
    clearTimeout(resultTimeoutRef.current);
    setScanResult(result);
    // Immediately refresh log so new time-in row appears
    if (result.type === 'recognized' || result.type === 'not_recognized') refreshLogs();
    resultTimeoutRef.current = setTimeout(() => setScanResult(null), RESULT_HOLD_TIME);
  }, [refreshLogs]);

  const showFaceResults = useCallback((results) => {
    clearTimeout(faceResultTimeoutRef.current);
    setFaceResults(results);
    faceResultTimeoutRef.current = setTimeout(() => setFaceResults([]), RESULT_HOLD_TIME);
  }, []);

  // ── Capture one frame and call the face-recognition API ───────────────────
  // isPendingRef prevents concurrent in-flight requests — dlib takes 1-3s
  // so without this guard the 1-second poll would stack up dozens of requests.
  const captureAndSend = useCallback(async () => {
    if (!unlocked || !stationPin) return;
    if (isPendingRef.current) return;  // skip — previous request still running
    if (Date.now() < nextAllowedRef.current) return;  // temporary backoff on 429s

    const frame = webcamRef.current?.getScreenshot();
    if (!frame) return;

    isPendingRef.current = true;
    try {
      const { data } = await entryStationFaceAuth(frame, stationPin);
      setScanError(false);

      if (isQuietWalkThroughMessage(data.message)) {
        unknownStreakRef.current = 0;
        setFaceResults([]);
        return;   // no face in frame — keep polling silently
      }

      if (data.message === 'too_dark') {
        unknownStreakRef.current = 0;
        setFaceResults([]);
        const lastSeen = cooldownRef.current['too_dark'] ?? 0;
        if (Date.now() - lastSeen < UNKNOWN_COOLDOWN) return;
        cooldownRef.current['too_dark'] = Date.now();
        showResult({ type: 'too_dark', data: {} });
        return;
      }

      const ts = Date.now();
      const faces = summarizeFaceResults(data);

      if (faces.length > 0) {
        unknownStreakRef.current = 0;
        setScanResult(null);
        showFaceResults(faces);

        const shouldRefreshLogs = faces.some((face) => (
          !face.matched ||
          ['time_in', 'time_out', 'time_out_updated'].includes(face.session_action)
        ));
        if (shouldRefreshLogs) refreshLogs();
        return;
      }

      if (data.matched) {
        unknownStreakRef.current = 0;
        refreshLogs();
      } else {
        // not_recognized
        unknownStreakRef.current += 1;
        if (unknownStreakRef.current < UNKNOWN_CONFIRM_FRAMES) return;
        const lastSeen = cooldownRef.current['unknown'] ?? 0;
        if (ts - lastSeen < UNKNOWN_COOLDOWN) return;

        cooldownRef.current['unknown'] = ts;
        unknownStreakRef.current = 0;
        showResult({ type: 'not_recognized', data: {} });
      }
    } catch (err) {
      if (err.response?.status === 429) {
        nextAllowedRef.current = Date.now() + 3000;
        return;
      }
      if (err.response?.status === 403) {
        clearStoredEntryStationPin();
        setStationPin('');
        setUnlocked(false);
        setPinError('Enter the station PIN again.');
        return;
      }
      setScanError(true);
      const detail = err.response?.data?.detail ?? err.message ?? 'Connection error';
      showResult({
        type: 'error',
        data: {
          message: detail.includes('face_recognition')
            ? 'Face recognition library not installed on the server.'
            : detail,
        },
      });
    } finally {
      isPendingRef.current = false;   // always release lock
    }
  }, [refreshLogs, showFaceResults, showResult, stationPin, unlocked]);

  // ── Auto-start scanning on mount ───────────────────────────────────────────
  useEffect(() => {
    cooldownRef.current = {};
    captureAndSend();
    pollRef.current = setInterval(captureAndSend, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [captureAndSend]);

  // ── Restart scanner (after error) ─────────────────────────────────────────
  const restartScanner = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    isPendingRef.current = false;
    cooldownRef.current  = {};
    setScanResult(null);
    setFaceResults([]);
    setScanError(false);
    nextAllowedRef.current = 0;
    captureAndSend();
    pollRef.current = setInterval(captureAndSend, POLL_INTERVAL);
  }, [captureAndSend]);

  const handleUnlock = async (e) => {
    e.preventDefault();
    const pin = pinInput.trim();
    if (!pin) {
      setPinError('Enter the station PIN.');
      return;
    }

    setPinError('');
    setLoadingLogs(true);
    try {
      const res = await getEntryStationLogs(pin, 30);
      storeEntryStationPin(pin);
      setStationPin(pin);
      setRecentEntries(res.data);
      setUnlocked(true);
      setIsOnline(true);
      setPinInput('');
    } catch (err) {
      clearStoredEntryStationPin();
      setStationPin('');
      setUnlocked(false);
      setPinError(err.response?.data?.detail || 'Invalid entry station PIN.');
      setIsOnline(false);
    } finally {
      setLoadingLogs(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const toLocalDate = (str) => parseApiDateTime(str);
  const fmtTime = (iso) =>
    toLocalDate(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const isInside = (log) => Boolean(log.is_inside);

  const fmtDate = (d) =>
    d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#05080f] text-white flex items-center justify-center p-6 font-sans">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        </div>

        <form
          onSubmit={handleUnlock}
          className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to previous page"
            className="mb-8 inline-flex items-center gap-3 text-slate-500 transition-colors hover:text-white"
          >
            <ArrowLeft size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Librarian Portal</span>
          </button>

          <div className="mb-7 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/10 text-blue-300">
              <LockKeyhole size={26} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-300">
                Entrance Station
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                PIN Required
              </p>
            </div>
          </div>

          <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none">
            Unlock Scanner
          </h1>
          <p className="mt-4 text-sm font-medium leading-6 text-slate-400">
            Enter the station PIN before opening the camera and attendance logs on this entrance PC.
            {' '}A librarian can set or change this PIN in Settings.
          </p>

          <div className="mt-7">
            <label htmlFor="station-pin" className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Station PIN
            </label>
            <input
              id="station-pin"
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-center text-lg font-black tracking-[0.4em] text-white outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
              autoFocus
            />
          </div>

          {pinError && (
            <p className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-300">
              {pinError}
            </p>
          )}

          <button
            type="submit"
            disabled={loadingLogs}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-blue-500 disabled:opacity-60 active:scale-[0.98]"
          >
            {loadingLogs ? <RefreshCw size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
            {loadingLogs ? 'Checking' : 'Unlock Station'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:h-screen bg-[#05080f] text-white flex flex-col overflow-x-hidden lg:overflow-hidden font-sans select-none">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8 py-3 border-b border-white/[0.06] bg-black/50 backdrop-blur-xl shrink-0 z-10">

        {/* Left: back + branding */}
        <div className="flex items-center gap-4">
          <button type="button" onClick={goBack} aria-label="Back to previous page" className="text-slate-600 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <img src="/logo.library.png" alt="Logo" className="w-8 h-8 object-contain opacity-50" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600 leading-none mb-0.5">
              Rizal Provincial Library · Taytay Branch
            </p>
            <h1 className="text-[13px] font-black uppercase tracking-widest text-white flex items-center gap-2 leading-none">
              <Shield size={12} className="text-blue-500" />
              Entrance Station
            </h1>
          </div>
        </div>

        {/* Center: live clock */}
        <div className="text-left lg:text-center">
          <p className="text-2xl sm:text-4xl whitespace-nowrap font-black tabular-nums tracking-tight text-white leading-none">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mt-1">
            {fmtDate(now)}
          </p>
        </div>

        {/* Right: connection status */}
        <div className="flex items-center gap-4">
          {isOnline ? (
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-500">
              <Wifi size={11} /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-500">
              <WifiOff size={11} /> Offline
            </span>
          )}
          {scanError && (
            <button
              onClick={restartScanner}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-500 hover:text-yellow-300 transition-colors"
            >
              <RefreshCw size={11} /> Restart
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">

        {/* ── LEFT: Camera ───────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-5">

          {/* Camera viewport */}
          <div className="relative w-full max-w-[580px] min-h-[300px] aspect-[4/3] bg-slate-950/60 border border-white/[0.08] rounded-[2.5rem] overflow-hidden shadow-[0_0_80px_rgba(59,130,246,0.08)]">

            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.8}
              videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
              className="absolute inset-0 w-full h-full object-cover opacity-80"
            />

            {/* Corner brackets */}
            <div className="absolute top-5 left-5  w-8 h-8 border-t-2 border-l-2 border-blue-500 rounded-tl-2xl pointer-events-none z-10" />
            <div className="absolute top-5 right-5 w-8 h-8 border-t-2 border-r-2 border-blue-500 rounded-tr-2xl pointer-events-none z-10" />
            <div className="absolute bottom-5 left-5  w-8 h-8 border-b-2 border-l-2 border-blue-500 rounded-bl-2xl pointer-events-none z-10" />
            <div className="absolute bottom-5 right-5 w-8 h-8 border-b-2 border-r-2 border-blue-500 rounded-br-2xl pointer-events-none z-10" />

            {/* Scan line — always sweeping */}
            <div className="animate-scan-line bg-gradient-to-r from-transparent via-blue-500/70 to-transparent shadow-[0_0_12px_rgba(59,130,246,0.8)] pointer-events-none z-20" />

            {/* Status pill — only when no overlay */}
            {!scanResult && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10">
                <span className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-600/70 backdrop-blur-sm border border-blue-500/30">
                  Auto-Scanning · Face the Camera
                </span>
              </div>
            )}

            {/* ── Result overlays ─────────────────────────────────────────── */}

            {faceResults.map((face) => {
              const labelBelow = Number(face.face_box?.top ?? 0) < 0.12;
              return (
                <div
                  key={face.key}
                  className={`absolute z-30 pointer-events-none border-2 ${
                    face.matched ? 'border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.45)]' : 'border-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.35)]'
                  }`}
                  style={faceBoxToStyle(face.face_box)}
                >
                  <div
                    className={`absolute left-0 max-w-[190px] rounded-md px-2 py-1 shadow-xl backdrop-blur-md ${
                      labelBelow ? 'top-full mt-1' : 'bottom-full mb-1'
                    } ${face.matched ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'}`}
                  >
                    <p className="truncate text-[10px] font-black uppercase leading-tight tracking-widest">
                      {face.label}
                    </p>
                    {face.subLabel && (
                      <p className="truncate text-[8px] font-black uppercase leading-tight opacity-80">
                        {face.subLabel}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {scanResult?.type === 'not_recognized' && (
              <div className="absolute inset-0 z-30 bg-rose-700/92 backdrop-blur-md flex flex-col items-center justify-center gap-2">
                <XCircle size={60} className="mb-1" />
                <h2 className="text-4xl font-black uppercase italic tracking-tighter">Not Recognized</h2>
                <p className="mt-1 font-black tracking-[0.3em] uppercase text-[10px] text-rose-200">
                  Face not found in the system · Please see the librarian
                </p>
              </div>
            )}

            {scanResult?.type === 'too_dark' && (
              <div className="absolute inset-0 z-30 bg-amber-700/92 backdrop-blur-md flex flex-col items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                <h2 className="text-3xl font-black uppercase italic tracking-tighter">Too Dark</h2>
                <p className="font-black tracking-[0.3em] uppercase text-[10px] text-amber-200">
                  Please move to a brighter area
                </p>
              </div>
            )}

            {scanResult?.type === 'error' && (
              <div className="absolute inset-0 z-30 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center gap-3 p-8 text-center">
                <UserX size={52} className="text-yellow-400 mb-1" />
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-yellow-400">Scanner Error</h2>
                <p className="text-slate-400 text-[11px] font-black tracking-widest uppercase">
                  {scanResult.data.message}
                </p>
                <button
                  onClick={restartScanner}
                  className="mt-3 px-6 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-xl text-yellow-400 text-[11px] font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            )}
          </div>

          {/* Scanner status line */}
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
              Biometric Scanner Active · Auto-Recording Attendance
            </span>
          </div>
        </div>

        {/* ── RIGHT: Attendance log ───────────────────────────────────────────── */}
        <div className="w-full lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.06] flex flex-col bg-black/20">

          {/* Panel header */}
          <div className="px-6 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                <Clock size={11} /> Attendance Log
              </h2>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">
                {recentEntries.length} record{recentEntries.length !== 1 ? 's' : ''} today
              </span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_80px_80px] px-5 py-2 border-b border-white/[0.04] shrink-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Member</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-1">
              <LogIn size={8} /> In
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700 flex items-center gap-1">
              <LogOut size={8} /> Out
            </span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {loadingLogs ? (
              <div className="flex items-center justify-center h-32 text-[10px] font-black uppercase tracking-widest text-slate-700">
                Loading…
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-slate-700">
                <Clock size={20} className="opacity-30" />
                <p className="text-[10px] font-black uppercase tracking-widest">No entries yet today</p>
              </div>
            ) : (
              recentEntries.map((log) => (
                <div
                  key={log.id}
                  className={`grid grid-cols-[1fr_80px_80px] items-center px-5 py-2.5 border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors ${
                    !log.granted ? 'opacity-40' : ''
                  }`}
                >
                  {/* Member */}
                  <div className="min-w-0 pr-2">
                    <p className={`text-[11px] font-black truncate leading-tight ${
                      log.granted ? 'text-white' : 'text-rose-400'
                    }`}>
                      {log.member_name ?? 'Unknown'}
                    </p>
                    <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest leading-tight mt-0.5">
                      {log.member_id ?? (log.granted ? '—' : 'Unregistered')}
                    </p>
                  </div>

                  {/* Time In */}
                  <span className="text-[11px] font-black tabular-nums text-blue-400 leading-tight">
                    {fmtTime(log.accessed_at)}
                  </span>

                  {/* Time Out */}
                  {!isInside(log) && log.time_out ? (
                    <span className="text-[11px] font-black tabular-nums text-orange-400 leading-tight">
                      {fmtTime(log.time_out)}
                    </span>
                  ) : isInside(log) ? (
                    <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest italic leading-tight">
                      Inside
                    </span>
                  ) : (
                    <span className="text-[9px] font-black text-slate-800 uppercase tracking-widest leading-tight">
                      --
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/[0.04] shrink-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-800">
              Auto-refreshes every {LOG_REFRESH_MS / 1000}s · Time In = first scan · Time Out = last scan
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EntryGate;
