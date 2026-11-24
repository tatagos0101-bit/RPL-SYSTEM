import { PRIVACY_NOTICE_VERSION } from './privacyPolicy.js';

export const passwordPolicyMessage = 'Use 8–128 characters, including at least one digit.';
export const isValidNewPassword = (value) => [...value].length >= 8 && [...value].length <= 128 && /\p{Nd}/u.test(value);

export const buildPasswordChangeRequest = (currentPassword, newPassword, { acceptPrivacyPolicy } = {}) => ({
  ...(currentPassword == null ? {} : { current_password: currentPassword }),
  new_password: newPassword,
  ...(acceptPrivacyPolicy === true ? {
    accept_privacy_policy: true,
    privacy_policy_version: PRIVACY_NOTICE_VERSION,
  } : {}),
});
