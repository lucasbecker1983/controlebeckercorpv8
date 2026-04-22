import axios from 'axios';

const fallbackBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:6778';

const handleUnauthorized = () => {
    if (typeof window === 'undefined') return;
    const hasToken = Boolean(localStorage.getItem('becker_token'));
    localStorage.removeItem('becker_token');
    localStorage.removeItem('becker_user');
    if (!hasToken) return;
    if (window.location.pathname !== '/') {
        window.location.href = '/';
        return;
    }
    window.location.reload();
};

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || fallbackBaseUrl,
    headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('becker_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const requestUrl = String(error?.config?.url || '');
        if (error?.response?.status === 401 && !requestUrl.includes('/api/auth/login')) {
            handleUnauthorized();
        }
        return Promise.reject(error);
    },
);
