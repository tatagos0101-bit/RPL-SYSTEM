import test from 'node:test';
import assert from 'node:assert/strict';
import { startCirculationFaceScan } from './circulationFaceScan.js';

function clock() {
  const queue = new Map();
  let id = 0;
  return {
    setTimer: (run, delay) => { queue.set(++id, { run, delay }); return id; },
    clearTimer: key => queue.delete(key),
    count: () => queue.size,
    delay: () => queue.values().next().value?.delay,
    run: async () => {
      const [key, task] = queue.entries().next().value;
      queue.delete(key);
      await task.run();
    },
  };
}

function session(overrides = {}) {
  const time = clock(), statuses = [], matches = [];
  const loop = startCirculationFaceScan({ ...time, capture: () => 'synthetic-frame',
    lookup: async () => ({ data: { matched: false, message: 'no_face' } }),
    onStatus: status => statuses.push(status), onMatch: member => matches.push(member), ...overrides });
  return { loop, time, statuses, matches };
}

test('automatically scans ready frames and waits for the camera without sending empty frames', async () => {
  let ready = false, requests = 0;
  const { loop, time, statuses } = session({ capture: () => ready ? 'synthetic-frame' : null,
    lookup: async () => { requests++; return { data: { matched: false, message: 'no_face' } }; } });
  assert.equal(time.delay(), 0);
  await time.run();
  assert.equal(requests, 0);
  assert.equal(time.delay(), 500);
  assert.equal(statuses.at(-1).phase, 'starting');
  ready = true; await time.run();
  assert.equal(requests, 1);
  assert.equal(time.delay(), 2000);
  assert.match(statuses.at(-1).message, /No face detected/);
  loop.stop(); assert.equal(time.count(), 0);
});

test('slow recognition never queues another request while the first is running', async () => {
  let resolve, requests = 0;
  const pending = new Promise(done => { resolve = done; });
  const { loop, time } = session({ lookup: () => { requests++; return pending; } });
  const inFlight = time.run();
  assert.equal(requests, 1);
  assert.equal(time.count(), 0);
  resolve({ data: { matched: false, message: 'no_face' } }); await inFlight;
  assert.equal(time.count(), 1);
  assert.equal(time.delay(), 2000);
  loop.stop();
});

test('lighting, unknown faces and uncertain liveness retry without identifying a member', async () => {
  const replies = ['too_dark', 'too_far', 'not_recognized', 'multiple_faces', 'liveness_uncertain'];
  const { loop, time, statuses, matches } = session({
    lookup: async () => ({ data: { matched: false, message: replies.shift() } }),
  });
  for (let index = 0; index < 5; index++) { await time.run(); assert.equal(time.delay(), 2000); }
  assert.deepEqual(matches, []);
  assert.ok(statuses.some(status => status.message.includes('Too dark')));
  assert.ok(statuses.some(status => status.message.includes('Face not recognized')));
  assert.ok(statuses.some(status => status.message.includes('Live face not confirmed')));
  loop.stop();
});

test('a confirmed match advances once and stops scanning', async () => {
  const member = { matched: true, user_id: 11 };
  const { time, statuses, matches } = session({ lookup: async () => ({ data: member }) });
  await time.run();
  assert.deepEqual(matches, [member]);
  assert.equal(statuses.at(-1).phase, 'recognized');
  assert.equal(time.count(), 0);
});

test('switching methods or closing aborts pending recognition and ignores a late match', async () => {
  let resolve, signal;
  const pending = new Promise(done => { resolve = done; });
  const { loop, time, statuses, matches } = session({ lookup: (_, options) => { signal = options.signal; return pending; } });
  const inFlight = time.run();
  loop.stop(); assert.equal(signal.aborted, true);
  const count = statuses.length;
  resolve({ data: { matched: true, user_id: 11 } }); await inFlight;
  assert.deepEqual(matches, []);
  assert.equal(statuses.length, count);
  assert.equal(time.count(), 0);
});

test('late failures after cancellation do not restart scanning or update the UI', async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const { loop, time, statuses } = session({ lookup: () => pending });
  const inFlight = time.run(); loop.stop(); const count = statuses.length;
  reject(new Error('synthetic cancellation')); await inFlight;
  assert.equal(statuses.length, count);
  assert.equal(time.count(), 0);
});

test('rate limits honor Retry-After and network errors use a safe retry delay', async () => {
  for (const [error, delay] of [
    [{ response: { status: 429, headers: { 'retry-after': '12' } } }, 12000],
    [{ response: { status: 429 } }, 60000],
    [new Error('Network Error'), 5000],
  ]) {
    const { loop, time, statuses, matches } = session({ lookup: async () => { throw error; } });
    await time.run();
    assert.equal(time.delay(), delay);
    assert.match(statuses.at(-1).message, /automatically/);
    assert.deepEqual(matches, []); loop.stop();
  }
});

test('lost authorization stops automatic requests and never selects a member', async () => {
  for (const status of [401, 403]) {
    const { time, statuses, matches } = session({ lookup: async () => { throw { response: { status } }; } });
    await time.run();
    assert.equal(time.count(), 0);
    assert.equal(statuses.at(-1).phase, 'error');
    assert.deepEqual(matches, []);
  }
});
