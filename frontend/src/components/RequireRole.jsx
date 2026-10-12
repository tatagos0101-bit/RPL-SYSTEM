import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getProfile } from '../api/user';
import {
  clearStoredAuth,
  getStoredAuth,
  homeForRole,
  isPasswordChangePath,
  loginForPath,
  passwordChangePathForRole,
  updateStoredProfile,
} from '../api/authRoutes';

const LoadingGate = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
    <div className="text-[10px] font-black uppercase tracking-[0.35em]">
      Verifying Access
    </div>
  </div>
);

export default function RequireRole({ allowedRoles }) {
  const location = useLocation();
  const [state, setState] = useState(() => {
    const stored = getStoredAuth();
    return { status: 'checking', role: stored.role, mustChangePassword: stored.mustChangePassword };
  });
  const [attempt, setAttempt] = useState(0);
  const expectedRole = allowedRoles[0];
  const currentPath = location.pathname + location.search;

  useEffect(() => {
    let cancelled = false;

    getProfile()
      .then(({ data }) => {
        if (cancelled) return;
        updateStoredProfile(data);
        setState({
          status: 'ready',
          path: location.pathname,
          attempt,
          role: data.role,
          mustChangePassword: Boolean(data.must_change_password),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.response?.status === 401 || error.response?.status === 403) {
          clearStoredAuth();
          setState({ status: 'signed-out', role: null, path: location.pathname, attempt });
        } else {
          setState({ status: 'unavailable', path: location.pathname, attempt });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, attempt]);

  // A new path must not use the previous page's password-change requirement.
  // Rendering a loading gate immediately prevents the redirect back to the form
  // before the new profile request can confirm that the password was saved.
  if (state.path !== location.pathname || state.attempt !== attempt) {
    return <LoadingGate />;
  }

  if (state.status === 'unavailable') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4">
        <div role="alert" className="max-w-sm text-center text-slate-700 dark:text-slate-200">
          <p className="font-semibold">We couldn't verify your account. Please retry.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}
            className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">
            Retry account verification
          </button>
        </div>
      </div>
    );
  }

  if (state.status === 'signed-out') {
    const loginPath = loginForPath(location.pathname);
    return (
      <Navigate
        to={`${loginPath}?next=${encodeURIComponent(currentPath)}`}
        replace
      />
    );
  }

  if (state.status !== 'ready') {
    return <LoadingGate />;
  }

  if (!allowedRoles.includes(state.role)) {
    return <Navigate to={homeForRole(state.role)} replace />;
  }

  if (expectedRole && state.role !== expectedRole) {
    return <Navigate to={homeForRole(state.role)} replace />;
  }

  if (state.mustChangePassword && !isPasswordChangePath(location.pathname)) {
    return <Navigate to={passwordChangePathForRole(state.role)} replace />;
  }

  if (!state.mustChangePassword && isPasswordChangePath(location.pathname)) {
    return <Navigate to={homeForRole(state.role)} replace state={location.state} />;
  }

  return <Outlet />;
}
