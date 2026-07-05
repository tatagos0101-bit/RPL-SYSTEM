const PORTAL_HOME = {
  member: '/user/home',
  librarian: '/librarian/home',
};

const PORTAL_LANDING = {
  member: '/',
  librarian: '/librarian',
};

const PORTAL_PREFIX = {
  member: '/user/',
  librarian: '/librarian/',
};

const PASSWORD_CHANGE_PATH = {
  member: '/user/change-password',
  librarian: '/librarian/change-password',
};

const AUTH_KEYS = ['token', 'isLoggedIn', 'userRole', 'userName', 'userId', 'mustChangePassword'];

export const homeForRole = (role) => PORTAL_HOME[role] || '/';

export const landingForRole = (role) => PORTAL_LANDING[role] || '/';

export const passwordChangePathForRole = (role) =>
  PASSWORD_CHANGE_PATH[role] || '/user/change-password';

export const isPasswordChangePath = (pathname = '') =>
  Object.values(PASSWORD_CHANGE_PATH).includes(pathname);

export const loginForRole = (role) =>
  role === 'librarian' ? '/librarian/login' : '/user/login';

export const loginForPath = (pathname = '') => {
  if (pathname.startsWith('/librarian/') || pathname === '/librarian') {
    return '/librarian/login';
  }
  if (pathname.startsWith('/lib/') || pathname === '/lib') {
    return '/librarian/login';
  }
  return '/user/login';
};

export const isSafeNextPath = (next, expectedRole) => {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return false;
  }

  const expectedPrefix = PORTAL_PREFIX[expectedRole];
  return Boolean(expectedPrefix && next.startsWith(expectedPrefix));
};

export const safeNextPath = (next, expectedRole) =>
  isSafeNextPath(next, expectedRole) ? next : homeForRole(expectedRole);

export const legacyLibPathToLibrarian = (path = '') =>
  path.replace(/^\/lib(?=\/|$)/, '/librarian');

export const getStoredAuth = () => ({
  isLoggedIn: localStorage.getItem('isLoggedIn') === 'true',
  role: localStorage.getItem('userRole'),
  name: localStorage.getItem('userName'),
  userId: localStorage.getItem('userId'),
  mustChangePassword: localStorage.getItem('mustChangePassword') === 'true',
});

export const persistStoredAuth = ({ user_id, name, role, must_change_password = false }) => {
  localStorage.removeItem('token');
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('userRole', role);
  localStorage.setItem('userName', name);
  localStorage.setItem('userId', String(user_id));
  localStorage.setItem('mustChangePassword', String(Boolean(must_change_password)));
};

export const updateStoredProfile = ({ id, name, role, must_change_password = false }) => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('userRole', role);
  localStorage.setItem('userName', name);
  localStorage.setItem('userId', String(id));
  localStorage.setItem('mustChangePassword', String(Boolean(must_change_password)));
};

export const clearStoredAuth = () => {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
};
