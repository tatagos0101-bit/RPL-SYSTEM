export function buildMemberRegistrationForm(form, idFile = null) {
  const body = new FormData();
  body.append('name', form.name.trim());
  body.append('location', form.location.trim());
  if (form.email?.trim()) body.append('email', form.email.trim());
  if (form.phone?.trim()) body.append('phone', form.phone.trim());
  if (idFile) body.append('id_image', idFile);
  return body;
}

export function registrationDeliveryNotice(result) {
  const delivery = result?.password_delivery;
  if (delivery?.status === 'accepted' && ['email', 'sms'].includes(delivery.channel)) {
    return { tone: 'success', temporaryPassword: null,
      title: delivery.channel === 'email' ? 'Temporary password sent by email' : 'Temporary password sent by text',
      message: delivery.channel === 'email'
        ? 'Ask the member to check their inbox or spam folder for their sign-in details.'
        : 'Ask the member to check their phone for their sign-in details.' };
  }
  const password = typeof result?.temporary_password === 'string' && result.temporary_password ? result.temporary_password : null;
  const channel = delivery?.channel === 'email' ? 'Email' : 'Text-message';
  return { tone: 'warning', temporaryPassword: password, title: 'Give sign-in details to the member',
    message: !password ? 'The account was created. If the member cannot sign in, use Reset Password from the member list.'
      : delivery?.status === 'unavailable' ? `${channel} sending is unavailable. The account was created; give these details directly to the member.`
        : delivery?.status === 'failed' ? `${channel} delivery could not be confirmed. The account was created; give these details directly to the member.`
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
