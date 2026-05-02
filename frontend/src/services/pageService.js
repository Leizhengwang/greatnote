import api from './apiClient';

export const listPages   = (noteId) =>
  api.get(`/notes/${noteId}/pages/`).then(r => r.data);

export const insertPage  = (noteId, afterPageId = null) =>
  api.post(`/notes/${noteId}/pages/`, { after_page_id: afterPageId }).then(r => r.data);

export const updatePage  = (noteId, pageId, body) =>
  api.patch(`/notes/${noteId}/pages/${pageId}/`, { body }).then(r => r.data);

export const deletePage  = (noteId, pageId) =>
  api.delete(`/notes/${noteId}/pages/${pageId}/`);
