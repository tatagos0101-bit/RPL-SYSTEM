import client from './client';

export const applyMembership = body => client.post('/api/membership/applications', body);
export const getApplications = (params, signal) => client.get('/api/librarian/applications', { params, signal });
export const reviewApplication = (id, body) => client.post(`/api/librarian/applications/${id}/review`, body);
export const getAccountability = (memberId, skip = 0, signal) => client.get(memberId
  ? `/api/librarian/users/${memberId}/accountability` : '/api/user/accountability', { params: { skip, limit: 25 }, signal });
export const recordAccountAction = (id, body) => client.post(`/api/librarian/users/${id}/actions`, body);
export const updateCopyCondition = (id, body) => client.put(`/api/inventory/book-copies/${id}/condition`, body);
export const accountReasons = { late_return: 'Late return', damaged_book: 'Damaged book', lost_book: 'Lost book',
  repeated_violations: 'Repeated violations', conduct: 'Library conduct', resolved: 'Issue resolved', librarian_review: 'Librarian review', other: 'Other' };
