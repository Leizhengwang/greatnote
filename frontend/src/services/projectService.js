import apiClient from './apiClient';

export function analyzeProjects(noteIds) {
  return apiClient.post('/notes/project-tracker/', { note_ids: noteIds }).then(r => r.data);
}
