import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { runCommand } from '../utils/process';
import { pool } from '../config/db';
import { filterOperationalVlans, getGatewayFromSubnet, INTERNAL_DNS_BY_VLAN, isManagedBlockingIp, isManagedBlockingVlan } from './blocking-release-scope';

export type EngineMode = 'off' | 'test-http-only' | 'test-http+https';

const BEGIN_MARKER = '# BEGIN V8_PROXY_ENGINE';
const END_MARKER = '# END V8_PROXY_ENGINE';
const TEST_INTERFACE = 'enp6s0.10';
const LEGACY_VLAN_GATEWAYS: Record<string, string> = {
    'enp6s0.10': INTERNAL_DNS_BY_VLAN[10],
    'enp6s0.30': INTERNAL_DNS_BY_VLAN[30],
    'enp6s0.50': INTERNAL_DNS_BY_VLAN[50],
    'enp6s0.70': INTERNAL_DNS_BY_VLAN[70],
};

const activePortsForMode = (mode: EngineMode) => {
    if (mode === 'test-http-only') return [80];
    if (mode === 'test-http+https') return [80, 443];
    return [];
};

const hasLegacyTargetConfig = () => Boolean(String(env.proxyTestTargetIpSingle || '').trim() && String(env.proxyTestTargetIp || '').trim());
const buildFilterRules = (mode: EngineMode) => {
    const rules: string[] = [];

    if (mode === 'test-http+https') {
        rules.push('*filter');
        rules.push(':V8_PROXY_ENGINE - [0:0]');
        rules.push(`-A ufw-before-forward -i ${TEST_INTERFACE} -s ${env.proxyTestTargetIp} -p udp --dport 443 -j REJECT --reject-with icmp-port-unreachable`);
        rules.push('COMMIT');
    }

    return rules;
};

const uniqueVipRows = (rows: Array<{ ip: string; vlan_id: number | null }>) => {
    const seen = new Set<string>();
    return rows
        .filter((row) => isManagedBlockingVlan(row.vlan_id) || isManagedBlockingIp(row.ip))
        .map((row) => ({
            ip: String(row.ip || '').trim(),
            vlan_id: row.vlan_id === null || row.vlan_id === undefined ? null : Number(row.vlan_id),
        }))
        .filter((row) => {
            if (!row.ip) return false;
            const key = `${row.ip}|${row.vlan_id || ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

const uniqueVlanIds = (rows: Array<{ vlan_id: number }>) => new Set(
    rows
        .map((row) => Number(row.vlan_id))
        .filter((value) => Number.isFinite(value) && isManagedBlockingVlan(value)),
);

export class InterceptionService {
    readonly backupDir = path.join(env.proxyStateDir, 'backups', 'ufw');

    constructor() {
        fs.mkdirSync(this.backupDir, { recursive: true });
    }

    async getManagedBlock(mode: EngineMode, bypassGlobal: boolean) {
        const rules: string[] = [];
        const ports = activePortsForMode(mode);
        const { rows } = await pool.query(
            `
                SELECT vlan_id, interface_name, subnet_cidr, exempt, blocking_enabled, monitoring_enabled
                FROM vlan_policies
                WHERE policy_mode = 'selective-intercept'
                  AND exempt = FALSE
                  AND blocking_enabled = TRUE
                  AND monitoring_enabled = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ vlan_id: number; interface_name: string; subnet_cidr: string; exempt: boolean; blocking_enabled: boolean; monitoring_enabled: boolean }> }));
        const selectiveVlans = filterOperationalVlans(rows);
        const { rows: allVlanRows } = await pool.query(
            `
                SELECT vlan_id, interface_name, subnet_cidr, exempt, blocking_enabled, monitoring_enabled
                FROM vlan_policies
                WHERE exempt = FALSE
                  AND blocking_enabled = TRUE
                  AND monitoring_enabled = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ vlan_id: number; interface_name: string; subnet_cidr: string; exempt: boolean; blocking_enabled: boolean; monitoring_enabled: boolean }> }));
        const { rows: vipRows } = await pool.query(
            `
                SELECT host(ip) AS ip, vlan_id
                FROM policy_exceptions
                WHERE active = TRUE
                  AND masklen(ip) = 32
                  AND (valid_until IS NULL OR valid_until >= NOW())
                ORDER BY id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ ip: string; vlan_id: number | null }> }));
        const { rows: emergencyRows } = await pool.query(
            `
                SELECT vlan_id
                FROM emergency_vlan_bypass
                WHERE active = TRUE
                  AND (expires_at IS NULL OR expires_at >= NOW())
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ vlan_id: number }> }));
        const { rows: totalBlockRows } = await pool.query(
            `
                SELECT vlan_id
                FROM total_vlan_blocks
                WHERE active = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ vlan_id: number }> }));
        const vipBypassRows = uniqueVipRows(vipRows);
        const emergencyVlans = uniqueVlanIds(emergencyRows);
        const totalBlockVlans = uniqueVlanIds(totalBlockRows);
        const totalBlockRules = filterOperationalVlans(allVlanRows).filter((row) => totalBlockVlans.has(Number(row.vlan_id)));

        if (((!bypassGlobal && ports.length > 0 && selectiveVlans.length > 0) || totalBlockRules.length > 0)) {
            rules.push('*nat');
            rules.push(':V8_PROXY_ENGINE - [0:0]');
            for (const row of totalBlockRules) {
                rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p udp --dport 53 -j RETURN`);
                rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p tcp --dport 53 -j RETURN`);
                rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p tcp --dport 80 -j REDIRECT --to-ports ${env.proxyInterceptHttpPort}`);
            }
            for (const row of selectiveVlans) {
                if (totalBlockVlans.has(Number(row.vlan_id))) continue;
                if (emergencyVlans.has(Number(row.vlan_id))) continue;
                const gatewayIp = getGatewayFromSubnet(row.subnet_cidr);
                const vlanVips = vipBypassRows.filter((vip) => !vip.vlan_id || vip.vlan_id === row.vlan_id);
                if (gatewayIp) {
                    rules.push(`-A PREROUTING -i ${row.interface_name} -s ${gatewayIp} -j RETURN`);
                }
                for (const vip of vlanVips) {
                    rules.push(`-A PREROUTING -i ${row.interface_name} -s ${vip.ip} -j RETURN`);
                }
                rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p udp --dport 53 -j RETURN`);
                rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p tcp --dport 53 -j RETURN`);
                if (gatewayIp) {
                    rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -d ${gatewayIp} -j RETURN`);
                }
                rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p tcp --dport 80 -j REDIRECT --to-ports ${env.proxyInterceptHttpPort}`);
                if (mode === 'test-http+https') {
                    rules.push(`-A PREROUTING -i ${row.interface_name} -s ${row.subnet_cidr} -p tcp --dport 443 -j REDIRECT --to-ports ${env.proxyInterceptHttpsPort}`);
                }
            }
            rules.push('COMMIT');
            rules.push(...buildFilterRules(mode));
            if (totalBlockRules.length > 0) {
                rules.push('*filter');
                rules.push(':V8_PROXY_TOTAL_BLOCK - [0:0]');
                for (const row of totalBlockRules) {
                    rules.push(`-A ufw-before-forward -i ${row.interface_name} -s ${row.subnet_cidr} -j REJECT --reject-with icmp-port-unreachable`);
                }
                rules.push('COMMIT');
            }
        } else {
            rules.push('# Modo OFF, bypass global ativo ou sem VLAN explicitamente marcada para intercept-selective.');
        }

        return [BEGIN_MARKER, ...rules, END_MARKER].join('\n');
    }

    stripManagedBlock(content: string) {
        const pattern = new RegExp(`${BEGIN_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g');
        return content.replace(pattern, '').trimEnd();
    }

    injectManagedBlock(content: string, block: string) {
        const stripped = this.stripManagedBlock(content);
        return `${stripped}\n\n${block}\n`;
    }

    async validateBeforeRules(content: string) {
        await runCommand('iptables-restore', ['--test'], {
            elevated: true,
            input: content,
        });
    }

    async commandExists(command: string) {
        const result = await runCommand('sh', ['-lc', `command -v ${command}`], { allowFailure: true });
        return result.code === 0;
    }

    async readBeforeRules() {
        return fs.readFileSync(env.ufwBeforeRulesFile, 'utf8');
    }

    async deleteNatRule(args: string[]) {
        while (true) {
            const check = await runCommand('iptables', ['-t', 'nat', '-C', 'PREROUTING', ...args], {
                elevated: true,
                allowFailure: true,
            });
            if (check.code !== 0) break;
            await runCommand('iptables', ['-t', 'nat', '-D', 'PREROUTING', ...args], {
                elevated: true,
                allowFailure: true,
            });
        }
    }

    async deleteFilterRule(args: string[]) {
        while (true) {
            const check = await runCommand('iptables', ['-t', 'filter', '-C', 'ufw-before-forward', ...args], {
                elevated: true,
                allowFailure: true,
            });
            if (check.code !== 0) break;
            await runCommand('iptables', ['-t', 'filter', '-D', 'ufw-before-forward', ...args], {
                elevated: true,
                allowFailure: true,
            });
        }
    }

    async clearLegacyRuntimeRules() {
        for (const [iface, gateway] of Object.entries(LEGACY_VLAN_GATEWAYS)) {
            await this.deleteNatRule(['-s', `${gateway}/32`, '-i', iface, '-j', 'RETURN']);
            await this.deleteNatRule(['-i', iface, '-p', 'udp', '--dport', '53', '-j', 'RETURN']);
            await this.deleteNatRule(['-i', iface, '-p', 'tcp', '--dport', '53', '-j', 'RETURN']);
            await this.deleteNatRule(['-d', `${gateway}/32`, '-i', iface, '-j', 'RETURN']);
            await this.deleteNatRule(['-i', iface, '-p', 'tcp', '--dport', '80', '-j', 'REDIRECT', '--to-ports', String(env.proxyInterceptHttpPort)]);
            await this.deleteNatRule(['-i', iface, '-p', 'tcp', '--dport', '443', '-j', 'REDIRECT', '--to-ports', String(env.proxyInterceptHttpsPort)]);
            await this.deleteFilterRule(['-i', iface, '-p', 'udp', '--dport', '443', '-j', 'REJECT', '--reject-with', 'icmp-port-unreachable']);
        }

        await runCommand('iptables', ['-t', 'nat', '-F', 'V8_PROXY_ENGINE'], {
            elevated: true,
            allowFailure: true,
        });
        await runCommand('iptables', ['-t', 'filter', '-F', 'V8_PROXY_ENGINE'], {
            elevated: true,
            allowFailure: true,
        });
    }

    async applyMode(mode: EngineMode, bypassGlobal: boolean) {
        const original = await this.readBeforeRules();
        const backupPath = path.join(
            this.backupDir,
            `before.rules.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`,
        );
        fs.writeFileSync(backupPath, original);

        const candidate = this.injectManagedBlock(original, await this.getManagedBlock(mode, bypassGlobal));

        try {
            await this.clearLegacyRuntimeRules();
            await this.validateBeforeRules(candidate);
            fs.writeFileSync(env.ufwBeforeRulesFile, candidate);
            if (await this.commandExists('ufw')) {
                await runCommand('ufw', ['reload'], { elevated: true });
            }
            await this.clearLegacyRuntimeRules();
        } catch (error) {
            fs.writeFileSync(env.ufwBeforeRulesFile, original);
            try {
                if (await this.commandExists('ufw')) {
                    await runCommand('ufw', ['reload'], { elevated: true, allowFailure: true });
                }
                await this.clearLegacyRuntimeRules();
            } catch {
                // noop
            }
            throw error;
        }

        return {
            backupPath,
            block: await this.getManagedBlock(mode, bypassGlobal),
            ports: activePortsForMode(mode),
        };
    }

    async resetTestTargetConntrack(mode: EngineMode) {
        if (!hasLegacyTargetConfig()) {
            return [];
        }

        const commands: Array<{ protocol: 'tcp' | 'udp'; port: number }> = [
            { protocol: 'tcp', port: 80 },
            { protocol: 'tcp', port: 443 },
        ];

        if (mode === 'test-http+https') {
            commands.push({ protocol: 'udp', port: 443 });
        }

        const results = [];
        for (const entry of commands) {
            const result = await runCommand('conntrack', [
                '-D',
                '-s',
                env.proxyTestTargetIpSingle,
                '-p',
                entry.protocol,
                '--dport',
                String(entry.port),
            ], {
                elevated: true,
                allowFailure: true,
            });
            results.push({
                cidr: env.proxyTestTargetIp,
                protocol: entry.protocol,
                port: entry.port,
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.code,
            });
        }

        return results;
    }
}
