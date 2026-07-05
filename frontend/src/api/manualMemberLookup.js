const normalize = (value) => String(value ?? '').trim().toLowerCase();
const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

export const findManualMemberMatch = (members, identifier) => {
  const needle = normalize(identifier);
  const needleDigits = digitsOnly(identifier);

  if (!needle) return null;

  return members.find((member) => {
    const memberId = normalize(member?.member_id);
    const email = normalize(member?.email);
    const phoneDigits = digitsOnly(member?.phone);

    return (
      memberId === needle ||
      email === needle ||
      (needleDigits && phoneDigits === needleDigits) ||
      String(member?.id ?? '') === needle
    );
  }) || null;
};

export const memberToSessionIdentity = (member) => ({
  user_id: member.id,
  name: member.name,
  member_id: member.member_id,
  role: 'member',
  active_loans: member.active_loans ?? 0,
});
