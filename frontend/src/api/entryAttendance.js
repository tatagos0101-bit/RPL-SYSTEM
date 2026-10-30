import { parseApiDateTime } from './dateTime.js';

// Two successful frames without a member re-arm their next encounter.
// Failed/dark/uncertain frames must not call this helper.
export function updatePresence(previous, faces) {
  const visible = new Set(faces.filter(face => face.matched).map(face => face.user_id));
  const next = {};
  for (const [id, misses] of Object.entries(previous)) {
    if (visible.has(Number(id))) next[id] = 0;
    else if (misses + 1 < 2) next[id] = misses + 1;
  }
  for (const id of visible) next[id] = 0;
  return next;
}

export function attendanceTimestamp(value) {
  const date = parseApiDateTime(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function attendanceElapsed(value, nowMs) {
  const start = parseApiDateTime(value).getTime();
  if (!Number.isFinite(start)) return '—';
  const seconds = Math.max(0, Math.floor((nowMs - start) / 1000));
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
}
