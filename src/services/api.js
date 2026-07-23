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

// ── Single-flight token refresh ───────────────────────────────────────────────
// The backend rotates refresh tokens and blacklists the old one on every use
// (ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION). If several requests 401 at
// the same time (the dashboards fire many parallel calls), each firing its own
// refresh would burn the same refresh token — the first call rotates it, the
// rest hit a now-blacklisted token and get logged out. So we share ONE in-flight
// refresh: the first 401 performs it, every concurrent 401 awaits the same
// promise and then retries with the freshly issued access token.
let refreshPromise = null;

function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const refresh = localStorage.getItem('refresh');
  if (!refresh) return Promise.reject(new Error('No refresh token'));

  // Use a bare axios instance (not API) to avoid interceptor recursion.
  refreshPromise = axios
    .post(
      `${BASE}/auth/token/refresh/`,
      { refresh },
      { headers: { 'Content-Type': 'application/json' } }
    )
    .then(({ data }) => {
      localStorage.setItem('access', data.access);
      if (data.refresh) localStorage.setItem('refresh', data.refresh);
      return data.access;
    })
    .finally(() => {
      // Clear so the NEXT expiry starts a fresh single-flight refresh.
      refreshPromise = null;
    });

  return refreshPromise;
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

      try {
        const access = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${access}`;
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