import client from './client';
import { prepareUploadForm } from './uploads';

export const identityError = error => typeof error.response?.data?.detail === 'string'
  ? error.response.data.detail : error.message || 'The ID check could not be completed. Please try again.';

export async function inspectIdentity(file, manualReview = null) {
  const body = new FormData();
  body.set('id_image', file);
  const prepared = await prepareUploadForm(body, 'id_image', 'ids');
  // Passwords stay request-local and are never returned with the upload proof.
  const request = new FormData();
  for (const [key, value] of prepared) request.set(key, value);
  if (manualReview) {
    request.set('manual_review', 'true');
    request.set('document_type', manualReview.documentType);
    request.set('current_password', manualReview.password);
  }
  const { data } = await client.post('/api/librarian/identity/inspect', request, { timeout: 90000 });
  return { ...data, prepared };
}

export const verifyMemberIdentity = (userId, body) =>
  client.post(`/api/librarian/users/${userId}/verify-identity`, body, { timeout: 90000 });


export { appendIdentityReview, idFileError, encodeComparisonId } from './identityForm';
