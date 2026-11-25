const FACE_CONSENT_VERSION = '2026-11-25';

export const buildFaceEnrollment = (imageBase64, acceptFaceRecognition, idImage) => ({
  image: imageBase64,
  accept_face_recognition: acceptFaceRecognition,
  face_consent_version: FACE_CONSENT_VERSION,
  ...(idImage ? { id_image: idImage } : {}),
});
