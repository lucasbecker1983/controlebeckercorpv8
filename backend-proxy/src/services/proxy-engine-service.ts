import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { env } from '../config/env';
import { runCommand } from '../utils/process';
import { ActionLogService } from './action-log-service';
import { CertificateService } from './certificate-service';
import { DnsLoggerService } from './dns-logger-service';
import { DomainPolicyService } from './domain-policy-service';
import { EngineMode, InterceptionService } from './interception-service';
import { ensureProxySchema } from './proxy-schema-service';
import { ReportService } from './report-service';
import { filterOperationalVlans, getGatewayFromSubnet, INTERNAL_DNS_BY_VLAN } from './blocking-release-scope';
import { policyCompilerService } from './policy-compiler-service';
import { dnsContingencyService } from './dns-contingency-service';

const toJson = (value: any) => JSON.stringify(value || {});

const parseIpv4Cidr = (value: string) => {
    const [ip, prefixRaw] = value.includes('/') ? value.split('/') : [value, '32'];
    if (ip.split('.').length !== 4) return null;
    const prefix = Number(prefixRaw);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
    const ipInt = ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const start = ipInt & mask;
    const end = start + (2 ** (32 - prefix)) - 1;
    return { raw: value, start, end, prefix };
};

const normalizeAllowedClientCidrs = (entries: string[]) => {
    const raw = Array.from(new Set(entries.map((entry) => String(entry || '').trim()).filter(Boolean)));
    const ipv4 = raw.map(parseIpv4Cidr).filter(Boolean) as Array<{ raw: string; start: number; end: number; prefix: number }>;
    const others = raw.filter((entry) => !parseIpv4Cidr(entry));

    ipv4.sort((left, right) => left.prefix - right.prefix || left.start - right.start);

    const kept: Array<{ raw: string; start: number; end: number; prefix: number }> = [];
    for (const candidate of ipv4) {
        const covered = kept.some((current) => candidate.start >= current.start && candidate.end <= current.end);
        if (!covered) kept.push(candidate);
    }

    return [...others.sort((left, right) => left.localeCompare(right)), ...kept.map((item) => item.raw)];
};

const hasActiveTotalVlanBlock = async () => {
    const { rows } = await pool.query(
        `SELECT 1 FROM total_vlan_blocks WHERE active = TRUE LIMIT 1`,
    ).catch(() => ({ rows: [] as any[] }));
    return rows.length > 0;
};

const readAclEntries = (filePath: string) => {
    if (!fs.existsSync(filePath)) return [];
    return fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
};

const SQUID_ERROR_DIR = '/etc/squid/errors/sgcg';
const SQUID_MAINTENANCE_ERROR = 'ERR_SGCG_MAINTENANCE';

const maintenanceErrorHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SGCG - Manutencao institucional</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 18% 18%, rgba(37, 99, 235, .16), transparent 28rem), linear-gradient(135deg, #f7fafc 0%, #eef6f1 48%, #f6f8fb 100%); color: #122033; display: flex; align-items: stretch; justify-content: center; }
    main { width: min(1120px, 100%); min-height: 100vh; padding: 28px; display: grid; grid-template-rows: auto 1fr auto; gap: 24px; }
    header { border-bottom: 1px solid rgba(18, 32, 51, .12); padding-bottom: 18px; }
    .city { font-size: clamp(18px, 3vw, 30px); font-weight: 900; letter-spacing: .02em; text-transform: uppercase; }
    .secretary { margin-top: 6px; font-size: clamp(13px, 2vw, 17px); color: #436072; font-weight: 700; }
    section { align-self: center; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 28px; align-items: center; }
    .signal { border: 1px solid rgba(18, 32, 51, .12); background: rgba(255, 255, 255, .72); box-shadow: 0 24px 70px rgba(15, 23, 42, .12); border-radius: 28px; padding: clamp(24px, 5vw, 44px); }
    .eyebrow { color: #0f766e; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .18em; }
    h1 { margin: 16px 0 0; font-size: clamp(38px, 7vw, 76px); line-height: .92; letter-spacing: 0; }
    p { margin: 18px 0 0; font-size: clamp(16px, 2.1vw, 21px); line-height: 1.65; color: #3a5063; }
    .panel { border-radius: 28px; background: #102033; color: #fff; padding: 24px; min-height: 420px; display: grid; align-content: space-between; overflow: hidden; position: relative; }
    .panel:before { content: ""; position: absolute; inset: -40% -30% auto auto; width: 320px; height: 320px; border-radius: 999px; background: rgba(20, 184, 166, .28); }
    .status { position: relative; display: inline-flex; width: fit-content; padding: 8px 12px; border: 1px solid rgba(255,255,255,.2); border-radius: 999px; font-size: 12px; font-weight: 800; color: #a7f3d0; }
    .grid { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 34px; }
    .tile { min-height: 76px; border: 1px solid rgba(255,255,255,.14); border-radius: 18px; background: rgba(255,255,255,.07); }
    .tile:nth-child(2), .tile:nth-child(5), .tile:nth-child(8) { background: rgba(20,184,166,.24); }
    .note { position: relative; color: rgba(255,255,255,.76); line-height: 1.55; font-size: 14px; }
    footer { display: flex; justify-content: space-between; gap: 16px; color: #5b7080; font-size: 12px; border-top: 1px solid rgba(18, 32, 51, .12); padding-top: 16px; }
    @media (max-width: 820px) { main { padding: 18px; } section { grid-template-columns: 1fr; } .panel { min-height: 320px; } footer { flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="city">Prefeitura Municipal de Jacarezinho</div>
      <div class="secretary">Secretaria de Comercio, Industria, Servicos e Inovacao</div>
    </header>
    <section>
      <div class="signal">
        <div class="eyebrow">SGCG - continuidade operacional</div>
        <h1>Rede em manutencao.</h1>
        <p>Esta VLAN foi colocada em Bloqueio Total por uma intervencao tecnica autorizada. A navegacao sera restabelecida assim que a equipe concluir a verificacao do ambiente.</p>
      </div>
      <div class="panel" aria-hidden="true">
        <div>
          <span class="status">MODO MANUTENCAO ATIVO</span>
          <div class="grid"><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div></div>
        </div>
        <div class="note">Protecao temporaria aplicada pelo Sistema de Governanca e Controle Governamental. Nao e necessario alterar configuracoes do dispositivo.</div>
      </div>
    </section>
    <footer><span>SGCG - Sistema de Governanca e Controle Governamental</span><span>JMB Tecnologia</span></footer>
  </main>
</body>
</html>
`;

const modePorts = (mode: EngineMode) => {
    if (mode === 'test-http-only') return [env.proxyForwardPort, env.proxyInterceptHttpPort];
    if (mode === 'test-http+https') return [env.proxyForwardPort, env.proxyInterceptHttpPort, env.proxyInterceptHttpsPort];
    return [env.proxyForwardPort];
};

const getObservedClientScopes = () => [];
const hasLegacyTarget = () => Boolean(String(env.proxyTestTargetIpSingle || '').trim());
const isEmergencyBypassEnabled = async () => {
    const { rows } = await pool.query(`SELECT emergency_bypass FROM policy_engine_state WHERE id = 1 LIMIT 1`).catch(() => ({ rows: [] as Array<{ emergency_bypass?: boolean }> }));
    return Boolean(rows[0]?.emergency_bypass);
};

export class ProxyEngineService {
    readonly actionLogService = new ActionLogService();
    readonly certificateService = new CertificateService();
    readonly interceptionService = new InterceptionService();
    readonly dnsLoggerService = new DnsLoggerService();
    readonly reportService = new ReportService();
    readonly domainPolicyService = new DomainPolicyService();
    readonly runtimeDir = path.join(env.proxyStateDir, 'engine');

    constructor() {
        fs.mkdirSync(this.runtimeDir, { recursive: true });
    }

    async bootstrap() {
        await ensureProxySchema();
        await this.domainPolicyService.ensureBaseState();
        await this.domainPolicyService.syncPolicyFiles();
        await policyCompilerService.compile('acl-plus-dns').catch(() => undefined);
        await this.certificateService.ensureActiveCertificate();
        if (env.proxyBootstrapApply) {
            await this.setMode('off', 'system', 'bootstrap');
            await this.dnsLoggerService.ensureRunning();
        }
    }

    async getPersistedState() {
        await ensureProxySchema();
        const { rows } = await pool.query(
            `
                SELECT id, mode, squid_active, interception_active, dns_logger_active, bypass_global,
                       active_ports, test_target_ip, last_action, last_action_by, last_validation, last_error, updated_at
                FROM proxy_engine_state
                WHERE id = 1
            `,
        );
        return rows[0];
    }

    async updateState(patch: Record<string, any>) {
        const current = await this.getPersistedState();
        const next = { ...current, ...patch };
        await pool.query(
            `
                UPDATE proxy_engine_state
                SET mode = $1,
                    squid_active = $2,
                    interception_active = $3,
                    dns_logger_active = $4,
                    bypass_global = $5,
                    active_ports = $6::jsonb,
                    test_target_ip = $7,
                    last_action = $8,
                    last_action_by = $9,
                    last_validation = $10::jsonb,
                    last_error = $11,
                    updated_at = NOW()
                WHERE id = 1
            `,
            [
                next.mode,
                next.squid_active,
                next.interception_active,
                next.dns_logger_active,
                next.bypass_global,
                JSON.stringify(next.active_ports || []),
                next.test_target_ip,
                next.last_action,
                next.last_action_by,
                JSON.stringify(next.last_validation || {}),
                next.last_error || null,
            ],
        );
    }

    async isSquidActive() {
        const result = await runCommand('systemctl', ['is-active', 'squid'], {
            elevated: true,
            allowFailure: true,
        });
        return result.stdout.trim() === 'active';
    }

    async ensureSquidSslDb() {
        fs.mkdirSync(env.squidSslDbPath, { recursive: true });
        await runCommand(env.squidSslCrtdProgram, ['-c', '-s', env.squidSslDbPath, '-M', '16MB'], {
            elevated: true,
            allowFailure: true,
        }).catch(() => undefined);
    }

    ensureMaintenanceErrorPage() {
        fs.mkdirSync(SQUID_ERROR_DIR, { recursive: true });
        const defaultErrorDir = [
            '/usr/share/squid/errors/templates',
            '/usr/share/squid/errors/English',
            '/usr/share/squid/errors/en',
        ].find((candidate) => fs.existsSync(candidate));
        if (defaultErrorDir) {
            fs.cpSync(defaultErrorDir, SQUID_ERROR_DIR, { recursive: true });
        }
        fs.writeFileSync(path.join(SQUID_ERROR_DIR, SQUID_MAINTENANCE_ERROR), maintenanceErrorHtml);
    }

    async renderSquidConfig(mode: EngineMode, activeCertificate: any) {
        const emergencyBypassActive = await isEmergencyBypassEnabled();
        this.ensureMaintenanceErrorPage();
        const protectedFile = path.join(env.squidAclDir, 'proxy_protected_ssl.acl');
        const whitelistFile = path.join(env.squidAclDir, 'proxy_whitelist.acl');
        const blocklistFile = path.join(env.squidAclDir, 'proxy_blocklist.acl');
        const whitelistUrlFile = path.join(env.squidAclDir, 'proxy_whitelist_url.acl');
        const blocklistUrlFile = path.join(env.squidAclDir, 'proxy_blocklist_url.acl');
        const bumpFile = path.join(env.squidAclDir, 'proxy_bump_ssl.acl');
        const ipBypassFile = path.join(env.squidAclDir, 'proxy_ip_bypass.acl');
        const { rows: vlanRows } = await pool.query(
            `SELECT vlan_id, subnet_cidr, exempt, blocking_enabled FROM vlan_policies ORDER BY vlan_id ASC`,
        ).catch(() => ({ rows: [] as any[] }));
        const { rows: totalBlockRows } = await pool.query(
            `
                SELECT vlan_id
                FROM total_vlan_blocks
                WHERE active = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as Array<{ vlan_id: number }> }));
        const totalBlockVlanIds = new Set(totalBlockRows.map((row: any) => Number(row.vlan_id)));
        const allowedClientCidrs = normalizeAllowedClientCidrs([
            '127.0.0.1/32',
            '::1',
            ...vlanRows.map((row: any) => row.subnet_cidr).filter(Boolean),
        ]);

        const managedVlanRows = filterOperationalVlans(vlanRows);
        const managedClientCidrs = managedVlanRows.map((row: any) => row.subnet_cidr).filter(Boolean);
        const vlanAcls = managedVlanRows.map((vlan: any) => {
            const allowPath = path.join(env.squidAclDir, `allowlist-vlan-${vlan.vlan_id}.acl`);
            const blockPath = path.join(env.squidAclDir, `blocklist-vlan-${vlan.vlan_id}.acl`);
            const allowUrlPath = path.join(env.squidAclDir, `allowlist-vlan-${vlan.vlan_id}-url.acl`);
            const blockUrlPath = path.join(env.squidAclDir, `blocklist-vlan-${vlan.vlan_id}-url.acl`);
            return {
                ...vlan,
                allowPath,
                blockPath,
                allowUrlPath,
                blockUrlPath,
                allowEntries: readAclEntries(allowPath),
                blockEntries: readAclEntries(blockPath),
                allowUrlEntries: readAclEntries(allowUrlPath),
                blockUrlEntries: readAclEntries(blockUrlPath),
            };
        }).filter((vlan: any) => vlan.subnet_cidr);
        const totalBlockAcls = vlanAcls.filter((vlan: any) => totalBlockVlanIds.has(Number(vlan.vlan_id)));
        const ipBypassEntries = readAclEntries(ipBypassFile);

        const lines = [
            `visible_hostname ${env.proxyVisibleHostname}`,
            'workers 1',
            'access_log stdio:/var/log/squid/access.log squid',
            'cache deny all',
            `dns_nameservers ${env.proxyLocalResolverIp}`,
            'connect_timeout 15 seconds',
            'request_timeout 30 seconds',
            'read_timeout 30 seconds',
            'client_lifetime 2 minutes',
            'client_idle_pconn_timeout 10 seconds',
            'server_idle_pconn_timeout 10 seconds',
            'shutdown_lifetime 3 seconds',
            'via on',
            'forwarded_for delete',
            `error_directory ${SQUID_ERROR_DIR}`,
            '',
            '# Acesso administrativo local e clientes explicitamente autorizados.',
            `acl allowed_clients src ${allowedClientCidrs.join(' ')}`,
            managedClientCidrs.length ? `acl managed_module_clients src ${managedClientCidrs.join(' ')}` : null,
            `acl proxy_whitelist dstdomain "${whitelistFile}"`,
            `acl proxy_blocklist dstdomain "${blocklistFile}"`,
            `acl proxy_whitelist_url url_regex -i "${whitelistUrlFile}"`,
            `acl proxy_blocklist_url url_regex -i "${blocklistUrlFile}"`,
            `acl protected_ssl ssl::server_name "${protectedFile}"`,
            `acl whitelist_ssl ssl::server_name "${whitelistFile}"`,
            `acl bump_ssl ssl::server_name "${bumpFile}"`,
            '',
            '# Squid permanece explícito por padrão. Interceptação só aparece fora do modo off.',
            `http_port ${env.proxyForwardPort}`,
        ].filter(Boolean) as string[];

        if (ipBypassEntries.length > 0) {
            lines.splice(lines.length - 3, 0, `acl ip_bypass src "${ipBypassFile}"`);
        }

        if (mode !== 'off' || totalBlockAcls.length > 0) {
            lines.push(`http_port ${env.proxyInterceptHttpPort} intercept`);
        }

        for (const vlan of vlanAcls) {
            lines.push(`acl vlan_${vlan.vlan_id}_src src ${vlan.subnet_cidr}`);
            if (vlan.allowEntries.length > 0) {
                lines.push(`acl vlan_${vlan.vlan_id}_allow dstdomain "${vlan.allowPath}"`);
            }
            if (vlan.blockEntries.length > 0) {
                lines.push(`acl vlan_${vlan.vlan_id}_block dstdomain "${vlan.blockPath}"`);
            }
            if (vlan.allowUrlEntries.length > 0) {
                lines.push(`acl vlan_${vlan.vlan_id}_allow_url url_regex -i "${vlan.allowUrlPath}"`);
            }
            if (vlan.blockUrlEntries.length > 0) {
                lines.push(`acl vlan_${vlan.vlan_id}_block_url url_regex -i "${vlan.blockUrlPath}"`);
            }
            if (totalBlockVlanIds.has(Number(vlan.vlan_id))) {
                lines.push(`acl vlan_${vlan.vlan_id}_total_block src ${vlan.subnet_cidr}`);
            }
        }

        if (mode === 'test-http+https') {
            lines.push(
                `https_port ${env.proxyInterceptHttpsPort} intercept ssl-bump cert=${activeCertificate.file_path.replace(/\.der$/, '.crt.pem')} key=${activeCertificate.key_path} generate-host-certificates=on dynamic_cert_mem_cache_size=16MB`,
                `sslcrtd_program ${env.squidSslCrtdProgram} -s ${env.squidSslDbPath} -M 16MB`,
                'acl step1 at_step SslBump1',
                'ssl_bump peek step1',
                'ssl_bump splice ip_bypass',
                'ssl_bump splice protected_ssl',
                'ssl_bump splice whitelist_ssl',
                'ssl_bump bump bump_ssl',
                'ssl_bump splice all',
            );
        }

        lines.push(
            '',
            '# Ordem de precedência no proxy complementar.',
            'http_access deny !allowed_clients',
        );

        for (const vlan of totalBlockAcls) {
            lines.push(`deny_info ${SQUID_MAINTENANCE_ERROR} vlan_${vlan.vlan_id}_total_block`);
            lines.push(`http_access deny vlan_${vlan.vlan_id}_total_block`);
        }

        if (emergencyBypassActive) {
            lines.push(
                '# Bypass de emergência: libera clientes institucionais sem ACL categórica.',
                managedClientCidrs.length ? 'http_access allow managed_module_clients' : 'http_access allow allowed_clients',
            );
        }

        if (ipBypassEntries.length > 0) {
            lines.push('http_access allow ip_bypass');
        }

        if (!emergencyBypassActive) {
            for (const vlan of vlanAcls.filter((row: any) => !row.exempt && row.blocking_enabled)) {
                if (vlan.allowUrlEntries.length > 0) {
                    lines.push(`http_access allow vlan_${vlan.vlan_id}_src vlan_${vlan.vlan_id}_allow_url`);
                }
                if (vlan.allowEntries.length > 0) {
                    lines.push(`http_access allow vlan_${vlan.vlan_id}_src vlan_${vlan.vlan_id}_allow`);
                }
                if (vlan.blockUrlEntries.length > 0) {
                    lines.push(`http_access deny vlan_${vlan.vlan_id}_src vlan_${vlan.vlan_id}_block_url`);
                }
                if (vlan.blockEntries.length > 0) {
                    lines.push(`http_access deny vlan_${vlan.vlan_id}_src vlan_${vlan.vlan_id}_block`);
                }
            }
            lines.push(
                managedClientCidrs.length ? 'http_access allow managed_module_clients proxy_whitelist_url' : 'http_access allow proxy_whitelist_url',
                managedClientCidrs.length ? 'http_access allow managed_module_clients proxy_whitelist' : 'http_access allow proxy_whitelist',
                managedClientCidrs.length ? 'http_access deny managed_module_clients proxy_blocklist_url' : 'http_access deny proxy_blocklist_url',
                managedClientCidrs.length ? 'http_access deny managed_module_clients proxy_blocklist' : 'http_access deny proxy_blocklist',
            );
        }

        lines.push(
            'http_access allow allowed_clients',
            'http_access deny all',
            '',
            'reply_header_access Server deny all',
            'reply_header_access X-Cache deny all',
            'reply_header_access X-Cache-Lookup deny all',
        );

        return `${lines.join('\n')}\n`;
    }

    async validateSquidConfig(configPath: string) {
        await runCommand('squid', ['-k', 'parse', '-f', configPath], { elevated: true });
    }

    async installSquidConfig(candidatePath: string) {
        const backupDir = path.join(env.proxyStateDir, 'backups', 'squid');
        fs.mkdirSync(backupDir, { recursive: true });
        const backupPath = path.join(backupDir, `squid.conf.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
        const currentExists = fs.existsSync(env.squidConfigPath);

        if (currentExists) {
            fs.copyFileSync(env.squidConfigPath, backupPath);
        }

        try {
            fs.copyFileSync(candidatePath, env.squidConfigPath);
            await runCommand('systemctl', ['restart', 'squid'], { elevated: true });
            const active = await this.isSquidActive();
            if (!active) {
                throw new Error('Squid não ficou ativo após restart');
            }
            return { backupPath: currentExists ? backupPath : null };
        } catch (error) {
            if (currentExists) {
                fs.copyFileSync(backupPath, env.squidConfigPath);
                await runCommand('systemctl', ['restart', 'squid'], {
                    elevated: true,
                    allowFailure: true,
                }).catch(() => undefined);
            }
            throw error;
        }
    }

    async buildAndApplySquid(mode: EngineMode) {
        const certificate = await this.certificateService.ensureActiveCertificate();
        await this.domainPolicyService.syncPolicyFiles();
        await this.ensureSquidSslDb();

        const certPemPath = certificate.file_path.replace(/\.der$/, '.crt.pem');
        if (!fs.existsSync(certPemPath)) {
            await runCommand('openssl', ['x509', '-inform', 'der', '-in', certificate.file_path, '-out', certPemPath]);
        }

        const candidatePath = path.join(this.runtimeDir, 'squid.conf.candidate');
        const rendered = await this.renderSquidConfig(mode, certificate);
        fs.writeFileSync(candidatePath, rendered);
        await this.validateSquidConfig(candidatePath);
        const install = await this.installSquidConfig(candidatePath);

        return {
            certificate,
            configPath: candidatePath,
            install,
        };
    }

    async renderDesiredSquidConfig(mode: EngineMode) {
        const certificate = await this.certificateService.ensureActiveCertificate();
        await this.domainPolicyService.syncPolicyFiles();
        await this.ensureSquidSslDb();

        const certPemPath = certificate.file_path.replace(/\.der$/, '.crt.pem');
        if (!fs.existsSync(certPemPath)) {
            await runCommand('openssl', ['x509', '-inform', 'der', '-in', certificate.file_path, '-out', certPemPath]);
        }

        return this.renderSquidConfig(mode, certificate);
    }

    async getServicesStatus() {
        const [squidActive, dnsLogger] = await Promise.all([
            this.isSquidActive(),
            this.dnsLoggerService.status(),
        ]);
        const state = await this.getPersistedState();
        return {
            squid_active: squidActive,
            dns_logger_active: dnsLogger.active,
            interception_active: !!state.interception_active,
            bypass_global: !!state.bypass_global,
        };
    }

    async setMode(mode: EngineMode, requestedBy = 'system', reason = 'manual') {
        await ensureProxySchema();

        const action = `mode:${mode}`;
        const observedScopes = getObservedClientScopes();
        try {
            const squidResult = await this.buildAndApplySquid(mode);
            const totalBlockActive = await hasActiveTotalVlanBlock();
            const bypassGlobal = mode === 'off' && !totalBlockActive;
            const interception = await this.interceptionService.applyMode(mode, bypassGlobal);
            const firewallRuntime = await dnsContingencyService.ensureFirewallState();
            const conntrackReset = await this.interceptionService.resetTestTargetConntrack(mode);
            const logger = await this.dnsLoggerService.ensureRunning();
            const squidActive = await this.isSquidActive();

            await this.updateState({
                mode,
                squid_active: squidActive,
                interception_active: !bypassGlobal && (interception.ports.length > 0 || totalBlockActive),
                dns_logger_active: logger.active,
                bypass_global: bypassGlobal,
                active_ports: modePorts(mode),
                test_target_ip: null,
                last_action: `${action}:${reason}`,
                last_action_by: requestedBy,
                last_validation: {
                    validated_at: new Date().toISOString(),
                    squid_conf: squidResult.configPath,
                    squid_backup: squidResult.install.backupPath,
                    ufw_backup: interception.backupPath,
                    firewall_runtime: firewallRuntime?.runtime,
                    conntrack_reset: conntrackReset,
                    redirects_active: interception.ports.length > 0,
                },
                last_error: null,
            });

            await this.actionLogService.log({
                action,
                requestedBy,
                payload: { mode, reason, observed_scopes: observedScopes },
                result: {
                    active_ports: modePorts(mode),
                    interception_backup: interception.backupPath,
                    firewall_runtime: firewallRuntime?.runtime,
                    conntrack_reset: conntrackReset,
                },
                success: true,
                message: `Modo ${mode} aplicado com sucesso`,
            });

            return this.getStatus();
        } catch (error: any) {
            await this.updateState({
                mode,
                last_action: `${action}:${reason}`,
                last_action_by: requestedBy,
                last_error: error.message || String(error),
            });
            await this.actionLogService.log({
                action,
                requestedBy,
                payload: { mode, reason, observed_scopes: observedScopes },
                result: { error: error.message || String(error) },
                success: false,
                message: error.message || String(error),
            });
            throw error;
        }
    }

    async emergencyBypass(requestedBy = 'system') {
        await this.interceptionService.applyMode('off', true);
        const firewallRuntime = await dnsContingencyService.ensureFirewallState();
        const conntrackReset = await this.interceptionService.resetTestTargetConntrack('off');
        await this.updateState({
            mode: 'off',
            squid_active: await this.isSquidActive(),
            interception_active: false,
            dns_logger_active: (await this.dnsLoggerService.status()).active,
            bypass_global: true,
            active_ports: modePorts('off'),
            test_target_ip: null,
            last_action: 'emergency-bypass',
            last_action_by: requestedBy,
            last_validation: {
                validated_at: new Date().toISOString(),
                conntrack_reset: conntrackReset,
                firewall_runtime: firewallRuntime?.runtime,
                redirects_active: false,
            },
            last_error: null,
        });
        await this.actionLogService.log({
            action: 'emergency-bypass',
            requestedBy,
            payload: { observed_scopes: getObservedClientScopes() },
            result: { bypass_global: true, conntrack_reset: conntrackReset, firewall_runtime: firewallRuntime?.runtime },
            success: true,
            message: 'Bypass global ativado',
        });
        return this.getStatus();
    }

    async getStatus() {
        const [state, services, certificate] = await Promise.all([
            this.getPersistedState(),
            this.getServicesStatus(),
            this.certificateService.getActiveCertificate(),
        ]);

        const { rows: selectiveVlans } = await pool.query(
            `
                SELECT vlan_id, interface_name, subnet_cidr
                FROM vlan_policies
                WHERE policy_mode = 'selective-intercept'
                  AND exempt = FALSE
                  AND blocking_enabled = TRUE
                  AND monitoring_enabled = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as any[] }));
        const { rows: operationalVlans } = await pool.query(
            `
                SELECT vlan_id, subnet_cidr
                FROM vlan_policies
                WHERE vlan_id BETWEEN 1 AND 4094
                  AND exempt = FALSE
                  AND blocking_enabled = TRUE
                  AND monitoring_enabled = TRUE
                ORDER BY vlan_id ASC
            `,
        ).catch(() => ({ rows: [] as any[] }));
        const internalDnsByVlan = Object.fromEntries(
            operationalVlans.map((row: any) => [Number(row.vlan_id), getGatewayFromSubnet(row.subnet_cidr) || INTERNAL_DNS_BY_VLAN[row.vlan_id]]).filter(([, dns]: any[]) => Boolean(dns)),
        );

        const redirectsActive = Boolean(services.interception_active && selectiveVlans.length > 0);
        const compilerManifest = policyCompilerService.readManifest();
        const enforcementMode = compilerManifest?.enforcementMode
            || (state.mode === 'off'
                ? 'acl-plus-dns'
                : (state.mode === 'test-http-only' || state.mode === 'test-http+https'
                    ? 'intercept-selective'
                    : 'acl-plus-dns'));

        return {
            source_of_truth: 'compiled-policy-runtime',
            mode: state.mode,
            enforcement_mode: enforcementMode,
            interception_mode: state.mode,
            squid_active: services.squid_active,
            intercepting: services.interception_active,
            interception_active: services.interception_active,
            dns_logger_active: services.dns_logger_active,
            logger_active: services.dns_logger_active,
            bypass_global: services.bypass_global,
            bypass: { global: services.bypass_global },
            active_ports: state.active_ports || [],
            active_services: {
                squid: services.squid_active,
                dns_logger: services.dns_logger_active,
                interception: services.interception_active,
            },
            compiler_status: 'healthy',
            dns_policy_loaded: true,
            squid_config_aligned: !state.last_error,
            redirects_active: redirectsActive,
            interception_scope: redirectsActive
                ? {
                    mode: 'selective',
                    vlans: selectiveVlans.map((row: any) => ({
                        vlan_id: row.vlan_id,
                        interface_name: row.interface_name,
                        subnet_cidr: row.subnet_cidr,
                    })),
                }
                : {
                    mode: 'none',
                    vlans: [],
                },
            observed_scopes: getObservedClientScopes(),
            observed_dns_server: null,
            internal_dns_by_vlan: internalDnsByVlan,
            managed_vlan_ids: operationalVlans.map((row: any) => Number(row.vlan_id)).sort((left: number, right: number) => left - right),
            last_action: state.last_action,
            last_action_by: state.last_action_by,
            last_validation: state.last_validation,
            last_error: state.last_error,
            updated_at: state.updated_at,
            legacy_fields_hidden: {
                test_target_ip: true,
                observed_target_host: true,
                bootstrap_host: true,
                single_host_dependency: false,
                legacy_target_configured: hasLegacyTarget(),
            },
            certificate: certificate ? {
                id: certificate.id,
                name: certificate.name,
                fingerprint: certificate.fingerprint,
                valid_from: certificate.valid_from,
                valid_until: certificate.valid_until,
                created_at: certificate.created_at,
            } : null,
            services,
        };
    }
}
