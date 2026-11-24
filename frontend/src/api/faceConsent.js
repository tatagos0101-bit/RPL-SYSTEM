const FACE_CONSENT_VERSION = '2026-11-24';

export const buildFaceEnrollment = (imageBase64, acceptFaceRecognition) => ({
  image: imageBase64,
  accept_face_recognition: acceptFaceRecognition,
  face_consent_version: FACE_CONSENT_VERSION,
});
