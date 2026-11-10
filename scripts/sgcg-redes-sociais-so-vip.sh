#!/usr/bin/env bash
# Redes sociais só para VIPs (decisão do Secretário Leandro, 10/11/2026).
# Faz pela API do SGCG, com registro na auditoria de políticas:
#   1. desliga a regra 18 "WhatsApp Web - dependencias Meta" (17 endereços do Facebook/Messenger/direct do
#      Instagram liberados em todas as VLANs; o WhatsApp usa a regra 9, que continua ligada);
#   2. desliga a janela "Horário de Almoço" (liberava YouTube e Redes Sociais na VLAN 30, 11:30-13:00);
#   3. apaga a janela "VLAN 30 - YouTube e Redes Sociais na sexta";
#   4. acrescenta à regra 8 "Redes Sociais" endereços do TikTok que ainda escapavam;
#   5. reaplica as políticas.
# Uso: sudo bash /opt/controlebeckercorp-v8/scripts/sgcg-redes-sociais-so-vip.sh
set -Eeuo pipefail
NODE="$(command -v node || echo /root/.nvm/versions/node/v20.20.0/bin/node)"
exec "$NODE" - <<'JS'
require('/opt/controlebeckercorp-v8/backend/node_modules/dotenv').config({ path: '/opt/controlebeckercorp-v8/backend/.env', quiet: true });
const jwt = require('/opt/controlebeckercorp-v8/backend/node_modules/jsonwebtoken');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const who = `${process.env.SUDO_USER || 'admin'} (redes sociais só VIP, decisão do Secretário Leandro)`;
const token = jwt.sign({ id: -1, username: who, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '5m' });
const B = 'https://127.0.0.1:6779/api/bloqueios-liberacoes';
const NOVOS_TIKTOK = ['ttdns2.com', 'tiktok.tps.dv.tech', 'bytedance.map.fastly.net'];
const call = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> HTTP ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
};
const listOf = (x) => (Array.isArray(x) ? x : x?.policies || x?.items || x?.rows || []);
(async () => {
  const policies = listOf(await call('GET', '/domain-policies'));
  const p18 = policies.find((p) => Number(p.id) === 18);
  const p8 = policies.find((p) => Number(p.id) === 8);
  if (!p8) throw new Error('Regra 8 "Redes Sociais" não encontrada; nada foi alterado.');

  if (p18?.enabled) { await call('POST', '/domain-policies/18/toggle'); console.log('1. Regra 18 desligada.'); }
  else console.log('1. Regra 18 já estava desligada.');

  const windows = listOf(await call('GET', '/scheduled-policy-windows'));
  const nota = 'Desligado em 10/11/2026: redes sociais só para VIPs (decisão do Secretário Leandro).';
  if (windows.some((w) => w.id === 'horario-de-almoco')) {
    await call('PATCH', '/scheduled-policy-windows/horario-de-almoco', { active: false, notes: nota });
    console.log('2. Janela "Horário de Almoço" desligada.');
  }
  if (windows.some((w) => w.id === 'vlan30-friday-social-youtube')) {
    await call('DELETE', '/scheduled-policy-windows/vlan30-friday-social-youtube');
    console.log('3. Janela "VLAN 30 - YouTube e Redes Sociais na sexta" apagada.');
  } else console.log('3. Janela de sexta já não existia.');

  const atuais = (p8.entries || p8.domains || []).map((e) => (typeof e === 'string' ? e : e.raw || e.normalized_domain)).filter(Boolean);
  if (atuais.length < 20) throw new Error(`Regra 8 veio com só ${atuais.length} entradas; por segurança nada foi gravado nela.`);
  const faltam = NOVOS_TIKTOK.filter((d) => !atuais.includes(d));
  if (faltam.length) {
    await call('PATCH', '/domain-policies/8', { domains: [...atuais, ...faltam] });
    console.log(`4. TikTok: ${faltam.join(', ')} incluídos na regra "Redes Sociais" (${atuais.length} -> ${atuais.length + faltam.length}).`);
  } else console.log('4. Endereços extras do TikTok já estavam na regra.');

  await call('POST', '/apply', {});
  console.log('5. Políticas reaplicadas. Pronto.');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
JS
