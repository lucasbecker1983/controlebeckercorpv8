import { pool } from '../config/db';

const schemaSql = `
CREATE TABLE IF NOT EXISTS proxy_engine_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    mode VARCHAR(32) NOT NULL DEFAULT 'off',
    squid_active BOOLEAN NOT NULL DEFAULT FALSE,
    interception_active BOOLEAN NOT NULL DEFAULT FALSE,
    dns_logger_active BOOLEAN NOT NULL DEFAULT FALSE,
    bypass_global BOOLEAN NOT NULL DEFAULT TRUE,
    active_ports JSONB NOT NULL DEFAULT '[]'::jsonb,
    test_target_ip INET,
    last_action TEXT,
    last_action_by TEXT,
    last_validation JSONB,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_vlans (
    id SERIAL PRIMARY KEY,
    vlan_key VARCHAR(32) NOT NULL UNIQUE,
    interface_name VARCHAR(64) NOT NULL,
    cidr VARCHAR(64) NOT NULL,
    description TEXT,
    interception_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_vips (
    id SERIAL PRIMARY KEY,
    ip VARCHAR(64) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    source VARCHAR(32) NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_blocklist (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    source VARCHAR(32) NOT NULL DEFAULT 'manual',
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_whitelist (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(128),
    source VARCHAR(32) NOT NULL DEFAULT 'manual',
    protected BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_radar_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    vlan_id VARCHAR(32),
    interface_name VARCHAR(64),
    client_ip VARCHAR(45),
    domain VARCHAR(255),
    event_type VARCHAR(64),
    evidence VARCHAR(64),
    status VARCHAR(64),
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    source VARCHAR(64),
    raw_payload JSONB
);

CREATE TABLE IF NOT EXISTS proxy_action_logs (
    id BIGSERIAL PRIMARY KEY,
    action VARCHAR(128) NOT NULL,
    requested_by VARCHAR(128),
    payload JSONB,
    result JSONB,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proxy_certificates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    key_path TEXT,
    fingerprint VARCHAR(255) NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE proxy_engine_state ADD COLUMN IF NOT EXISTS last_validation JSONB;
ALTER TABLE proxy_engine_state ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE proxy_engine_state ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE proxy_engine_state ALTER COLUMN test_target_ip DROP NOT NULL;
ALTER TABLE proxy_engine_state ALTER COLUMN test_target_ip DROP DEFAULT;
ALTER TABLE proxy_certificates ADD COLUMN IF NOT EXISTS key_path TEXT;
ALTER TABLE proxy_action_logs ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE proxy_vips ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE proxy_vips ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'manual';
ALTER TABLE proxy_vips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE proxy_vips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_proxy_radar_events_occurred_at ON proxy_radar_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_radar_events_client_ip ON proxy_radar_events (client_ip);
CREATE INDEX IF NOT EXISTS idx_proxy_radar_events_domain ON proxy_radar_events (domain);
CREATE INDEX IF NOT EXISTS idx_proxy_action_logs_created_at ON proxy_action_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proxy_certificates_active ON proxy_certificates (active);
CREATE INDEX IF NOT EXISTS idx_proxy_blocklist_active ON proxy_blocklist (active);
CREATE INDEX IF NOT EXISTS idx_proxy_whitelist_active ON proxy_whitelist (active);
`;

let schemaReady = false;

export const ensureProxySchema = async () => {
    if (schemaReady) return;

    await pool.query(schemaSql);
    await pool.query(`
        INSERT INTO proxy_engine_state (
            id,
            mode,
            squid_active,
            interception_active,
            dns_logger_active,
            bypass_global,
            active_ports,
            test_target_ip,
            last_action,
            last_action_by
        )
        VALUES (
            1,
            'off',
            FALSE,
            FALSE,
            FALSE,
            TRUE,
            '[]'::jsonb,
            NULL,
            'bootstrap:init',
            'system'
        )
        ON CONFLICT (id) DO NOTHING
    `);

    await pool.query(`
        INSERT INTO proxy_vlans (vlan_key, interface_name, cidr, description, interception_enabled)
        VALUES ('VLAN10', 'enp6s0.10', '192.168.10.0/24', 'VLAN 10 com escopo administrativo de política', FALSE)
        ON CONFLICT (vlan_key) DO NOTHING
    `);

    schemaReady = true;
};
