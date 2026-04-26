import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';
import { env } from '../config/env';
import { filterOperationalVlans, isManagedBlockingIp } from './blocking-release-scope';

export type EnforcementMode = 'acl-only' | 'acl-plus-dns' | 'intercept-selective';

type PolicyRow = {
    id: number;
    domain: string;
    category?: string | null;
    protected?: boolean;
    scope_type: 'global' | 'vlan';
    scope_value: string;
    active: boolean;
};

type ExceptionRow = {
    id: number;
    ip: string;
    vlan_id: number | null;
    description?: string | null;
    exception_type?: string | null;
    bypass_total?: boolean;
    active: boolean;
};

type VlanRow = {
    vlan_id: number;
    interface_name: string;
    subnet_cidr: string;
    exempt: boolean;
    blocking_enabled: boolean;
    monitoring_enabled: boolean;
    policy_mode: string;
};

const normalizeDomain = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '')
    .replace(/\.$/, '');

const unique = (items: string[]) => Array.from(new Set(items
    .map((item) => String(item || '').trim())
    .filter(Boolean)));
const sortedUnique = (items: string[]) => unique(items).sort((left, right) => left.localeCompare(right));

const toRpzEntries = (domains: string[], target = '.') => domains.flatMap((domain) => ([
    `${domain} CNAME ${target}`,
    `*.${domain} CNAME ${target}`,
]));

const cidrToRpzClientIp = (cidr: string) => {
    try {
        let ip = cidr;
        let prefix = 32;
        if (cidr.includes('/')) {
            const parts = cidr.split('/');
            ip = parts[0];
            prefix = parseInt(parts[1], 10);
        }
        return `${prefix}.${ip.split('.').reverse().join('.')}.rpz-client-ip CNAME rpz-passthru.`;
    } catch {
        return null;
    }
};

const ipv4ToInt = (ip: string) => ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);

const normalizeIpv4Cidrs = (entries: string[]) => {
    const parsed = entries.map((entry) => {
        const [ip, prefixRaw] = entry.includes('/') ? entry.split('/') : [entry, '32'];
        const prefix = Number(prefixRaw);
        if (ip.split('.').length !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
            return null;
        }

        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        const start = ipv4ToInt(ip) & mask;
        const end = start + (2 ** (32 - prefix)) - 1;
        return { entry, start, end, prefix };
    }).filter(Boolean) as Array<{ entry: string; start: number; end: number; prefix: number }>;

    parsed.sort((left, right) => left.prefix - right.prefix || left.start - right.start);

    const kept: Array<{ entry: string; start: number; end: number; prefix: number }> = [];
    for (const candidate of parsed) {
        const covered = kept.some((current) => candidate.start >= current.start && candidate.end <= current.end);
        if (!covered) kept.push(candidate);
    }

    return kept.map((item) => item.entry);
};

const sha256 = (content: string) => crypto.createHash('sha256').update(content).digest('hex');

type CompiledArtifacts = {
    enforcementMode: EnforcementMode;
    version: string;
    generatedAt: string;
    paths: Record<string, string>;
    hashes: Record<string, string>;
    policySummary: Record<string, any>;
};

type ManifestInspection = {
    present: boolean;
    manifest: CompiledArtifacts | null;
    allFilesPresent: boolean;
    filesMatchManifest: boolean;
    missingPaths: string[];
    mismatchedPaths: string[];
    compilerIncludePresent: boolean;
    compilerIncludeLoaded: boolean;
    moduleConfigOk: boolean;
    rpzReferencesOk: boolean;
    vipBypassReferenced: boolean;
    allowedReferenced: boolean;
    blockedReferenced: boolean;
    expectedTaggedVlans: number[];
    missingTaggedVpcFiles: string[];
    missingTaggedVpcTags: string[];
};

export class PolicyCompilerService {
    readonly squidAclDir = env.squidAclDir;
    readonly legacyGeneratedDir = path.join(env.rulesDir, 'generated');
    readonly enterpriseDir = path.join(this.legacyGeneratedDir, 'bloqueios-liberacoes');
    readonly manifestPath = path.join(env.proxyStateDir, 'policy-compiler', 'manifest.json');

    readonly squidWhitelistFile = path.join(this.squidAclDir, 'proxy_whitelist.acl');
    readonly squidBlocklistFile = path.join(this.squidAclDir, 'proxy_blocklist.acl');
    readonly squidIpBypassFile = path.join(this.squidAclDir, 'proxy_ip_bypass.acl');
    readonly squidProtectedFile = path.join(this.squidAclDir, 'proxy_protected_ssl.acl');
    readonly squidBumpFile = path.join(this.squidAclDir, 'proxy_bump_ssl.acl');
    readonly unboundPolicyDir = path.dirname(env.blockedRpzFile);

    constructor() {
        fs.mkdirSync(this.squidAclDir, { recursive: true });
        fs.mkdirSync(this.legacyGeneratedDir, { recursive: true });
        fs.mkdirSync(this.enterpriseDir, { recursive: true });
        fs.mkdirSync(path.dirname(env.whitelistFile), { recursive: true });
        fs.mkdirSync(path.dirname(env.blockedRpzFile), { recursive: true });
        fs.mkdirSync(path.dirname(env.vipConf), { recursive: true });
        fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    }

    async loadState() {
        const [blocks, allows, exceptions, vlans, engine] = await Promise.all([
            pool.query(`SELECT * FROM blocking_policies WHERE active = TRUE ORDER BY scope_type, scope_value, domain`),
            pool.query(`SELECT * FROM release_policies WHERE active = TRUE ORDER BY scope_type, scope_value, domain`),
            pool.query(`SELECT * FROM policy_exceptions WHERE active = TRUE ORDER BY id ASC`),
            pool.query(`SELECT * FROM vlan_policies ORDER BY vlan_id ASC`),
            pool.query(`SELECT * FROM policy_engine_state WHERE id = 1 LIMIT 1`),
        ]);

        return {
            blocks: blocks.rows as PolicyRow[],
            allows: allows.rows as PolicyRow[],
            exceptions: exceptions.rows as ExceptionRow[],
            vlans: vlans.rows as VlanRow[],
            engine: engine.rows[0] || null,
        };
    }

    private writeRawFile(filePath: string, content: string) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
        if (current !== content) {
            fs.writeFileSync(filePath, content);
        }
        return content;
    }

    private writeText(filePath: string, lines: string[]) {
        const normalized = sortedUnique(lines.filter((line) => line !== null && line !== undefined));
        const content = `${normalized.join('\n')}${normalized.length ? '\n' : ''}`;
        return this.writeRawFile(filePath, content);
    }

    private buildZoneFile(origin: string, entries: string[], comments: string[] = []) {
        return [
            '$ORIGIN .',
            '$TTL 300',
            '@ SOA localhost. root.localhost. 1 3600 900 86400 300',
            '  NS localhost.',
            '',
            `$ORIGIN ${origin}.`,
            '',
            ...comments.map((comment) => `; ${comment}`),
            ...entries,
            '',
        ].join('\n');
    }

    private buildVlanTag(vlanId: number) {
        return `vlan_${vlanId}`;
    }

    private compileScopes(blocks: PolicyRow[], allows: PolicyRow[], exceptions: ExceptionRow[], vlans: VlanRow[]) {
        const managedVlans = filterOperationalVlans(vlans);
        const allowGlobal = sortedUnique(allows.filter((row) => row.scope_type === 'global').map((row) => normalizeDomain(row.domain)));
        const allowProtectedGlobal = sortedUnique(allows.filter((row) => row.protected).map((row) => normalizeDomain(row.domain)));
        const allowByVlan = new Map<number, string[]>();
        const blockByVlan = new Map<number, string[]>();

        for (const vlan of managedVlans) {
            const vlanAllow = sortedUnique(allows
                .filter((row) => row.scope_type === 'vlan' && Number(row.scope_value) === vlan.vlan_id)
                .map((row) => normalizeDomain(row.domain)));
            const vlanBlock = sortedUnique(blocks
                .filter((row) => row.scope_type === 'vlan' && Number(row.scope_value) === vlan.vlan_id)
                .map((row) => normalizeDomain(row.domain))
                .filter((domain) => !allowGlobal.includes(domain) && !allowProtectedGlobal.includes(domain) && !vlanAllow.includes(domain)));
            allowByVlan.set(vlan.vlan_id, vlanAllow);
            blockByVlan.set(vlan.vlan_id, vlanBlock);
        }

        const blockGlobal = sortedUnique(blocks
            .filter((row) => row.scope_type === 'global')
            .map((row) => normalizeDomain(row.domain))
            .filter((domain) => !allowGlobal.includes(domain) && !allowProtectedGlobal.includes(domain)));

        const ipBypassEntries = normalizeIpv4Cidrs(unique(exceptions
            .filter((row) => isManagedBlockingIp(row.ip))
            .map((row) => String(row.ip || '').trim())));

        // Exempt VLANs deixam de significar bypass DNS total. Elas continuam sem
        // escopo categórico explícito por VLAN, mas herdam políticas globais
        // mandatórias como pornografia bloqueada.
        const dnsBypassEntries = sortedUnique([
            ...ipBypassEntries,
            `${env.proxyLocalResolverIp}/32`,
        ]);

        return {
            allowGlobal,
            allowProtectedGlobal,
            allowByVlan,
            blockGlobal,
            blockByVlan,
            ipBypassEntries,
            dnsBypassEntries,
            managedVlans,
        };
    }

    private readMainUnboundConfig() {
        if (!fs.existsSync(env.unboundConfigPath)) return '';
        return fs.readFileSync(env.unboundConfigPath, 'utf8');
    }

    inspectManifest(): ManifestInspection {
        const manifest = this.readManifest();
        const compilerIncludePresent = fs.existsSync(env.unboundPolicyConf);
        const compilerIncludeContent = compilerIncludePresent ? fs.readFileSync(env.unboundPolicyConf, 'utf8') : '';
        const unboundMainConfig = this.readMainUnboundConfig();
        const compilerIncludeLoaded = compilerIncludePresent
            && (unboundMainConfig.includes(env.unboundPolicyConf) || unboundMainConfig.includes('/etc/unbound/unbound.conf.d/*.conf'));
        const moduleConfigOk = compilerIncludeContent.includes('module-config: "respip validator iterator"');
        const vipBypassReferenced = compilerIncludeContent.includes(`zonefile: "${env.vipConf}"`);
        const allowedReferenced = compilerIncludeContent.includes(`zonefile: "${env.whitelistFile}"`);
        const blockedReferenced = compilerIncludeContent.includes(`zonefile: "${env.blockedRpzFile}"`);

        if (!manifest) {
            return {
                present: false,
                manifest: null,
                allFilesPresent: false,
                filesMatchManifest: false,
                missingPaths: [],
                mismatchedPaths: [],
                compilerIncludePresent,
                compilerIncludeLoaded,
                moduleConfigOk,
                rpzReferencesOk: false,
                vipBypassReferenced,
                allowedReferenced,
                blockedReferenced,
                expectedTaggedVlans: [],
                missingTaggedVpcFiles: [],
                missingTaggedVpcTags: [],
            };
        }

        const missingPaths: string[] = [];
        const mismatchedPaths: string[] = [];
        for (const [key, rawPath] of Object.entries(manifest.paths || {})) {
            const filePath = String(rawPath || '');
            if (!filePath || !fs.existsSync(filePath)) {
                missingPaths.push(key);
                continue;
            }
            const currentHash = sha256(fs.readFileSync(filePath, 'utf8'));
            if (manifest.hashes?.[key] && manifest.hashes[key] !== currentHash) {
                mismatchedPaths.push(key);
            }
        }

        const expectedTaggedVlans = (manifest.policySummary?.vlan_scopes || [])
            .filter((scope: any) => Number(scope.allow_count || 0) > 0 || Number(scope.block_count || 0) > 0)
            .map((scope: any) => ({ vlanId: Number(scope.vlan_id), subnet: String(scope.subnet_cidr || '').trim() }));
        const missingTaggedVpcFiles: string[] = [];
        const missingTaggedVpcTags: string[] = [];

        for (const entry of expectedTaggedVlans) {
            const vlanId = entry.vlanId;
            const allowPath = path.join(this.unboundPolicyDir, `allowlist-vlan-${vlanId}.rpz`);
            const blockPath = path.join(this.unboundPolicyDir, `blocklist-vlan-${vlanId}.rpz`);
            if (!fs.existsSync(allowPath)) missingTaggedVpcFiles.push(`allowlist-vlan-${vlanId}.rpz`);
            if (!fs.existsSync(blockPath)) missingTaggedVpcFiles.push(`blocklist-vlan-${vlanId}.rpz`);
            if (!compilerIncludeContent.includes(`access-control-tag: ${entry.subnet} "vlan_${vlanId}"`)) {
                missingTaggedVpcTags.push(`vlan_${vlanId}`);
            }
            if (!compilerIncludeContent.includes(`name: "rpz.allow.vlan${vlanId}.becker.local."`)) {
                missingTaggedVpcTags.push(`allow-rpz-vlan-${vlanId}`);
            }
            if (!compilerIncludeContent.includes(`name: "rpz.block.vlan${vlanId}.becker.local."`)) {
                missingTaggedVpcTags.push(`block-rpz-vlan-${vlanId}`);
            }
        }

        return {
            present: true,
            manifest,
            allFilesPresent: missingPaths.length === 0,
            filesMatchManifest: mismatchedPaths.length === 0,
            missingPaths,
            mismatchedPaths,
            compilerIncludePresent,
            compilerIncludeLoaded,
            moduleConfigOk,
            rpzReferencesOk: vipBypassReferenced && allowedReferenced && blockedReferenced,
            vipBypassReferenced,
            allowedReferenced,
            blockedReferenced,
            expectedTaggedVlans: expectedTaggedVlans.map((entry) => entry.vlanId),
            missingTaggedVpcFiles,
            missingTaggedVpcTags,
        };
    }

    private syncCompatibilityFiles(compiled: ReturnType<PolicyCompilerService['compileScopes']>) {
        this.writeText(path.join(this.enterpriseDir, 'allowlist-global.acl'), compiled.allowGlobal);
        this.writeText(path.join(this.enterpriseDir, 'blocklist-global.acl'), compiled.blockGlobal);
        this.writeText(path.join(this.enterpriseDir, 'ip-bypass.acl'), compiled.ipBypassEntries);

        for (const [vlanId, domains] of compiled.allowByVlan.entries()) {
            this.writeText(path.join(this.enterpriseDir, `allowlist-vlan-${vlanId}.acl`), domains);
        }
        for (const [vlanId, domains] of compiled.blockByVlan.entries()) {
            this.writeText(path.join(this.enterpriseDir, `blocklist-vlan-${vlanId}.acl`), domains);
        }

        this.writeText(path.join(this.legacyGeneratedDir, 'proxy_whitelist.acl'), unique([...compiled.allowGlobal, ...compiled.allowProtectedGlobal]));
        this.writeText(path.join(this.legacyGeneratedDir, 'proxy_blocklist.acl'), compiled.blockGlobal);
        this.writeText(path.join(this.legacyGeneratedDir, 'proxy_protected_ssl.acl'), unique([...compiled.allowProtectedGlobal, ...compiled.allowGlobal]));
        this.writeText(path.join(this.legacyGeneratedDir, 'proxy_bump_ssl.acl'), compiled.blockGlobal);
        this.writeText(path.join(this.legacyGeneratedDir, 'proxy_ip_bypass.acl'), compiled.ipBypassEntries);
    }

    async compile(mode: EnforcementMode = 'acl-plus-dns'): Promise<CompiledArtifacts> {
        const state = await this.loadState();
        const compiled = this.compileScopes(state.blocks, state.allows, state.exceptions, state.vlans);
        const previousManifest = this.readManifest();
        const generatedAt = new Date().toISOString();
        const version = generatedAt.replace(/[:.]/g, '-');

        const files: Record<string, string> = {};
        files.squidWhitelist = this.writeText(this.squidWhitelistFile, sortedUnique([...compiled.allowGlobal, ...compiled.allowProtectedGlobal]));
        files.squidBlocklist = this.writeText(this.squidBlocklistFile, compiled.blockGlobal);
        files.squidIpBypass = this.writeText(this.squidIpBypassFile, compiled.ipBypassEntries);
        files.squidProtected = this.writeText(this.squidProtectedFile, sortedUnique([...compiled.allowProtectedGlobal, ...compiled.allowGlobal]));
        files.squidBump = this.writeText(this.squidBumpFile, compiled.blockGlobal);

        for (const [vlanId, domains] of compiled.allowByVlan.entries()) {
            files[`squidAllowVlan${vlanId}`] = this.writeText(path.join(this.squidAclDir, `allowlist-vlan-${vlanId}.acl`), domains);
        }
        for (const [vlanId, domains] of compiled.blockByVlan.entries()) {
            files[`squidBlockVlan${vlanId}`] = this.writeText(path.join(this.squidAclDir, `blocklist-vlan-${vlanId}.acl`), domains);
        }

        const allowedEntries = [
            '; Becker V8 whitelist gerada automaticamente',
            ...toRpzEntries(compiled.allowGlobal, 'rpz-passthru.'),
            ...toRpzEntries(compiled.allowProtectedGlobal, 'rpz-passthru.'),
        ];
        files.allowedRpz = `${this.buildZoneFile('rpz.allow.becker.local', allowedEntries, ['Whitelist global e protegida'])}\n`;
        this.writeRawFile(env.whitelistFile, files.allowedRpz);

        const blockedEntries = [
            '; Becker V8 blocklist gerada automaticamente',
            ...toRpzEntries(compiled.blockGlobal, '.'),
        ];
        files.blockedRpz = `${this.buildZoneFile('rpz.block.becker.local', blockedEntries, ['Blocklist global'])}\n`;
        this.writeRawFile(env.blockedRpzFile, files.blockedRpz);

        const vipBypassEntries = compiled.dnsBypassEntries.map(cidrToRpzClientIp).filter(Boolean) as string[];
        files.vipBypass = `${this.buildZoneFile(
            'rpz.vippass.becker.local',
            [
                '; BeckerCorp VIP Bypass — gerado automaticamente',
                '; NÃO EDITAR MANUALMENTE',
                '',
                ...vipBypassEntries,
            ],
            ['VIP bypass por client-ip'],
        )}\n`;
        this.writeRawFile(env.vipConf, files.vipBypass);

        const dnsTaggedVlans = compiled.managedVlans.filter((vlan) => {
            const allowCount = compiled.allowByVlan.get(vlan.vlan_id)?.length || 0;
            const blockCount = compiled.blockByVlan.get(vlan.vlan_id)?.length || 0;
            return allowCount > 0 || blockCount > 0;
        });

        for (const vlan of compiled.managedVlans) {
            const allowPath = path.join(this.unboundPolicyDir, `allowlist-vlan-${vlan.vlan_id}.rpz`);
            files[`dnsAllowVlan${vlan.vlan_id}`] = `${this.buildZoneFile(
                `rpz.allow.vlan${vlan.vlan_id}.becker.local`,
                [
                    '; Becker V8 allowlist por VLAN gerada automaticamente',
                    ...toRpzEntries(compiled.allowByVlan.get(vlan.vlan_id) || [], 'rpz-passthru.'),
                ],
                [`Whitelist VLAN ${vlan.vlan_id}`],
            )}\n`;
            this.writeRawFile(allowPath, files[`dnsAllowVlan${vlan.vlan_id}`]);

            const blockPath = path.join(this.unboundPolicyDir, `blocklist-vlan-${vlan.vlan_id}.rpz`);
            files[`dnsBlockVlan${vlan.vlan_id}`] = `${this.buildZoneFile(
                `rpz.block.vlan${vlan.vlan_id}.becker.local`,
                [
                    '; Becker V8 blocklist por VLAN gerada automaticamente',
                    ...toRpzEntries(compiled.blockByVlan.get(vlan.vlan_id) || [], '.'),
                ],
                [`Blocklist VLAN ${vlan.vlan_id}`],
            )}\n`;
            this.writeRawFile(blockPath, files[`dnsBlockVlan${vlan.vlan_id}`]);
        }

        const accessVlans = state.vlans
            .filter((vlan) => String(vlan.subnet_cidr || '').trim())
            .sort((left, right) => left.vlan_id - right.vlan_id);
        const managedTags = compiled.managedVlans.map((vlan) => this.buildVlanTag(vlan.vlan_id)).join(' ');

        const unboundPolicyLines = [
            '# BeckerCorp Policy Compiler — gerado automaticamente',
            'server:',
            '    # RPZ exige respip; usa a cadeia suportada pelo Unbound 1.19.x.',
            '    module-config: "respip validator iterator"',
            '    # Mantem o Unbound disponível para todas as VLANs, sem whitelist órfã.',
            ...accessVlans.map((vlan) => `    access-control: ${vlan.subnet_cidr} allow`),
            '',
        ];

        if (compiled.managedVlans.length) {
            unboundPolicyLines.push(
                `    define-tag: "${managedTags}"`,
                ...compiled.managedVlans.map((vlan) => `    access-control-tag: ${vlan.subnet_cidr} "${this.buildVlanTag(vlan.vlan_id)}"`),
                '',
            );
        }

        if (mode !== 'acl-only') {
            unboundPolicyLines.push(
                'rpz:',
                '    name: "rpz.vippass.becker.local."',
                `    zonefile: "${env.vipConf}"`,
                '',
                ...dnsTaggedVlans.flatMap((vlan) => ([
                    'rpz:',
                    `    name: "rpz.allow.vlan${vlan.vlan_id}.becker.local."`,
                    `    zonefile: "${path.join(this.unboundPolicyDir, `allowlist-vlan-${vlan.vlan_id}.rpz`)}"`,
                    `    tags: "${this.buildVlanTag(vlan.vlan_id)}"`,
                    '',
                ])),
                ...dnsTaggedVlans.flatMap((vlan) => ([
                    'rpz:',
                    `    name: "rpz.block.vlan${vlan.vlan_id}.becker.local."`,
                    `    zonefile: "${path.join(this.unboundPolicyDir, `blocklist-vlan-${vlan.vlan_id}.rpz`)}"`,
                    `    tags: "${this.buildVlanTag(vlan.vlan_id)}"`,
                    '    rpz-action-override: nxdomain',
                    '',
                ])),
                'rpz:',
                '    name: "rpz.allow.becker.local."',
                `    zonefile: "${env.whitelistFile}"`,
                ...(managedTags ? [`    tags: "${managedTags}"`] : []),
                '',
                'rpz:',
                '    name: "rpz.block.becker.local."',
                `    zonefile: "${env.blockedRpzFile}"`,
                ...(managedTags ? [`    tags: "${managedTags}"`] : []),
                '    rpz-log: yes',
                '    rpz-log-name: "becker-blocked"',
                '    rpz-action-override: nxdomain',
                '',
            );
        } else {
            unboundPolicyLines.push('# Modo acl-only: RPZ gerada, porém enforcement DNS desativado.');
        }

        files.unboundPolicyConf = `${unboundPolicyLines.join('\n')}\n`;
        this.writeRawFile(env.unboundPolicyConf, files.unboundPolicyConf);

        this.syncCompatibilityFiles(compiled);

        const policySummary = {
            mode,
            block_global: compiled.blockGlobal.length,
            allow_global: compiled.allowGlobal.length,
            allow_protected_global: compiled.allowProtectedGlobal.length,
            bypass_ip: compiled.ipBypassEntries.length,
            bypass_dns: compiled.dnsBypassEntries.length,
            vlan_scopes: compiled.managedVlans.map((vlan) => ({
                vlan_id: vlan.vlan_id,
                interface_name: vlan.interface_name,
                subnet_cidr: vlan.subnet_cidr,
                exempt: vlan.exempt,
                blocking_enabled: vlan.blocking_enabled,
                policy_mode: vlan.policy_mode,
                allow_count: compiled.allowByVlan.get(vlan.vlan_id)?.length || 0,
                block_count: compiled.blockByVlan.get(vlan.vlan_id)?.length || 0,
                dns_tag: dnsTaggedVlans.some((tagged) => tagged.vlan_id === vlan.vlan_id) ? this.buildVlanTag(vlan.vlan_id) : null,
            })),
        };

        const manifestHashes = Object.fromEntries(Object.entries(files).map(([key, content]) => [key, sha256(content)]));
        const sameAsPrevious = Boolean(previousManifest
            && previousManifest.enforcementMode === mode
            && JSON.stringify(previousManifest.hashes || {}) === JSON.stringify(manifestHashes)
            && JSON.stringify(previousManifest.policySummary || {}) === JSON.stringify(policySummary));

        const manifest: CompiledArtifacts = {
            enforcementMode: mode,
            version: sameAsPrevious ? previousManifest!.version : version,
            generatedAt: sameAsPrevious ? previousManifest!.generatedAt : generatedAt,
            paths: {
                squidWhitelist: this.squidWhitelistFile,
                squidBlocklist: this.squidBlocklistFile,
                squidIpBypass: this.squidIpBypassFile,
                squidProtected: this.squidProtectedFile,
                squidBump: this.squidBumpFile,
                allowedRpz: env.whitelistFile,
                blockedRpz: env.blockedRpzFile,
                vipBypass: env.vipConf,
                unboundPolicyConf: env.unboundPolicyConf,
                ...Object.fromEntries(compiled.managedVlans.flatMap((vlan) => ([
                    [`squidAllowVlan${vlan.vlan_id}`, path.join(this.squidAclDir, `allowlist-vlan-${vlan.vlan_id}.acl`)],
                    [`squidBlockVlan${vlan.vlan_id}`, path.join(this.squidAclDir, `blocklist-vlan-${vlan.vlan_id}.acl`)],
                    [`dnsAllowVlan${vlan.vlan_id}`, path.join(this.unboundPolicyDir, `allowlist-vlan-${vlan.vlan_id}.rpz`)],
                    [`dnsBlockVlan${vlan.vlan_id}`, path.join(this.unboundPolicyDir, `blocklist-vlan-${vlan.vlan_id}.rpz`)],
                ]))),
            },
            hashes: manifestHashes,
            policySummary,
        };

        this.writeRawFile(this.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        return manifest;
    }

    readManifest() {
        if (!fs.existsSync(this.manifestPath)) return null;
        return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8'));
    }
}

export const policyCompilerService = new PolicyCompilerService();
