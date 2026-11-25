export function appendIdentityReview(body, document, checked) {
  if (!document?.review_token) throw new Error('Upload and check the required photo ID first.');
  for (const [key, value] of document.prepared) body.set(key, value);
  body.set('id_review_token', document.review_token);
  body.set('identity_checked', String(Boolean(checked)));
  return body;
}

export function idFileError(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG or WEBP photo of the ID. PDFs cannot be compared.';
  if (!file.size || file.size > 10 * 1024 * 1024) return 'Use an ID photo under 10 MB.';
  return '';
}

// Remote comparison files never go to Storage or browser persistence.
export async function encodeComparisonId(file) {
  const validation = idFileError(file);
  if (validation) throw new Error(validation);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('This photo could not be opened.')); image.src = url; });
    if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error('Use a photo of 16 megapixels or less.');
    if (Math.min(image.naturalWidth, image.naturalHeight) < 320 || Math.max(image.naturalWidth, image.naturalHeight) < 600) throw new Error('Use a larger, clear photo of the entire ID.');
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7]) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (encoded.length <= 1_600_000) return encoded;
    }
    throw new Error('This photo is too large after preparation. Take a clear photo of just the ID.');
  } finally { URL.revokeObjectURL(url); }
}
