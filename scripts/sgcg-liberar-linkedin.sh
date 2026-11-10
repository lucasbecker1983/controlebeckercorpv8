#!/usr/bin/env bash
# Libera o LinkedIn (pedido do responsável, 10/11/2026): tira linkedin.com e licdn.com da regra 8 "Redes Sociais"
# pela API do SGCG (fica na auditoria de políticas) e reaplica as políticas.
# Uso: sudo bash /opt/controlebeckercorp-v8/scripts/sgcg-liberar-linkedin.sh
set -Eeuo pipefail
NODE="$(command -v node || echo /root/.nvm/versions/node/v20.20.0/bin/node)"
exec "$NODE" - <<'JS'
require('/opt/controlebeckercorp-v8/backend/node_modules/dotenv').config({ path: '/opt/controlebeckercorp-v8/backend/.env', quiet: true });
const jwt = require('/opt/controlebeckercorp-v8/backend/node_modules/jsonwebtoken');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const token = jwt.sign({ id: -1, username: `${process.env.SUDO_USER || 'admin'} (libera LinkedIn, pedido do responsável)`, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const B = 'https://127.0.0.1:6779/api/bloqueios-liberacoes';
const TIRAR = ['linkedin.com', 'licdn.com'];
const call = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} -> HTTP ${r.status}: ${t.slice(0, 300)}`);
  try { return JSON.parse(t); } catch { return t; }
};
(async () => {
  const list = await call('GET', '/domain-policies');
  const p8 = (Array.isArray(list) ? list : list.policies || list.items || []).find((p) => Number(p.id) === 8);
  if (!p8) throw new Error('Regra 8 não encontrada; nada foi alterado.');
  const atuais = (p8.entries || []).map((e) => e.raw || e.normalized_domain).filter(Boolean);
  if (atuais.length < 20) throw new Error(`Regra 8 veio com só ${atuais.length} entradas; nada foi gravado.`);
  const novo = atuais.filter((d) => !TIRAR.includes(String(d).toLowerCase()));
  if (novo.length === atuais.length) console.log('LinkedIn já não estava na regra.');
  else { await call('PATCH', '/domain-policies/8', { domains: novo }); console.log(`LinkedIn retirado da regra "Redes Sociais" (${atuais.length} -> ${novo.length}).`); }
  await call('POST', '/apply', {});
  console.log('Políticas reaplicadas.');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
JS
