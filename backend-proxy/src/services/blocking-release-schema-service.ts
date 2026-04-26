import { pool } from '../config/db';
import { INTERNAL_DNS_BY_VLAN, MANAGED_BLOCKING_VLAN_IDS } from './blocking-release-scope';

const schemaSql = `
CREATE TABLE IF NOT EXISTS policy_engine_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    enforcement_mode VARCHAR(32) NOT NULL DEFAULT 'acl-plus-dns',
    global_blocking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    global_monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    emergency_bypass BOOLEAN NOT NULL DEFAULT FALSE,
    last_apply_at TIMESTAMPTZ,
    last_apply_by VARCHAR(128),
    last_rollback_at TIMESTAMPTZ,
    last_rollback_by VARCHAR(128),
    last_error TEXT,
    last_sync_at TIMESTAMPTZ,
    health_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    compiler_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
    compiler_version VARCHAR(128),
    last_snapshot_path TEXT,
    last_validation JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocking_policies (
    id BIGSERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(128),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    scope_type VARCHAR(32) NOT NULL DEFAULT 'global',
    scope_value VARCHAR(64) NOT NULL DEFAULT 'global',
    origin_rule VARCHAR(64) NOT NULL DEFAULT 'manual',
    created_by VARCHAR(128) NOT NULL DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS domain_policies (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    policy_type VARCHAR(16) NOT NULL,
    scope_type VARCHAR(16) NOT NULL DEFAULT 'global',
    scope_value VARCHAR(255) NOT NULL DEFAULT 'global',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    governance_summary TEXT,
    legal_basis TEXT,
    requested_by VARCHAR(128),
    approval_scope VARCHAR(128),
    lifecycle_status VARCHAR(64),
    review_date DATE,
    approved_by VARCHAR(128),
    approved_at TIMESTAMPTZ,
    effective_from TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_by VARCHAR(128),
    revoked_at TIMESTAMPTZ,
    created_by VARCHAR(128) NOT NULL DEFAULT 'system',
    updated_by VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_domain_policies_type CHECK (policy_type IN ('allow', 'block')),
    CONSTRAINT ck_domain_policies_scope CHECK (scope_type IN ('global', 'vlan'))
);

CREATE TABLE IF NOT EXISTS domain_policy_entries (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT NOT NULL REFERENCES domain_policies(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    normalized_domain VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_domain_policy_entries_policy_domain
    ON domain_policy_entries (policy_id, normalized_domain);

CREATE TABLE IF NOT EXISTS domain_policy_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    policy_id BIGINT,
    action VARCHAR(64) NOT NULL,
    requested_by VARCHAR(128) NOT NULL DEFAULT 'system',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_blocking_policies_domain_scope
    ON blocking_policies (domain, scope_type, scope_value);

CREATE TABLE IF NOT EXISTS release_policies (
    id BIGSERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(128),
    reason TEXT,
    protected BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    scope_type VARCHAR(32) NOT NULL DEFAULT 'global',
    scope_value VARCHAR(64) NOT NULL DEFAULT 'global',
    created_by VARCHAR(128) NOT NULL DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_release_policies_domain_scope
    ON release_policies (domain, scope_type, scope_value);

ALTER TABLE release_policies ADD COLUMN IF NOT EXISTS category VARCHAR(128);
ALTER TABLE blocking_policies ADD COLUMN IF NOT EXISTS domain_policy_id BIGINT;
ALTER TABLE release_policies ADD COLUMN IF NOT EXISTS domain_policy_id BIGINT;
ALTER TABLE release_policies ADD COLUMN IF NOT EXISTS origin_rule VARCHAR(64) NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS vlan_policies (
    id BIGSERIAL PRIMARY KEY,
    vlan_id INTEGER NOT NULL UNIQUE,
    label VARCHAR(128) NOT NULL,
    interface_name VARCHAR(64) NOT NULL,
    subnet_cidr VARCHAR(64) NOT NULL,
    exempt BOOLEAN NOT NULL DEFAULT FALSE,
    blocking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    custom_policy BOOLEAN NOT NULL DEFAULT FALSE,
    policy_mode VARCHAR(32) NOT NULL DEFAULT 'global',
    whitelist_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    blacklist_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_exceptions (
    id BIGSERIAL PRIMARY KEY,
    ip INET NOT NULL,
    hostname VARCHAR(255),
    description TEXT,
    governance_summary TEXT,
    legal_basis TEXT,
    responsible VARCHAR(128),
    requested_by VARCHAR(128),
    approval_scope VARCHAR(128),
    lifecycle_status VARCHAR(64),
    review_date DATE,
    approved_by VARCHAR(128),
    approved_at TIMESTAMPTZ,
    effective_from TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked_by VARCHAR(128),
    revoked_at TIMESTAMPTZ,
    vlan_id INTEGER,
    exception_type VARCHAR(64) NOT NULL,
    bypass_total BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_until TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    client_ip INET,
    vlan_id INTEGER,
    domain VARCHAR(255),
    action VARCHAR(32) NOT NULL,
    source VARCHAR(64),
    policy_origin VARCHAR(128),
    http_status INTEGER,
    evidence VARCHAR(128),
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_access_events_fingerprint
    ON access_events (occurred_at, client_ip, vlan_id, domain, action, source);

CREATE TABLE IF NOT EXISTS dns_policy_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    client_ip INET,
    vlan_id INTEGER,
    query_name VARCHAR(255) NOT NULL,
    query_type VARCHAR(32) NOT NULL,
    response_code VARCHAR(32),
    action VARCHAR(32) NOT NULL,
    policy_source VARCHAR(32) NOT NULL DEFAULT 'default',
    category VARCHAR(128),
    rule_id BIGINT,
    matched_rule TEXT,
    resolver VARCHAR(64) NOT NULL DEFAULT 'unbound',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    fingerprint VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_dns_policy_events_fingerprint
    ON dns_policy_events (fingerprint);

CREATE TABLE IF NOT EXISTS proxy_policy_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    client_ip INET,
    vlan_id INTEGER,
    host VARCHAR(255),
    url_or_host TEXT,
    method VARCHAR(32),
    status_code INTEGER,
    action VARCHAR(32) NOT NULL,
    category VARCHAR(128),
    rule_id BIGINT,
    matched_rule TEXT,
    proxy_layer VARCHAR(64) NOT NULL DEFAULT 'explicit',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    fingerprint VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_proxy_policy_events_fingerprint
    ON proxy_policy_events (fingerprint);

CREATE TABLE IF NOT EXISTS metrics_aggregates (
    id BIGSERIAL PRIMARY KEY,
    metric_key VARCHAR(128) NOT NULL,
    metric_scope VARCHAR(128) NOT NULL,
    metric_value NUMERIC(20,2) NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(128) NOT NULL,
    requested_by VARCHAR(128) NOT NULL DEFAULT 'system',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    vlan_id INTEGER,
    domain VARCHAR(255),
    ip INET,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_index (
    id BIGSERIAL PRIMARY KEY,
    report_key VARCHAR(255) NOT NULL UNIQUE,
    report_type VARCHAR(64) NOT NULL DEFAULT 'sarg',
    title VARCHAR(255) NOT NULL,
    relative_path TEXT,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dns_contingency_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'normal',
    scope_type VARCHAR(16) NOT NULL DEFAULT 'global',
    vlan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    providers JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolvers JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason TEXT,
    impact_summary TEXT,
    requested_by VARCHAR(128),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    deactivated_at TIMESTAMPTZ,
    last_test JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dns_contingency_audit (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(64) NOT NULL,
    requested_by VARCHAR(128) NOT NULL DEFAULT 'system',
    scope_type VARCHAR(16),
    vlan_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    providers JSONB NOT NULL DEFAULT '[]'::jsonb,
    resolvers JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason TEXT,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_events_occurred_at ON access_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_vlan_occurred_at ON access_events (vlan_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_events_domain ON access_events (domain);
CREATE INDEX IF NOT EXISTS idx_access_events_client_ip ON access_events (client_ip);
CREATE INDEX IF NOT EXISTS idx_dns_policy_events_occurred_at ON dns_policy_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dns_policy_events_query_name ON dns_policy_events (query_name);
CREATE INDEX IF NOT EXISTS idx_dns_policy_events_client_ip ON dns_policy_events (client_ip);
CREATE INDEX IF NOT EXISTS idx_dns_policy_events_vlan_id ON dns_policy_events (vlan_id);
CREATE INDEX IF NOT EXISTS idx_proxy_policy_events_occurred_at ON proxy_policy_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_policy_events_host ON proxy_policy_events (host);
CREATE INDEX IF NOT EXISTS idx_proxy_policy_events_client_ip ON proxy_policy_events (client_ip);
CREATE INDEX IF NOT EXISTS idx_action_audit_logs_created_at ON action_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocking_policies_scope ON blocking_policies (scope_type, scope_value, active);
CREATE INDEX IF NOT EXISTS idx_release_policies_scope ON release_policies (scope_type, scope_value, active);
CREATE INDEX IF NOT EXISTS idx_domain_policies_scope ON domain_policies (scope_type, scope_value, enabled);
CREATE INDEX IF NOT EXISTS idx_domain_policies_type ON domain_policies (policy_type, enabled);
CREATE INDEX IF NOT EXISTS idx_domain_policy_entries_domain ON domain_policy_entries (normalized_domain);
CREATE INDEX IF NOT EXISTS idx_domain_policy_audit_logs_created_at ON domain_policy_audit_logs (created_at DESC);

ALTER TABLE policy_engine_state ADD COLUMN IF NOT EXISTS enforcement_mode VARCHAR(32) NOT NULL DEFAULT 'acl-plus-dns';
ALTER TABLE policy_engine_state ADD COLUMN IF NOT EXISTS compiler_status VARCHAR(32) NOT NULL DEFAULT 'unknown';
ALTER TABLE policy_engine_state ADD COLUMN IF NOT EXISTS compiler_version VARCHAR(128);
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS governance_summary TEXT;
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS legal_basis TEXT;
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS requested_by VARCHAR(128);
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS approval_scope VARCHAR(128);
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(64);
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS review_date DATE;
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS approved_by VARCHAR(128);
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ;
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS revoked_by VARCHAR(128);
ALTER TABLE domain_policies ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS governance_summary TEXT;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS legal_basis TEXT;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS requested_by VARCHAR(128);
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS approval_scope VARCHAR(128);
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(64);
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS review_date DATE;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS approved_by VARCHAR(128);
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS revoked_by VARCHAR(128);
ALTER TABLE policy_exceptions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE OR REPLACE VIEW unified_access_events AS
WITH unified AS (
    SELECT
        'dns'::text AS source,
        id,
        occurred_at,
        host(client_ip) AS client_ip,
        vlan_id,
        lower(query_name) AS domain,
        NULL::text AS url_or_host,
        action,
        policy_source,
        category,
        rule_id,
        matched_rule,
        resolver AS source_detail,
        raw_payload
    FROM dns_policy_events
    WHERE client_ip IS NOT NULL
    UNION ALL
    SELECT
        'proxy'::text AS source,
        id,
        occurred_at,
        host(client_ip) AS client_ip,
        vlan_id,
        lower(host) AS domain,
        url_or_host,
        action,
        proxy_layer AS policy_source,
        category,
        rule_id,
        matched_rule,
        proxy_layer AS source_detail,
        raw_payload
    FROM proxy_policy_events
    WHERE client_ip IS NOT NULL
)
SELECT
    u.source,
    u.id,
    (u.source || ':' || u.id::text) AS event_uid,
    u.occurred_at,
    u.client_ip,
    u.vlan_id,
    vp.label AS vlan_label,
    u.domain,
    u.url_or_host,
    u.action,
    u.policy_source,
    u.category,
    u.rule_id,
    u.matched_rule,
    u.source_detail,
    dp.id AS matched_policy_id,
    dp.name AS matched_policy_name,
    dp.policy_type AS matched_policy_type,
    COALESCE(bp.domain, rp.domain) AS matched_domain,
    CASE
        WHEN u.action = 'bypassed' THEN 'VIP / exceção'
        WHEN dp.name IS NOT NULL THEN dp.name
        WHEN COALESCE(bp.category, rp.category) IS NOT NULL THEN COALESCE(bp.category, rp.category)
        WHEN u.policy_source = 'default' THEN 'Padrão permitido'
        ELSE u.matched_rule
    END AS policy_label,
    u.raw_payload
FROM unified u
LEFT JOIN vlan_policies vp
    ON vp.vlan_id = u.vlan_id
LEFT JOIN blocking_policies bp
    ON (u.matched_rule = ('blocking_policies:' || bp.id::text))
    OR (u.action = 'blocked' AND u.rule_id = bp.id)
LEFT JOIN release_policies rp
    ON (u.matched_rule = ('release_policies:' || rp.id::text))
    OR (u.action = 'allowed' AND u.rule_id = rp.id)
LEFT JOIN domain_policies dp
    ON dp.id = COALESCE(bp.domain_policy_id, rp.domain_policy_id);

CREATE OR REPLACE VIEW domain_attempt_index AS
WITH unified AS (
    SELECT occurred_at, client_ip::text AS client_ip, vlan_id, lower(query_name) AS domain, action
    FROM dns_policy_events
    UNION ALL
    SELECT occurred_at, client_ip::text AS client_ip, vlan_id, lower(host) AS domain, action
    FROM proxy_policy_events
)
SELECT
    domain,
    COUNT(*)::bigint AS total_attempts,
    COUNT(*) FILTER (WHERE action = 'blocked')::bigint AS blocked_attempts,
    COUNT(*) FILTER (WHERE action IN ('allowed', 'bypassed'))::bigint AS allowed_attempts,
    COUNT(DISTINCT client_ip)::bigint AS unique_ips,
    COALESCE((
        SELECT jsonb_agg(vlan_total.vlan_id ORDER BY vlan_total.total DESC)
        FROM (
            SELECT inner_unified.vlan_id, COUNT(*)::bigint AS total
            FROM unified inner_unified
            WHERE inner_unified.domain = unified.domain
              AND inner_unified.vlan_id IS NOT NULL
            GROUP BY inner_unified.vlan_id
            ORDER BY total DESC, inner_unified.vlan_id ASC
            LIMIT 3
        ) AS vlan_total
    ), '[]'::jsonb) AS top_vlans,
    MAX(occurred_at) AS last_seen_at
FROM unified
WHERE domain IS NOT NULL
  AND domain <> ''
GROUP BY domain;
`;

const DEFAULT_VLANS = MANAGED_BLOCKING_VLAN_IDS.map((vlanId) => ({
    vlanId,
    label: vlanId === 10 ? 'Secretaria' : vlanId === 30 ? 'Celulares' : vlanId === 50 ? 'SINE' : 'Visitantes',
    interfaceName: `enp6s0.${vlanId}`,
    subnetCidr: `${INTERNAL_DNS_BY_VLAN[vlanId].replace(/\.1$/, '.0')}/24`,
    exempt: false,
    blockingEnabled: true,
}));

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;
const SCHEMA_LOCK_KEY = 80422061;

const schemaExists = async () => {
    const { rows } = await pool.query(
        `
            SELECT
                to_regclass('public.policy_engine_state') AS policy_engine_state,
                to_regclass('public.dns_contingency_state') AS dns_contingency_state,
                to_regclass('public.vlan_policies') AS vlan_policies,
                to_regclass('public.policy_exceptions') AS policy_exceptions,
                to_regclass('public.domain_policies') AS domain_policies,
                to_regclass('public.domain_policy_entries') AS domain_policy_entries
        `,
    );
    const row = rows[0] || {};
    return Object.values(row).every(Boolean);
};

export const ensureBlockingReleaseSchema = async () => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;

    schemaPromise = (async () => {
        if (await schemaExists()) {
            schemaReady = true;
            return;
        }

        const client = await pool.connect();
        try {
            await client.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);

            if (await schemaExists()) {
                schemaReady = true;
                return;
            }

            await client.query(schemaSql);
            await client.query(`
                INSERT INTO policy_engine_state (
                    id,
                    enforcement_mode,
                    global_blocking_enabled,
                    global_monitoring_enabled,
                    emergency_bypass,
                    health_status,
                    compiler_status,
                    last_validation
                )
                VALUES (1, 'acl-plus-dns', TRUE, TRUE, FALSE, 'unknown', 'unknown', '{}'::jsonb)
                ON CONFLICT (id) DO NOTHING
            `);
            await client.query(`
                INSERT INTO dns_contingency_state (
                    id,
                    status,
                    scope_type,
                    vlan_ids,
                    providers,
                    resolvers,
                    last_test
                )
                VALUES (1, 'normal', 'global', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb)
                ON CONFLICT (id) DO NOTHING
            `);

            for (const vlan of DEFAULT_VLANS) {
                await client.query(
                    `
                        INSERT INTO vlan_policies (
                            vlan_id,
                            label,
                            interface_name,
                            subnet_cidr,
                            exempt,
                            blocking_enabled,
                            monitoring_enabled,
                            custom_policy,
                            policy_mode,
                            whitelist_scope,
                            blacklist_scope
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, 'global', '[]'::jsonb, '[]'::jsonb)
                        ON CONFLICT (vlan_id) DO NOTHING
                    `,
                    [
                        vlan.vlanId,
                        vlan.label,
                        vlan.interfaceName,
                        vlan.subnetCidr,
                        vlan.exempt,
                        vlan.blockingEnabled,
                    ],
                );
            }
        } finally {
            await client.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]).catch(() => undefined);
            client.release();
        }

        schemaReady = true;
    })().catch((error) => {
        throw error;
    }).finally(() => {
        schemaPromise = null;
    });

    return schemaPromise;
};
