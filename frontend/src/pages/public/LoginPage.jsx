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
            await clearAuth();
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
        setFaceStatus('failed');
        setFaceMessage('Could not complete sign-in or sign-out. Please retry.');
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
        await clearAuth();
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
    <div className="rpl-page rpl-public min-h-screen flex font-sans transition-colors duration-300 bg-panel">

      {/* ── LEFT PANEL (dark branding) ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-panel flex-col justify-between p-16 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-info-soft rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-info-soft rounded-full blur-[80px] pointer-events-none" />

        {/* Top: Tagline */}
        <div className="relative z-10 pt-16">
          <span className="inline-block px-4 py-1.5 bg-info-soft text-link rounded-full text-sm font-semibold tracking-normal mb-6">
            {portalLabel} Access Portal
          </span>

          <h2 className="font-semibold tracking-normal text-ink leading-[0.9] mb-6 rpl-section-title">
            Welcome <br /> Back.
          </h2>

          <p className="text-muted text-base font-medium leading-relaxed max-w-xs">
            Secure, biometric-integrated library management for the people of Rizal Province.
          </p>
        </div>

        {/* Middle: Registration notice */}
        <div className="relative z-10 bg-panel border border-line rounded-xl p-8">
          <div className="flex items-center gap-3 mb-4">
            <Info size={16} className="text-link" />
            <p className="text-sm font-semibold tracking-normal text-link">
              {isLibrarianPortal ? 'Staff Accounts Only' : 'New Member?'}
            </p>
          </div>
          <p className="text-sm text-muted leading-relaxed">
            {isLibrarianPortal ? (
              <>
                Librarian access is issued by authorized administrators only.
                Member accounts cannot enter the staff console.
              </>
            ) : (
              <>
                Account registration is done in person at the{' '}
                <span className="text-ink font-bold">Taytay branch</span>. A librarian will set up your account and enroll your Face ID.
              </>
            )}
          </p>
        </div>

        {/* Bottom: Footer text */}
        <div className="relative z-10">
          <p className="text-sm font-semibold tracking-normal text-muted">
            © 2025 Rizal Provincial Library
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL (form) ── */}
      <div className="relative w-full lg:w-1/2 flex items-center justify-center px-5 sm:px-8 py-8 pt-32 sm:pt-36 bg-subtle transition-colors">
        <Link
          to={portalLandingPath}
          aria-label={`Back to ${portalLandingLabel}`}
          className="rpl-auth-brand absolute top-6 sm:top-8 left-4 right-4 flex justify-center px-3 py-2"
        >
          <span className="rpl-brand"><img src="/RPL.png" alt="" className="rpl-brand-logo" /><span>Rizal Provincial Library</span></span>
        </Link>

        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-semibold tracking-normal text-ink leading-none mb-3 rpl-title">
              Sign In
            </h1>
            <p className="text-muted font-bold text-sm tracking-normal">
              Identity Verification System
            </p>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-2 mb-8 p-1 bg-subtle rounded-xl">
            <button
              type="button"
              onClick={() => setTab('password')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold tracking-normal transition-all ${
                tab === 'password'
                  ? 'bg-panel text-ink shadow-sm'
                  : 'text-muted hover:text-muted '
              }`}
            >
              <KeyRound size={14} />
              Password
            </button>
            <button
              type="button"
              onClick={() => setTab('face')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold tracking-normal transition-all ${
                tab === 'face'
                  ? 'bg-panel text-link text-link shadow-sm'
                  : 'text-muted hover:text-muted '
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
                <div className="flex items-start gap-3 p-4 bg-danger-soft border border-danger rounded-xl mb-6">
                  <AlertCircle size={18} className="text-danger mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-bold text-danger leading-relaxed">{error}</p>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-muted tracking-normal ml-1">
                    Email or Member ID
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={17} />
                    <input aria-label="Email or Member ID"
                      type="text"
                      placeholder="email@domain.com or RPL-K7X2M"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-panel border border-line rounded-lg py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-line transition-all font-medium text-ink placeholder:text-muted"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-semibold text-muted tracking-normal ml-1">
                      Password
                    </label>
                    {!isLibrarianPortal && (
                      <Link
                        to="/user/forgot-password"
                        className="text-sm font-semibold tracking-normal text-link hover:text-link"
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={17} />
                    <input aria-label="Password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-panel border border-line rounded-lg py-4 pl-12 pr-12 outline-none focus:ring-2 focus:ring-line transition-all font-medium text-ink placeholder:text-muted"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-link transition-colors"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-action hover:bg-action-hover disabled:opacity-60 text-white rounded-lg font-semibold tracking-normal text-sm shadow-sm transition-all flex justify-center items-center mt-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-line border-t-transparent rounded-full animate-spin" />
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
              <div className="relative w-64 h-64 rounded-xl overflow-hidden bg-panel border-2 border-line shadow-sm">
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-success-soft">
                    <div className="w-16 h-16 rounded-full bg-success-soft border-2 border-success flex items-center justify-center mb-3">
                      <ScanFace size={32} className="text-success" />
                    </div>
                    <p className="text-success font-semibold tracking-normal text-sm text-center px-4">{faceMessage}</p>
                  </div>
                )}

                {/* Scanning overlays */}
                {faceStatus === 'scanning' && (
                  <>
                    {/* Corner brackets */}
                    <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-line rounded-tl-lg" />
                    <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-line rounded-tr-lg" />
                    <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-line rounded-bl-lg" />
                    <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-line rounded-br-lg" />
                    {/* Scan line */}
                    <div className="animate-scan-line bg-info-soft" style={{ boxShadow: '0 0 8px 2px rgba(96,165,250,0.6)' }} />
                  </>
                )}
              </div>

              {/* Status text */}
              <div className="text-center space-y-1">
                {(faceStatus === 'scanning' || faceStatus === 'failed') && (
                  <>
                    <p className={`text-sm font-semibold tracking-normal ${faceStatus === 'failed' ? 'text-danger' : 'text-link text-link'}`}>
                      {faceStatus === 'failed' ? 'Access Denied' : 'Scanning...'}
                    </p>
                    <p className={`text-sm ${faceStatus === 'failed' ? 'text-danger text-danger font-bold' : 'text-muted '}`}>
                      {faceMessage || 'Position your face in the frame'}
                    </p>
                    {faceStatus === 'failed' && !faceMessage.includes('Too many') && (
                      <button
                        onClick={() => { setFaceStatus('scanning'); setFaceMessage(''); }}
                        className="mt-2 text-sm font-semibold tracking-normal text-link hover:underline"
                      >
                        Try Again
                      </button>
                    )}
                  </>
                )}
                {faceStatus === 'idle' && (
                  <p className="text-sm text-muted">Initializing camera...</p>
                )}
              </div>

              <p className="text-sm text-muted text-center tracking-normal font-bold">
                Face must be enrolled to use Face ID
              </p>
            </div>
          )}

          {/* Mobile-only: New Member notice */}
          <div className="lg:hidden mt-8 bg-panel border border-line rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 bg-info-soft rounded-lg flex items-center justify-center flex-shrink-0">
                <Info size={14} className="text-link" />
              </div>
              <p className="text-sm font-semibold tracking-normal text-link">
                {isLibrarianPortal ? 'Staff Access Only' : 'Want to Create an Account?'}
              </p>
            </div>
            <p className="text-sm text-muted leading-relaxed mb-4">
              {isLibrarianPortal ? (
                <>
                  Only librarian accounts can enter this portal. Member accounts must use the public member login.
                </>
              ) : (
                <>
                  Account registration is done in person at the{' '}
                  <span className="text-ink font-bold">Rizal Provincial Library</span>.
                  Visit the library and a librarian will set up your account and enroll your Face ID.
                </>
              )}
            </p>
            <div className="flex items-start gap-2.5 pt-4 border-t border-line">
              <MapPin size={14} className="text-link mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted font-medium">
                Taytay Municipal Compound, Taytay, Rizal
                <span className="block text-muted mt-0.5">Mon – Fri · 8:00 AM – 5:00 PM</span>
              </p>
            </div>
          </div>

          {/* Back to portal landing */}
          <div className="mt-6 text-center">
            <Link
              to={portalLandingPath}
              className="text-sm font-semibold tracking-normal text-muted hover:text-link transition-colors"
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
