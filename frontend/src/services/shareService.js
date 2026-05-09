import api from './apiClient';

export const getPublicShare = (noteId, pageId) =>
  api.get(`/notes/${noteId}/pages/${pageId}/share/public/`).then(r => r.data);

export const createPublicShare = (noteId, pageId) =>
  api.post(`/notes/${noteId}/pages/${pageId}/share/public/`).then(r => r.data);

export const revokePublicShare = (noteId, pageId) =>
  api.delete(`/notes/${noteId}/pages/${pageId}/share/public/`);

export const listUserShares = (noteId, pageId) =>
  api.get(`/notes/${noteId}/pages/${pageId}/share/users/`).then(r => r.data);

export const shareWithUser = (noteId, pageId, username) =>
  api.post(`/notes/${noteId}/pages/${pageId}/share/users/`, { username }).then(r => r.data);

export const revokeUserShare = (noteId, pageId, sharedUserId) =>
  api.delete(`/notes/${noteId}/pages/${pageId}/share/users/${sharedUserId}/`);

export const getSharedPage = (token) =>
  api.get(`/shared/${token}/`).then(r => r.data);
