export function overdueEmailOutcome(data) {
  if (data?.status === 'accepted') return { status: 'accepted', message: data.message || 'Overdue email submitted. Inbox delivery is not guaranteed.' };
  if (data?.status === 'failed') return { status: 'failed', message: data.message || 'The email was not accepted. Please try again later.' };
  return { status: 'unknown', message: data?.status === 'unknown' && data.message ? data.message : 'The email outcome could not be confirmed. Check the previous send before trying again.' };
}

export function overdueEmailError(error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (status >= 400 && status < 500) {
    return { status: status === 429 ? 'recent' : 'failed', message: typeof detail === 'string' ? detail : 'The reminder could not be submitted. Refresh the loan and saved email details.' };
  }
  return { status: 'unknown', message: 'Could not confirm whether the email was submitted. Check the member’s inbox or email-provider records before sending again.' };
}
