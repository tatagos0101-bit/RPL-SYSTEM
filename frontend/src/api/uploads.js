import client from './client';

// Large files go straight to Storage; the API receives an owner-bound ticket.
export async function prepareUploadForm(formData, field, category) {
  const file = formData.get(field);
  if (!(file instanceof File)) return formData;
  const { data } = await client.post('/api/uploads/prepare', {
    category, filename: file.name, size: file.size,
  });
  if (!data.direct) return formData;
  const response = await fetch(data.upload_url, {
    method: 'PUT', body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error('File upload failed. Please try again.');
  const prepared = new FormData();
  for (const [name, value] of formData) {
    if (name !== field) prepared.append(name, value);
  }
  prepared.set('upload_ticket', data.upload_ticket);
  return prepared;
}
