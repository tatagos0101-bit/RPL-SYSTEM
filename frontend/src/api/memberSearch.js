const normalize = (value) => String(value ?? '').toLowerCase();

export const memberMatchesSearch = (member, search) => {
  const needle = normalize(search).trim();
  if (!needle) return true;

  return [
    member?.name,
    member?.member_id,
    member?.email,
  ].some((value) => normalize(value).includes(needle));
};
