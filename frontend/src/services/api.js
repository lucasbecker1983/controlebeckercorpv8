import axios from 'axios';
import {
    invalidateSession,
    isSessionInvalidated,
    readStoredAccessToken,
    refreshAccessToken,
    resetSessionInvalidation,
} from './authSession';

const fallbackBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:6778';
const isAuthRoute = (requestUrl = '') => (
    requestUrl.includes('/api/auth/login')
    || requestUrl.includes('/api/auth/refresh')
    || requestUrl.includes('/api/auth/logout')
);
const isPublicRoute = (requestUrl = '') => (
    isAuthRoute(requestUrl)
    || requestUrl.includes('/api/hotspot/public/')
    || requestUrl.includes('/api/collaborators/public/')
    || requestUrl.includes('/api/support/public/')
);

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || fallbackBaseUrl,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

const shouldSkipRefresh = (requestUrl = '') => isPublicRoute(requestUrl);

api.interceptors.request.use((config) => {
    const requestUrl = String(config?.url || '');
    if (isSessionInvalidated() && !isPublicRoute(requestUrl)) {
        return Promise.reject(new axios.Cancel('Sessão invalidada.'));
    }
    const token = readStoredAccessToken();
    if (token && !isPublicRoute(requestUrl)) {
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

        if (originalRequest._sgcgRetry) {
            invalidateSession();
            return Promise.reject(error);
        }

        originalRequest._sgcgRetry = true;
        const nextToken = await refreshAccessToken();
        if (!nextToken) {
            return Promise.reject(error);
        }

        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${nextToken}`;
        return api(originalRequest);
    },
);

export const resetAuthInvalidation = () => {
    resetSessionInvalidation();
};
