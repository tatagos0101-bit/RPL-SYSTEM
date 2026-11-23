const normalize = (value) => String(value ?? '').trim().toLowerCase();

export const findManualMemberMatch = (members, identifier) => {
  const needle = normalize(identifier);

  if (!needle) return null;

  return members.find((member) => {
    const memberId = normalize(member?.member_id);
    const email = normalize(member?.email);

    return (
      memberId === needle ||
      email === needle ||
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
