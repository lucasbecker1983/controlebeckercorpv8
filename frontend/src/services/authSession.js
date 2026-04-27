const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

let refreshPromise = null;
let authInvalidated = false;

const resolveUrl = (path) => {
    const raw = String(path || '');
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

export const readStoredAccessToken = () => (
    typeof window === 'undefined' ? '' : String(localStorage.getItem('becker_token') || '')
);

export const isSessionInvalidated = () => authInvalidated;

export const resetSessionInvalidation = () => {
    authInvalidated = false;
};

export const invalidateSession = () => {
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

export async function refreshAccessToken() {
    if (authInvalidated) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = fetch(resolveUrl('/api/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
    })
        .then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.accessToken) {
                invalidateSession();
                return null;
            }

            localStorage.setItem('becker_token', payload.accessToken);
            if (payload.user) {
                localStorage.setItem('becker_user', JSON.stringify(payload.user));
            }
            return payload.accessToken;
        })
        .catch(() => {
            invalidateSession();
            return null;
        })
        .finally(() => {
            refreshPromise = null;
        });

    return refreshPromise;
}
