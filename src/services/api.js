import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

const API = axios.create({ baseURL: BASE });

// ── Request: attach access token ──────────────────────────────────────────
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('access');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response: auto-refresh on 401, skip auth routes ───────────────────────
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original     = err.config;
    const isAuthRoute  = original?.url?.includes('/auth/');
    if (isAuthRoute) return Promise.reject(err);

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh   = localStorage.getItem('refresh');

      if (!refresh) {
        clearSessionAndRedirect();
        return Promise.reject(err);
      }

      try {
        const { data } = await axios.post(`${BASE}/auth/token/refresh/`, { refresh });
        localStorage.setItem('access', data.access);
        // Simplejwt ROTATE_REFRESH_TOKENS sends new refresh too
        if (data.refresh) localStorage.setItem('refresh', data.refresh);
        original.headers.Authorization = `Bearer ${data.access}`;
        return API(original);
      } catch {
        clearSessionAndRedirect();
      }
    }

    return Promise.reject(err);
  }
);

function clearSessionAndRedirect() {
  localStorage.removeItem('access');
  localStorage.removeItem('refresh');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

/** Call this on logout button clicks — blacklists the refresh token server-side */
export async function logoutUser() {
  const refresh = localStorage.getItem('refresh');
  try {
    if (refresh) {
      await API.post('/auth/logout/', { refresh });
    }
  } catch {
    // Ignore — still clear session locally
  } finally {
    clearSessionAndRedirect();
  }
}

export default API;