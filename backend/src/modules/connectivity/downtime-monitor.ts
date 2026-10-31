import { execFile } from 'child_process';
import { execCmd } from '../../utils/sys';
import { env } from '../../config/env';
import { pool } from '../../config/db';
import { sendTelegram } from '../../utils/telegram';

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

// Segundo alvo de internet (Cloudflare): só para o estado em tempo real. Se o Google não responder ping mas este sim,
// a internet está de pé (evita falso "internet fora"). Não abre incidente nem manda Telegram.
const EXTERNAL2_IP = process.env.EXTERNAL_PING_IP_2 || '1.1.1.1';
const EXTERNAL2_LABEL = process.env.EXTERNAL_PING_LABEL_2 || 'Cloudflare DNS';
// Quantas falhas seguidas (a cada INTERVAL_MS) para o estado em tempo real mudar para "fora" (~6 s); voltar é imediato.
const LIVE_FAIL_AFTER = 3;

export type LinkState = 'checking' | 'ok' | 'no_world' | 'no_gateway';
type LiveProbe = { ip: string; label: string; online: boolean; rtt_ms: number | null; failures: number };

let ex2Failures = 0;
let liveStatus: {
    state: LinkState;
    since: number;
    checked_at: number;
    gateway: LiveProbe;
    world: { online: boolean; rtt_ms: number | null; targets: LiveProbe[] };
} | null = null;

// Ping único sem shell; devolve o tempo de resposta em ms (null = sem resposta).
const pingRtt = (ip: string): Promise<number | null> => new Promise((resolve) => {
    execFile('ping', ['-4', '-c', '1', '-W', '1', '-I', WAN_IFACE, ip], { timeout: 3000 }, (err, stdout) => {
        if (err) return resolve(null);
        const m = String(stdout).match(/time=([\d.]+)/);
        resolve(m ? Math.round(Number(m[1]) * 10) / 10 : 0);
    });
});

const updateLiveStatus = (gw: ProbeState, ex: ProbeState, gwRtt: number | null, exRtt: number | null, ex2Rtt: number | null) => {
    if (ex2Rtt === null) ex2Failures += 1; else ex2Failures = 0;
    const gateway: LiveProbe = { ip: gw.ip, label: gw.label, online: gw.consecutiveFailures < LIVE_FAIL_AFTER, rtt_ms: gwRtt, failures: gw.consecutiveFailures };
    const t1: LiveProbe = { ip: ex.ip, label: ex.label, online: ex.consecutiveFailures < LIVE_FAIL_AFTER, rtt_ms: exRtt, failures: ex.consecutiveFailures };
    const t2: LiveProbe = { ip: EXTERNAL2_IP, label: EXTERNAL2_LABEL, online: ex2Failures < LIVE_FAIL_AFTER, rtt_ms: ex2Rtt, failures: ex2Failures };
    const worldOnline = t1.online || t2.online;
    const rtts = [t1, t2].filter((t) => t.online && t.rtt_ms !== null).map((t) => t.rtt_ms as number);
    const state: LinkState = !gateway.online ? 'no_gateway' : !worldOnline ? 'no_world' : 'ok';
    const now = Date.now();
    liveStatus = {
        state,
        since: liveStatus && liveStatus.state === state ? liveStatus.since : now,
        checked_at: now,
        gateway,
        world: { online: worldOnline, rtt_ms: rtts.length ? Math.min(...rtts) : null, targets: [t1, t2] },
    };
};

// Estado em tempo real do link (último ciclo da sentinela, sem pingar de novo).
// no_gateway: a Secretaria não alcança o gateway do provedor; no_world: o gateway responde, mas a internet além dele não.
export const getLinkStatus = () => ({
    provider: env.wanProviderName,
    interface: WAN_IFACE,
    interval_ms: INTERVAL_MS,
    ...(liveStatus || { state: 'checking' as LinkState, since: Date.now(), checked_at: 0, gateway: { ip: GATEWAY_IP, label: `${env.wanProviderName} gateway`, online: true, rtt_ms: null, failures: 0 }, world: { online: true, rtt_ms: null, targets: [] } }),
});

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

    let ticking = false;
    const tick = async () => {
        if (ticking) return;
        ticking = true;
        try {
            const [gwRtt, exRtt, ex2Rtt] = await Promise.all([pingRtt(targets[0].ip), pingRtt(targets[1].ip), pingRtt(EXTERNAL2_IP)]);
            const rttOf = [gwRtt, exRtt];
            for (const [idx, target] of targets.entries()) {
                const isOnline = rttOf[idx] !== null;
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
                        void sendTelegram(`🔌 LINK FORA: ${target.label}\n\nCaminho: ${target.path}. Se a internet inteira caiu, este aviso só chega quando ela voltar.`);
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
                        const lostSeconds = Math.max(0, Math.round(target.consecutiveFailures * INTERVAL_MS / 1000));
                        console.warn(`[LINK-SENTINEL] RESTABELECIDO: ${target.label} via ${WAN_IFACE}`);
                        void sendTelegram(`✅ LINK RESTABELECIDO: ${target.label}\n\nCaminho: ${target.path}. Ficou sem resposta por cerca de ${lostSeconds >= 120 ? `${Math.round(lostSeconds / 60)} min` : `${lostSeconds} s`}.`);
                        target.currentIncidentId = null;
                    }
                    target.consecutiveFailures = 0;
                }
            }
            updateLiveStatus(targets[0], targets[1], gwRtt, exRtt, ex2Rtt);
        } catch (e) {
            console.error('[LINK-SENTINEL] Falha na sentinela de link:', e);
        } finally {
            ticking = false;
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
