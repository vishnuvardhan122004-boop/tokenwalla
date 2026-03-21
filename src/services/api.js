// services/api.js
import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

const API = axios.create({ baseURL: BASE });

// ── Request: attach access token ──────────────────────────────────────────
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('access');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: auto-refresh on 401, but NOT for auth routes ───────────────
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Skip refresh logic entirely for any /auth/ endpoint.
    // This prevents an infinite loop when login itself returns 401
    // (wrong credentials) or when there is no session yet.
    const isAuthRoute = original?.url?.includes('/auth/');
    if (isAuthRoute) return Promise.reject(err);

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh');

      // No refresh token stored — send user to login directly
      if (!refresh) {
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(err);
      }

      try {
        const { data } = await axios.post(`${BASE}/auth/token/refresh/`, { refresh });
        localStorage.setItem('access', data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return API(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }

    return Promise.reject(err);
  }
);

export default API;