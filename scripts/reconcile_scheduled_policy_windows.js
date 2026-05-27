#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pool } = require('../backend-proxy/dist/config/db');
const { blockingReleaseService } = require('../backend-proxy/dist/services/blocking-release-service');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STORE_FILE = path.join(PROJECT_ROOT, 'data', 'scheduled_policy_windows.json');
const TIMEZONE = 'America/Sao_Paulo';
const REQUESTED_BY = 'sgcg-scheduled-policy-windows';
const SOCIAL_FIREWALL_COMMENT = 'SGCG SCHEDULED VLAN30 SOCIAL ALLOW';
const LEGACY_SOCIAL_FIREWALL_COMMENT = 'SGCG FRIDAY VLAN30 SOCIAL ALLOW 0800-1700';
const RPZ_FILE = '/etc/unbound/becker/allowed.rpz';
const RPZ_START = '; SGCG SCHEDULED VLAN30 YOUTUBE ALLOW START';
const RPZ_END = '; SGCG SCHEDULED VLAN30 YOUTUBE ALLOW END';
const LEGACY_RPZ_START = '; SGCG FRIDAY VLAN30 YOUTUBE ALLOW START';
const LEGACY_RPZ_END = '; SGCG FRIDAY VLAN30 YOUTUBE ALLOW END';

const CATALOG = {
  'YouTube': ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com', 'youtube-nocookie.com', 'youtubei.googleapis.com', 'youtube.googleapis.com', 'ggpht.com', 'googleusercontent.com'],
  'Redes Sociais': [
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
  ],
};

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function loadSchedules() {
  if (!fs.existsSync(STORE_FILE)) return [];
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
}

function localNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    weekday: weekdayMap[pick('weekday')],
    minutes: Number(pick('hour')) * 60 + Number(pick('minute')),
  };
}

function parseTime(value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function isScheduleOpen(schedule, now = localNow()) {
  if (!schedule?.active) return false;
  const start = parseTime(schedule.start_time);
  const end = parseTime(schedule.end_time);
  const inTime = start <= end
    ? now.minutes >= start && now.minutes < end
    : now.minutes >= start || now.minutes < end;
  if (!inTime) return false;
  if (schedule.date_mode === 'single') return now.date === schedule.start_date;
  if (schedule.date_mode === 'range') {
    if (schedule.start_date && now.date < schedule.start_date) return false;
    if (schedule.end_date && now.date > schedule.end_date) return false;
  }
  return (schedule.weekdays || []).map(Number).includes(now.weekday);
}

function scheduleDomains(schedule) {
  return Array.from(new Set((schedule.categories || []).flatMap((category) => CATALOG[category] || [])));
}

function categoryKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hasForbiddenCategory(schedule) {
  return (schedule.categories || []).some((category) => /(pornograf|adulto|conteudo-adulto)/.test(categoryKey(category)));
}

async function openSchedule(schedule) {
  if (hasForbiddenCategory(schedule)) return closeSchedule(schedule);
  const domains = scheduleDomains(schedule);
  if (!domains.length) return 0;
  let changed = 0;
  for (const vlanId of schedule.vlan_ids || []) {
    for (const category of schedule.categories || []) {
      const categoryDomains = CATALOG[category] || [];
      for (const domain of categoryDomains) {
        const { rowCount } = await pool.query(
          `
            INSERT INTO release_policies (domain, description, category, reason, protected, active, scope_type, scope_value, created_by, notes, origin_rule)
            VALUES ($1, $2, $3, $4, FALSE, TRUE, 'vlan', $5, $6, $7, 'scheduled-window')
            ON CONFLICT (domain, scope_type, scope_value) DO UPDATE SET
              description = EXCLUDED.description,
              category = EXCLUDED.category,
              reason = EXCLUDED.reason,
              active = TRUE,
              notes = EXCLUDED.notes,
              origin_rule = EXCLUDED.origin_rule,
              updated_at = NOW()
            WHERE release_policies.description IS DISTINCT FROM EXCLUDED.description
               OR release_policies.category IS DISTINCT FROM EXCLUDED.category
               OR release_policies.reason IS DISTINCT FROM EXCLUDED.reason
               OR release_policies.active IS DISTINCT FROM TRUE
               OR release_policies.notes IS DISTINCT FROM EXCLUDED.notes
               OR release_policies.origin_rule IS DISTINCT FROM EXCLUDED.origin_rule
          `,
          [
            domain,
            `${category} liberado por agendamento visual`,
            category,
            `${schedule.name} (${schedule.start_time}-${schedule.end_time})`,
            String(vlanId),
            REQUESTED_BY,
            `SGCG-SCHEDULE:${schedule.id}`,
          ],
        );
        changed += rowCount || 0;
      }
    }
  }
  return changed;
}

async function closeSchedule(schedule) {
  const { rowCount } = await pool.query(
    `DELETE FROM release_policies WHERE notes = $1 AND origin_rule = 'scheduled-window'`,
    [`SGCG-SCHEDULE:${schedule.id}`],
  );
  return rowCount || 0;
}

function ensureFirewall(active) {
  const rule = ['-i', 'enp6s0.30', '-s', '192.168.30.0/24', '-m', 'set', '--match-set', 'sgcg_social_blocked', 'dst', '-m', 'comment', '--comment', SOCIAL_FIREWALL_COMMENT, '-j', 'ACCEPT'];
  const legacyRule = ['-i', 'enp6s0.30', '-s', '192.168.30.0/24', '-m', 'set', '--match-set', 'sgcg_social_blocked', 'dst', '-m', 'comment', '--comment', LEGACY_SOCIAL_FIREWALL_COMMENT, '-j', 'ACCEPT'];
  for (;;) {
    if (run('iptables', ['-D', 'FORWARD', ...legacyRule]).status !== 0) break;
  }
  if (active) {
    if (run('iptables', ['-C', 'FORWARD', ...rule]).status === 0) return;
    const saved = run('iptables-save', ['-t', 'filter']).stdout.split('\n');
    const target = saved.findIndex((line) => line.includes('SGCG SOCIAL BLOCK VLAN30'));
    const position = target >= 0 ? saved.slice(0, target).filter((line) => line.startsWith('-A FORWARD ')).length + 1 : 1;
    run('iptables', ['-I', 'FORWARD', String(position), ...rule]);
    return;
  }
  for (;;) {
    if (run('iptables', ['-D', 'FORWARD', ...rule]).status !== 0) break;
  }
}

function ensureRpz(active) {
  if (!fs.existsSync(RPZ_FILE)) return;
  const original = fs.readFileSync(RPZ_FILE, 'utf8');
  const current = original
    .replace(new RegExp(`\\n?${RPZ_START}[\\s\\S]*?${RPZ_END}\\n?`, 'g'), '\n')
    .replace(new RegExp(`\\n?${LEGACY_RPZ_START}[\\s\\S]*?${LEGACY_RPZ_END}\\n?`, 'g'), '\n')
    .trimEnd();
  let next;
  if (active) {
    const entries = CATALOG.YouTube.flatMap((domain) => [`${domain} CNAME rpz-passthru.`, `*.${domain} CNAME rpz-passthru.`]);
    next = `${current}\n${RPZ_START}\n${entries.join('\n')}\n${RPZ_END}\n`;
  } else {
    next = `${current}\n`;
  }
  if (next === original) return;
  fs.writeFileSync(RPZ_FILE, next);
  if (run('unbound-checkconf', []).status === 0) run('systemctl', ['reload', 'unbound']);
}

async function main() {
  const schedules = loadSchedules();
  let changed = 0;
  let vlan30MediaActive = false;
  for (const schedule of schedules) {
    if (hasForbiddenCategory(schedule)) {
      changed += await closeSchedule(schedule);
      continue;
    }
    const open = isScheduleOpen(schedule);
    if (open) changed += await openSchedule(schedule);
    else changed += await closeSchedule(schedule);
    if (open && (schedule.vlan_ids || []).map(Number).includes(30) && (schedule.categories || []).some((category) => ['YouTube', 'Redes Sociais'].includes(category))) {
      vlan30MediaActive = true;
    }
  }
  ensureFirewall(vlan30MediaActive);
  ensureRpz(vlan30MediaActive);
  if (changed) await blockingReleaseService.apply(REQUESTED_BY);
  console.log(JSON.stringify({ ok: true, schedules: schedules.length, changed, vlan30_media_active: vlan30MediaActive }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end().catch(() => undefined);
});
