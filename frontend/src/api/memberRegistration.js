export function buildMemberRegistrationForm(form, idFile = null) {
  const body = new FormData();
  body.append('name', form.name.trim());
  body.append('location', form.location.trim());
  if (form.email?.trim()) body.append('email', form.email.trim());
  if (idFile) body.append('id_image', idFile);
  return body;
}

export function registrationDeliveryNotice(result) {
  const delivery = result?.password_delivery;
  if (delivery?.status === 'accepted' && delivery.channel === 'email') {
    return { tone: 'success', temporaryPassword: null,
      title: 'Temporary password sent by email',
      message: 'Ask the member to check their inbox or spam folder for their sign-in details.' };
  }
  const password = typeof result?.temporary_password === 'string' && result.temporary_password ? result.temporary_password : null;
  return { tone: 'warning', temporaryPassword: password, title: 'Give sign-in details to the member',
    message: !password ? 'The account was created. If the member cannot sign in, use Reset Password from the member list.'
      : delivery?.channel === 'email' && delivery?.status === 'unavailable' ? 'Email sending is unavailable. The account was created; give these details directly to the member.'
        : delivery?.channel === 'email' && delivery?.status === 'failed' ? 'Email delivery could not be confirmed. The account was created; give these details directly to the member.'
          : 'Give this Member ID and temporary password directly to the member.' };
}

export function registrationErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    const message = detail.map(item => item.msg).filter(Boolean).join(', ');
    if (message) return message;
  }
  if (typeof detail === 'string' && detail) return detail;
  return 'Registration could not be confirmed. Check the member list before registering again.';
}
