import client from './client';

export const lookupCirculation = (code, mode) => client.get('/api/transactions/scan', { params: { code, mode } });
export const circulationStatus = requestId => client.get(`/api/transactions/write-requests/${requestId}`);
export const sendCirculation = ({ operation, payload, requestId }) => client.post(
  `/api/transactions/${operation}`, payload, { headers: { 'Idempotency-Key': requestId } },
);
