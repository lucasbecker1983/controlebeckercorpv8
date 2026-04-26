import fs from 'fs';
import { pool } from '../config/db';
import { env } from '../config/env';
import { extractVlanIdFromIp } from './blocking-release-scope';
import { execCmd } from '../utils/sys';

export const VLAN_GATEWAYS: Record<string, string> = {
    'enp6s0.10': '192.168.10.1',
    'enp6s0.30': '192.168.30.1',
    'enp6s0.40': '192.168.40.1',
    'enp6s0.50': '192.168.50.1',
    'enp6s0.70': '192.168.70.1',
    'enp6s0.80': '192.168.80.1',
    'enp6s0.99': '192.168.99.1',
};

export const INTERCEPT_VLANS = ['enp6s0.10', 'enp6s0.30', 'enp6s0.50', 'enp6s0.70'] as const;
export const ENGINE_MODE_FILE = `${env.rulesDir}/engine_mode.json`;
export const BYPASS_FILE = `${env.rulesDir}/bypassed_vlans.json`;

export type InterceptionMode = 'off' | 'http-only' | 'http-https';

type BypassState = {
    global: boolean;
    vlans: Record<string, boolean>;
};

const defaultBypassVlanMap = () => ({
    'enp6s0.10': false,
    'enp6s0.30': false,
    'enp6s0.40': true,
    'enp6s0.50': false,
    'enp6s0.70': false,
    'enp6s0.80': true,
    'enp6s0.99': true,
});

export const defaultBypassState = (): BypassState => ({
    global: false,
    vlans: defaultBypassVlanMap(),
});

const ensureRulesDir = () => {
    fs.mkdirSync(env.rulesDir, { recursive: true });
};

export const readBypassState = (): BypassState => {
    try {
        if (!fs.existsSync(BYPASS_FILE)) return defaultBypassState();
        const parsed = JSON.parse(fs.readFileSync(BYPASS_FILE, 'utf8'));
        return {
            global: Boolean(parsed.global),
            vlans: {
                ...defaultBypassVlanMap(),
                ...(parsed.vlans || {}),
            },
        };
    } catch {
        return defaultBypassState();
    }
};

export const writeBypassState = (state: BypassState) => {
    ensureRulesDir();
    fs.writeFileSync(BYPASS_FILE, JSON.stringify(state, null, 2));
};

export const readEngineMode = (): InterceptionMode => {
    try {
        if (!fs.existsSync(ENGINE_MODE_FILE)) return 'http-https';
        const parsed = JSON.parse(fs.readFileSync(ENGINE_MODE_FILE, 'utf8'));
        if (parsed.mode === 'http-only' || parsed.mode === 'http-https' || parsed.mode === 'off') {
            return parsed.mode;
        }
        return 'http-https';
    } catch {
        return 'http-https';
    }
};

export const writeEngineMode = (mode: InterceptionMode) => {
    ensureRulesDir();
    fs.writeFileSync(ENGINE_MODE_FILE, JSON.stringify({ mode }, null, 2));
};

export const isSquidActive = async (): Promise<boolean> => {
    try {
        const out = await execCmd('systemctl is-active squid || true');
        return out.trim() === 'active';
    } catch {
        return false;
    }
};

export const isLoggerActive = async (): Promise<boolean> => {
    try {
        const out = await execCmd("ps -ef | grep -E 'node .*ingester|dist/ingester.js' | grep -v grep || true");
        return out.trim().length > 0;
    } catch {
        return false;
    }
};

export const readPreroutingRules = async (): Promise<string[]> => {
    const out = await execCmd('iptables -t nat -S PREROUTING');
    return out.split('\n').map((line) => line.trim()).filter(Boolean);
};

const listPorts = (rules: string[]) => {
    const has80 = rules.some((line) => line.includes('--dport 80') && line.includes('REDIRECT'));
    const has443 = rules.some((line) => line.includes('--dport 443') && line.includes('REDIRECT'));
    const ports: number[] = [];
    if (has80) ports.push(80);
    if (has443) ports.push(443);
    return ports;
};

const hasRedirectFor = (rules: string[], iface: string, port: 80 | 443) => (
    rules.some((line) =>
        line.includes(`-i ${iface} `) &&
        line.includes(`--dport ${port}`) &&
        line.includes('REDIRECT')
    )
);

export const getVlanStatus = async () => {
    const rules = await readPreroutingRules();
    return Object.fromEntries(
        Object.keys(VLAN_GATEWAYS).map((iface) => [
            iface,
            hasRedirectFor(rules, iface, 80) || hasRedirectFor(rules, iface, 443),
        ]),
    ) as Record<string, boolean>;
};

const getModeFromRules = (rules: string[]): InterceptionMode => {
    const ports = listPorts(rules);
    if (ports.includes(80) && ports.includes(443)) return 'http-https';
    if (ports.includes(80)) return 'http-only';
    return 'off';
};

const getInterfacesByMode = (rules: string[], modePort: 80 | 443) =>
    INTERCEPT_VLANS.filter((iface) => hasRedirectFor(rules, iface, modePort));

const saveRules = async () => {
    try {
        await execCmd('netfilter-persistent save');
    } catch {
        // Sem fallback genérico de shell aqui. Persistência do firewall fica
        // dependente do host ter netfilter-persistent configurado.
    }
};

const addReturnRules = async (iface: string, gateway: string) => {
    await execCmd(`iptables -t nat -A PREROUTING -i ${iface} -s ${gateway} -j RETURN`);
    await execCmd(`iptables -t nat -A PREROUTING -i ${iface} -p udp --dport 53 -j RETURN`);
    await execCmd(`iptables -t nat -A PREROUTING -i ${iface} -p tcp --dport 53 -j RETURN`);
    await execCmd(`iptables -t nat -A PREROUTING -i ${iface} -d ${gateway} -j RETURN`);
};

const addRedirectRules = async (iface: string, mode: InterceptionMode) => {
    await execCmd(`iptables -t nat -A PREROUTING -i ${iface} -p tcp --dport 80 -j REDIRECT --to-port 3128`);
    if (mode === 'http-https') {
        await execCmd(`iptables -t nat -A PREROUTING -i ${iface} -p tcp --dport 443 -j REDIRECT --to-port 3129`);
    }
};

export const removeRedirects = async () => {
    for (const iface of Object.keys(VLAN_GATEWAYS)) {
        const gateway = VLAN_GATEWAYS[iface];
        for (let i = 0; i < 5; i++) {
            await execCmd(`iptables -t nat -D PREROUTING -i ${iface} -p tcp --dport 80 -j REDIRECT --to-port 3128 || true`);
            await execCmd(`iptables -t nat -D PREROUTING -i ${iface} -p tcp --dport 443 -j REDIRECT --to-port 3129 || true`);
        }
        for (let i = 0; i < 3; i++) {
            await execCmd(`iptables -t nat -D PREROUTING -i ${iface} -s ${gateway} -j RETURN || true`);
            await execCmd(`iptables -t nat -D PREROUTING -i ${iface} -p udp --dport 53 -j RETURN || true`);
            await execCmd(`iptables -t nat -D PREROUTING -i ${iface} -p tcp --dport 53 -j RETURN || true`);
            await execCmd(`iptables -t nat -D PREROUTING -i ${iface} -d ${gateway} -j RETURN || true`);
        }
    }
    await saveRules();
};

export const applyRedirects = async (mode: InterceptionMode) => {
    await removeRedirects();
    if (mode === 'off') return;

    const bypass = readBypassState();
    if (bypass.global) return;

    for (const iface of INTERCEPT_VLANS) {
        if (bypass.vlans[iface]) continue;
        const gateway = VLAN_GATEWAYS[iface];
        await addReturnRules(iface, gateway);
        await addRedirectRules(iface, mode);
    }
    await saveRules();
};

export const setBypass = async ({
    iface,
    isGlobal,
    enabled,
}: {
    iface?: string;
    isGlobal?: boolean;
    enabled: boolean;
}) => {
    const state = readBypassState();
    if (isGlobal) {
        state.global = enabled;
    } else if (iface) {
        state.vlans[iface] = enabled;
    }

    writeBypassState(state);

    if (await isSquidActive()) {
        await applyRedirects(readEngineMode());
    } else {
        await removeRedirects();
    }

    return state;
};

export const getEngineStatus = async () => {
    const [squidActive, loggerActive, preroutingRules, vlanStatus, bypass, auditSample] = await Promise.all([
        isSquidActive(),
        isLoggerActive(),
        readPreroutingRules(),
        getVlanStatus(),
        Promise.resolve(readBypassState()),
        pool.query(`
            SELECT client_ip
            FROM proxy_audit_log
            WHERE timestamp >= NOW() - INTERVAL '15 minutes'
            ORDER BY timestamp DESC
            LIMIT 300
        `).catch(() => ({ rows: [] })),
    ]);

    const localNoiseClients = new Set<string>();
    const realClients = new Set<string>();

    for (const row of auditSample.rows) {
        const clientIp = String(row.client_ip || '').trim();
        if (!clientIp) continue;
        if (clientIp === '127.0.0.1' || clientIp === '::1') {
            localNoiseClients.add(clientIp);
            continue;
        }
        if (extractVlanIdFromIp(clientIp) !== null) {
            realClients.add(clientIp);
        }
    }

    const activePorts = listPorts(preroutingRules);
    const activeVlans = Object.entries(vlanStatus).filter(([, enabled]) => enabled).map(([iface]) => iface);
    const interceptionMode = squidActive ? getModeFromRules(preroutingRules) : 'off';

    return {
        squid_active: squidActive,
        intercepting: squidActive && activePorts.length > 0 && activeVlans.length > 0 && !bypass.global,
        interception_mode: interceptionMode,
        active_ports: activePorts,
        active_vlans: activeVlans,
        bypass_enabled: bypass.global || Object.values(bypass.vlans).some(Boolean),
        bypassed_vlans: Object.entries(bypass.vlans).filter(([, enabled]) => enabled).map(([iface]) => iface),
        logger_active: loggerActive,
        prerouting_rules: preroutingRules,
        real_clients_seen: Array.from(realClients),
        local_noise_seen: Array.from(localNoiseClients),
        vlans: vlanStatus,
        bypass,
        source_of_truth: 'engine',
    };
};

export const startEngine = async (mode: InterceptionMode) => {
    writeEngineMode(mode);

    if (!await isSquidActive()) {
        await execCmd('systemctl start squid');
    }

    let active = false;
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        active = await isSquidActive();
        if (active) break;
    }

    if (!active) {
        const logs = await execCmd('journalctl -u squid -n 10 --no-pager').catch(() => '');
        return {
            ok: false,
            status: 500,
            payload: {
                success: false,
                error: 'Squid não ficou ativo em 10 segundos. REDIRECTs não foram aplicados.',
                logs,
            },
        };
    }

    await applyRedirects(mode);
    return {
        ok: true,
        status: 200,
        payload: {
            success: true,
            message: mode === 'http-only'
                ? 'Squid ativo. Interceptação HTTP-only aplicada em 10, 30, 50 e 70.'
                : 'Squid ativo. Interceptação HTTP+HTTPS aplicada em 10, 30, 50 e 70.',
        },
    };
};

export const stopEngine = async () => {
    writeEngineMode('off');
    await removeRedirects();
    await execCmd('systemctl stop squid');
    return {
        success: true,
        message: 'REDIRECTs removidos. Squid parado. Internet em modo direto.',
    };
};
