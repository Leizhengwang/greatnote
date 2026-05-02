import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:8000/api' });
const TOKEN_KEY = 'greatnote_token';
const USERNAME_KEY = 'greatnote_username';

export const getToken    = () => localStorage.getItem(TOKEN_KEY);
export const getUsername = () => localStorage.getItem(USERNAME_KEY);

const setSession = ({ token, username }) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
};

export const register = (username, password) =>
  api.post('/auth/register/', { username, password }).then(r => {
    setSession(r.data);
    return r.data;
  });

export const login = (username, password) =>
  api.post('/auth/login/', { username, password }).then(r => {
    setSession(r.data);
    return r.data;
  });

export const logout = () => {
  const token = getToken();
  const req = token
    ? api.post('/auth/logout/', null, { headers: { Authorization: `Token ${token}` } })
    : Promise.resolve();
  return req.finally(clearSession);
};
