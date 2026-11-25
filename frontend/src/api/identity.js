import client from './client';
import { prepareUploadForm } from './uploads';

export const identityError = error => typeof error.response?.data?.detail === 'string'
  ? error.response.data.detail : error.message || 'The ID check could not be completed. Please try again.';

export async function inspectIdentity(file) {
  const body = new FormData();
  body.set('id_image', file);
  const prepared = await prepareUploadForm(body, 'id_image', 'ids');
  const { data } = await client.post('/api/librarian/identity/inspect', prepared, { timeout: 90000 });
  return { ...data, prepared };
}

export const verifyMemberIdentity = (userId, body) =>
  client.post(`/api/librarian/users/${userId}/verify-identity`, body, { timeout: 90000 });


export { appendIdentityReview, idFileError, encodeComparisonId } from './identityForm';
