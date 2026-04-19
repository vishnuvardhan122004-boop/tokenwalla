import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';

const API = axios.create({ baseURL: BASE });

// ── Request: attach access token ──────────────────────────────────────────────
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('access');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Routes that must NEVER trigger a token-refresh loop ───────────────────────
// Pattern-matched against the request URL (relative to BASE).
const SKIP_REFRESH_PATTERNS = [
  '/auth/login/',
  '/auth/register/',
  '/auth/token/refresh/',
  '/auth/otp/',
  '/auth/reset-password/',
  '/hospitals/login/',
  '/hospitals/register/',
  '/hospitals/reset-password/',
];

function shouldSkipRefresh(url = '') {
  return SKIP_REFRESH_PATTERNS.some((p) => url.includes(p));
}

// ── Decide where to redirect an unauthenticated user ─────────────────────────
function getLoginPath() {
  const path = window.location.pathname;
  if (path.startsWith('/Hdashboard') || path.startsWith('/Hlogin')) return '/Hlogin';
  if (path.startsWith('/Adashboard') || path.startsWith('/2004'))   return '/2004';
  return '/login';
}

// ── Response: auto-refresh on 401, then redirect on failure ──────────────────
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (shouldSkipRefresh(original?.url)) {
      return Promise.reject(err);
    }

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh');

      if (!refresh) {
        clearSessionAndRedirect();
        return Promise.reject(err);
      }

      try {
        // Use a fresh axios instance (not API) to avoid interceptor loops
        const { data } = await axios.post(
          `${BASE}/auth/token/refresh/`,
          { refresh },
          { headers: { 'Content-Type': 'application/json' } }
        );
        localStorage.setItem('access', data.access);
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
  window.location.href = getLoginPath();
}

/**
 * Call on logout button clicks.
 * Blacklists the refresh token server-side, then clears localStorage.
 */
export async function logoutUser() {
  const refresh = localStorage.getItem('refresh');
  try {
    if (refresh) {
      await API.post('/auth/logout/', { refresh });
    }
  } catch {
    // Ignore server errors — still clear session locally
  } finally {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    window.location.href = '/';
  }
}

export default API;