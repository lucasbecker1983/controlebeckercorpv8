#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.SGCG_IDENTITY_PORT || 8088);
const HOST = process.env.SGCG_IDENTITY_HOST || '0.0.0.0';
const AGENT_TOKEN = process.env.SGCG_AGENT_TOKEN || '';
const DATA_DIR = process.env.SGCG_IDENTITY_DATA_DIR || path.resolve(__dirname, '..', 'data', 'identity');
const CHECKINS_FILE = path.join(DATA_DIR, 'checkins.jsonl');
const LATEST_FILE = path.join(DATA_DIR, 'latest.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!AGENT_TOKEN) {
  console.error('[SGCG Identity] SGCG_AGENT_TOKEN obrigatorio.');
  process.exit(1);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function normalizeCheckin(payload, req) {
  const now = new Date().toISOString();
  return {
    received_at: now,
    remote_ip: req.socket.remoteAddress,
    agent_id: String(payload.agent_id || ''),
    user: String(payload.user || ''),
    display_user: String(payload.display_user || ''),
    computer: String(payload.computer || ''),
    ip: String(payload.ip || ''),
    mac: String(payload.mac || ''),
    vlan: String(payload.vlan || 'unknown'),
    logged: Boolean(payload.logged),
    source: String(payload.source || 'sgcg-endpoint-identity-service'),
    agent_version: String(payload.agent_version || ''),
    checked_at: String(payload.checked_at || ''),
  };
}

function upsertLatest(checkin) {
  let latest = {};
  try {
    latest = JSON.parse(fs.readFileSync(LATEST_FILE, 'utf8'));
  } catch {
    latest = {};
  }
  const key = checkin.agent_id || checkin.computer || checkin.ip || checkin.remote_ip;
  latest[key] = checkin;
  fs.writeFileSync(LATEST_FILE, JSON.stringify(latest, null, 2));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, service: 'sgcg-endpoint-identity-checkin', port: PORT });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/identity/checkin') {
    sendJson(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  const token = req.headers['x-agent-token'];
  if (!AGENT_TOKEN || token !== AGENT_TOKEN) {
    sendJson(res, 401, { ok: false, error: 'invalid_agent_token' });
    return;
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw || '{}');
    const checkin = normalizeCheckin(payload, req);
    fs.appendFileSync(CHECKINS_FILE, JSON.stringify(checkin) + '\n');
    upsertLatest(checkin);
    sendJson(res, 200, { ok: true, received_at: checkin.received_at });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[SGCG Identity] listening on http://${HOST}:${PORT}`);
  console.log(`[SGCG Identity] checkins: ${CHECKINS_FILE}`);
});
