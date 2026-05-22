#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const { pool } = require('../backend-proxy/dist/config/db');
const { blockingReleaseService } = require('../backend-proxy/dist/services/blocking-release-service');

const REQUESTED_BY = 'codex-temp-20260522';
const VLAN_ID = 30;
const CATEGORIES = ['YouTube', 'Redes Sociais'];
const RPZ_FILE = '/etc/unbound/becker/allowed.rpz';
const TEMP_COMMENT = 'SGCG TEMP VLAN30 SOCIAL ALLOW 20260522';
const TEMP_RPZ_START = '; SGCG TEMP VLAN30 YOUTUBE ALLOW 20260522 START';
const TEMP_RPZ_END = '; SGCG TEMP VLAN30 YOUTUBE ALLOW 20260522 END';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  return {
    command: `${command} ${args.join(' ')}`,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function removeTempFirewallRules() {
  const removed = [];
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
    removed.push(result.command);
  }
  return removed;
}

function removeTempRpzBlock() {
  if (!fs.existsSync(RPZ_FILE)) return false;
  const current = fs.readFileSync(RPZ_FILE, 'utf8');
  const next = current.replace(new RegExp(`\\n?${TEMP_RPZ_START}[\\s\\S]*?${TEMP_RPZ_END}\\n?`, 'g'), '\n');
  if (next === current) return false;
  fs.writeFileSync(RPZ_FILE, next.replace(/\n{3,}/g, '\n\n'));
  return true;
}

async function main() {
  const deleted = await pool.query(
    `
      DELETE FROM release_policies
      WHERE scope_type = 'vlan'
        AND scope_value = $1
        AND category = ANY($2::text[])
        AND origin_rule = 'category-quick'
      RETURNING id, domain, category
    `,
    [String(VLAN_ID), CATEGORIES],
  );

  await blockingReleaseService.recordAudit({
    action: 'temporary-vlan30-social-youtube:expire',
    requestedBy: REQUESTED_BY,
    payload: { vlan_id: VLAN_ID, categories: CATEGORIES },
    result: { deleted_release_policies: deleted.rows.length },
    success: true,
    message: 'Liberação temporária de YouTube e Redes Sociais da VLAN 30 expirada automaticamente.',
    vlanId: VLAN_ID,
  });

  await blockingReleaseService.apply(REQUESTED_BY);
  const firewallRemoved = removeTempFirewallRules();
  const rpzChanged = removeTempRpzBlock();
  const check = run('unbound-checkconf', []);
  if (check.status === 0) {
    run('systemctl', ['reload', 'unbound']);
  }

  console.log(JSON.stringify({
    ok: true,
    deleted_release_policies: deleted.rows.length,
    firewall_removed: firewallRemoved.length,
    rpz_changed: rpzChanged,
    unbound_check_status: check.status,
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
