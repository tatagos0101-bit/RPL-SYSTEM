import { useState, useRef, useEffect, useCallback } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Info, ScanFace, KeyRound, MapPin } from 'lucide-react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import { clearAuth, login, faceAuth, persistAuth } from '../../api/auth';
import { landingForRole, passwordChangePathForRole, safeNextPath } from '../../api/authRoutes';

const ROLE_LABEL = {
  member: 'Member',
  librarian: 'Librarian',
};

const wrongPortalMessage = (actualRole, expectedRole) => {
  if (expectedRole === 'member' && actualRole === 'librarian') {
    return 'This is not a member account. Please contact library staff if you need help.';
  }

  if (expectedRole === 'librarian' && actualRole === 'member') {
    return 'This account is not authorized for the librarian portal.';
  }

  return `This account is not authorized for the ${ROLE_LABEL[expectedRole] || 'selected'} portal.`;
};

const LoginPage = ({ expectedRole = 'member' }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('password'); // 'password' | 'face'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Face login state
  const webcamRef = useRef(null);
  const pollingRef = useRef(null);
  const isPendingRef = useRef(false);
  const nextAllowedRef = useRef(0);
  const [faceStatus, setFaceStatus] = useState('idle'); // idle | scanning | matched | failed
  const [faceMessage, setFaceMessage] = useState('');
  const portalLabel = ROLE_LABEL[expectedRole] || 'Member';
  const nextPath = searchParams.get('next');
  const isLibrarianPortal = expectedRole === 'librarian';
  const portalLandingPath = landingForRole(expectedRole);
  const portalLandingLabel = isLibrarianPortal ? 'Staff Portal' : 'Member Portal';

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startFaceScan = useCallback(() => {
    setFaceStatus('scanning');
    setFaceMessage('');
    let spoofConfidence = 0; // Buffer for consecutive spoof results

    pollingRef.current = setInterval(async () => {
      if (isPendingRef.current) return;
      if (Date.now() < nextAllowedRef.current) return;
      const screenshot = webcamRef.current?.getScreenshot();
      if (!screenshot) return;
      const image = screenshot;
      isPendingRef.current = true;
      try {
        const { data } = await faceAuth(image);
        
        if (data.matched) {
          spoofConfidence = 0;
          stopPolling();
          if (data.role !== expectedRole) {
            clearAuth();
            setFaceStatus('failed');
            setFaceMessage(wrongPortalMessage(data.role, expectedRole));
            return;
          }

          setFaceStatus('matched');
          setFaceMessage(`Welcome, ${data.name}!`);
          persistAuth({
            user_id: data.user_id,
            name: data.name,
            role: data.role,
            must_change_password: data.must_change_password,
          });
          setTimeout(() => {
            navigate(data.must_change_password ? passwordChangePathForRole(data.role) : safeNextPath(nextPath, data.role));
          }, 900);
        } else if (data.message === 'Spoofing Detected') {
          spoofConfidence++;
          // Only show message and rely on backend logging if seen 3 times
          if (spoofConfidence >= 3) {
            setFaceMessage('Spoofing Detected. Please use a live face.');
            // We do NOT call setFaceStatus('failed') or stopPolling() 
            // so the user can just keep trying.
          } else {
            setFaceMessage('Verifying identity...');
          }
        } else if (['no_face', 'too_dark', 'too_far'].includes(data.message)) {
          // "Do nothing" to spoofConfidence - doesn't reset, doesn't increment
          if (data.message === 'too_dark') setFaceMessage('Too dark. Add more light.');
          else if (data.message === 'too_far') setFaceMessage('Move closer to the camera.');
          else if (spoofConfidence > 0) setFaceMessage('Keep still...');
          else setFaceMessage('');
        } else {
          // Reset on a valid real face (even if not recognized)
          spoofConfidence = 0;
          if (data.message === 'not_recognized') {
            setFaceMessage('Face not recognized. Keep still...');
          } else {
            setFaceMessage(data.message || '');
          }
        }
      } catch (err) {
        if (err.response?.status === 429) {
          nextAllowedRef.current = Date.now() + 3000;
        }
      }
      finally {
        isPendingRef.current = false;
      }
    }, 1000);
  }, [expectedRole, nextPath, stopPolling, navigate]);

  // Start/stop polling when tab changes
  useEffect(() => {
    if (tab === 'face') {
      // short delay so webcam has time to mount
      const t = setTimeout(startFaceScan, 600);
      return () => { clearTimeout(t); stopPolling(); };
    } else {
      stopPolling();
      setFaceStatus('idle');
      setFaceMessage('');
    }
  }, [tab, startFaceScan, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await login(email, password);
      if (data.role !== expectedRole) {
        clearAuth();
        setError(wrongPortalMessage(data.role, expectedRole));
        setIsLoading(false);
        return;
      }

      persistAuth(data);
      navigate(data.must_change_password ? passwordChangePathForRole(data.role) : safeNextPath(nextPath, data.role));
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials or backend connection.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans transition-colors duration-300 bg-white dark:bg-slate-950">

      {/* ── LEFT PANEL (dark branding) ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 dark:bg-black flex-col justify-between p-16 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-800/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Top: Tagline */}
        <div className="relative z-10 pt-16">
          <span className="inline-block px-4 py-1.5 bg-blue-600/20 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">
            {portalLabel} Access Portal
          </span>

          <h2 className="text-5xl font-black italic uppercase tracking-tighter text-white leading-[0.9] mb-6">
            Welcome <br /> Back.
          </h2>

          <p className="text-slate-400 text-base font-medium leading-relaxed max-w-xs">
            Secure, biometric-integrated library management for the people of Rizal Province.
          </p>
        </div>

        {/* Middle: Registration notice */}
        <div className="relative z-10 bg-white/5 border border-white/10 rounded-3xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Info size={16} className="text-blue-400" />
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">
              {isLibrarianPortal ? 'Staff Accounts Only' : 'New Member?'}
            </p>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            {isLibrarianPortal ? (
              <>
                Librarian access is issued by authorized administrators only.
                Member accounts cannot enter the staff console.
              </>
            ) : (
              <>
                Account registration is done in person at the{' '}
                <span className="text-white font-bold">Taytay branch</span>. A librarian will set up your account and enroll your Face ID.
              </>
            )}
          </p>
        </div>

        {/* Bottom: Footer text */}
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-700">
            © 2025 Rizal Provincial Library
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL (form) ── */}
      <div className="relative w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-8 pt-32 sm:pt-36 bg-slate-50 dark:bg-slate-900 transition-colors">
        <Link
          to={portalLandingPath}
          aria-label={`Back to ${portalLandingLabel}`}
          className="group absolute top-6 sm:top-8 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white dark:hover:bg-slate-800/80 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 overflow-hidden flex-shrink-0 group-hover:border-blue-300 dark:group-hover:border-blue-500 transition-colors duration-200">
            <img
              src="/logo.library.png"
              alt="Rizal Provincial Library"
              className="w-full h-full object-contain transition-transform duration-500 group-hover:rotate-[20deg] group-hover:scale-110"
            />
          </div>
          <div className="leading-none text-left">
            <p className="font-black italic uppercase tracking-tighter text-slate-900 dark:text-white text-base leading-none group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
              Rizal <span className="text-blue-600 dark:text-blue-400">Lib</span>
            </p>
            <p className="text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors duration-200">
              {portalLandingLabel}
            </p>
          </div>
        </Link>

        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white leading-none mb-3">
              Sign In
            </h1>
            <p className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
              Identity Verification System
            </p>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-2 mb-8 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => setTab('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                tab === 'password'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <KeyRound size={14} />
              Password
            </button>
            <button
              type="button"
              onClick={() => setTab('face')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                tab === 'face'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <ScanFace size={14} />
              Face ID
            </button>
          </div>

          {/* ── PASSWORD TAB ── */}
          {tab === 'password' && (
            <>
              {error && (
                <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl mb-6">
                  <AlertCircle size={18} className="text-rose-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-bold text-rose-700 dark:text-rose-400 leading-relaxed">{error}</p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                    Email or Member ID
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={17} />
                    <input
                      type="text"
                      placeholder="email@domain.com or RPL-K7X2M"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">
                      Password
                    </label>
                    {!isLibrarianPortal && (
                      <Link
                        to="/user/forgot-password"
                        className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={17} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-12 outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 transition-all font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-blue-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-blue-200 dark:shadow-blue-900/40 transition-all flex justify-center items-center active:scale-[0.98] mt-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    `Authorize ${portalLabel}`
                  )}
                </button>
              </form>
            </>
          )}

          {/* ── FACE ID TAB ── */}
          {tab === 'face' && (
            <div className="flex flex-col items-center gap-5">
              {/* Webcam + HUD */}
              <div className="relative w-64 h-64 rounded-3xl overflow-hidden bg-slate-950 border-2 border-blue-500/30 shadow-xl shadow-blue-900/20">
                {faceStatus !== 'matched' && (
                  <Webcam
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: 'user', width: 640, height: 640 }}
                    className="w-full h-full object-cover"
                    mirrored
                  />
                )}

                {/* Matched overlay */}
                {faceStatus === 'matched' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/80">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-400 flex items-center justify-center mb-3">
                      <ScanFace size={32} className="text-green-400" />
                    </div>
                    <p className="text-green-400 font-black uppercase tracking-widest text-xs text-center px-4">{faceMessage}</p>
                  </div>
                )}

                {/* Scanning overlays */}
                {faceStatus === 'scanning' && (
                  <>
                    {/* Corner brackets */}
                    <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-blue-400 rounded-tl-lg" />
                    <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-blue-400 rounded-tr-lg" />
                    <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-blue-400 rounded-bl-lg" />
                    <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-blue-400 rounded-br-lg" />
                    {/* Scan line */}
                    <div className="animate-scan-line bg-blue-400/50" style={{ boxShadow: '0 0 8px 2px rgba(96,165,250,0.6)' }} />
                  </>
                )}
              </div>

              {/* Status text */}
              <div className="text-center space-y-1">
                {(faceStatus === 'scanning' || faceStatus === 'failed') && (
                  <>
                    <p className={`text-[11px] font-black uppercase tracking-widest ${faceStatus === 'failed' ? 'text-rose-500' : 'text-blue-500 dark:text-blue-400'}`}>
                      {faceStatus === 'failed' ? 'Access Denied' : 'Scanning...'}
                    </p>
                    <p className={`text-xs ${faceStatus === 'failed' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                      {faceMessage || 'Position your face in the frame'}
                    </p>
                    {faceStatus === 'failed' && !faceMessage.includes('Too many') && (
                      <button 
                        onClick={() => { setFaceStatus('scanning'); setFaceMessage(''); }}
                        className="mt-2 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Try Again
                      </button>
                    )}
                  </>
                )}
                {faceStatus === 'idle' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Initializing camera...</p>
                )}
              </div>

              <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center uppercase tracking-widest font-bold">
                Face must be enrolled to use Face ID
              </p>
            </div>
          )}

          {/* Mobile-only: New Member notice */}
          <div className="lg:hidden mt-8 bg-slate-900 dark:bg-black border border-white/10 rounded-3xl p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Info size={14} className="text-blue-400" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-400">
                {isLibrarianPortal ? 'Staff Access Only' : 'Want to Create an Account?'}
              </p>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              {isLibrarianPortal ? (
                <>
                  Only librarian accounts can enter this portal. Member accounts must use the public member login.
                </>
              ) : (
                <>
                  Account registration is done in person at the{' '}
                  <span className="text-white font-bold">Rizal Provincial Library</span>.
                  Visit the library and a librarian will set up your account and enroll your Face ID.
                </>
              )}
            </p>
            <div className="flex items-start gap-2.5 pt-4 border-t border-white/10">
              <MapPin size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-500 font-medium">
                Taytay Municipal Compound, Taytay, Rizal
                <span className="block text-slate-600 mt-0.5">Mon – Fri · 8:00 AM – 5:00 PM</span>
              </p>
            </div>
          </div>

          {/* Back to portal landing */}
          <div className="mt-6 text-center">
            <Link
              to={portalLandingPath}
              className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {expectedRole === 'librarian' ? 'Back to Staff Portal' : 'Back to Home'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
