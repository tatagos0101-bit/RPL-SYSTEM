export const PROFILE_UPDATED = 'rpl-profile-updated';
export const PROFILE_REVISION_KEY = 'rpl-profile-revision';

export function publishProfileUpdate(patch) {
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED, { detail: patch }));
  // Other tabs re-fetch through the authenticated API. Never store signed URLs.
  try { localStorage.setItem(PROFILE_REVISION_KEY, `${Date.now()}-${Math.random()}`); }
  catch { /* Same-tab updates still work when storage is unavailable. */ }
}

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export function avatarFileError(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Choose a JPG, PNG or WebP image.';
  }
  if (!file.size || file.size > AVATAR_MAX_BYTES) return 'Choose an image up to 5 MB.';
  return '';
}
