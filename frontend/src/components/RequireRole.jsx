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
          role: data.role,
          mustChangePassword: Boolean(data.must_change_password),
        });
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredAuth();
        setState({ status: 'signed-out', role: null });
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

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

  return <Outlet />;
}
