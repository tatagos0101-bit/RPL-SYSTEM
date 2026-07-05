export const PASSWORD_RESET_REQUEST_PATH = '/api/auth/password-reset/request';
export const PASSWORD_RESET_CONFIRM_PATH = '/api/auth/password-reset/confirm';

export const buildPasswordResetRequest = (identifier, channel = 'auto') => {
  const payload = { identifier: identifier.trim() };

  if (channel && channel !== 'auto') {
    payload.channel = channel;
  }

  return payload;
};

export const buildPasswordResetConfirm = (identifier, code, newPassword) => ({
  identifier: identifier.trim(),
  code: code.trim(),
  new_password: newPassword,
});

export const resetMemberPasswordPath = (userId) =>
  `/api/librarian/users/${userId}/reset-password`;
