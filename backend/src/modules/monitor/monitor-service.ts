import fs from 'fs';
import os from 'os';
import { promises as dnsPromises } from 'dns';
import { env } from '../../config/env';
import { pool } from '../../config/db';
import { execCmd } from '../../utils/sys';
import { getLinkSentinelSnapshot } from '../connectivity/downtime-monitor';

/*
 * Coletor único de métricas do SGCG.
 * Uma coleta a cada 5 s serve todos os navegadores abertos (antes cada aba rodava
 * vmstat, greps e consultas por conta própria).
 */

const SAMPLE_MS = 5000;
const RING_SIZE = 720; // 1 hora de amostras de 5 s
const TRAFFIC_MS = 10000;
const LINK_MBPS = Number(process.env.WAN_CAPACITY_MBPS || 300);

const DEFAULT_VLAN_NAMES: Record<number, string> = {
    10: 'Secretaria',
    30: 'Celulares',
    40: 'Câmeras / CFTV',
    50: 'SINE',
    70: 'Visitantes',
    80: 'VoIP',
    99: 'Infraestrutura',
};

type Counter = { rx: number; tx: number };
type VlanRuntime = {
    id: number;
    iface: string;
    name: string;
    down: number;
    up: number;
    limitDown: number | null;
    limitUp: number | null;
    drops: number;
    overlimits: number;
    neighbors: number;
    exempt: boolean;
    internalExempt: boolean;
};
type Sample = {
    t: number;
    wan: { down: number; up: number };
    vlans: Record<number, { down: number; up: number }>;
    cpu: number;
    ram: number;
};
type Flow = { remote: string; label: string; domain: string | null; kind: 'internet' | 'internal'; remoteVlan: number | null; down: number; up: number };
type Device = { ip: string; vlan: number; hostname: string | null; mac?: string | null; down: number; up: number; internalDown: number; internalUp: number; qosVip: boolean; filterVip?: boolean; flows: Flow[] };

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const readNumber = (path: string) => {
    try {
        return Number(fs.readFileSync(path, 'utf-8').trim()) || 0;
    } catch {
        return 0;
    }
};

const isPrivate = (ip: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip);
const vlanOfIp = (ip: string): number | null => {
    const match = ip.match(/^192\.168\.(\d{1,3})\.\d{1,3}$/);
    return match ? Number(match[1]) : null;
};

// Nomes amigáveis para os destinos mais comuns. A chave é o domínio registrável.
const FRIENDLY_SITES: Array<[RegExp, string]> = [
    [/(googlevideo|youtube|ytimg|youtu)\./, 'YouTube'],
    [/(whatsapp)\./, 'WhatsApp'],
    [/(instagram|cdninstagram)\./, 'Instagram'],
    [/(facebook|fbcdn|fbsbx)\./, 'Facebook'],
    [/(windowsupdate|delivery\.mp\.microsoft|update\.microsoft|wustat)\./, 'Windows Update'],
    [/(office|office365|microsoftonline|sharepoint|onedrive|live\.com|outlook|teams|skype)/, 'Microsoft 365'],
    [/(microsoft|msn|bing|azure|msedge|windows)\./, 'Microsoft'],
    [/(nflxvideo|netflix|nflxso)\./, 'Netflix'],
    [/(tiktok|tiktokcdn|byteoversea|ibytedtos)\./, 'TikTok'],
    [/(spotify|scdn\.co)/, 'Spotify'],
    [/(intelbras|intelbrasp2p)/, 'Intelbras (câmeras)'],
    [/\.gov\.br$|^gov\.br$/, 'Gov.br'],
    [/(caixa|bb\.com\.br|bancobrasil|itau|bradesco|santander|sicoob|sicredi|nubank)/, 'Bancos'],
    [/(1e100\.net|google|gstatic|googleapis|googleusercontent|gvt1|gvt2)/, 'Google'],
    [/(apple|icloud|mzstatic)\./, 'Apple'],
    [/(amazonaws|cloudfront|amazon)\./, 'Amazon / AWS'],
    [/(akamai|akamaized|akadns|edgekey|edgesuite)\./, 'Akamai (CDN)'],
    [/(cloudflare)/, 'Cloudflare'],
    [/(dropbox)/, 'Dropbox'],
    [/(globo|glbimg)\./, 'Globo'],
];

// Faixas conhecidas para IPs sem nome no DNS (ex.: chamadas de vídeo do Google Meet).
const KNOWN_RANGES: Array<[RegExp, string]> = [
    [/^(74\.125|142\.25[01]|172\.217|172\.253|216\.58|216\.239|209\.85|64\.233|108\.177|173\.194)\./, 'google.com'],
    [/^(157\.240|31\.13|179\.60\.19[2-5]|185\.60\.21[6-9])\./, 'facebook.com'],
    [/^(104\.(1[6-9]|2\d|3[01])|172\.(6[4-9]|7[01])|162\.15[89])\./, 'cloudflare.com'],
    [/^(13\.107|52\.(9[6-9]|1[01]\d)|20\.(18[89]|19\d))\./, 'microsoft.com'],
];

const SECOND_LEVEL = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'mil', 'art', 'jus', 'leg', 'app']);
const registrableDomain = (host: string) => {
    const parts = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    if (tld.length === 2 && SECOND_LEVEL.has(sld)) return parts.slice(-3).join('.');
    return parts.slice(-2).join('.');
};
const friendlyName = (host: string) => {
    const lower = host.toLowerCase();
    for (const [pattern, name] of FRIENDLY_SITES) {
        if (pattern.test(lower)) return name;
    }
    return registrableDomain(lower);
};

class MonitorService {
    private started = false;
    private ring: Sample[] = [];
    private lastCounters = new Map<string, Counter>();
    private lastAt = 0;
    private lastCpu: { idle: number; total: number } | null = null;
    private vlans = new Map<number, VlanRuntime>();
    private dropsHistory = new Map<number, Array<{ t: number; drops: number }>>();
    private vlanMeta = new Map<number, { name: string; exempt: boolean }>();
    private services: Record<string, boolean> = {};
    private disk = { total: 0, used: 0, percent: 0 };
    private traffic: { updatedAt: number; devices: Device[] } = { updatedAt: 0, devices: [] };
    private ipToDomain = new Map<string, { domain: string; at: number }>();
    private resolvedDomains = new Map<string, number>();
    private reverseCache = new Map<string, { name: string | null; at: number }>();
    private hostnames = new Map<string, string>();
    private neighborList: Array<{ ip: string; mac: string; iface: string }> = [];
    private filterVips = new Set<string>();
    private serverIps = new Set<string>();
    private qosVips = new Set<string>();
    private resolver = new dnsPromises.Resolver({ timeout: 1500, tries: 1 });
    private trafficRunning = false;
    private internet: { gateway: boolean; external: boolean; checked_at: number; provider: string } = { gateway: true, external: true, checked_at: 0, provider: env.wanProviderName || 'Provedor' };

    start() {
        if (this.started) return;
        this.started = true;
        try {
            this.resolver.setServers(['127.0.0.1']);
        } catch {}
        this.loadVlanMeta().catch(() => null);
        this.sample();
        const sampler = setInterval(() => this.sample(), SAMPLE_MS);
        sampler.unref?.();
        const slow = setInterval(() => {
            this.readTc().catch(() => null);
            this.readNeighbors();
            this.readDisk();
            this.readInternet().catch(() => null);
        }, 15000);
        this.readInternet().catch(() => null);
        slow.unref?.();
        this.readTc().catch(() => null);
        this.readNeighbors();
        this.readDisk();
        const svc = setInterval(() => this.readServices().catch(() => null), 30000);
        svc.unref?.();
        this.readServices().catch(() => null);
        const meta = setInterval(() => {
            this.loadVlanMeta().catch(() => null);
            this.loadHostnames().catch(() => null);
            this.loadQosVips().catch(() => null);
        }, 60000);
        meta.unref?.();
        this.loadHostnames().catch(() => null);
        this.loadQosVips().catch(() => null);
        const dns = setInterval(() => this.refreshDnsMap().catch(() => null), 30000);
        dns.unref?.();
        this.refreshDnsMap().catch(() => null);
        // Varredura de presença: todo aparelho ligado responde ARP, mesmo sem tráfego.
        const sweep = setInterval(() => this.sweepPresence().catch(() => null), 120000);
        sweep.unref?.();
        setTimeout(() => this.sweepPresence().catch(() => null), 5000).unref?.();
        const traffic = setInterval(() => this.collectTraffic().catch(() => null), TRAFFIC_MS);
        traffic.unref?.();
        setTimeout(() => this.collectTraffic().catch(() => null), 6000).unref?.();
    }

    private listVlanIfaces() {
        const prefix = `${env.lanInterface}.`;
        try {
            return fs.readdirSync('/sys/class/net')
                .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
                .map((name) => ({ iface: name, id: Number(name.slice(prefix.length)) }))
                .sort((a, b) => a.id - b.id);
        } catch {
            return [];
        }
    }

    private readCounter(iface: string): Counter {
        return {
            rx: readNumber(`/sys/class/net/${iface}/statistics/rx_bytes`),
            tx: readNumber(`/sys/class/net/${iface}/statistics/tx_bytes`),
        };
    }

    private rate(iface: string, current: Counter, seconds: number) {
        const previous = this.lastCounters.get(iface);
        this.lastCounters.set(iface, current);
        if (!previous || seconds <= 0) return { rx: 0, tx: 0 };
        const rx = current.rx >= previous.rx ? ((current.rx - previous.rx) * 8) / seconds / 1e6 : 0;
        const tx = current.tx >= previous.tx ? ((current.tx - previous.tx) * 8) / seconds / 1e6 : 0;
        return { rx, tx };
    }

    private readCpu() {
        try {
            const line = fs.readFileSync('/proc/stat', 'utf-8').split('\n')[0];
            const values = line.trim().split(/\s+/).slice(1).map(Number);
            const idle = values[3] + (values[4] || 0);
            const total = values.reduce((sum, value) => sum + value, 0);
            const previous = this.lastCpu;
            this.lastCpu = { idle, total };
            if (!previous || total <= previous.total) return 0;
            return Math.round((1 - (idle - previous.idle) / (total - previous.total)) * 100);
        } catch {
            return 0;
        }
    }

    private readRam() {
        try {
            const text = fs.readFileSync('/proc/meminfo', 'utf-8');
            const total = Number(text.match(/MemTotal:\s+(\d+)/)?.[1] || 0);
            const available = Number(text.match(/MemAvailable:\s+(\d+)/)?.[1] || 0);
            if (!total) return { percent: 0, totalMb: 0, usedMb: 0 };
            return { percent: Math.round(((total - available) / total) * 100), totalMb: Math.round(total / 1024), usedMb: Math.round((total - available) / 1024) };
        } catch {
            return { percent: 0, totalMb: 0, usedMb: 0 };
        }
    }

    private readDisk() {
        try {
            const stat: any = (fs as any).statfsSync('/');
            const total = stat.blocks * stat.bsize;
            const free = stat.bavail * stat.bsize;
            this.disk = { total, used: total - free, percent: total ? Math.round(((total - free) / total) * 100) : 0 };
        } catch {}
    }

    private sample() {
        const now = Date.now();
        const seconds = this.lastAt ? (now - this.lastAt) / 1000 : 0;
        this.lastAt = now;
        const wanRate = this.rate(env.wanInterface, this.readCounter(env.wanInterface), seconds);
        const vlans: Sample['vlans'] = {};
        for (const { iface, id } of this.listVlanIfaces()) {
            const r = this.rate(iface, this.readCounter(iface), seconds);
            // Na interface da VLAN, tx é o que chega aos dispositivos (download) e rx o que eles enviam (upload).
            vlans[id] = { down: round(r.tx), up: round(r.rx) };
            const current = this.vlans.get(id) || this.emptyVlan(id, iface);
            current.down = vlans[id].down;
            current.up = vlans[id].up;
            this.vlans.set(id, current);
        }
        const ram = this.readRam();
        const sample: Sample = { t: now, wan: { down: round(wanRate.rx), up: round(wanRate.tx) }, vlans, cpu: this.readCpu(), ram: ram.percent };
        if (seconds > 0) {
            this.ring.push(sample);
            if (this.ring.length > RING_SIZE) this.ring.shift();
        }
    }

    private emptyVlan(id: number, iface: string): VlanRuntime {
        const meta = this.vlanMeta.get(id);
        return {
            id,
            iface,
            name: meta?.name || DEFAULT_VLAN_NAMES[id] || `VLAN ${id}`,
            down: 0,
            up: 0,
            limitDown: null,
            limitUp: null,
            drops: 0,
            overlimits: 0,
            neighbors: 0,
            exempt: meta?.exempt || false,
            internalExempt: false,
        };
    }

    private async loadVlanMeta() {
        const { rows } = await pool.query('SELECT vlan_id, label, exempt FROM vlan_policies');
        for (const row of rows) {
            this.vlanMeta.set(Number(row.vlan_id), { name: row.label || DEFAULT_VLAN_NAMES[row.vlan_id] || `VLAN ${row.vlan_id}`, exempt: Boolean(row.exempt) });
        }
        for (const vlan of this.vlans.values()) {
            const meta = this.vlanMeta.get(vlan.id);
            if (meta) {
                vlan.name = meta.name;
                vlan.exempt = meta.exempt;
            }
        }
    }

    private qosLabels = new Map<string, string>();
    private vipLabels = new Map<string, string>();

    private async loadQosVips() {
        const { rows } = await pool.query('SELECT ip::text AS ip, label FROM net_qos_vips');
        this.qosVips = new Set(rows.map((row) => String(row.ip).replace(/\/32$/, '')));
        this.qosLabels = new Map(rows.filter((r) => r.label).map((r) => [String(r.ip).replace(/\/32$/, ''), String(r.label)]));
        const vips = await pool.query("SELECT host(ip) AS ip, COALESCE(NULLIF(hostname, ''), NULLIF(description, '')) AS name FROM policy_exceptions WHERE active = TRUE").catch(() => ({ rows: [] as any[] }));
        this.filterVips = new Set(vips.rows.map((r) => String(r.ip)));
        this.vipLabels = new Map(vips.rows.filter((r) => r.name && !/^vip-\d/.test(r.name)).map((r) => [String(r.ip), String(r.name)]));
    }

    private nameFor(ip: string) {
        const dhcp = this.hostnames.get(ip);
        return this.identityNames.get(ip) || this.qosLabels.get(ip) || this.vipLabels.get(ip) || (dhcp && dhcp !== '1' ? dhcp : null);
    }

    private identityNames = new Map<string, string>();
    private activeLeases: Array<{ ip: string; mac: string }> = [];
    private seen = new Map<string, { mac: string | null; at: number }>();

    private async loadHostnames() {
        const names = new Map<string, string>();
        const identity = new Map<string, string>();
        try {
            const leases = fs.readFileSync('/var/lib/dhcp/dhcpd.leases', 'utf-8');
            const blocks = leases.split(/\nlease /);
            const active = new Map<string, string>();
            const now = Date.now();
            for (const block of blocks) {
                const ip = block.match(/^(\d+\.\d+\.\d+\.\d+)/)?.[1];
                const host = block.match(/client-hostname "([^"]+)"/)?.[1];
                if (ip && host) names.set(ip, host);
                // O arquivo guarda o histórico; o último bloco de cada IP é o que vale.
                const state = block.match(/binding state (\w+);/)?.[1];
                const mac = block.match(/hardware ethernet ([0-9a-f:]+);/i)?.[1]?.toLowerCase();
                const ends = block.match(/ends \d (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2});/)?.[1];
                if (ip) {
                    const valid = state === 'active' && (!ends || new Date(`${ends.replace(/\//g, '-')}Z`).getTime() > now);
                    if (valid && mac) active.set(ip, mac); else active.delete(ip);
                }
            }
            this.activeLeases = Array.from(active.entries()).map(([ip, mac]) => ({ ip, mac }));
        } catch {}
        try {
            const identity = JSON.parse(fs.readFileSync(`${env.projectRoot}/data/identity/latest.json`, 'utf-8'));
            for (const entry of Object.values<any>(identity || {})) {
                if (entry?.ip && entry?.computer && entry?.agent_id !== 'TESTE') {
                    identity.set(String(entry.ip), entry.display_user ? `${entry.computer} · ${entry.display_user}` : String(entry.computer));
                }
            }
        } catch {}
        this.hostnames = names;
        this.identityNames = identity;
    }

    private parseTcClass(text: string, classId: string) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i += 1) {
            if (lines[i].includes(`class htb ${classId} `)) {
                const rate = lines[i].match(/ rate (\d+(?:\.\d+)?)([KMG]?)bit/);
                const ceil = lines[i].match(/ ceil (\d+(?:\.\d+)?)([KMG]?)bit/);
                const stats = lines.slice(i, i + 3).join(' ');
                const toMbps = (m: RegExpMatchArray | null) => {
                    if (!m) return null;
                    const n = Number(m[1]);
                    return m[2] === 'G' ? n * 1000 : m[2] === 'K' ? n / 1000 : m[2] === '' ? n / 1e6 : n;
                };
                return {
                    rate: toMbps(rate),
                    ceil: toMbps(ceil),
                    dropped: Number(stats.match(/dropped (\d+)/)?.[1] || 0),
                    overlimits: Number(stats.match(/overlimits (\d+)/)?.[1] || 0),
                };
            }
        }
        return null;
    }

    private async readTc() {
        const now = Date.now();
        await Promise.all(this.listVlanIfaces().map(async ({ iface, id }) => {
            const [down, up] = await Promise.all([
                execCmd(`sudo tc -s class show dev ${iface}`),
                execCmd(`sudo tc -s class show dev ifb${id}`),
            ]);
            const vlan = this.vlans.get(id) || this.emptyVlan(id, iface);
            const downClass = this.parseTcClass(down, '1:10');
            const upClass = this.parseTcClass(up, '1:10');
            vlan.limitDown = downClass?.ceil ?? null;
            vlan.limitUp = upClass?.ceil ?? null;
            vlan.drops = (downClass?.dropped || 0) + (upClass?.dropped || 0);
            vlan.overlimits = (downClass?.overlimits || 0) + (upClass?.overlimits || 0);
            vlan.internalExempt = Boolean(this.parseTcClass(down, '1:30'));
            this.vlans.set(id, vlan);
            const history = this.dropsHistory.get(id) || [];
            history.push({ t: now, drops: vlan.drops });
            while (history.length && now - history[0].t > 6 * 60 * 1000) history.shift();
            this.dropsHistory.set(id, history);
        }));
    }

    private readNeighbors() {
        try {
            const counts = new Map<string, number>();
            const list: Array<{ ip: string; mac: string; iface: string }> = [];
            const lines = fs.readFileSync('/proc/net/arp', 'utf-8').split('\n').slice(1);
            for (const line of lines) {
                const cols = line.trim().split(/\s+/);
                if (cols.length < 6) continue;
                if (cols[2] === '0x0' || cols[3] === '00:00:00:00:00:00') continue;
                counts.set(cols[5], (counts.get(cols[5]) || 0) + 1);
                list.push({ ip: cols[0], mac: cols[3].toLowerCase(), iface: cols[5] });
            }
            this.neighborList = list;
            this.serverIps = new Set(Object.values(os.networkInterfaces()).flat().filter((a: any) => a && a.family === 'IPv4').map((a: any) => a.address));
            for (const vlan of this.vlans.values()) vlan.neighbors = counts.get(vlan.iface) || 0;
        } catch {}
    }

    private sweeping = false;

    private async sweepPresence() {
        if (this.sweeping) return;
        this.sweeping = true;
        try {
            const subnets = this.listVlanIfaces().map(({ id }) => `192.168.${id}.0/24`).join(' ');
            if (!subnets) return;
            const out = await execCmd(`sudo nmap -sn -n --min-rate 1000 ${subnets}`);
            const now = Date.now();
            let current: string | null = null;
            for (const line of out.split('\n')) {
                const ip = line.match(/Nmap scan report for (\d+\.\d+\.\d+\.\d+)/)?.[1];
                if (ip) {
                    current = ip;
                    if (!ip.endsWith('.1')) this.seen.set(ip, { mac: this.seen.get(ip)?.mac || null, at: now });
                    continue;
                }
                const mac = line.match(/MAC Address: ([0-9A-F:]{17})/i)?.[1];
                if (mac && current && !current.endsWith('.1')) this.seen.set(current, { mac: mac.toLowerCase(), at: now });
            }
        } finally {
            this.sweeping = false;
        }
    }

    private async readInternet() {
        const snapshot: any = await getLinkSentinelSnapshot();
        this.internet = {
            gateway: Boolean(snapshot?.gateway?.online),
            external: Boolean(snapshot?.external?.online),
            checked_at: Date.now(),
            provider: env.wanProviderName || 'Provedor',
        };
    }

    private async readServices() {
        const names = ['unbound', 'squid', 'isc-dhcp-server', env.wireguardService, 'fail2ban', 'postgresql'].filter(Boolean);
        const results = await Promise.all(names.map(async (name) => {
            const out = await execCmd(`systemctl is-active ${name}`);
            return [name, out.trim() === 'active'] as const;
        }));
        this.services = Object.fromEntries(results);
    }

    private async refreshDnsMap() {
        const { rows } = await pool.query(
            `SELECT query_name, COUNT(*)::int AS hits
             FROM dns_policy_events
             WHERE occurred_at > NOW() - INTERVAL '15 minutes' AND query_name IS NOT NULL
             GROUP BY query_name ORDER BY hits DESC LIMIT 1500`,
        );
        const now = Date.now();
        const pending = rows
            .map((row) => String(row.query_name).replace(/\.$/, ''))
            .filter((name) => name.includes('.') && !name.endsWith('.local') && !name.endsWith('.arpa') && (now - (this.resolvedDomains.get(name) || 0)) > 10 * 60 * 1000);
        const queue = pending.slice(0, 600);
        const workers = Array.from({ length: 12 }, async () => {
            while (queue.length) {
                const name = queue.shift() as string;
                this.resolvedDomains.set(name, now);
                try {
                    const ips = await this.resolver.resolve4(name);
                    for (const ip of ips) {
                        const existing = this.ipToDomain.get(ip);
                        // Mantém o nome mais específico já visto para o IP, renovando a validade.
                        this.ipToDomain.set(ip, { domain: existing && now - existing.at < 60 * 60 * 1000 ? existing.domain : name, at: now });
                    }
                } catch {}
            }
        });
        await Promise.all(workers);
        for (const [ip, entry] of this.ipToDomain) {
            if (now - entry.at > 3 * 60 * 60 * 1000) this.ipToDomain.delete(ip);
        }
    }

    private reverseQueue = new Set<string>();
    private reverseActive = 0;

    // Nome do destino sem esperar: usa o que já se sabe e busca o resto em segundo plano.
    private nameForRemoteNow(ip: string): string | null {
        const mapped = this.ipToDomain.get(ip);
        if (mapped) return mapped.domain;
        const known = KNOWN_RANGES.find(([pattern]) => pattern.test(ip));
        if (known) return known[1];
        const cached = this.reverseCache.get(ip);
        if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.name;
        if (!this.reverseQueue.has(ip) && this.reverseQueue.size < 500) {
            this.reverseQueue.add(ip);
            this.pumpReverse();
        }
        return null;
    }

    private pumpReverse() {
        while (this.reverseActive < 8 && this.reverseQueue.size) {
            const ip = this.reverseQueue.values().next().value as string;
            this.reverseQueue.delete(ip);
            this.reverseActive += 1;
            this.nameForRemote(ip).catch(() => null).finally(() => {
                this.reverseActive -= 1;
                this.pumpReverse();
            });
        }
    }

    private async nameForRemote(ip: string) {
        const mapped = this.ipToDomain.get(ip);
        if (mapped) return mapped.domain;
        const known = KNOWN_RANGES.find(([pattern]) => pattern.test(ip));
        if (known) return known[1];
        const cached = this.reverseCache.get(ip);
        if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.name;
        let name: string | null = null;
        try {
            const names = await Promise.race([
                dnsPromises.reverse(ip),
                new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200)),
            ]);
            name = names?.[0] || null;
        } catch {}
        this.reverseCache.set(ip, { name, at: Date.now() });
        return name;
    }

    private parseIftop(text: string) {
        const toBytes = (raw: string) => {
            const m = raw.replace(',', '.').match(/^([\d.]+)([KMG]?)B$/);
            if (!m) return 0;
            const mult = m[2] === 'G' ? 1e9 : m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : 1;
            return Number(m[1]) * mult;
        };
        const pairs: Array<{ a: string; b: string; ab: number; ba: number }> = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length - 1; i += 1) {
            const first = lines[i].match(/^\s*\d+\s+(\S+)\s+=>\s+(\S+)\s+(\S+)/);
            if (!first) continue;
            const second = lines[i + 1].match(/^\s+(\S+)\s+<=\s+(\S+)\s+(\S+)/);
            if (!second) continue;
            // Coluna "last 10s": média estável da janela de coleta.
            pairs.push({ a: first[1], b: second[1], ab: toBytes(first[3]) * 8 / 1e6, ba: toBytes(second[3]) * 8 / 1e6 });
            i += 1;
        }
        return pairs;
    }

    private trafficStartedAt = 0;

    private async collectTraffic() {
        // Proteção: uma coleta presa por mais de 30 s é descartada e a próxima começa.
        if (this.trafficRunning && Date.now() - this.trafficStartedAt < 30000) return;
        this.trafficRunning = true;
        this.trafficStartedAt = Date.now();
        try {
            const ifaces = this.listVlanIfaces().filter(({ id }) => {
                const vlan = this.vlans.get(id);
                return vlan && (vlan.down + vlan.up) > 0.02;
            });
            const outputs = await Promise.all(ifaces.map(async ({ iface, id }) => ({
                id,
                text: await execCmd(`sudo iftop -i ${iface} -t -s 3 -n -N -L 500 -B 2>/dev/null`),
            })));
            const devices = new Map<string, Device>();
            for (const { id, text } of outputs) {
                for (const pair of this.parseIftop(text)) {
                    const aLocal = vlanOfIp(pair.a) === id && !pair.a.endsWith('.1');
                    const bLocal = vlanOfIp(pair.b) === id && !pair.b.endsWith('.1');
                    if (aLocal === bLocal) continue;
                    const local = aLocal ? pair.a : pair.b;
                    const remote = aLocal ? pair.b : pair.a;
                    const up = aLocal ? pair.ab : pair.ba;
                    const down = aLocal ? pair.ba : pair.ab;
                    if (up + down < 0.01) continue;
                    const device = devices.get(local) || {
                        ip: local,
                        vlan: id,
                        hostname: this.nameFor(local),
                        down: 0,
                        up: 0,
                        internalDown: 0,
                        internalUp: 0,
                        qosVip: this.qosVips.has(local),
                        flows: [],
                    };
                    const isServer = this.serverIps.has(remote);
                    const internal = isPrivate(remote) || isServer;
                    const remoteVlan = vlanOfIp(remote);
                    let label: string;
                    let domain: string | null = null;
                    if (internal) {
                        if (isServer && !isPrivate(remote)) label = 'Servidor SGCG (IP público)';
                        else if (remote.endsWith('.1')) label = 'Servidor SGCG';
                        else if (remoteVlan && this.vlans.get(remoteVlan)) label = `${this.vlans.get(remoteVlan)?.name} · ${remote}`;
                        else label = `Rede interna · ${remote}`;
                    } else {
                        const name = this.nameForRemoteNow(remote);
                        domain = name ? registrableDomain(name) : null;
                        label = name ? friendlyName(name) : remote;
                    }
                    device.flows.push({ remote, label, domain, kind: internal ? 'internal' : 'internet', remoteVlan, down: round(down), up: round(up) });
                    device.down += down;
                    device.up += up;
                    if (internal) {
                        device.internalDown += down;
                        device.internalUp += up;
                    }
                    devices.set(local, device);
                }
            }
            // Todos os dispositivos conectados: tabela ARP, IPs ativos no DHCP e quem teve tráfego.
            // Quem para de responder sai da lista depois de 10 minutos (desligou ou saiu da rede).
            const now = Date.now();
            const managed = new Set(this.listVlanIfaces().map((v) => v.id));
            for (const n of this.neighborList) {
                if (n.iface.startsWith(`${env.lanInterface}.`)) this.seen.set(n.ip, { mac: n.mac, at: now });
            }
            for (const l of this.activeLeases) this.seen.set(l.ip, { mac: l.mac, at: now });
            for (const ip of devices.keys()) this.seen.set(ip, { mac: this.seen.get(ip)?.mac || null, at: now });
            for (const [ip, info] of this.seen) {
                if (now - info.at > 10 * 60 * 1000) { this.seen.delete(ip); continue; }
                const id = vlanOfIp(ip);
                if (!id || !managed.has(id) || ip.endsWith('.1')) continue;
                const existing = devices.get(ip);
                if (existing) { existing.mac = info.mac; continue; }
                devices.set(ip, { ip, vlan: id, hostname: this.nameFor(ip), mac: info.mac, down: 0, up: 0, internalDown: 0, internalUp: 0, qosVip: this.qosVips.has(ip), flows: [] });
            }
            const list = Array.from(devices.values()).map((device) => ({
                ...device,
                down: round(device.down),
                up: round(device.up),
                internalDown: round(device.internalDown),
                internalUp: round(device.internalUp),
                filterVip: this.filterVips.has(device.ip),
                flows: device.flows.sort((x, y) => (y.down + y.up) - (x.down + x.up)),
            }));
            const ipNum = (ip: string) => ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
            list.sort((x, y) => x.vlan - y.vlan || ipNum(x.ip) - ipNum(y.ip));
            this.traffic = { updatedAt: Date.now(), devices: list };
        } finally {
            this.trafficRunning = false;
        }
    }

    private vlanList() {
        const now = Date.now();
        return Array.from(this.vlans.values()).sort((a, b) => a.id - b.id).map((vlan) => {
            const history = this.dropsHistory.get(vlan.id) || [];
            const oldest = history.find((entry) => now - entry.t <= 5 * 60 * 1000) || history[0];
            const drops5m = oldest ? Math.max(0, vlan.drops - oldest.drops) : 0;
            const internal = this.traffic.devices
                .filter((device) => device.vlan === vlan.id)
                .reduce((acc, device) => ({ down: acc.down + device.internalDown, up: acc.up + device.internalUp }), { down: 0, up: 0 });
            return {
                id: vlan.id,
                name: vlan.name,
                interface: vlan.iface,
                down: vlan.down,
                up: vlan.up,
                limit_down: vlan.limitDown,
                limit_up: vlan.limitUp,
                use_down: vlan.limitDown ? round(vlan.down / vlan.limitDown, 3) : null,
                use_up: vlan.limitUp ? round(vlan.up / vlan.limitUp, 3) : null,
                drops_total: vlan.drops,
                drops_5m: drops5m,
                neighbors: vlan.neighbors,
                exempt: vlan.exempt,
                internal_down: round(internal.down),
                internal_up: round(internal.up),
                internal_exempt: vlan.internalExempt,
            };
        });
    }

    getLive() {
        const last = this.ring[this.ring.length - 1];
        const ram = this.readRam();
        return {
            updated_at: last?.t || Date.now(),
            link_mbps: LINK_MBPS,
            wan: { interface: env.wanInterface, down: last?.wan.down || 0, up: last?.wan.up || 0 },
            cpu: last?.cpu || 0,
            ram: { percent: ram.percent, used_mb: ram.usedMb, total_mb: ram.totalMb },
            disk: this.disk,
            uptime: Number((fs.readFileSync('/proc/uptime', 'utf-8').split(' ')[0]) || 0),
            services: this.services,
            internet: this.internet,
            vlans: this.vlanList(),
        };
    }

    getRecent(minutes = 60) {
        const since = Date.now() - minutes * 60 * 1000;
        return this.ring.filter((sample) => sample.t >= since);
    }

    async getHistory(range: string, scope: string) {
        if (range === '1h') {
            const points = this.ring.map((sample) => {
                if (scope === 'wan') return [sample.t, sample.wan.down, sample.wan.up];
                const id = Number(scope.replace('vlan:', ''));
                const v = sample.vlans[id] || { down: 0, up: 0 };
                return [sample.t, v.down, v.up];
            });
            return { range, scope, unit: 'Mbps', step_seconds: SAMPLE_MS / 1000, points };
        }
        const iface = scope === 'wan' ? env.wanInterface : `${env.lanInterface}.${Number(scope.replace('vlan:', ''))}`;
        if (!/^[\w.]+$/.test(iface)) throw new Error('Escopo inválido');
        const mode = range === '30d' ? 'd' : 'h';
        const limit = range === '30d' ? 30 : range === '7d' ? 168 : 24;
        const raw = await execCmd(`vnstat --json ${mode} ${limit} -i ${iface}`);
        const parsed = JSON.parse(raw || '{}');
        const rows = parsed?.interfaces?.[0]?.traffic?.[mode === 'd' ? 'day' : 'hour'] || [];
        const seconds = mode === 'd' ? 86400 : 3600;
        const isWan = scope === 'wan';
        const nowSec = Date.now() / 1000;
        const points = rows.map((row: any) => {
            const down = isWan ? row.rx : row.tx;
            const up = isWan ? row.tx : row.rx;
            // O período corrente ainda não terminou: a média usa só o tempo já decorrido.
            const elapsed = Math.max(60, Math.min(seconds, nowSec - row.timestamp));
            return [row.timestamp * 1000, round((down * 8) / elapsed / 1e6), round((up * 8) / elapsed / 1e6), down, up];
        });
        return { range, scope, unit: 'Mbps (média)', step_seconds: seconds, points };
    }

    getTraffic() {
        const devices = this.traffic.devices;
        const sites = new Map<string, { label: string; domains: Set<string>; down: number; up: number; devices: Set<string> }>();
        for (const device of devices) {
            for (const flow of device.flows) {
                if (flow.kind !== 'internet') continue;
                const site = sites.get(flow.label) || { label: flow.label, domains: new Set<string>(), down: 0, up: 0, devices: new Set<string>() };
                if (flow.domain) site.domains.add(flow.domain);
                site.down += flow.down;
                site.up += flow.up;
                site.devices.add(device.ip);
                sites.set(flow.label, site);
            }
        }
        const siteList = Array.from(sites.values())
            .map((site) => ({ label: site.label, domains: Array.from(site.domains).slice(0, 5), down: round(site.down), up: round(site.up), devices: Array.from(site.devices) }))
            .sort((a, b) => (b.down + b.up) - (a.down + a.up));
        return {
            updated_at: this.traffic.updatedAt,
            link_mbps: LINK_MBPS,
            wan: this.getLive().wan,
            vlans: this.vlanList(),
            devices,
            sites: siteList,
        };
    }

    private dnsCache: { at: number; data: any } | null = null;

    async getDnsSummary() {
        if (this.dnsCache && Date.now() - this.dnsCache.at < 60000) return this.dnsCache.data;
        const [hourly, topBlocked, topQueried, byVlan] = await Promise.all([
            pool.query(`SELECT date_trunc('hour', occurred_at) AS hour, COUNT(*)::int AS total,
                               COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked
                        FROM dns_policy_events WHERE occurred_at > NOW() - INTERVAL '24 hours'
                        GROUP BY 1 ORDER BY 1`),
            pool.query(`SELECT query_name AS domain, COUNT(*)::int AS total
                        FROM dns_policy_events WHERE occurred_at > NOW() - INTERVAL '24 hours' AND action = 'blocked'
                        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
            pool.query(`SELECT query_name AS domain, COUNT(*)::int AS total
                        FROM dns_policy_events WHERE occurred_at > NOW() - INTERVAL '24 hours'
                        GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
            pool.query(`SELECT vlan_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked,
                               COUNT(DISTINCT client_ip)::int AS clients
                        FROM dns_policy_events WHERE occurred_at > NOW() - INTERVAL '24 hours'
                        GROUP BY 1 ORDER BY 1`),
        ]);
        const data = {
            hourly: hourly.rows.map((row) => ({ hour: new Date(row.hour).getTime(), total: row.total, blocked: row.blocked })),
            top_blocked: topBlocked.rows,
            top_queried: topQueried.rows,
            by_vlan: byVlan.rows,
            total: hourly.rows.reduce((sum, row) => sum + row.total, 0),
            blocked: hourly.rows.reduce((sum, row) => sum + row.blocked, 0),
        };
        this.dnsCache = { at: Date.now(), data };
        return data;
    }

    async getDeviceDns(ip: string, minutes = 120) {
        const [events, top] = await Promise.all([
            pool.query(
                `SELECT occurred_at, query_name AS domain, query_type, action, category, policy_source, identity_user, identity_computer
                 FROM dns_policy_events
                 WHERE client_ip = $1::inet AND occurred_at > NOW() - ($2 || ' minutes')::interval
                 ORDER BY occurred_at DESC LIMIT 400`,
                [ip, String(minutes)],
            ),
            pool.query(
                `SELECT query_name AS domain, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE action = 'blocked')::int AS blocked
                 FROM dns_policy_events
                 WHERE client_ip = $1::inet AND occurred_at > NOW() - ($2 || ' minutes')::interval
                 GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
                [ip, String(minutes)],
            ),
        ]);
        return { ip, minutes, name: this.nameFor(ip), events: events.rows, top_domains: top.rows };
    }

    async getAlerts() {
        const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; detail: string; link?: string }> = [];
        const live = this.getLive();
        const fmtDate = (value: any) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        const [accessFresh, dnsFresh, bypass, totalBlocks, contingency, tickets, sporadic] = await Promise.all([
            pool.query('SELECT MAX(occurred_at) AS last FROM access_events').catch(() => ({ rows: [{}] })),
            pool.query('SELECT MAX(occurred_at) AS last FROM dns_policy_events').catch(() => ({ rows: [{}] })),
            pool.query('SELECT vlan_id, expires_at FROM emergency_vlan_bypass WHERE active = TRUE').catch(() => ({ rows: [] as any[] })),
            pool.query('SELECT vlan_id FROM total_vlan_blocks WHERE active = TRUE').catch(() => ({ rows: [] as any[] })),
            pool.query("SELECT status, scope_type, vlan_ids FROM dns_contingency_state WHERE id = 1").catch(() => ({ rows: [] as any[] })),
            pool.query("SELECT COUNT(*)::int AS total FROM support_tickets WHERE archived_at IS NULL AND status IN ('open','triage','analysis','waiting_approval','in_progress')").catch(() => ({ rows: [{ total: 0 }] })),
            pool.query('SELECT COUNT(*)::int AS total FROM sporadic_exceptions WHERE active = TRUE AND expires_at > NOW()').catch(() => ({ rows: [{ total: 0 }] })),
        ]);

        const accessLast = accessFresh.rows[0]?.last;
        if (!accessLast || Date.now() - new Date(accessLast).getTime() > 30 * 60 * 1000) {
            alerts.push({ severity: 'critical', title: 'Eventos de navegação do proxy parados', detail: accessLast ? `Último registro em ${fmtDate(accessLast)}. Indicadores de bloqueio e relatórios de navegação ficam desatualizados.` : 'Nenhum registro encontrado.', link: '/dns-proxy' });
        }
        const dnsLast = dnsFresh.rows[0]?.last;
        if (!dnsLast || Date.now() - new Date(dnsLast).getTime() > 15 * 60 * 1000) {
            alerts.push({ severity: 'critical', title: 'Radar DNS sem eventos recentes', detail: dnsLast ? `Último registro em ${fmtDate(dnsLast)}.` : 'Nenhum registro encontrado.', link: '/radar-dns' });
        }
        for (const row of bypass.rows) {
            alerts.push({ severity: 'critical', title: `Bypass emergencial ativo na VLAN ${row.vlan_id}`, detail: `A VLAN está sem filtros de acesso${row.expires_at ? ` até ${fmtDate(row.expires_at)}` : ''}.`, link: '/operacoes' });
        }
        for (const row of totalBlocks.rows) {
            alerts.push({ severity: 'critical', title: `Bloqueio total ativo na VLAN ${row.vlan_id}`, detail: 'Nenhum dispositivo da VLAN navega até a desativação.', link: '/operacoes' });
        }
        const cont = contingency.rows[0];
        if (cont && (cont.status === 'active' || cont.status === 'error')) {
            alerts.push({ severity: 'critical', title: 'Contingência DNS ativa', detail: `Escopo ${cont.scope_type === 'vlan' ? `VLAN ${(cont.vlan_ids || []).join(', ')}` : 'global'}. Os filtros de DNS estão contornados.`, link: '/dns-proxy?tab=contingency' });
        }

        const linkDown = live.wan.down / live.link_mbps;
        const linkUp = live.wan.up / live.link_mbps;
        if (this.internet.checked_at && !this.internet.external) {
            alerts.push({ severity: 'critical', title: this.internet.gateway ? 'Sem internet além do provedor' : 'Link do provedor fora do ar', detail: this.internet.gateway ? 'O gateway do provedor responde, mas a internet externa não.' : 'O gateway do provedor não responde.', link: '/rede?tab=link' });
        }
        if (linkDown > 0.85 || linkUp > 0.85) {
            alerts.push({ severity: 'warning', title: 'Link de internet perto do limite', detail: `Download ${Math.round(linkDown * 100)}% e upload ${Math.round(linkUp * 100)}% de ${live.link_mbps} Mbps.`, link: '/mapa-trafego' });
        }

        const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
        const weekday = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
        const businessHours = !['Sat', 'Sun'].includes(weekday) && hour >= 8 && hour < 18;
        for (const vlan of live.vlans) {
            if (vlan.drops_5m > 200) {
                alerts.push({ severity: 'warning', title: `VLAN ${vlan.id} (${vlan.name}) batendo no limite de banda`, detail: `${vlan.drops_5m.toLocaleString('pt-BR')} pacotes descartados pelo QoS nos últimos 5 minutos. Limite: ${vlan.limit_down ?? '—'} Mbps de download.`, link: '/rede?tab=qos' });
            }
            if (!vlan.internal_exempt && vlan.internal_down > 5 && vlan.limit_down && vlan.limit_down < 1000) {
                alerts.push({ severity: 'info', title: `Tráfego interno contando no limite da VLAN ${vlan.id}`, detail: `${round(vlan.internal_down, 1)} Mbps entre VLANs (ex.: câmeras) passam pela fila de internet de ${vlan.limit_down} Mbps.`, link: '/mapa-trafego' });
            }
            if (businessHours && vlan.neighbors === 0 && !vlan.exempt && vlan.id !== 99) {
                alerts.push({ severity: 'warning', title: `VLAN ${vlan.id} (${vlan.name}) sem nenhum dispositivo`, detail: 'Nenhum equipamento conectado em horário de expediente. Verifique switch, cabo ou ponto de acesso.', link: '/rede?tab=vlans' });
            }
        }

        for (const [name, active] of Object.entries(live.services)) {
            if (!active) alerts.push({ severity: 'critical', title: `Serviço ${name} parado`, detail: 'O serviço não está ativo no servidor.', link: '/servidor' });
        }
        if (live.disk.percent >= 85) alerts.push({ severity: 'warning', title: 'Disco quase cheio', detail: `${live.disk.percent}% usado.`, link: '/servidor' });
        if (live.ram.percent >= 92) alerts.push({ severity: 'warning', title: 'Memória quase esgotada', detail: `${live.ram.percent}% em uso.`, link: '/servidor' });

        const openTickets = Number(tickets.rows[0]?.total || 0);
        if (openTickets > 0) alerts.push({ severity: 'info', title: `${openTickets} chamado${openTickets > 1 ? 's' : ''} em aberto`, detail: 'Atendimentos aguardando ação.', link: '/chamados' });
        const sporadicActive = Number(sporadic.rows[0]?.total || 0);
        if (sporadicActive > 0) alerts.push({ severity: 'info', title: `${sporadicActive} liberação${sporadicActive > 1 ? 'ões' : ''} temporária${sporadicActive > 1 ? 's' : ''} em vigor`, detail: 'Exceções com prazo de validade.', link: '/acoes-rapidas' });

        const order = { critical: 0, warning: 1, info: 2 };
        return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
    }
}

export const monitorService = new MonitorService();
