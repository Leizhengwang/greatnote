import apiClient from './apiClient';

export function reviseText(noteId, pageId, action, text) {
  return apiClient
    .post(`/notes/${noteId}/pages/${pageId}/ai-revise/`, { action, text })
    .then(res => res.data);
}
