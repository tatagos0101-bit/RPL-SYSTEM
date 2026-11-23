import test from 'node:test';
import assert from 'node:assert/strict';

import {
  homeForRole,
  landingForRole,
  loginForPath,
  isSafeNextPath,
  legacyLibPathToLibrarian,
  persistStoredAuth,
  getStoredAuth,
  updateStoredProfile,
  clearStoredAuth,
} from './authRoutes.js';

const makeLocalStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('landingForRole returns the public landing for each portal', () => {
  assert.equal(landingForRole('member'), '/');
  assert.equal(landingForRole('librarian'), '/librarian');
});

test('homeForRole returns the correct portal home', () => {
  assert.equal(homeForRole('member'), '/user/home');
  assert.equal(homeForRole('librarian'), '/librarian/home');
  assert.equal(homeForRole('unknown'), '/');
});

test('loginForPath chooses the matching login URL for protected paths', () => {
  assert.equal(loginForPath('/librarian/inventory'), '/librarian/login');
  assert.equal(loginForPath('/lib/inventory'), '/librarian/login');
  assert.equal(loginForPath('/user/browse'), '/user/login');
  assert.equal(loginForPath('/browse'), '/user/login');
});

test('isSafeNextPath only allows next paths inside the expected portal', () => {
  assert.equal(isSafeNextPath('/user/browse', 'member'), true);
  assert.equal(isSafeNextPath('/librarian/home', 'librarian'), true);
  assert.equal(isSafeNextPath('/librarian/home', 'member'), false);
  assert.equal(isSafeNextPath('/user/home', 'librarian'), false);
  assert.equal(isSafeNextPath('https://evil.test/user/home', 'member'), false);
});

test('legacyLibPathToLibrarian preserves the old librarian path suffix', () => {
  assert.equal(legacyLibPathToLibrarian('/lib/home'), '/librarian/home');
  assert.equal(legacyLibPathToLibrarian('/lib'), '/librarian');
  assert.equal(legacyLibPathToLibrarian('/lib/entry?mode=gate'), '/librarian/entry?mode=gate');
});

test('persistStoredAuth keeps non-sensitive auth metadata but not the bearer token', () => {
  globalThis.localStorage = makeLocalStorage();

  persistStoredAuth({
    access_token: 'secret-token',
    user_id: 42,
    name: 'Juan',
    role: 'member',
    must_change_password: true,
  });

  assert.equal(localStorage.getItem('token'), null);
  assert.deepEqual(getStoredAuth(), {
    isLoggedIn: true,
    role: 'member',
    name: 'Juan',
    userId: '42',
    mustChangePassword: true,
    canManageLibrarians: false,
  });
});

test('staff management metadata is cleared across logins and logout and defaults closed', () => {
  globalThis.localStorage = makeLocalStorage();
  updateStoredProfile({ id: 1, name: 'Main librarian', role: 'librarian', can_manage_librarians: true });
  assert.equal(getStoredAuth().canManageLibrarians, true);
  persistStoredAuth({ user_id: 2, name: 'Another librarian', role: 'librarian' });
  assert.equal(getStoredAuth().canManageLibrarians, false);
  updateStoredProfile({ id: 1, name: 'Main librarian', role: 'librarian', can_manage_librarians: true });
  updateStoredProfile({ id: 1, name: 'Main librarian', role: 'librarian' });
  assert.equal(getStoredAuth().canManageLibrarians, false);
  updateStoredProfile({ id: 3, name: 'Member', role: 'member', can_manage_librarians: true });
  assert.equal(getStoredAuth().canManageLibrarians, false);
  clearStoredAuth();
  assert.equal(localStorage.getItem('canManageLibrarians'), null);
});
