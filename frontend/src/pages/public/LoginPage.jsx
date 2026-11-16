import { useState, useRef, useEffect, useCallback } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ScanFace, KeyRound, MapPin, ArrowRight } from 'lucide-react';
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
        const { data } = await faceAuth(image, expectedRole);

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
        } else if (data.message === 'liveness_uncertain') {
          setFaceMessage('Live face not confirmed. Face the camera directly in even lighting.');
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
        } else if (err.response?.status === 503) {
          nextAllowedRef.current = Date.now() + 5000;
          setFaceMessage('Face verification is unavailable. Please use password login.');
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
      setError(err.response?.data?.detail || 'Login failed. Check your credentials or backend connection.');
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
              <button type="button" onClick={() => setTab('face')} aria-pressed={tab === 'face'}
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
                    <div className="animate-scan-line bg-info-soft" style={{ boxShadow: '0 0 8px 2px rgba(199,161,90,0.6)' }} />
                  </>
                )}
              </div>

              {/* Status text */}
              <div role="status" aria-live="polite" className="auth-face-status text-center space-y-1">
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
                <>Account registration is done in person at the <strong>Taytay branch</strong>. A librarian will set up your account and enroll your Face ID.</>
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
