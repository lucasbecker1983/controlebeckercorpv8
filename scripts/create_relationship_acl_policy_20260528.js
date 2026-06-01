#!/usr/bin/env node

const { pool } = require('../backend-proxy/dist/config/db');
const { domainPolicyManagerService } = require('../backend-proxy/dist/services/domain-policy-manager-service');
const { blockingReleaseService } = require('../backend-proxy/dist/services/blocking-release-service');

const REQUESTED_BY = 'codex-relationship-acl-20260528';
const POLICY_NAME = 'Sites e aplicativos de relacionamento';
const VLAN_IDS = [10, 30, 40, 50, 70];

const DOMAINS = [
  'tinder.com',
  'gotinder.com',
  'tinder.co',
  'tinderpressroom.com',
  'badoo.com',
  'badoocdn.com',
  'bumble.com',
  'bumblecdn.com',
  'hinge.co',
  'hingeapp.com',
  'happn.com',
  'okcupid.com',
  'pof.com',
  'plentyoffish.com',
  'match.com',
  'mtch.com',
  'zoosk.com',
  'grindr.com',
  'grindr.mobi',
  'her.app',
  'weareher.com',
  'taimi.com',
  'tantanapp.com',
  'lovoo.com',
  'mamba.ru',
  'boo.world',
  'coffeeandbagel.com',
  'coffeemeetsbagel.com',
  'feeld.co',
  'pure.app',
  'hily.com',
  'hilyapp.com',
  'jaumo.com',
  'waplog.com',
  'skout.com',
  'meetme.com',
  'tagged.com',
  'yubo.live',
  'fru.it',
  'fruitz.io',
  'flava.app',
  'chatta.com',
  'chatta.it',
  'chattalive.com',
  'superlive.chat',
  'superlivetv.com',
  'crushfun.live',
  'getcrushlive.com',
  'crushlive.xyz',
  'crushliveagencycrush.com',
  'crushliveregistration.com',
  'aliiparty.com',
  'alii.global',
  'web-timo.vercel.app',
  'vibedate.io',
  'vibedating.net',
  'vibebe.app',
  'vybe.dating',
  'vibematchapp.com',
];

async function main() {
  const description = [
    'Bloqueio institucional de sites e aplicativos de relacionamento, encontros, paquera, chat adulto/social e live streaming de interação pessoal.',
    'Inclui Tinder, Timo/Taimi, Badoo, Alii, Vibe, Crush Live, SuperLive, Chatta e serviços similares conhecidos.',
  ].join(' ');

  const payload = {
    name: POLICY_NAME,
    policy_type: 'block',
    scope_type: 'vlan',
    vlan_ids: VLAN_IDS,
    enabled: true,
    description,
    governance_summary: 'Reduz risco operacional, assédio, distração e exposição institucional por plataformas de relacionamento e live chat sem finalidade administrativa.',
    legal_basis: 'Política interna de uso aceitável da rede institucional.',
    requested_by: REQUESTED_BY,
    approval_scope: 'Administração SGCG',
    lifecycle_status: 'Vigente',
    domains: DOMAINS,
  };

  const existing = await domainPolicyManagerService.list({ search: POLICY_NAME });
  const exact = existing.find((item) => String(item.name || '').toLowerCase() === POLICY_NAME.toLowerCase());
  const policy = exact
    ? await domainPolicyManagerService.update(exact.id, payload, REQUESTED_BY, { username: REQUESTED_BY })
    : await domainPolicyManagerService.create(payload, REQUESTED_BY, { username: REQUESTED_BY });

  const applyResult = await blockingReleaseService.apply(REQUESTED_BY);
  const legacyRows = await pool.query(
    `
      SELECT scope_value, COUNT(*)::int AS total
      FROM blocking_policies
      WHERE domain_policy_id = $1
        AND active = TRUE
      GROUP BY scope_value
      ORDER BY scope_value
    `,
    [policy.id],
  );

  console.log(JSON.stringify({
    ok: true,
    policy_id: policy.id,
    name: policy.name,
    policy_type: policy.policy_type,
    scope_type: policy.scope_type,
    scope_value: policy.scope_value,
    domains: DOMAINS.length,
    legacy_rows_by_vlan: legacyRows.rows,
    apply: {
      enforcement_mode: applyResult?.enforcementMode || applyResult?.enforcement_mode || null,
      ok: applyResult?.ok ?? true,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
