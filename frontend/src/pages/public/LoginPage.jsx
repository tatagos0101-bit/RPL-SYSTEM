import { useState, useRef, useEffect, useCallback } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Check, ScanFace, KeyRound, MapPin, ArrowRight } from 'lucide-react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import { clearAuth, login, faceAuth, persistAuth } from '../../api/auth';
import { landingForRole, passwordChangePathForRole, safeNextPath } from '../../api/authRoutes';
import { startAutomaticFaceScan } from '../../api/circulationFaceScan';
import { loginErrorMessage } from '../../api/loginErrors';

const ROLE_LABEL = {
  member: 'Member',
  librarian: 'Librarian',
};

const FACE_SUCCESS_DELAY_MS = 500;

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
  const [scanRevision, setScanRevision] = useState(0);
  const [facePaused, setFacePaused] = useState(false);
  const [faceStatus, setFaceStatus] = useState('idle'); // idle | scanning | matched | failed
  const [faceMessage, setFaceMessage] = useState('');
  const portalLabel = ROLE_LABEL[expectedRole] || 'Member';
  const nextPath = searchParams.get('next');
  const isLibrarianPortal = expectedRole === 'librarian';
  const portalLandingPath = landingForRole(expectedRole);
  const portalLandingLabel = isLibrarianPortal ? 'Staff Portal' : 'Member Portal';

  const stopPolling = useCallback(() => {
    pollingRef.current?.stop();
    pollingRef.current = null;
  }, []);

  const startFaceScan = useCallback(() => {
    if (document.hidden) return;
    stopPolling();
    setFacePaused(false);
    setScanRevision(value => value + 1);
  }, [stopPolling]);

  useEffect(() => {
    if (tab !== 'face' || facePaused) return;
    let active = true;
    let spoofConfidence = 0;
    let successTimer;
    const video = webcamRef.current?.video;
    const scanner = startAutomaticFaceScan({
      purpose: 'login',
      capture: () => document.hidden ? null : webcamRef.current?.getScreenshot(),
      lookup: (image, config) => faceAuth(image, expectedRole, config),
      onStatus: status => {
        if (!active || status.phase === 'recognized') return;
        if (status.reason === 'member_setup_required') {
          setError(status.message);
          setTab('password');
          return;
        }
        setFaceStatus(status.phase === 'error' ? 'failed' : 'scanning');
        if (status.reason === 'Spoofing Detected') {
          spoofConfidence++;
          setFaceMessage(spoofConfidence >= 3 ? 'Spoofing Detected. Please use a live face.' : 'Verifying identity…');
        } else {
          if (status.phase === 'retry' && !['no_face', 'too_dark', 'too_far', 'liveness_uncertain'].includes(status.reason)) spoofConfidence = 0;
          setFaceMessage(status.message);
        }
      },
      onMatch: async data => {
        if (!active) return;
        try {
          if (data.role !== expectedRole) {
            await clearAuth();
            if (active) {
              setFaceStatus('failed');
              setFaceMessage(wrongPortalMessage(data.role, expectedRole));
            }
            return;
          }
          persistAuth(data);
          setFaceStatus('matched');
          setFaceMessage('Welcome, ' + data.name + '!');
          successTimer = setTimeout(() => {
            if (active && !document.hidden) {
              navigate(data.must_change_password ? passwordChangePathForRole(data.role) : safeNextPath(nextPath, data.role));
            }
          }, FACE_SUCCESS_DELAY_MS);
        } catch {
          if (active) {
            setFaceStatus('failed');
            setFaceMessage('Sign-in could not be completed. Please use password sign-in.');
          }
        }
      },
    });
    pollingRef.current = scanner;
    const hide = () => {
      if (!document.hidden) return;
      active = false;
      scanner.stop();
      clearTimeout(successTimer);
      video?.srcObject?.getTracks().forEach(track => track.stop());
      setFacePaused(true);
      setFaceStatus('paused');
      setFaceMessage('The camera paused while this page was hidden. Choose Try Again to resume.');
    };
    document.addEventListener('visibilitychange', hide);
    if (document.hidden) hide();
    return () => {
      active = false;
      scanner.stop();
      clearTimeout(successTimer);
      video?.srcObject?.getTracks().forEach(track => track.stop());
      if (pollingRef.current === scanner) pollingRef.current = null;
      document.removeEventListener('visibilitychange', hide);
    };
  }, [tab, facePaused, scanRevision, expectedRole, nextPath, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await login(email, password, expectedRole);
      if (data.role !== expectedRole) {
        await clearAuth();
        setError(wrongPortalMessage(data.role, expectedRole));
        setIsLoading(false);
        return;
      }

      persistAuth(data);
      navigate(data.must_change_password ? passwordChangePathForRole(data.role) : safeNextPath(nextPath, data.role));
    } catch (err) {
      setError(loginErrorMessage(err));
      setIsLoading(false);
    }
  };

  return (
    <div className="rpl-page rpl-public rpl-auth">
      <header className="auth-brandbar">
        <Link to={portalLandingPath} aria-label={`Back to ${portalLandingLabel}`} className="auth-brand">
          <img src="/RPL.png" alt="" width="44" height="44" />
          <span>Rizal Provincial Library</span>
        </Link>
      </header>

      <main className="auth-main">
        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-form-panel">
            <p className="auth-portal-label">{portalLabel} Access Portal</p>
            <h1 id="auth-heading">Welcome back</h1>

            <div className="auth-methods" role="group" aria-label="Sign-in method">
              <button type="button" onClick={() => setTab('password')} aria-pressed={tab === 'password'}
                className={`auth-method ${tab === 'password' ? 'is-active' : ''}`}>
                <KeyRound size={18} aria-hidden="true" /> Password
              </button>
              <button type="button" onClick={() => { setFacePaused(false); setTab('face'); }} aria-pressed={tab === 'face'}
                className={`auth-method ${tab === 'face' ? 'is-active' : ''}`}>
                <ScanFace size={18} aria-hidden="true" /> Face ID
              </button>
            </div>

            <p className="auth-divider"><span>Identity Verification System</span></p>

            {tab === 'password' && (
              <>
                {error && (
                  <div className="auth-error" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <p>{error}</p>
                  </div>
                )}
                <form onSubmit={handleLogin} className="auth-form">
                  <div className="auth-field-group">
                    <label htmlFor="auth-identifier">Email or Member ID</label>
                    <div className="auth-field">
                      <Mail size={18} aria-hidden="true" />
                      <input id="auth-identifier" aria-label="Email or Member ID" type="text"
                        placeholder="email@domain.com or RPL-K7X2M" value={email}
                        onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                  </div>
                  <div className="auth-field-group">
                    <div className="auth-password-label">
                      <label htmlFor="auth-password">Password</label>
                      {!isLibrarianPortal && <Link to="/user/forgot-password">Forgot?</Link>}
                    </div>
                    <div className="auth-field auth-password-field">
                      <Lock size={18} aria-hidden="true" />
                      <input id="auth-password" aria-label="Password" type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password" value={password}
                        onChange={(e) => setPassword(e.target.value)} required />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                        className="auth-password-toggle">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={isLoading} aria-busy={isLoading} aria-label={isLoading ? 'Signing in' : 'Sign in'} className="auth-submit">
                    {isLoading ? <span className="auth-submit-spinner animate-spin" aria-label="Signing in" /> : 'Sign in'}
                  </button>
                </form>
              </>
            )}

          {tab === 'face' && (
            <div className="auth-face-content flex flex-col items-center gap-5">
              {/* Webcam + HUD */}
              <div className="auth-face-frame relative w-64 h-64 rounded-xl overflow-hidden bg-panel border-2 border-line shadow-sm">
                {faceStatus !== 'matched' && !facePaused && (
                  <Webcam
                    key={scanRevision}
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.8}
                    videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                    onUserMediaError={() => { stopPolling(); setFaceStatus('failed'); setFaceMessage('Camera unavailable. Check permissions or use password sign-in.'); }}
                    className="w-full h-full object-cover"
                    mirrored
                  />
                )}

                {/* Matched overlay */}
                {faceStatus === 'matched' && (
                  <div role="status" aria-live="polite" aria-atomic="true" className="absolute inset-0 flex flex-col items-center justify-center bg-success-soft px-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-success-soft border-2 border-success flex items-center justify-center mb-3">
                      <Check size={32} className="text-success" aria-hidden="true" />
                    </div>
                    <p className="text-success font-bold text-base">Scan successful</p>
                    <p className="mt-1 text-success font-semibold tracking-normal text-sm break-words max-w-full">{faceMessage}</p>
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
                    <div className="animate-scan-line bg-info-soft" style={{ boxShadow: '0 0 8px 2px rgba(199,161,90,0.6)' }} />
                  </>
                )}
              </div>

              {/* Status text */}
              <div role="status" aria-live="polite" className="auth-face-status text-center space-y-1">
                {['scanning', 'failed', 'paused'].includes(faceStatus) && (
                  <>
                    <p className={`text-sm font-semibold tracking-normal ${faceStatus === 'failed' ? 'text-danger' : 'text-link text-link'}`}>
                      {faceStatus === 'paused' ? 'Camera paused' : faceStatus === 'failed' ? 'Sign-in unavailable' : 'Scanning...'}
                    </p>
                    <p className={`text-sm ${faceStatus === 'failed' ? 'text-danger text-danger font-bold' : 'text-muted '}`}>
                      {faceMessage || 'Position your face in the frame'}
                    </p>
                    {['failed', 'paused'].includes(faceStatus) && !faceMessage.includes('Too many') && (
                      <button
                        onClick={startFaceScan}
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
          </div>

          <aside className="auth-welcome" aria-label="Library account guidance">
            <div className="auth-welcome-brand">
              <img src="/RPL.png" alt="" width="76" height="76" />
              <p>Rizal Provincial Library</p>
            </div>
            <h2>{isLibrarianPortal ? 'Staff Accounts Only' : 'New Member?'}</h2>
            <p className="auth-access-description">
              {isLibrarianPortal ? (
                <>Librarian access is issued by authorized administrators only. Member accounts cannot enter the staff console.</>
              ) : (
                <>Register in person at the <strong>Taytay branch</strong>. A librarian will set up your account and can help you enroll in Face ID if you choose.</>
              )}
            </p>
            <div className="auth-location">
              <MapPin size={16} aria-hidden="true" />
              <p>Taytay Municipal Compound, Taytay, Rizal<span>Mon – Fri · 8:00 AM – 5:00 PM</span></p>
            </div>
            <Link to={portalLandingPath} className="auth-guidance-link">
              {expectedRole === 'librarian' ? 'Back to Staff Portal' : 'Back to Home'}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <p className="auth-mission">Secure, biometric-integrated library management for the people of Rizal Province.</p>
          </aside>
        </section>
      </main>
      <footer className="auth-footer">© 2025 Rizal Provincial Library</footer>
    </div>
  );
};

export default LoginPage;
