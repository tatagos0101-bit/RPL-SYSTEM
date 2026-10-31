import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePresence, attendanceElapsed, attendanceTimestamp } from './entryAttendance.js';

test('continuous sightings stay suppressed; two missing frames re-arm each member independently', () => {
  const faces = [{ matched: true, user_id: 1 }, { matched: true, user_id: 2 }];
  let state = updatePresence({}, faces);
  assert.deepEqual(state, { 1: 0, 2: 0 });
  for (let i = 0; i < 400; i++) state = updatePresence(state, faces);
  assert.deepEqual(state, { 1: 0, 2: 0 });
  state = updatePresence(state, [faces[1]]);
  assert.deepEqual(state, { 1: 1, 2: 0 });
  state = updatePresence(state, [faces[1]]);
  assert.deepEqual(state, { 2: 0 });
  assert.deepEqual(updatePresence(state, faces), { 1: 0, 2: 0 });
});

test('elapsed time handles Philippine legacy dates, UTC, invalid and future input', () => {
  const now = Date.parse('2026-10-31T01:02:03Z');
  assert.equal(attendanceElapsed('2026-10-31T08:00:00', now), '1h 2m 3s');
  assert.equal(attendanceElapsed('2026-10-31T00:00:00Z', now), '1h 2m 3s');
  assert.equal(attendanceElapsed('2026-11-01T00:00:00Z', now), '0h 0m 0s');
  assert.equal(attendanceElapsed(null, now), '—');
  assert.equal(attendanceTimestamp('2026-10-31T00:00:00Z'), attendanceTimestamp('2026-10-31T08:00:00'));
  assert.match(attendanceTimestamp('2026-10-31T00:00:00Z'), /08:00:00/);
});
