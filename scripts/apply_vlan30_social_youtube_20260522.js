#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const { blockingReleaseService } = require('../backend-proxy/dist/services/blocking-release-service');
const { pool } = require('../backend-proxy/dist/config/db');

const REQUESTED_BY = 'codex-temp-20260522';
const NOTE = 'Liberacao temporaria somente em 2026-05-22 para VLAN 30, solicitada pelo operador: YouTube e Redes Sociais.';
const RPZ_FILE = '/etc/unbound/becker/allowed.rpz';
const TEMP_COMMENT = 'SGCG TEMP VLAN30 SOCIAL ALLOW 20260522';
const TEMP_RPZ_START = '; SGCG TEMP VLAN30 YOUTUBE ALLOW 20260522 START';
const TEMP_RPZ_END = '; SGCG TEMP VLAN30 YOUTUBE ALLOW 20260522 END';

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

function ensureYoutubeRpzAllow() {
  let current = fs.readFileSync(RPZ_FILE, 'utf8');
  current = current.replace(new RegExp(`\\n?${TEMP_RPZ_START}[\\s\\S]*?${TEMP_RPZ_END}\\n?`, 'g'), '\n').trimEnd();
  const entries = youtubeDomains.flatMap((domain) => [
    `${domain} CNAME rpz-passthru.`,
    `*.${domain} CNAME rpz-passthru.`,
  ]);
  fs.writeFileSync(RPZ_FILE, `${current}\n${TEMP_RPZ_START}\n${entries.join('\n')}\n${TEMP_RPZ_END}\n`);
}

async function main() {
  await blockingReleaseService.updateCategoryPolicy({
    policy_type: 'allow',
    category: 'Redes Sociais',
    description: 'Redes Sociais liberadas temporariamente para VLAN 30 em 2026-05-22',
    scope_type: 'vlan',
    vlan_id: 30,
    domains: socialDomains,
    notes: NOTE,
  }, REQUESTED_BY);

  await blockingReleaseService.updateCategoryPolicy({
    policy_type: 'allow',
    category: 'YouTube',
    description: 'YouTube liberado temporariamente para VLAN 30 em 2026-05-22',
    scope_type: 'vlan',
    vlan_id: 30,
    domains: youtubeDomains,
    notes: NOTE,
  }, REQUESTED_BY);

  const applyResult = await blockingReleaseService.apply(REQUESTED_BY);
  const firewall = ensureFirewallAllow();
  ensureYoutubeRpzAllow();
  const unboundCheck = run('unbound-checkconf', []);
  if (unboundCheck.status !== 0) {
    throw new Error(unboundCheck.stderr || unboundCheck.stdout || 'unbound-checkconf failed');
  }
  const unboundReload = run('systemctl', ['reload', 'unbound']);

  console.log(JSON.stringify({
    ok: true,
    apply_ok: applyResult?.ok !== false,
    firewall,
    unbound_check: unboundCheck.status,
    unbound_reload: unboundReload.status,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
