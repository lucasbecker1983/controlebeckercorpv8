import axios from 'axios';

const fallbackBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:6778';
let authInvalidated = false;
const readAccessToken = () => (typeof window === 'undefined' ? '' : String(localStorage.getItem('becker_token') || ''));
const isAuthRoute = (requestUrl = '') => (
    requestUrl.includes('/api/auth/login')
    || requestUrl.includes('/api/auth/logout')
);

const redirectToLogin = () => {
    if (typeof window === 'undefined') return;
    if (authInvalidated) return;
    authInvalidated = true;
    localStorage.removeItem('becker_token');
    localStorage.removeItem('becker_user');
    window.dispatchEvent(new CustomEvent('sgcg:auth-invalid'));
    if (window.location.pathname !== '/') {
        window.location.href = '/';
    }
};

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || fallbackBaseUrl,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

const shouldSkipRefresh = (requestUrl = '') => isAuthRoute(requestUrl);

api.interceptors.request.use((config) => {
    const requestUrl = String(config?.url || '');
    if (authInvalidated && !isAuthRoute(requestUrl)) {
        return Promise.reject(new axios.Cancel('Sessão invalidada.'));
    }
    const token = readAccessToken();
    if (token && !isAuthRoute(requestUrl)) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error?.config || {};
        const requestUrl = String(originalRequest.url || '');
        if (axios.isCancel(error) || error?.response?.status !== 401 || shouldSkipRefresh(requestUrl)) {
            return Promise.reject(error);
        }
        redirectToLogin();
        return Promise.reject(error);
    },
);

export const resetAuthInvalidation = () => {
    authInvalidated = false;
};
