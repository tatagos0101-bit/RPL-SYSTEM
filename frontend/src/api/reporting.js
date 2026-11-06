import client from './client';
export const getReportingMetadata = signal => client.get('/api/reporting/metadata', { signal }).then(r => r.data);
export const getAnalytics = (filters, signal) => client.post('/api/reporting/dashboard', filters, { signal }).then(r => r.data);
export const queryReport = (body, signal) => client.post('/api/reporting/query', body, { signal }).then(r => r.data);
export const exportReport = (body, signal) => client.post('/api/reporting/export', body, { signal, responseType: 'blob', timeout: 120000 });
export const getAcquisition = id => client.get(`/api/reporting/acquisitions/${id}`).then(r => r.data);
export const saveAcquisition = body => client.put(`/api/reporting/acquisitions/${body.copy_id}`, body).then(r => r.data);
export const previewAcquisitions = file => { const body = new FormData(); body.append('file', file); return client.post('/api/reporting/acquisitions/import-preview', body).then(r => r.data); };
export const applyAcquisitions = body => client.post('/api/reporting/acquisitions/import-apply', body).then(r => r.data);
export async function reportError(error) {
  let data = error?.response?.data;
  if (data instanceof Blob) { try { data = JSON.parse(await data.text()); } catch { data = null; } }
  const detail = data?.detail;
  return Array.isArray(detail) ? detail.map(item => item.msg).join('; ') : detail || error.message || 'Unable to load this report. Please retry.';
}
export function downloadReport(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
