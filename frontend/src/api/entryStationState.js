export const shouldLoadEntryStationLogsOnMount = (stationPin) =>
  Boolean(String(stationPin || '').trim());

export const isQuietWalkThroughMessage = (message) =>
  ['no_face', 'too_far'].includes(message);
