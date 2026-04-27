import {
    invalidateSession,
    isSessionInvalidated,
    readStoredAccessToken,
    refreshAccessToken,
    resetSessionInvalidation,
} from './authSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const resolveUrl = (input) => {
    const raw = String(input || '');
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!API_BASE_URL) return raw;
    return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const isAuthRoute = (requestUrl = '') => (
    requestUrl.includes('/api/auth/login')
    || requestUrl.includes('/api/auth/refresh')
    || requestUrl.includes('/api/auth/logout')
);

const buildHeaders = (init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
    const token = readStoredAccessToken();
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
};

export async function authFetch(input, init = {}) {
    if (isSessionInvalidated()) {
        return new Response(JSON.stringify({ error: 'Sessão invalidada.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const requestUrl = resolveUrl(input);

    const execute = () => fetch(requestUrl, {
        ...init,
        headers: buildHeaders(init),
        credentials: 'include',
    });

    let response = await execute();
    if (response.status === 401 && !isAuthRoute(requestUrl)) {
        const nextToken = await refreshAccessToken();
        if (nextToken) {
            response = await execute();
        } else {
            invalidateSession();
        }
    }

    return response;
}

export function resetAuthFetchInvalidation() {
    resetSessionInvalidation();
}
