import { ENTRY_SCAN_INTERVAL_MS, entryStationRetryDelay } from './entryStationState.js';

const retryMessage = message => ({
  too_dark: 'Too dark. Improve the lighting. Scanning will retry automatically.',
  too_far: 'Move closer to the camera. Scanning will retry automatically.',
  no_face: 'No face detected. Face the camera. Scanning will retry automatically.',
  multiple_faces: 'More than one face detected. One member at a time, please. Scanning will retry automatically.',
  not_recognized: 'Face not recognized. Face the camera in good lighting. Scanning will retry automatically.',
  'Spoofing Detected': 'Live face not confirmed. Use the camera directly, without a photo or screen. Scanning will retry automatically.',
  liveness_uncertain: 'Live face not confirmed. Face the camera in even lighting. Scanning will retry automatically.',
})[message] || (typeof message === 'string' && message.includes(' ')
  ? `${message} Scanning will retry automatically.`
  : 'Face not recognized. Scanning will retry automatically, or use email or Member ID instead.');

// A new frame is scheduled only after the previous request finishes. Stopping
// aborts that request and prevents late responses from selecting a member.
export function startAutomaticFaceScan({ capture, lookup, onStatus, onMatch, purpose = 'circulation',
  setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  let stopped = false;
  let timer;
  let controller;
  const stop = () => {
    stopped = true;
    clearTimer(timer);
    controller?.abort();
  };
  const scan = async () => {
    if (stopped) return;
    let delay = ENTRY_SCAN_INTERVAL_MS;
    try {
      const image = capture();
      if (!image) {
        delay = 500;
        onStatus({ phase: 'starting', message: 'Starting camera… Please wait.' });
        return;
      }
      controller = new AbortController();
      onStatus({ phase: 'scanning', message: purpose === 'login' ? 'Scanning… Face the camera in even lighting.' : 'Scanning… Keep the member facing the camera.' });
      const started = now();
      const { data } = await lookup(image, { signal: controller.signal });
      if (stopped) return;
      delay = Math.max(0, ENTRY_SCAN_INTERVAL_MS - Math.max(0, now() - started));
      if (data?.matched === true) {
        stop();
        onStatus({ phase: 'recognized', message: purpose === 'login' ? 'Face recognized.' : 'Member recognized. Loading their books…' });
        onMatch(data);
        return;
      }
      onStatus({ phase: 'retry', reason: data?.message, message: retryMessage(data?.message) });
      if (data?.message === 'Spoofing Detected' && purpose !== 'login') delay = 5000;
    } catch (error) {
      if (stopped) return;
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;
      if (purpose === 'login' && status === 403 && detail?.code === 'member_setup_required') {
        stop();
        onStatus({ phase: 'error', reason: detail.code, message: detail.message });
      } else if ([401, 403].includes(status)) {
        stop();
        onStatus({ phase: 'error', message: purpose === 'login'
          ? 'Face sign-in could not be completed. Please use password sign-in.'
          : 'Your librarian session is unavailable. Close this dialog and sign in again.' });
      } else if ([400, 413, 422].includes(status)) {
        stop();
        onStatus({ phase: 'error', message: 'This camera image could not be processed. Use email or Member ID instead.' });
      } else {
        // Reuse the entrance scanner's conservative Retry-After/backoff policy.
        delay = entryStationRetryDelay(error);
        onStatus({ phase: 'retry', message: status === 429
          ? 'Too many scan requests. Waiting before retrying automatically. You can use email or Member ID instead.'
          : 'Face scanning is temporarily unavailable. Retrying automatically, or use email or Member ID instead.' });
      }
    } finally {
      controller = null;
      if (!stopped) timer = setTimer(scan, delay);
    }
  };
  timer = setTimer(scan, 0);
  return { stop };
}

export const startCirculationFaceScan = startAutomaticFaceScan;
