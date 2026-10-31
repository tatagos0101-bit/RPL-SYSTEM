import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  Shield, XCircle, UserX,
  ArrowLeft, Clock, LogIn, LogOut, Wifi, WifiOff, RefreshCw,
  LockKeyhole,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getStoredAuth, homeForRole } from '../../api/authRoutes';
import { attendanceElapsed, attendanceTimestamp, updatePresence } from '../../api/entryAttendance';
import { faceBoxToStyle, summarizeFaceResults } from '../../api/entryFaceOverlay';
import {
  ENTRY_SCAN_INTERVAL_MS, ENTRY_LOG_MIN_INTERVAL_MS, entryStationRetryDelay,
  isQuietWalkThroughMessage, shouldLoadEntryStationLogsOnMount,
} from '../../api/entryStationState';
import { errorMessage } from '../../api/inventoryWrites';
import {
  clearStoredEntryStationPin,
  entryStationFaceAuth,
  getEntryStationLogs,
  getStoredEntryStationPin,
  storeEntryStationPin,
} from '../../api/entryStation';

// ── Tunables ──────────────────────────────────────────────────────────────────
const POLL_INTERVAL    = ENTRY_SCAN_INTERVAL_MS;
const POLL_TICK_MS     = 250;    // check deadlines without encoding frames before the scan interval
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
  const presenceRef = useRef({});
  const webcamRef    = useRef(null);
  const pollRef      = useRef(null);       // setInterval handle
  const isPendingRef = useRef(false);      // true while a face-scan request is in flight
  const cooldownRef  = useRef({});         // { userId | 'unknown': lastShownTimestamp }
  const unknownStreakRef = useRef(0);      // consecutive not_recognized responses
  const nextAllowedRef = useRef(0);        // rate-limit backoff timestamp
  const nextLogAllowedRef = useRef(0);     // backoff timestamp for log refresh
  const logPendingRef = useRef(false);
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
    if (logPendingRef.current || Date.now() < nextLogAllowedRef.current) return;
    logPendingRef.current = true;
    nextLogAllowedRef.current = Date.now() + ENTRY_LOG_MIN_INTERVAL_MS;
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
      nextLogAllowedRef.current = Date.now() + entryStationRetryDelay(err);
    } finally {
      logPendingRef.current = false;
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
    // Refresh within the shared-address budget; the periodic refresh catches deferred updates.
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
  // so polling must not stack up requests, including after a manual restart.
  const captureAndSend = useCallback(async () => {
    if (!unlocked || !stationPin) return;
    if (isPendingRef.current) return;  // skip — previous request still running
    const startedAt = Date.now();
    if (startedAt < nextAllowedRef.current) return;

    const frame = webcamRef.current?.getScreenshot();
    if (!frame) return;

    isPendingRef.current = true;
    nextAllowedRef.current = startedAt + POLL_INTERVAL;
    try {
      const { data } = await entryStationFaceAuth(frame, stationPin, Object.keys(presenceRef.current).map(Number));
      setScanError(false);

      if (data.message === 'no_face') presenceRef.current = updatePresence(presenceRef.current, []);

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
      if (faces.length) presenceRef.current = updatePresence(presenceRef.current, faces);

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
      nextAllowedRef.current = Date.now() + entryStationRetryDelay(err);
      if (err.response?.status === 403) {
        clearStoredEntryStationPin();
        setStationPin('');
        setUnlocked(false);
        setPinError('Enter the station PIN again.');
        return;
      }
      setScanError(true);
      const detail = err.response?.status === 429
        ? 'Too many scan requests. Scanning will resume automatically.'
        : errorMessage(err, 'Connection error. Scanning will retry automatically.');
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
    pollRef.current = setInterval(captureAndSend, POLL_TICK_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [captureAndSend]);

  // ── Restart scanner (after error) ─────────────────────────────────────────
  const restartScanner = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    cooldownRef.current  = {};
    setScanResult(null);
    setFaceResults([]);
    setScanError(false);
    captureAndSend();
    pollRef.current = setInterval(captureAndSend, POLL_TICK_MS);
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
      nextLogAllowedRef.current = Date.now() + ENTRY_LOG_MIN_INTERVAL_MS;
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
      setPinError(errorMessage(err, 'Unable to unlock the station. Please retry.'));
      setIsOnline(false);
    } finally {
      setLoadingLogs(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isInside = (log) => Boolean(log.is_inside);

  const fmtDate = (d) =>
    d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="rpl-page rpl-station relative min-h-dvh bg-canvas text-ink flex flex-col p-4 sm:p-6 font-sans">
        <header className="rpl-chrome rpl-station-brand"><p className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p></header>
        <form
          onSubmit={handleUnlock}
          className="relative w-full max-w-md my-auto self-center rounded-xl border border-line bg-panel p-6 sm:p-8 shadow-sm"
        >
          <button
            type="button"
            onClick={goBack}
            aria-label="Back to previous page"
            className="mb-8 inline-flex items-center gap-3 text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={16} />
            <span className="text-sm font-semibold tracking-normal">Librarian Portal</span>
          </button>

          <div className="mb-7 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-info-soft text-link">
              <LockKeyhole size={26} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-normal text-link">
                Entrance Station
              </p>
              <p className="mt-1 text-sm font-bold tracking-normal text-muted">
                PIN Required
              </p>
            </div>
          </div>

          <h1 className="font-semibold tracking-normal leading-none rpl-title">
            Unlock Scanner
          </h1>
          <p className="mt-4 text-sm font-medium leading-6 text-muted">
            Enter the station PIN before opening the camera and attendance logs on this entrance PC.
            {' '}A librarian can set or change this PIN in Settings.
          </p>

          <div className="mt-7">
            <label htmlFor="station-pin" className="mb-2 block text-sm font-semibold tracking-normal text-muted">
              Station PIN
            </label>
            <input
              id="station-pin"
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel px-4 py-4 text-center text-base font-semibold tracking-normal text-ink outline-none transition-all focus:border-line focus:ring-2 focus:ring-line"
              autoFocus
            />
          </div>

          {pinError && (
            <p className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm font-bold text-danger">
              {pinError}
            </p>
          )}

          <button
            type="submit"
            disabled={loadingLogs}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-action px-5 py-4 text-sm font-semibold tracking-normal text-white transition-all hover:bg-blue-500 disabled:opacity-60"
          >
            {loadingLogs ? <RefreshCw size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
            {loadingLogs ? 'Checking' : 'Unlock Station'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="rpl-page rpl-station min-h-dvh lg:h-dvh bg-canvas text-ink flex flex-col lg:overflow-hidden font-sans select-none">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="rpl-chrome flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8 py-4 shrink-0">

        {/* Left: back + branding */}
        <div className="flex items-center gap-4">
          <button type="button" onClick={goBack} aria-label="Back to previous page" className="text-muted hover:text-ink transition-colors">
            <ArrowLeft size={16} />
          </button>
          <p className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></p>
        </div>

        {/* Center: live clock */}
        <div className="text-left lg:text-center">
          <p className="text-2xl sm:text-4xl whitespace-nowrap font-semibold tabular-nums tracking-normal text-ink leading-none">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-sm font-semibold tracking-normal text-muted mt-1">
            {fmtDate(now)}
          </p>
        </div>

        {/* Right: connection status */}
        <div className="flex items-center gap-4">
          {isOnline ? (
            <span className="flex items-center gap-1.5 text-sm font-semibold tracking-normal text-success">
              <Wifi size={11} /> Live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-semibold tracking-normal text-danger">
              <WifiOff size={11} /> Offline
            </span>
          )}
          {scanError && (
            <button
              onClick={restartScanner}
              className="flex items-center gap-1.5 text-sm font-semibold tracking-normal text-warning hover:text-warning transition-colors"
            >
              <RefreshCw size={11} /> Restart
            </button>
          )}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">

        {/* ── LEFT: Camera ───────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-5 lg:overflow-y-auto">

          <h1 className="rpl-section-title self-start">Entrance Station</h1>

          {/* Camera viewport */}
          <div className="relative w-full max-w-[580px] aspect-[4/3] bg-black text-white border border-line rounded-xl overflow-hidden shadow-sm">

            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.8}
              videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Corner brackets */}
            <div className="absolute top-5 left-5 w-8 h-8 border-t-2 border-l-2 border-line rounded-tl-2xl pointer-events-none z-10" />
            <div className="absolute top-5 right-5 w-8 h-8 border-t-2 border-r-2 border-line rounded-tr-2xl pointer-events-none z-10" />
            <div className="absolute bottom-5 left-5 w-8 h-8 border-b-2 border-l-2 border-line rounded-bl-2xl pointer-events-none z-10" />
            <div className="absolute bottom-5 right-5 w-8 h-8 border-b-2 border-r-2 border-line rounded-br-2xl pointer-events-none z-10" />

            {/* Scan line — always sweeping */}
            <div className="animate-scan-line bg-gradient-to-r from-transparent via-blue-500/70 to-transparent shadow-sm pointer-events-none z-20" />

            {/* Status pill — only when no overlay */}
            {!scanResult && (
              <div className="absolute bottom-5 left-4 right-4 z-10 flex justify-center">
                <span className="block px-4 py-2 rounded-lg text-center text-sm font-semibold tracking-normal bg-panel text-ink border border-line">
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
                    face.matched ? 'border-success shadow-sm' : 'border-danger shadow-sm'
                  }`}
                  style={faceBoxToStyle(face.face_box)}
                >
                  <div
                    className={`absolute left-0 max-w-[190px] rounded-md px-2 py-1 shadow-sm ${
                      labelBelow ? 'top-full mt-1' : 'bottom-full mb-1'
                    } ${face.matched ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
                  >
                    <p className="truncate text-sm font-semibold leading-tight tracking-normal">
                      {face.label}
                    </p>
                    {face.subLabel && (
                      <p className="truncate text-sm font-semibold leading-tight opacity-80">
                        {face.subLabel}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {scanResult?.type === 'not_recognized' && (
              <div className="absolute inset-0 z-30 bg-danger-soft text-danger px-4 text-center flex flex-col items-center justify-center gap-2">
                <XCircle size={60} className="mb-1" />
                <h2 className="font-semibold tracking-normal rpl-section-title">Not Recognized</h2>
                <p className="mt-1 font-semibold tracking-normal text-sm text-danger">
                  Face not found in the system · Please see the librarian
                </p>
              </div>
            )}

            {scanResult?.type === 'too_dark' && (
              <div className="absolute inset-0 z-30 bg-warning-soft text-warning px-4 text-center flex flex-col items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                <h2 className="font-semibold tracking-normal rpl-section-title">Too Dark</h2>
                <p className="font-semibold tracking-normal text-sm text-warning">
                  Please move to a brighter area
                </p>
              </div>
            )}

            {scanResult?.type === 'error' && (
              <div className="absolute inset-0 z-30 bg-panel flex flex-col items-center justify-center gap-3 p-8 text-center">
                <UserX size={52} className="text-warning mb-1" />
                <h2 className="font-semibold tracking-normal text-warning rpl-section-title">Scanner Error</h2>
                <p className="text-muted text-sm font-semibold tracking-normal">
                  {scanResult.data.message}
                </p>
                <button
                  onClick={restartScanner}
                  className="mt-3 px-6 py-2 bg-warning-soft hover:bg-warning-soft border border-warning rounded-lg text-warning text-sm font-semibold tracking-normal transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            )}
          </div>

          {/* Scanner status line */}
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-sm font-semibold tracking-normal text-muted">
              Biometric Scanner Active · Auto-Recording Attendance
            </span>
          </div>
        </div>

        {/* ── RIGHT: Attendance log ───────────────────────────────────────────── */}
        <div className="w-full lg:w-[400px] shrink-0 border-t lg:border-t-0 lg:border-l border-line flex flex-col bg-panel">

          {/* Panel header */}
          <div className="px-6 py-4 border-b border-line shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold tracking-normal text-muted flex items-center gap-2 rpl-section-title">
                <Clock size={11} /> Attendance Log
              </h2>
              <span className="text-sm font-semibold tracking-normal text-muted">
                {recentEntries.length} record{recentEntries.length !== 1 ? 's' : ''} today
              </span>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] px-5 py-2 border-b border-line shrink-0">
            <span className="text-sm font-semibold tracking-normal text-muted">Member</span>
            <span className="text-sm font-semibold tracking-normal text-muted flex items-center gap-1">
              <LogIn size={8} /> In
            </span>
            <span className="text-sm font-semibold tracking-normal text-muted flex items-center gap-1">
              <LogOut size={8} /> Out
            </span>
          </div>

          {/* Rows */}
          <div className="min-h-0 max-h-[32rem] lg:max-h-none flex-1 overflow-y-auto">
            {loadingLogs ? (
              <div className="flex items-center justify-center h-32 text-sm font-semibold tracking-normal text-muted">
                Loading…
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted">
                <Clock size={20} className="opacity-30" />
                <p className="text-sm font-semibold tracking-normal">No entries yet today</p>
              </div>
            ) : (
              recentEntries.map((log) => (
                <div
                  key={log.id}
                  className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center px-5 py-2.5 border-b border-line hover:bg-panel transition-colors ${
                    !log.granted ? 'opacity-40' : ''
                  }`}
                >
                  {/* Member */}
                  <div className="min-w-0 pr-2">
                    <p className={`text-sm font-semibold truncate leading-tight ${
                      log.granted ? 'text-ink' : 'text-danger'
                    }`}>
                      {log.member_name ?? 'Unknown'}
                    </p>
                    <p className="text-sm font-semibold text-muted tracking-normal leading-tight mt-0.5">
                      {log.member_id ?? (log.granted ? '—' : 'Unregistered')}
                    </p>
                  </div>

                  {/* Time In */}
                  <span className="text-sm font-semibold tabular-nums text-link leading-tight">
                    {isInside(log) ? 'Inside' : attendanceTimestamp(log.accessed_at)}
                  </span>

                  {/* Time Out */}
                  {!isInside(log) && log.time_out ? (
                    <span className="text-sm font-semibold tabular-nums text-warning leading-tight">
                      {attendanceTimestamp(log.time_out)}
                    </span>
                  ) : isInside(log) ? (
                    <span className="text-sm font-semibold text-muted tracking-normal leading-tight">
                      {attendanceElapsed(log.accessed_at, now.getTime())}
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-ink tracking-normal leading-tight">
                      --
                    </span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-line shrink-0">
            <p className="text-sm font-semibold tracking-normal text-ink">
              Auto-refreshes every {LOG_REFRESH_MS / 1000}s · First appearance = In · Return appearance = Out · Philippine time
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EntryGate;
