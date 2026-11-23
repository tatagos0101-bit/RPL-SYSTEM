// Camera pixels stay in memory only and are never resized to the preview's width.
export const ENTRY_CAMERA_CONSTRAINTS = {
  width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user',
};
export const MAX_CAPTURE_PIXELS = 3_800_000;
export const MAX_CAPTURE_EDGE = 2560;
export const MAX_FRAME_AGE_MS = 240;
export const MAX_IMAGE_CHARACTERS = 2_500_000;

export function entryCaptureDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(width, height), Math.sqrt(MAX_CAPTURE_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export function measureFrameDetail(rgba, width, height) {
  if (width < 3 || height < 3 || rgba.length !== width * height * 4) return { score: 0, brightness: 0 };
  const gray = new Float32Array(width * height);
  let brightness = 0;
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    gray[index] = .299 * rgba[offset] + .587 * rgba[offset + 1] + .114 * rgba[offset + 2];
    brightness += gray[index];
  }
  brightness /= gray.length;
  let energy = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const laplacian = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
    energy += laplacian * laplacian;
  }
  // Selection only: every submitted frame still undergoes server verification.
  const exposure = Math.min(1, brightness / 80, (255 - brightness) / 40);
  return { score: energy / ((width - 2) * (height - 2)) * Math.max(0, exposure), brightness };
}

export function preferCurrentFrame(best, current, now) {
  return !best || now - best.capturedAt >= MAX_FRAME_AGE_MS || current.score >= best.score;
}

export function readEntryDiagnostics(headers, roundTripMs) {
  const read = name => headers?.get?.(name) ?? headers?.[name];
  const numeric = name => {
    const raw = read(name);
    const value = raw == null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  };
  const total = /(?:^|,)\s*total;dur=(\d+(?:\.\d+)?)(?:,|$)/.exec(read('server-timing') || '');
  return {
    frameWidth: numeric('x-entry-frame-width'), frameHeight: numeric('x-entry-frame-height'),
    minFacePixels: numeric('x-entry-min-face-pixels'),
    serverMs: total ? Math.round(Number(total[1])) : null,
    roundTripMs: Number.isFinite(roundTripMs) ? Math.max(0, Math.round(roundTripMs)) : null,
  };
}

export function createEntryFrameSampler(getVideo, { canvas = () => document.createElement('canvas'), now = () => performance.now() } = {}) {
  let analysis = canvas();
  let selected = canvas();
  let best = null;
  let sampleSize = null;
  let lastVideoTime = -1;
  analysis.width = 160; analysis.height = 90;
  const analysisContext = analysis.getContext('2d', { willReadFrequently: true });
  const captureContext = selected.getContext('2d');
  function sample() {
    const video = getVideo();
    if (!analysis || !video || video.readyState < 2 || video.currentTime === lastVideoTime) return false;
    const size = entryCaptureDimensions(video.videoWidth, video.videoHeight);
    if (!size || !analysisContext || !captureContext) return false;
    lastVideoTime = video.currentTime;
    const started = now();
    analysisContext.drawImage(video, 0, 0, 160, 90);
    const detail = measureFrameDetail(analysisContext.getImageData(0, 0, 160, 90).data, 160, 90);
    if (!sampleSize || size.width !== sampleSize.width || size.height !== sampleSize.height) {
      selected.width = size.width; selected.height = size.height;
      sampleSize = size; best = null;
    }
    const current = { ...detail, capturedAt: started, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, ...size };
    if (preferCurrentFrame(best, current, started)) {
      captureContext.drawImage(video, 0, 0, size.width, size.height);
      best = current;
    }
    return true;
  }
  function take() {
    sample();
    if (!selected || !best || now() - best.capturedAt > MAX_FRAME_AGE_MS) return null;
    const started = now();
    for (const quality of [.86, .76, .66, .56]) {
      const image = selected.toDataURL('image/jpeg', quality);
      if (image.startsWith('data:image/jpeg;') && image.length <= MAX_IMAGE_CHARACTERS) {
        return { image, ...best, ageMs: Math.max(0, Math.round(started - best.capturedAt)), encodeMs: Math.max(0, Math.round(now() - started)) };
      }
    }
    return null;
  }
  function clear() {
    if (analysis) { analysis.width = analysis.height = 0; }
    if (selected) { selected.width = selected.height = 0; }
    analysis = selected = best = sampleSize = null;
  }
  return { sample, take, clear };
}
