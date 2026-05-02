import api from './apiClient';

export const listNotes  = (params = {}) => api.get('/notes/', { params }).then(r => r.data);
export const createNote = (data = {})   => api.post('/notes/', data).then(r => r.data);
export const updateNote = (id, data)    => api.patch(`/notes/${id}/`, data).then(r => r.data);
export const deleteNote = (id)          => api.delete(`/notes/${id}/`);
