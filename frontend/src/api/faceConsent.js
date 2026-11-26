const FACE_CONSENT_VERSION = '2026-11-26';

export const buildFaceEnrollment = (imageBase64, acceptFaceRecognition) => ({
  image: imageBase64,
  accept_face_recognition: acceptFaceRecognition,
  face_consent_version: FACE_CONSENT_VERSION,
});

export function faceEnrollmentSupportDetails(diagnostic) {
  if (diagnostic?.model !== 'sface_2021dec_int8' || diagnostic.metric !== 'cosine_distance'
      || !['live_alignment', 'live_to_saved', 'live_to_id'].includes(diagnostic.stage)) return '';
  const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10_000_000;
  const lines = ['RPL-ID-FACE-DIAG/1', `model=${diagnostic.model}`, `stage=${diagnostic.stage}`, 'metric=cosine_distance'];
  if (diagnostic.preprocessing === 'face_scale_160_lanczos_v1') lines.push(`preprocessing=${diagnostic.preprocessing}`);
  if (['not_found', 'multiple_faces', 'invalid_detection', 'different_face', 'invalid_landmarks'].includes(diagnostic.detector_issue)) {
    lines.push(`detector_issue=${diagnostic.detector_issue}`);
  }
  if (numeric(diagnostic.maximum_distance)) lines.push(`maximum_distance=${diagnostic.maximum_distance.toFixed(4)}`);
  for (const name of ['id_to_saved', 'live_to_saved', 'live_to_id']) {
    const value = diagnostic.distances?.[name];
    if (numeric(value) && value <= 2) lines.push(`${name}=${value.toFixed(4)}`);
  }
  for (const name of ['uploaded_id', 'saved_id', 'live']) {
    for (const field of ['width_px', 'height_px', 'brightness', 'contrast', 'sharpness']) {
      const value = diagnostic.quality?.[name]?.[field];
      if (numeric(value)) lines.push(`${name}.${field}=${value}`);
    }
  }
  return lines.join('\n');
}
