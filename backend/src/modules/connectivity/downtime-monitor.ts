import { execCmd } from '../../utils/sys';
import { env } from '../../config/env';
import { pool } from '../../config/db';

const GATEWAY_IP = env.gatewayIp;
const EXTERNAL_IP = env.externalPingIp;
const WAN_IFACE = env.wanInterface;
const THRESHOLD = 10;
const INTERVAL_MS = 2000;

type LinkTarget = 'provider_gateway' | 'external_internet';

type ProbeState = {
    target: LinkTarget;
    label: string;
    ip: string;
    path: string;
    consecutiveFailures: number;
    currentIncidentId: number | null;
    lastOnline: boolean | null;
    lastCheckedAt: Date | null;
};

const targets: ProbeState[] = [
    {
        target: 'provider_gateway',
        label: `${env.wanProviderName} gateway`,
        ip: GATEWAY_IP,
        path: 'Secretaria -> Provedor',
        consecutiveFailures: 0,
        currentIncidentId: null,
        lastOnline: null,
        lastCheckedAt: null,
    },
    {
        target: 'external_internet',
        label: env.externalPingLabel,
        ip: EXTERNAL_IP,
        path: 'Secretaria -> Provedor -> Internet',
        consecutiveFailures: 0,
        currentIncidentId: null,
        lastOnline: null,
        lastCheckedAt: null,
    },
];

let started = false;

const ensureSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS net_link_downtime (
            id SERIAL PRIMARY KEY,
            gateway_ip TEXT NOT NULL,
            start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            end_at TIMESTAMPTZ,
            duration DOUBLE PRECISION,
            reason TEXT,
            packets_lost INTEGER DEFAULT 0
        )
    `);
    await pool.query(`ALTER TABLE net_link_downtime ADD COLUMN IF NOT EXISTS target_key TEXT`);
    await pool.query(`ALTER TABLE net_link_downtime ADD COLUMN IF NOT EXISTS target_label TEXT`);
    await pool.query(`ALTER TABLE net_link_downtime ADD COLUMN IF NOT EXISTS path_label TEXT`);
    await pool.query(`ALTER TABLE net_link_downtime ADD COLUMN IF NOT EXISTS wan_interface TEXT`);
    await pool.query(`ALTER TABLE net_link_downtime ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE net_link_downtime ALTER COLUMN duration TYPE DOUBLE PRECISION USING duration::double precision`);
    await pool.query(`ALTER TABLE net_link_downtime ALTER COLUMN reason TYPE TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_net_link_downtime_target_start ON net_link_downtime (target_key, start_at DESC)`);
};

const hydrateOpenIncidents = async () => {
    for (const target of targets) {
        const result = await pool.query(
            `SELECT id, packets_lost
             FROM net_link_downtime
             WHERE end_at IS NULL
               AND (
                 target_key = $1
                 OR (target_key IS NULL AND gateway_ip = $2)
               )
             ORDER BY start_at DESC
             LIMIT 1`,
            [target.target, target.ip],
        );
        if (result.rows[0]) {
            target.currentIncidentId = Number(result.rows[0].id);
            target.consecutiveFailures = Number(result.rows[0].packets_lost || THRESHOLD);
        }
    }
};

export const getLinkSentinelSnapshot = async () => {
    const probes = await Promise.all(targets.map(async (target) => {
        const online = await pingCheck(target.ip);
        target.lastOnline = online;
        target.lastCheckedAt = new Date();
        return {
            key: target.target,
            label: target.label,
            ip: target.ip,
            path: target.path,
            interface: WAN_IFACE,
            online,
            consecutive_failures: target.consecutiveFailures,
            active_incident_id: target.currentIncidentId,
            last_checked_at: target.lastCheckedAt.toISOString(),
        };
    }));

    return {
        provider: env.wanProviderName,
        interface: WAN_IFACE,
        threshold_failures: THRESHOLD,
        interval_ms: INTERVAL_MS,
        gateway: probes.find((probe) => probe.key === 'provider_gateway'),
        external: probes.find((probe) => probe.key === 'external_internet'),
        probes,
    };
};

export const startLinkMonitor = async () => {
    if (started) return;
    started = true;
    await ensureSchema();
    await hydrateOpenIncidents();

    const tick = async () => {
        try {
            for (const target of targets) {
                const isOnline = await pingCheck(target.ip);
                target.lastOnline = isOnline;
                target.lastCheckedAt = new Date();

                if (!isOnline) {
                    target.consecutiveFailures++;
                    if (target.consecutiveFailures >= THRESHOLD && !target.currentIncidentId) {
                        const res = await pool.query(
                            `INSERT INTO net_link_downtime
                                (gateway_ip, target_key, target_label, path_label, wan_interface, start_at, reason, packets_lost, last_checked_at)
                             VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, NOW())
                             RETURNING id`,
                            [
                                target.ip,
                                target.target,
                                target.label,
                                target.path,
                                WAN_IFACE,
                                `Sentinela ${target.label} indisponivel via ${WAN_IFACE}: ${target.path}`,
                                target.consecutiveFailures,
                            ]
                        );
                        target.currentIncidentId = res.rows[0].id;
                        console.error(`[LINK-SENTINEL] ALERTA: ${target.label} caiu via ${WAN_IFACE} (${target.path})`);
                    }

                    if (target.currentIncidentId) {
                        await pool.query(
                            "UPDATE net_link_downtime SET packets_lost = $1, last_checked_at = NOW() WHERE id = $2",
                            [target.consecutiveFailures, target.currentIncidentId]
                        );
                    }
                } else {
                    if (target.currentIncidentId) {
                        await pool.query(
                            "UPDATE net_link_downtime SET end_at = NOW(), duration = EXTRACT(EPOCH FROM (NOW() - start_at)), last_checked_at = NOW() WHERE id = $1",
                            [target.currentIncidentId]
                        );
                        console.warn(`[LINK-SENTINEL] RESTABELECIDO: ${target.label} via ${WAN_IFACE}`);
                        target.currentIncidentId = null;
                    }
                    target.consecutiveFailures = 0;
                }
            }
        } catch (e) {
            console.error('[LINK-SENTINEL] Falha na sentinela de link:', e);
        }
    };

    await tick();
    const timer = setInterval(tick, INTERVAL_MS);
    timer.unref?.();
};

const pingCheck = async (ip: string): Promise<boolean> => {
    try {
        const result = await execCmd(`ping -4 -c 1 -W 1 -I ${WAN_IFACE} ${ip} > /dev/null 2>&1 && echo true || echo false`);
        return result.trim() === 'true';
    } catch { return false; }
};
