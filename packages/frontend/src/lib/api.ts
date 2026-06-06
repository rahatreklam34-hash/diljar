import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

let accessToken: string | null = null;
let onAuthFail: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function setOnAuthFail(fn: () => void) {
  onAuthFail = fn;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post('/api/v1/auth/refresh', {}, { withCredentials: true })
      .then((r) => {
        accessToken = r.data.accessToken;
        return accessToken;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      const token = await tryRefresh();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (onAuthFail) onAuthFail();
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(e: any): string {
  const raw = e?.response?.data?.error || e?.message || 'Bir hata oluştu';
  // "TRIAL_LOCKED:..." gibi prefiksleri ayıkla
  if (typeof raw === 'string' && raw.includes(':')) {
    const [code, ...rest] = raw.split(':');
    if (code === 'TRIAL_LOCKED') return rest.join(':');
  }
  return raw;
}

export function isTrialLocked(e: any): boolean {
  const raw = e?.response?.data?.error;
  return typeof raw === 'string' && raw.startsWith('TRIAL_LOCKED');
}

export default api;
