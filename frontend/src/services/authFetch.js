export function authFetch(input, init = {}) {
    const token = localStorage.getItem('becker_token');
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
    return fetch(input, { ...init, headers }).then((response) => {
        if (response.status === 401 && typeof window !== 'undefined' && token) {
            localStorage.removeItem('becker_token');
            localStorage.removeItem('becker_user');
            if (window.location.pathname !== '/') {
                window.location.href = '/';
            } else {
                window.location.reload();
            }
        }
        return response;
    });
}
