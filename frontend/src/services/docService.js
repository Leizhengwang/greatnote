import apiClient from './apiClient';

export function rankNotes(noteIds, criteria) {
  return apiClient.post('/notes/ranking/', { note_ids: noteIds, criteria }).then(r => r.data);
}
