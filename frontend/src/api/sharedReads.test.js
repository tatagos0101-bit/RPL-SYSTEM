import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedRead, invalidateSharedReads } from './sharedReads.js';

const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('concurrent reads share one request, but completed results are never cached', async () => {
  let calls = 0;
  const first = pending();
  const read = createSharedRead('synthetic-profile', () => { calls++; return first.promise; }, () => 'member:11');
  const a = read(), b = read();
  assert.equal(a, b);
  await Promise.resolve(); assert.equal(calls, 1);
  first.resolve({ data: 'synthetic profile' });
  assert.deepEqual(await a, await b);
  await read(); assert.equal(calls, 2);
});

test('authentication changes cannot return a previous account response or join its request', async () => {
  let scope = 'member:11', calls = 0;
  const first = pending(), second = pending();
  const read = createSharedRead('synthetic-profile-switch', () => (++calls === 1 ? first.promise : second.promise), () => scope);
  const a = read();
  const rejected = assert.rejects(a, { name: 'AbortError' });
  await Promise.resolve();
  invalidateSharedReads(); scope = 'member:12';
  const b = read(); await Promise.resolve();
  first.resolve({ data: 'old synthetic account' }); await rejected;
  second.resolve({ data: 'new synthetic account' });
  assert.deepEqual(await b, { data: 'new synthetic account' });
  assert.equal(calls, 2);
});

test('failed reads are evicted and explicit request configs retain independent cancellation', async () => {
  let calls = 0;
  const read = createSharedRead('synthetic-fines', config => {
    calls++;
    return config ? Promise.resolve(config) : Promise.reject(new Error('synthetic failure'));
  }, () => 'member:11');
  await assert.rejects(read()); await assert.rejects(read());
  const a = { signal: new AbortController().signal }, b = { signal: new AbortController().signal };
  assert.equal(await read(a), a); assert.equal(await read(b), b);
  assert.equal(calls, 4);
});

test('profile updates start a fresh read without evicting its newer pending response', async () => {
  const old = pending(), current = pending();
  let calls = 0;
  const read = createSharedRead('profile', () => (++calls === 1 ? old.promise : current.promise), () => 'member:11');
  const a = read(); await Promise.resolve();
  invalidateSharedReads('profile');
  const b = read(); await Promise.resolve();
  old.resolve('old synthetic photo'); await a;
  assert.equal(read(), b);
  current.resolve('current synthetic photo'); assert.equal(await b, 'current synthetic photo');
  assert.equal(calls, 2);
});
