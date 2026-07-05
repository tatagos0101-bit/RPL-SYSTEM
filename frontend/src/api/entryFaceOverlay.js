const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

const pct = (value) => `${Number((value * 100).toFixed(3))}%`;

export function faceBoxToStyle(faceBox) {
  if (!faceBox) {
    return { top: '0%', left: '0%', width: '0%', height: '0%' };
  }

  const top = clamp(faceBox.top);
  const left = clamp(faceBox.left);
  const width = clamp(faceBox.width, 0, 1 - left);
  const height = clamp(faceBox.height, 0, 1 - top);

  return {
    top: pct(top),
    left: pct(left),
    width: pct(width),
    height: pct(height),
  };
}

export function summarizeFaceResults(data) {
  const faces = Array.isArray(data?.faces) && data.faces.length > 0
    ? data.faces
    : data?.face_box
      ? [data]
      : [];

  return faces
    .filter((face) => face?.face_box)
    .map((face, index) => {
      const matched = Boolean(face.matched);
      return {
        ...face,
        key: `${matched ? face.user_id ?? 'matched' : 'unknown'}-${index}`,
        label: matched ? (face.name || 'Member') : 'Unknown',
        subLabel: matched ? (face.member_id || '') : 'Not enrolled',
      };
    });
}
