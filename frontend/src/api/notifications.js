import client from './client';
import { notificationBase } from './notificationLinks';

const apiBase = role => `/api/${notificationBase(role).slice(1)}`;
export const listNotifications = (role, params, signal) => client.get(apiBase(role), { params, signal });
export const getNotification = (role, id, signal) => {
  if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
    return Promise.reject({ response: { status: 404 } });
  }
  return client.get(`${apiBase(role)}/${id}`, { signal });
};
export const readNotification = (role, id, signal) => client.request({
  method: role === 'librarian' ? 'patch' : 'post', url: `${apiBase(role)}/${id}/read`, signal,
});
export const readAllNotifications = role => client.post(`${apiBase(role)}/read-all`);
