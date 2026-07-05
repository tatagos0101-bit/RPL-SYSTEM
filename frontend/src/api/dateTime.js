const PH_OFFSET = '+08:00';
const TIMEZONE_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/i;

export const parseApiDateTime = (value) => {
  if (!value) return new Date(NaN);
  const text = String(value);
  return new Date(TIMEZONE_SUFFIX_RE.test(text) ? text : `${text}${PH_OFFSET}`);
};

export const formatTimeLeft = (value, nowMs = Date.now()) => {
  const diff = parseApiDateTime(value).getTime() - nowMs;
  if (diff <= 0) return 'Expired';
  const hrs = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hrs > 0) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
};
