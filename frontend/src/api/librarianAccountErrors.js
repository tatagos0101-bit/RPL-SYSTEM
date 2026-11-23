export function staffAccountError(error) {
  if (!error.response || error.response.status >= 500) {
    return 'The result could not be confirmed. Refresh the librarian list and check the email address before trying again.';
  }
  if (error.response.status === 429) return 'Too many attempts. Please wait a minute before trying again.';
  const detail = error.response.data?.detail;
  return typeof detail === 'string' ? detail : 'Check the name, email address and your current password.';
}
