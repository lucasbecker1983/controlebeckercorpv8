import { Router } from 'express';
import { pool } from '../../config/db';
import { execCmd, execCmdStrict } from '../../utils/sys';

const router = Router();

const MANAGED_INTERFACES = [
    'enp6s0.10',
    'enp6s0.30',
    'enp6s0.40',
    'enp6s0.50',
    'enp6s0.70',
    'enp6s0.80',
] as const;

const IPV4_PATTERN = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

let schemaPromise: Promise<void> | null = null;

type QosVipInput = {
    ip?: string;
    label?: string;
};

type RuntimeState = {
    active: boolean;
    mode: 'managed' | 'legacy' | 'absent';
    download: {
        active: boolean;
        defaultClass: string | null;
        classes: string[];
        vipFilterCount: number;
    };
    upload: {
        active: boolean;
        ifb: string;
        redirectActive: boolean;
        defaultClass: string | null;
        classes: string[];
        vipFilterCount: number;
    };
};

const ensureSchema = async () => {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS net_qos_policies (
                    interface VARCHAR(64) PRIMARY KEY,
                    down_limit INTEGER NOT NULL DEFAULT 0,
                    up_limit INTEGER NOT NULL DEFAULT 0,
                    active BOOLEAN NOT NULL DEFAULT TRUE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);
            await pool.query(`
                ALTER TABLE net_qos_policies
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS net_qos_vips (
                    id BIGSERIAL PRIMARY KEY,
                    interface VARCHAR(64) NOT NULL REFERENCES net_qos_policies(interface) ON DELETE CASCADE,
                    ip INET NOT NULL,
                    label TEXT NOT NULL DEFAULT 'VIP',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);
            await pool.query(`
                ALTER TABLE net_qos_vips
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            `);
            await pool.query(`
                ALTER TABLE net_qos_vips
                ALTER COLUMN label SET DEFAULT 'VIP'
            `);
            await pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_net_qos_vips_interface_ip
                ON net_qos_vips (interface, ip)
            `);
        })().catch((error) => {
            schemaPromise = null;
            throw error;
        });
    }

    await schemaPromise;
};

export const qosSchemaService = {
    ensureSchema,
};

const reconcileAllPolicies = async () => {
    await ensureSchema();

    const client = await pool.connect();
    try {
        const policies = await client.query(`
            SELECT interface, down_limit, up_limit
            FROM net_qos_policies
            ORDER BY interface
        `);

        const policyMap = new Map(policies.rows.map((row) => [row.interface, row]));
        const results = [];

        // Reconcile all managed interfaces — including those without a DB entry
        const allInterfaces = new Set<string>([
            ...MANAGED_INTERFACES,
            ...policies.rows.map((row) => row.interface),
        ]);

        for (const iface of allInterfaces) {
            const policy = policyMap.get(iface) || null;
            const downLimit = Number(policy?.down_limit || 0);
            const upLimit = Number(policy?.up_limit || 0);

            let normalizedVips: Array<{ ip: string; label: string }> = [];
            if (policy) {
                const vips = await client.query(
                    'SELECT ip::text AS ip, label FROM net_qos_vips WHERE interface = $1 ORDER BY ip',
                    [iface],
                );
                normalizedVips = normalizeVips(vips.rows);
            }
            const runtime = await applyPolicyToKernel(iface, downLimit, upLimit, normalizedVips);

            results.push({
                interface: iface,
                down_limit: downLimit,
                up_limit: upLimit,
                vip_count: normalizedVips.length,
                runtime,
            });
        }

        return results;
    } finally {
        client.release();
    }
};

export const qosRuntimeService = {
    reconcileAllPolicies,
};

const isManagedInterface = (iface: string) => MANAGED_INTERFACES.includes(iface as (typeof MANAGED_INTERFACES)[number]);

const getIfbName = (iface: string) => {
    const suffix = iface.split('.').pop() || iface.replace(/[^\d]/g, '');
    return `ifb${suffix}`;
};

const parseDefaultClass = (qdiscText: string) => {
    const defaultClassMatch = qdiscText.match(/default 0x([0-9a-f]+)/i);
    return defaultClassMatch ? `1:${defaultClassMatch[1].toLowerCase()}` : null;
};

const parseClasses = (classesOutput: string) => {
    return Array.from(classesOutput.matchAll(/class htb ([\d:]+)/g)).map((match) => match[1]);
};

const ensureIfbDevice = async (ifb: string) => {
    await execCmdStrict('sudo modprobe ifb');

    const linksOutput = await execCmd('ip -o link show');
    if (!new RegExp(`:\\s+${ifb}:`).test(linksOutput)) {
        await execCmdStrict(`sudo ip link add ${ifb} type ifb`);
    }

    await execCmdStrict(`sudo ip link set dev ${ifb} up`);
};

const normalizeVips = (vips: unknown): Array<{ ip: string; label: string }> => {
    if (!Array.isArray(vips)) return [];

    const seen = new Set<string>();
    const normalized: Array<{ ip: string; label: string }> = [];

    for (const item of vips as QosVipInput[]) {
        const ip = String(item?.ip || '').trim();
        const label = String(item?.label || 'VIP').trim() || 'VIP';

        if (!ip) continue;
        if (!IPV4_PATTERN.test(ip)) {
            throw new Error(`IP VIP inválido para QoS: ${ip}`);
        }
        if (seen.has(ip)) continue;

        seen.add(ip);
        normalized.push({ ip, label });
    }

    return normalized;
};

const inspectRuntime = async (iface: string): Promise<RuntimeState> => {
    const ifb = getIfbName(iface);
    const [qdisc, classesOutput, filtersOutput, ingressQdisc, ingressFilters, ifbQdisc, ifbClassesOutput, ifbFiltersOutput] = await Promise.all([
        execCmd(`sudo tc qdisc show dev ${iface}`),
        execCmd(`sudo tc class show dev ${iface}`),
        execCmd(`sudo tc filter show dev ${iface} parent 1:`),
        execCmd(`sudo tc qdisc show dev ${iface} ingress`),
        execCmd(`sudo tc filter show dev ${iface} parent ffff:`),
        execCmd(`sudo tc qdisc show dev ${ifb}`),
        execCmd(`sudo tc class show dev ${ifb}`),
        execCmd(`sudo tc filter show dev ${ifb} parent 1:`),
    ]);

    const qdiscText = qdisc.trim();
    const classMatches = parseClasses(classesOutput);
    const defaultClass = parseDefaultClass(qdiscText);
    const hasManagedDownload = classMatches.includes('1:10') && classMatches.includes('1:20');
    const hasAnyDownloadState = Boolean(qdiscText || classesOutput.trim() || filtersOutput.trim());
    const downloadVipFilterCount = (filtersOutput.match(/\bflowid 1:20\b/g) || []).length;

    const ifbQdiscText = ifbQdisc.trim();
    const ifbClassMatches = parseClasses(ifbClassesOutput);
    const ifbDefaultClass = parseDefaultClass(ifbQdiscText);
    const redirectActive = /mirred.+redirect to device/.test(ingressFilters) || new RegExp(`mirred.+\\b${ifb}\\b`).test(ingressFilters);
    const hasManagedUpload = redirectActive && ifbClassMatches.includes('1:10') && ifbClassMatches.includes('1:20');
    const hasAnyUploadState = Boolean(ingressQdisc.trim() || ingressFilters.trim() || ifbQdiscText || ifbClassesOutput.trim() || ifbFiltersOutput.trim());
    const uploadVipFilterCount = (ifbFiltersOutput.match(/\bflowid 1:20\b/g) || []).length;
    const hasAnyState = hasAnyDownloadState || hasAnyUploadState;
    const mode = hasAnyState
        ? (hasManagedDownload || hasManagedUpload ? 'managed' : 'legacy')
        : 'absent';

    return {
        active: hasAnyState,
        mode,
        download: {
            active: hasAnyDownloadState,
            defaultClass,
            classes: classMatches,
            vipFilterCount: downloadVipFilterCount,
        },
        upload: {
            active: hasAnyUploadState,
            ifb,
            redirectActive,
            defaultClass: ifbDefaultClass,
            classes: ifbClassMatches,
            vipFilterCount: uploadVipFilterCount,
        },
    };
};

const applyPolicyToKernel = async (iface: string, downLim: number, upLim: number, vips: Array<{ ip: string; label: string }>) => {
    const ifb = getIfbName(iface);

    await execCmd(`sudo tc qdisc del dev ${iface} root 2>/dev/null || true`);
    await execCmd(`sudo tc qdisc del dev ${iface} ingress 2>/dev/null || true`);
    await execCmd(`sudo tc qdisc del dev ${ifb} root 2>/dev/null || true`);

    if (downLim > 0) {
        await execCmdStrict(`sudo tc qdisc add dev ${iface} root handle 1: htb default 10`);
        await execCmdStrict(`sudo tc class add dev ${iface} parent 1: classid 1:1 htb rate 1000mbit`);
        await execCmdStrict(`sudo tc class add dev ${iface} parent 1:1 classid 1:10 htb rate ${downLim}mbit ceil ${downLim}mbit`);
        await execCmdStrict(`sudo tc class add dev ${iface} parent 1:1 classid 1:20 htb rate 1000mbit ceil 1000mbit`);

        for (const vip of vips) {
            await execCmdStrict(`sudo tc filter add dev ${iface} protocol ip parent 1:0 prio 1 u32 match ip dst ${vip.ip}/32 flowid 1:20`);
        }
    }

    if (upLim > 0) {
        await ensureIfbDevice(ifb);
        await execCmdStrict(`sudo tc qdisc add dev ${iface} handle ffff: ingress`);
        await execCmdStrict(`sudo tc filter add dev ${iface} parent ffff: protocol ip prio 1 u32 match u32 0 0 action mirred egress redirect dev ${ifb}`);
        await execCmdStrict(`sudo tc qdisc add dev ${ifb} root handle 1: htb default 10`);
        await execCmdStrict(`sudo tc class add dev ${ifb} parent 1: classid 1:1 htb rate 1000mbit`);
        await execCmdStrict(`sudo tc class add dev ${ifb} parent 1:1 classid 1:10 htb rate ${upLim}mbit ceil ${upLim}mbit`);
        await execCmdStrict(`sudo tc class add dev ${ifb} parent 1:1 classid 1:20 htb rate 1000mbit ceil 1000mbit`);

        for (const vip of vips) {
            await execCmdStrict(`sudo tc filter add dev ${ifb} protocol ip parent 1:0 prio 1 u32 match ip src ${vip.ip}/32 flowid 1:20`);
        }
    }

    return inspectRuntime(iface);
};

const loadPolicies = async () => {
    await ensureSchema();

    const [policies, vips] = await Promise.all([
        pool.query(`
            SELECT interface, down_limit, up_limit, active, updated_at
            FROM net_qos_policies
            ORDER BY interface
        `),
        pool.query(`
            SELECT interface, ip::text AS ip, label, created_at
            FROM net_qos_vips
            ORDER BY interface, ip
        `),
    ]);

    const vipMap = new Map<string, Array<{ ip: string; label: string; created_at: string }>>();
    for (const row of vips.rows) {
        const list = vipMap.get(row.interface) || [];
        list.push(row);
        vipMap.set(row.interface, list);
    }

    const interfaceNames = new Set<string>([
        ...MANAGED_INTERFACES,
        ...policies.rows.map((row) => row.interface),
        ...vips.rows.map((row) => row.interface),
    ]);

    const entries = await Promise.all(
        Array.from(interfaceNames).map(async (iface) => {
            const policy = policies.rows.find((row) => row.interface === iface) || null;
            const runtime = await inspectRuntime(iface);
            const scopedVips = vipMap.get(iface) || [];
            const downLimit = Number(policy?.down_limit || 0);
            const upLimit = Number(policy?.up_limit || 0);

            return [
                iface,
                {
                    interface: iface,
                    down_limit: downLimit,
                    up_limit: upLimit,
                    active: Boolean(policy?.active) && (downLimit > 0 || upLimit > 0),
                    vips: scopedVips,
                    runtime,
                    runtime_synced:
                        (
                            (downLimit <= 0 && !runtime.download.active) ||
                            (
                                downLimit > 0 &&
                                runtime.download.defaultClass === '1:10' &&
                                runtime.download.vipFilterCount === scopedVips.length
                            )
                        ) &&
                        (
                            (upLimit <= 0 && !runtime.upload.active) ||
                            (
                                upLimit > 0 &&
                                runtime.upload.redirectActive &&
                                runtime.upload.defaultClass === '1:10' &&
                                runtime.upload.vipFilterCount === scopedVips.length
                            )
                        ),
                    warnings: [
                        ...(runtime.mode === 'legacy' ? ['A interface ainda está com um modelo antigo de tc e precisa ser reaplicada.'] : []),
                        ...(upLimit > 0 && !runtime.upload.redirectActive ? ['O runtime de upload ainda não está redirecionando o ingresso para a IFB desta VLAN.'] : []),
                    ],
                },
            ] as const;
        }),
    );

    return Object.fromEntries(entries);
};

router.get('/', async (_req, res) => {
    try {
        const result = await loadPolicies();
        res.json(result);
    } catch (error) {
        console.error('QoS List Error:', error);
        res.status(500).json({ error: 'Falha ao carregar estado do QoS.' });
    }
});

router.post('/apply', async (req, res) => {
    const iface = String(req.body?.interface || '').trim();
    const downLim = Number.parseInt(String(req.body?.download ?? '0'), 10) || 0;
    const upLim = Number.parseInt(String(req.body?.upload ?? '0'), 10) || 0;

    if (!isManagedInterface(iface)) {
        return res.status(400).json({ error: 'Interface de QoS inválida para este módulo.' });
    }

    if (downLim < 0 || upLim < 0) {
        return res.status(400).json({ error: 'Os limites de QoS não podem ser negativos.' });
    }

    let normalizedVips: Array<{ ip: string; label: string }> = [];
    try {
        normalizedVips = normalizeVips(req.body?.vips);
    } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'VIP inválido.' });
    }

    const client = await pool.connect();

    try {
        await ensureSchema();
        const runtime = await applyPolicyToKernel(iface, downLim, upLim, normalizedVips);

        await client.query('BEGIN');
        await client.query(
            `
                INSERT INTO net_qos_policies (interface, down_limit, up_limit, active, updated_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (interface) DO UPDATE
                SET down_limit = EXCLUDED.down_limit,
                    up_limit = EXCLUDED.up_limit,
                    active = EXCLUDED.active,
                    updated_at = NOW()
            `,
            [iface, downLim, upLim, downLim > 0 || upLim > 0],
        );
        await client.query('DELETE FROM net_qos_vips WHERE interface = $1', [iface]);

        for (const vip of normalizedVips) {
            await client.query(
                'INSERT INTO net_qos_vips (interface, ip, label) VALUES ($1, $2, $3)',
                [iface, vip.ip, vip.label],
            );
        }

        await client.query('COMMIT');
        const warnings = [
            ...(runtime.mode === 'legacy' ? ['A interface ainda está com um modelo antigo de tc e precisa ser reaplicada.'] : []),
            ...(upLim > 0 && !runtime.upload.redirectActive ? ['O runtime de upload ainda não está redirecionando o ingresso para a IFB desta VLAN.'] : []),
        ];
        res.json({
            success: true,
            interface: iface,
            runtime,
            warnings,
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('QoS Apply Error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erro ao aplicar regras de QoS.',
        });
    } finally {
        client.release();
    }
});

router.post('/reconcile', async (_req, res) => {
    try {
        const results = await reconcileAllPolicies();
        res.json({ success: true, results });
    } catch (error) {
        console.error('QoS Reconcile Error:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Falha ao reconciliar o runtime do QoS.',
        });
    }
});

export default router;
