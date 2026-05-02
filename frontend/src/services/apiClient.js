import axios from 'axios';
import { getToken, clearSession } from './authService';

const apiClient = axios.create({ baseURL: 'http://localhost:8000/api' });

apiClient.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      clearSession();
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export default apiClient;
