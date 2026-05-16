import api from './apiClient';
import { getToken } from './authService';

export const listAttachments = (noteId, pageId) =>
  api.get(`/notes/${noteId}/pages/${pageId}/attachments/`).then(r => r.data);

export const uploadAttachment = (noteId, pageId, file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/notes/${noteId}/pages/${pageId}/attachments/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
      ? e => onProgress(Math.round((e.loaded * 100) / e.total))
      : undefined,
  }).then(r => r.data);
};

export const deleteAttachment = (noteId, pageId, attachmentId) =>
  api.delete(`/notes/${noteId}/pages/${pageId}/attachments/${attachmentId}/`);

export const downloadAttachment = async (noteId, pageId, attachmentId, filename) => {
  const token = getToken();
  const response = await fetch(
    `http://localhost:8000/api/notes/${noteId}/pages/${pageId}/attachments/${attachmentId}/`,
    { headers: { Authorization: `Token ${token}` } },
  );
  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
