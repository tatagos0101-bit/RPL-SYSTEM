export function loginErrorMessage(error) {
  const status = error?.response?.status;

  if (status === 429) {
    return 'Too many sign-in attempts. Please wait a minute and try again.';
  }
  if (status >= 500) {
    return 'The sign-in service is temporarily unavailable. Please try again shortly.';
  }
  if (['QuotaExceededError', 'SecurityError'].includes(error?.name)) {
    return 'Your browser could not save your sign-in. Allow site storage and try again.';
  }
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    return 'The sign-in request took too long. Please try again.';
  }

  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (status === 422) {
    return 'Check your email or Member ID and password, then try again.';
  }
  if (!error?.response) {
    return 'The library server could not be reached. Check your connection and try again.';
  }

  return 'Sign-in could not be completed. Please try again.';
}
