import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import UserLayout from './components/UserLayout';
import LibLayout from './components/LibLayout';
import RequireRole from './components/RequireRole';
import PasswordChangeNotice from './components/PasswordChangeNotice';
import { legacyLibPathToLibrarian } from './api/authRoutes';
import './index.css';

const LandingPage = lazy(() => import('./pages/public/LandingPage'));
const PublicBrowse = lazy(() => import('./pages/public/PublicBrowse'));
const LoginPage = lazy(() => import('./pages/public/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/public/ForgotPasswordPage'));
const LibrarianLanding = lazy(() => import('./pages/public/LibrarianLanding'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));

const UserHome = lazy(() => import('./pages/user/UserHome'));
const UserBrowseBooks = lazy(() => import('./pages/user/UserBrowseBooks'));
const UserProfile = lazy(() => import('./pages/user/UserProfile'));
const UserReservations = lazy(() => import('./pages/user/UserReservations'));

const LibDashboard = lazy(() => import('./pages/lib/LibDashboard'));
const LibInventory = lazy(() => import('./pages/lib/LibInventory'));
const EntryGate = lazy(() => import('./pages/lib/EntryGate'));
const LibAddBook = lazy(() => import('./pages/lib/LibAddBook'));
const LibQRBulk = lazy(() => import('./pages/lib/LibQRBulk'));
const LibBorrowReturn = lazy(() => import('./pages/lib/LibBorrowReturn'));
const LibUsers = lazy(() => import('./pages/lib/LibUsers'));
const LibDueBooks = lazy(() => import('./pages/lib/LibDueBooks'));
const LibReservations = lazy(() => import('./pages/lib/LibReservations'));
const LibReports = lazy(() => import('./pages/lib/LibReports'));
const LibSettings = lazy(() => import('./pages/lib/LibSettings'));

const NAVBAR_HIDDEN_PATHS = ['/librarian', '/entry-station', '/entry-gate'];
const NAVBAR_HIDDEN_PREFIXES = ['/user/', '/librarian/', '/lib/'];

const LegacyLibRedirect = () => {
  const location = useLocation();
  return (
    <Navigate
      to={legacyLibPathToLibrarian(`${location.pathname}${location.search}${location.hash}`)}
      replace
    />
  );
};

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
    <div className="text-sm font-semibold tracking-normal">Loading</div>
  </div>
);

const AppContent = () => {
  const location = useLocation();
  const showNavbar =
    !NAVBAR_HIDDEN_PATHS.includes(location.pathname) &&
    !NAVBAR_HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  return (
    <>
      <PasswordChangeNotice />
      {showNavbar && <Navbar />}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/browse" element={<PublicBrowse />} />
          <Route path="/login" element={<Navigate to="/user/login" replace />} />
          <Route path="/user/login" element={<LoginPage expectedRole="member" />} />
          <Route path="/user/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/librarian" element={<LibrarianLanding />} />
          <Route path="/librarian/login" element={<LoginPage expectedRole="librarian" />} />
          <Route path="/entry-gate" element={<Navigate to="/entry-station" replace />} />
          <Route path="/entry-station" element={<EntryGate />} />
          <Route path="/lib/*" element={<LegacyLibRedirect />} />

          <Route element={<RequireRole allowedRoles={['member']} />}>
            <Route element={<UserLayout />}>
              <Route path="/user/home" element={<UserHome />} />
              <Route path="/user/browse" element={<UserBrowseBooks />} />
              <Route path="/user/reservations" element={<UserReservations />} />
              <Route path="/user/profile" element={<UserProfile />} />
              <Route path="/user/change-password" element={<ChangePasswordPage />} />
            </Route>
          </Route>

          <Route element={<RequireRole allowedRoles={['librarian']} />}>
            <Route element={<LibLayout />}>
              <Route path="/librarian/home" element={<LibDashboard />} />
              <Route path="/librarian/inventory" element={<LibInventory />} />
              <Route path="/librarian/add-book" element={<LibAddBook />} />
              <Route path="/librarian/qr-bulk" element={<LibQRBulk />} />
              <Route path="/librarian/borrow-return" element={<LibBorrowReturn />} />
              <Route path="/librarian/users" element={<LibUsers />} />
              <Route path="/librarian/due-books" element={<LibDueBooks />} />
              <Route path="/librarian/reservations" element={<LibReservations />} />
              <Route path="/librarian/reports" element={<LibReports />} />
              <Route path="/librarian/settings" element={<LibSettings />} />
              <Route path="/librarian/entry" element={<Navigate to="/entry-station" replace />} />
              <Route path="/librarian/change-password" element={<ChangePasswordPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
