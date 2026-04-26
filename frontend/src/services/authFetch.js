const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
let authInvalidated = false;

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

const resolveUrl = (input) => {
    const raw = String(input || '');
    if (!raw) return raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (!API_BASE_URL) return raw;
    return `${API_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

export async function authFetch(input, init = {}) {
    if (authInvalidated) {
        return new Response(JSON.stringify({ error: 'Sessão invalidada.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const headers = new Headers(init.headers || {});
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
    const token = String(localStorage.getItem('becker_token') || '');
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }
    const requestUrl = resolveUrl(input);

    const execute = () => fetch(requestUrl, {
        ...init,
        headers,
        credentials: 'include',
    });

    let response = await execute();
    if (response.status === 401 && !requestUrl.includes('/api/auth/login') && !requestUrl.includes('/api/auth/logout')) {
        redirectToLogin();
    }

    return response;
}

export function resetAuthFetchInvalidation() {
    authInvalidated = false;
}
