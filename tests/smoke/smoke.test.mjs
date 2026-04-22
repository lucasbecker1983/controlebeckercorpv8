import test from 'node:test';
import assert from 'node:assert/strict';

if (process.env.SMOKE_INSECURE_TLS === '1') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const CORE_BASE = process.env.SMOKE_CORE_BASE || 'https://console.beckercorp.cloud';
const PROXY_BASE = process.env.SMOKE_PROXY_BASE || 'https://console.beckercorp.cloud';
const USERNAME = process.env.SMOKE_USERNAME || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin';
const PRESET_TOKEN = process.env.SMOKE_TOKEN || '';

let token = PRESET_TOKEN;

test('login returns token', async () => {
    if (token) {
        assert.ok(token, 'token pré-configurado ausente');
        return;
    }
    const res = await fetch(`${CORE_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    assert.equal(res.ok, true, `login falhou com status ${res.status}`);
    const data = await res.json();
    assert.ok(data.token, 'token ausente');
    token = data.token;
});

test('smtp endpoint accepts token', async () => {
    assert.ok(token, 'token não inicializado');
    const res = await fetch(`${CORE_BASE}/api/security/smtp`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.ok, true, `smtp GET falhou com status ${res.status}`);
});

test('critical core routes respond with token', async () => {
    assert.ok(token, 'token não inicializado');
    for (const path of ['/api/dashboard/metrics', '/api/users', '/api/security/dashboard']) {
        const res = await fetch(`${CORE_BASE}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res.ok, true, `${path} falhou com status ${res.status}`);
    }
});

test('proxy critical routes respond with token', async () => {
    assert.ok(token, 'token não inicializado');
    for (const path of ['/api/dns/status', '/api/dns/stats', '/api/dns/radar?limit=5']) {
        const res = await fetch(`${PROXY_BASE}${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res.ok, true, `${path} falhou com status ${res.status}`);
    }
});
