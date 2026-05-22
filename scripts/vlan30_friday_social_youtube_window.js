#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const { blockingReleaseService } = require('../backend-proxy/dist/services/blocking-release-service');
const { pool } = require('../backend-proxy/dist/config/db');

const VLAN_ID = 30;
const REQUESTED_BY = 'sgcg-friday-vlan30-window';
const TIMEZONE = 'America/Sao_Paulo';
const RPZ_FILE = '/etc/unbound/becker/allowed.rpz';
const TEMP_COMMENT = 'SGCG FRIDAY VLAN30 SOCIAL ALLOW 0800-1700';
const TEMP_RPZ_START = '; SGCG FRIDAY VLAN30 YOUTUBE ALLOW START';
const TEMP_RPZ_END = '; SGCG FRIDAY VLAN30 YOUTUBE ALLOW END';
const NOTE = 'SGCG-FRIDAY-VLAN30-WINDOW: libera YouTube e Redes Sociais somente nas sextas-feiras das 08:00 as 17:00 para a VLAN 30.';

const socialDomains = [
  'beacons.ai', 'byteoversea.com', 'cdninstagram.com', 'discordapp.com', 'discordapp.net',
  'discord.com', 'discord.gg', 'facebook.com', 'facebook.net', 'fbcdn.net', 'fb.com',
  'fbsbx.com', 'ibytedtos.com', 'ig.me', 'instagram.com', 'kuaishou.com', 'kwai.com',
  'kwimgs.com', 'licdn.com', 'linkedin.com', 'messengercdn.com', 'messenger.com',
  'musical.ly', 'pinimg.com', 'pinterest.com', 'redd.it', 'reddit.com', 'redditmedia.com',
  'sc-cdn.net', 'snapchat.com', 'snap.com', 't.co', 'threads.net', 'tiktokcdn.com',
  'tiktok.com', 'tiktokv.com', 'tumblr.co', 'tumblr.com', 'twimg.com', 'twitter.com', 'x.com',
  'b-graph.facebook.com', 'connect.facebook.net', 'edge-mqtt.facebook.com', 'graph.facebook.com',
  'graph.instagram.com', 'i.instagram.com', 'scontent-gru1-1.cdninstagram.com',
  'test-gateway.instagram.com', 'z-m-gateway.facebook.com',
];

const youtubeDomains = [
  'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'youtube-nocookie.com',
  'youtubei.googleapis.com', 'youtube.googleapis.com', 'ggpht.com', 'googleusercontent.com',
];

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command: `${command} ${args.join(' ')}`,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function saoPauloNowParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return {
    weekday: pick('weekday'),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
  };
}

function isFridayWindow() {
  const now = saoPauloNowParts();
  return now.weekday === 'Fri' && now.hour >= 8 && now.hour < 17;
}

function ensureFirewallAllow() {
  const rule = [
    '-i', 'enp6s0.30',
    '-s', '192.168.30.0/24',
    '-m', 'set', '--match-set', 'sgcg_social_blocked', 'dst',
    '-m', 'comment', '--comment', TEMP_COMMENT,
    '-j', 'ACCEPT',
  ];
  const check = run('iptables', ['-C', 'FORWARD', ...rule]);
  if (check.status === 0) return { already: true };

  const saved = run('iptables-save', ['-t', 'filter']);
  const lines = saved.stdout.split('\n');
  const targetIndex = lines.findIndex((line) => line.includes('SGCG SOCIAL BLOCK VLAN30'));
  const insertPosition = targetIndex >= 0
    ? lines.slice(0, targetIndex).filter((line) => line.startsWith('-A FORWARD ')).length + 1
    : 1;
  const insert = run('iptables', ['-I', 'FORWARD', String(insertPosition), ...rule]);
  return { already: false, insertPosition, insert_status: insert.status, stderr: insert.stderr.trim() };
}

function removeFirewallAllow() {
  let removed = 0;
  for (;;) {
    const result = run('iptables', [
      '-D', 'FORWARD',
      '-i', 'enp6s0.30',
      '-s', '192.168.30.0/24',
      '-m', 'set', '--match-set', 'sgcg_social_blocked', 'dst',
      '-m', 'comment', '--comment', TEMP_COMMENT,
      '-j', 'ACCEPT',
    ]);
    if (result.status !== 0) break;
    removed += 1;
  }
  return removed;
}

function ensureYoutubeRpzAllow() {
  let current = fs.readFileSync(RPZ_FILE, 'utf8');
  current = current.replace(new RegExp(`\\n?${TEMP_RPZ_START}[\\s\\S]*?${TEMP_RPZ_END}\\n?`, 'g'), '\n').trimEnd();
  const entries = youtubeDomains.flatMap((domain) => [
    `${domain} CNAME rpz-passthru.`,
    `*.${domain} CNAME rpz-passthru.`,
  ]);
  fs.writeFileSync(RPZ_FILE, `${current}\n${TEMP_RPZ_START}\n${entries.join('\n')}\n${TEMP_RPZ_END}\n`);
  return entries.length;
}

function removeYoutubeRpzAllow() {
  if (!fs.existsSync(RPZ_FILE)) return false;
  const current = fs.readFileSync(RPZ_FILE, 'utf8');
  const next = current.replace(new RegExp(`\\n?${TEMP_RPZ_START}[\\s\\S]*?${TEMP_RPZ_END}\\n?`, 'g'), '\n');
  if (next === current) return false;
  fs.writeFileSync(RPZ_FILE, next.replace(/\n{3,}/g, '\n\n'));
  return true;
}

async function openWindow(force = false) {
  if (!force && !isFridayWindow()) {
    return { ok: true, skipped: true, reason: 'fora_da_janela_sexta_0800_1700' };
  }

  await blockingReleaseService.updateCategoryPolicy({
    policy_type: 'allow',
    category: 'Redes Sociais',
    description: 'Redes Sociais liberadas toda sexta-feira das 08:00 as 17:00 para VLAN 30',
    scope_type: 'vlan',
    vlan_id: VLAN_ID,
    domains: socialDomains,
    notes: NOTE,
  }, REQUESTED_BY);

  await blockingReleaseService.updateCategoryPolicy({
    policy_type: 'allow',
    category: 'YouTube',
    description: 'YouTube liberado toda sexta-feira das 08:00 as 17:00 para VLAN 30',
    scope_type: 'vlan',
    vlan_id: VLAN_ID,
    domains: youtubeDomains,
    notes: NOTE,
  }, REQUESTED_BY);

  const applyResult = await blockingReleaseService.apply(REQUESTED_BY);
  const firewall = ensureFirewallAllow();
  const rpzEntries = ensureYoutubeRpzAllow();
  const unboundCheck = run('unbound-checkconf', []);
  if (unboundCheck.status !== 0) throw new Error(unboundCheck.stderr || unboundCheck.stdout || 'unbound-checkconf failed');
  const unboundReload = run('systemctl', ['reload', 'unbound']);
  return {
    ok: true,
    mode: 'open',
    apply_ok: applyResult?.ok !== false,
    firewall,
    rpz_entries: rpzEntries,
    unbound_reload: unboundReload.status,
  };
}

async function closeWindow() {
  const deleted = await pool.query(
    `
      DELETE FROM release_policies
      WHERE scope_type = 'vlan'
        AND scope_value = $1
        AND (
          category = ANY($2::text[])
          OR lower(COALESCE(reason, '')) = ANY($3::text[])
        )
      RETURNING id, domain, category
    `,
    [String(VLAN_ID), ['YouTube', 'Redes Sociais'], ['youtube', 'redes-sociais']],
  );

  await blockingReleaseService.recordAudit({
    action: 'friday-vlan30-social-youtube:close',
    requestedBy: REQUESTED_BY,
    payload: { vlan_id: VLAN_ID, categories: ['YouTube', 'Redes Sociais'], schedule: 'Fri 08:00-17:00 America/Sao_Paulo' },
    result: { deleted_release_policies: deleted.rows.length },
    success: true,
    message: 'Janela semanal de YouTube e Redes Sociais da VLAN 30 encerrada.',
    vlanId: VLAN_ID,
  });

  const applyResult = await blockingReleaseService.apply(REQUESTED_BY);
  const firewallRemoved = removeFirewallAllow();
  const rpzChanged = removeYoutubeRpzAllow();
  const unboundCheck = run('unbound-checkconf', []);
  if (unboundCheck.status !== 0) throw new Error(unboundCheck.stderr || unboundCheck.stdout || 'unbound-checkconf failed');
  const unboundReload = run('systemctl', ['reload', 'unbound']);
  return {
    ok: true,
    mode: 'close',
    deleted_release_policies: deleted.rows.length,
    apply_ok: applyResult?.ok !== false,
    firewall_removed: firewallRemoved,
    rpz_changed: rpzChanged,
    unbound_reload: unboundReload.status,
  };
}

async function main() {
  const mode = process.argv[2];
  const force = process.argv.includes('--force');
  if (!['open', 'close'].includes(mode)) {
    throw new Error('Uso: vlan30_friday_social_youtube_window.js open|close [--force]');
  }
  const result = mode === 'open' ? await openWindow(force) : await closeWindow();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
