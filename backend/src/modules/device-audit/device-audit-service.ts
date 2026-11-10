import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pool } from '../../config/db';

/*
 * Auditoria por aparelho.
 * 1. Guarda, a cada 5 minutos, qual aparelho (MAC) estava em cada IP (DHCP, tabela ARP e portais), porque o DHCP
 *    só guarda a última concessão de cada IP e o IP de um celular muda de um dia para o outro.
 * 2. Identifica o aparelho: pessoa (colaborador, VIP, visitante ou usuário do PC), marca (pelo MAC), modelo
 *    (pelo navegador usado no portal ou pelo nome do aparelho) e sistema.
 * 3. Monta o relatório de redes sociais: uma linha por aparelho, com as redes tentadas e os horários.
 */

const run = promisify(execFile);
const LEASES_FILE = '/var/lib/dhcp/dhcpd.leases';
const MAC_HISTORY_FILE = '/var/lib/dhcp/mac_ip_db.csv';
const OUI_FILE = '/usr/share/nmap/nmap-mac-prefixes';
const IDENTITY_FILE = '/opt/controlebeckercorp-v8/data/identity/latest.json';
const RESERVATIONS_FILE = '/etc/dhcp/static_hosts.conf';
const NAME_PROBES_PER_TICK = 12;

// Tipo e marca pelo tráfego do próprio aparelho (serviços que só cada fabricante consulta).
const TRAFFIC_HINTS: Array<[RegExp, string, string]> = [
    [/(^|\.)(icloud\.com|apple\.com|mzstatic\.com|apple-dns\.net|icloud-content\.com|aaplimg\.com)$/, 'Apple', 'Aparelho Apple (iPhone, iPad ou Mac)'],
    [/(samsung|samsungcloud|samsungapps|samsungosp|secb2b)/, 'Samsung', 'Celular Samsung'],
    [/(xiaomi|miui|mi\.com$|mi-img\.com)/, 'Xiaomi', 'Celular Xiaomi'],
    [/(motorola|lenovomm)/, 'Motorola', 'Celular Motorola'],
    [/(heytap|coloros|oppomobile|realme)/, 'Oppo/Realme', 'Celular Oppo/Realme'],
    [/(vivo\.com\.cn|vivoglobal|bbktel)/, 'vivo', 'Celular vivo'],
    [/(hicloud|huawei|dbankcloud)/, 'Huawei', 'Celular Huawei'],
    [/(msftconnecttest|windowsupdate|update\.microsoft|msftncsi|wns\.windows)/, 'Windows', 'Computador Windows'],
    [/(connectivitycheck\.gstatic\.com|android\.clients\.google|play\.googleapis)/, 'Android', 'Celular Android'],
];
const TRAFFIC_HINT_SQL = '(icloud\\.com|apple\\.com|mzstatic|apple-dns|aaplimg|samsung|secb2b|xiaomi|miui|mi-img|motorola|lenovomm|heytap|coloros|oppomobile|realme|vivoglobal|bbktel|hicloud|huawei|dbankcloud|msftconnecttest|windowsupdate|update\\.microsoft|msftncsi|wns\\.windows|connectivitycheck\\.gstatic|android\\.clients\\.google|play\\.googleapis)';
const GENERIC_DEVICES = new Set(['', 'Aparelho não identificado', 'Celular com MAC privado', 'Celular Android', 'Computador']);
const COLLECT_EVERY_MS = 5 * 60 * 1000;
const TZ = 'America/Sao_Paulo';

type Sighting = { ip: string; mac: string; vlan: number | null; hostname?: string | null; vendor?: string | null; source: string; first: Date; last: Date };

const normMac = (value: unknown) => {
    const hex = String(value || '').toLowerCase().replace(/[^0-9a-f]/g, '');
    return hex.length === 12 ? hex.match(/.{2}/g)!.join(':') : '';
};
const vlanOf = (ip: string) => {
    const m = ip.match(/^192\.168\.(\d+)\./);
    return m ? Number(m[1]) : null;
};
// MAC "privado" (aleatório): o segundo dígito é 2, 6, A ou E. A marca fica escondida pelo próprio celular.
const isPrivateMac = (mac: string) => /^.[26ae]/i.test(mac);
const leaseDate = (s?: string) => (s ? new Date(`${s.replace(/\//g, '-').replace(' ', 'T')}Z`) : null);

// ─── Nome das redes ─────────────────────────────────────────────────────────
const NETWORKS: Array<[RegExp, string]> = [
    [/(^|\.)(instagram\.com|cdninstagram\.com|ig\.me|instagr\.am)$|-ig\.facebook\.com$/, 'Instagram'],
    [/(^|\.)(messenger\.com|messengercdn\.com)$/, 'Messenger'],
    [/(^|\.)(facebook\.com|facebook\.net|fbcdn\.net|fb\.com|fbsbx\.com|fb\.watch)$/, 'Facebook'],
    [/(tiktok|bytedance|byteoversea|byteimg|ibyte|bytefcdn|musical\.ly|ttwstatic|ttdns2|snssdk|amemv|muscdn|(^|\.)dv\.tech$)/, 'TikTok'],
    [/(kwai|kuaishou|kwimgs)/, 'Kwai'],
    [/(^|\.)(twitter\.com|twimg\.com|x\.com|t\.co)$/, 'X (Twitter)'],
    [/(telegram|(^|\.)t\.me$|tdesktop|telegra\.ph)/, 'Telegram'],
    [/(^|\.)(threads\.net|threads\.com)$/, 'Threads'],
    [/(discord)/, 'Discord'],
    [/(pinterest|pinimg)/, 'Pinterest'],
    [/(reddit|redd\.it)/, 'Reddit'],
    [/(snapchat|(^|\.)snap\.com$|sc-cdn\.net)/, 'Snapchat'],
    [/(linkedin|licdn)/, 'LinkedIn'],
    [/(twitch|jtvnw)/, 'Twitch'],
    [/(bsky\.app|blueskyweb)/, 'Bluesky'],
    [/(tumblr)/, 'Tumblr'],
];
const networkOf = (domain: string) => NETWORKS.find(([re]) => re.test(domain))?.[1] || 'Outras redes sociais';

// ─── Marca pelo MAC ─────────────────────────────────────────────────────────
let ouiMap: Map<string, string> | null = null;
const loadOui = () => {
    if (ouiMap) return ouiMap;
    ouiMap = new Map();
    try {
        for (const line of fs.readFileSync(OUI_FILE, 'utf8').split('\n')) {
            const m = line.match(/^([0-9A-F]{6})\s+(.+)$/);
            if (m) ouiMap.set(m[1], m[2].trim());
        }
    } catch { /* sem base: marca fica em branco */ }
    return ouiMap;
};
const BRAND_ALIASES: Array<[RegExp, string]> = [
    [/samsung/i, 'Samsung'], [/apple/i, 'Apple'], [/motorola|lenovo mobile/i, 'Motorola'], [/xiaomi|redmi/i, 'Xiaomi'],
    [/huawei/i, 'Huawei'], [/oppo/i, 'Oppo'], [/vivo/i, 'vivo'], [/realme/i, 'Realme'], [/oneplus/i, 'OnePlus'], [/google/i, 'Google'],
    [/^lg/i, 'LG'], [/asus/i, 'ASUS'], [/dell/i, 'Dell'], [/hewlett|hp inc/i, 'HP'], [/lenovo/i, 'Lenovo'], [/intel/i, 'Intel'],
    [/positivo/i, 'Positivo'], [/intelbras/i, 'Intelbras'], [/tp-link/i, 'TP-Link'], [/microsoft/i, 'Microsoft'],
];
const brandOf = (mac: string) => {
    if (!mac || isPrivateMac(mac)) return '';
    const raw = loadOui().get(mac.replace(/:/g, '').slice(0, 6).toUpperCase()) || '';
    return BRAND_ALIASES.find(([re]) => re.test(raw))?.[1] || raw;
};

// ─── Modelo e sistema ───────────────────────────────────────────────────────
const MODEL_BRANDS: Array<[RegExp, string]> = [
    [/^SM-/i, 'Samsung Galaxy'], [/^moto/i, 'Motorola'], [/^(Redmi|POCO|M2\d{3}|2\d{3}[A-Z0-9]{4,})/i, 'Xiaomi'], [/^(CPH|RMX)/i, 'Oppo/Realme'],
    [/^V2\d{3}/i, 'vivo'], [/^Pixel/i, 'Google'], [/^(LM-|LG-)/i, 'LG'], [/^(Infinix|TECNO|itel)/i, 'Transsion'], [/^ASUS/i, 'ASUS'],
];
const parseUserAgent = (ua: string) => {
    if (!ua) return null;
    let m = ua.match(/iPhone OS (\d+)[_.](\d+)/);
    if (m) return { brand: 'Apple', model: 'iPhone', os: `iOS ${m[1]}.${m[2]}` };
    if (/iPad/.test(ua)) return { brand: 'Apple', model: 'iPad', os: 'iPadOS' };
    m = /Build\//.test(ua) ? ua.match(/Android (\d+(?:\.\d+)?);\s*([^;]+?)\s+Build\//) : ua.match(/Android (\d+(?:\.\d+)?);\s*([^;)]+)/);
    if (m) {
        const code = m[2].trim();
        const generic = /^(K|wv|Mobile|Linux)$/i.test(code);
        const brand = MODEL_BRANDS.find(([re]) => re.test(code))?.[1] || '';
        return { brand, model: generic ? '' : (brand && !code.toLowerCase().startsWith(brand.split(' ')[0].toLowerCase()) ? `${brand} ${code}` : code), os: `Android ${m[1]}` };
    }
    if (/Windows NT/.test(ua)) return { brand: '', model: 'Computador', os: 'Windows' };
    if (/Macintosh/.test(ua)) return { brand: 'Apple', model: 'Mac', os: 'macOS' };
    return null;
};
// "S24-FE-de-Ana-Laura" -> modelo "S24 FE", dono "Ana Laura"; "iPhone-de-Joao" -> iPhone, João.
const parseHostname = (host: string) => {
    if (!host || /^(android|localhost|unknown|\\1)/i.test(host)) return { model: '', owner: '' };
    const clean = host.replace(/[_]+/g, '-');
    const m = clean.match(/^(.*?)-(?:de|do|da)-(.+)$/i);
    const tidy = (s: string) => s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    if (m) return { model: tidy(m[1]), owner: tidy(m[2]) };
    if (/^(DESKTOP|LAPTOP|NOTEBOOK|PC)-/i.test(clean)) return { model: 'Computador', owner: '' };
    return { model: tidy(clean), owner: '' };
};
const osFromVendor = (vendor: string) => {
    let m = vendor.match(/android-dhcp-(\d+)/i);
    if (m) return `Android ${m[1]}`;
    if (/MSFT/i.test(vendor)) return 'Windows';
    m = vendor.match(/dhcpcd-[\d.]+:Linux/i);
    if (m) return 'Linux';
    return '';
};

const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const personName = (value: string) => String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    .map((t, i, all) => { const l = t.toLocaleLowerCase('pt-BR'); return i > 0 && i < all.length - 1 && PARTICLES.has(l) ? l : l.charAt(0).toLocaleUpperCase('pt-BR') + l.slice(1); })
    .join(' ');
// "iPhone da Lavínia Pimentel", "Galaxy S24 FE da Ana Laura", "Computador DESKTOP-WAGNER do Wagner".
// "da"/"do" pelo primeiro nome (termina em "a" -> "da"); sem dono identificado, só o aparelho.
const shortDevice = (device: string) => device.replace(/^Apple (iPhone|iPad|Mac)\b/, '$1').replace(/^Samsung Galaxy /, 'Galaxy ').replace(/^Motorola moto/i, 'Motorola Moto').replace(/^([SAMZ]\d{2}(?:\s?(?:FE|Ultra|Plus|\+))?)\b/i, 'Galaxy $1');
const deviceLabel = (device: string, person: string) => {
    const d = shortDevice(device || 'Aparelho');
    if (!person) return d;
    const first = person.split(' ')[0].toLocaleLowerCase('pt-BR');
    return `${d} ${first.endsWith('a') ? 'da' : 'do'} ${person}`;
};

export class DeviceAuditService {
    private ready: Promise<void> | null = null;
    private timer: NodeJS.Timeout | null = null;

    ensureReady() {
        if (!this.ready) {
            this.ready = (async () => {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS device_sightings (
                        ip inet NOT NULL,
                        mac text NOT NULL,
                        seen_day date NOT NULL,
                        vlan_id integer,
                        hostname text,
                        vendor_class text,
                        source text,
                        first_seen timestamptz NOT NULL,
                        last_seen timestamptz NOT NULL,
                        PRIMARY KEY (ip, mac, seen_day)
                    );
                    CREATE INDEX IF NOT EXISTS idx_device_sightings_day ON device_sightings (seen_day);
                    CREATE INDEX IF NOT EXISTS idx_device_sightings_mac ON device_sightings (mac);
                    CREATE TABLE IF NOT EXISTS device_labels (
                        id serial PRIMARY KEY,
                        mac text,
                        ip inet,
                        person text,
                        device text,
                        notes text,
                        created_by text,
                        created_at timestamptz NOT NULL DEFAULT NOW(),
                        updated_by text,
                        updated_at timestamptz NOT NULL DEFAULT NOW(),
                        active boolean NOT NULL DEFAULT TRUE
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_device_labels_mac ON device_labels (mac) WHERE active AND mac IS NOT NULL;
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_device_labels_ip ON device_labels (ip) WHERE active AND mac IS NULL;
                `);
                const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM device_sightings');
                if (!rows[0]?.n) await this.backfill().catch((e) => console.error('[DEVICE AUDIT] Histórico inicial falhou:', e?.message || e));
            })().catch((e) => { this.ready = null; throw e; });
        }
        return this.ready;
    }

    start() {
        if (this.timer) return;
        const tick = () => this.collect().catch((e) => console.error('[DEVICE AUDIT] Coleta falhou:', e?.message || e));
        setTimeout(tick, 20_000);
        this.timer = setInterval(tick, COLLECT_EVERY_MS);
    }

    private async save(items: Sighting[]) {
        // Junta as repetições (mesmo IP, aparelho e dia vindos do DHCP, da ARP e do portal): o banco recusa a mesma chave duas vezes no lote.
        const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
        const merged = new Map<string, Sighting>();
        for (const s of items) {
            if (!s.ip || !s.mac || !s.first || !s.last || Number.isNaN(s.first.getTime()) || Number.isNaN(s.last.getTime())) continue;
            const key = `${s.ip}|${s.mac}|${dayKey.format(s.first)}`;
            const cur = merged.get(key);
            if (!cur) { merged.set(key, { ...s }); continue; }
            if (s.first < cur.first) cur.first = s.first;
            if (s.last > cur.last) cur.last = s.last;
            cur.hostname = cur.hostname || s.hostname;
            cur.vendor = cur.vendor || s.vendor;
        }
        const rows = Array.from(merged.values());
        for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            await pool.query(
                `
                    INSERT INTO device_sightings (ip, mac, seen_day, vlan_id, hostname, vendor_class, source, first_seen, last_seen)
                    SELECT x.ip::inet, x.mac, (x.first AT TIME ZONE '${TZ}')::date, x.vlan, NULLIF(x.host, ''), NULLIF(x.vendor, ''), x.source, x.first, x.last
                    FROM UNNEST($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::timestamptz[], $8::timestamptz[])
                         AS x(ip, mac, vlan, host, vendor, source, first, last)
                    ON CONFLICT (ip, mac, seen_day) DO UPDATE SET
                        first_seen = LEAST(device_sightings.first_seen, EXCLUDED.first_seen),
                        last_seen = GREATEST(device_sightings.last_seen, EXCLUDED.last_seen),
                        hostname = COALESCE(EXCLUDED.hostname, device_sightings.hostname),
                        vendor_class = COALESCE(EXCLUDED.vendor_class, device_sightings.vendor_class),
                        vlan_id = COALESCE(EXCLUDED.vlan_id, device_sightings.vlan_id)
                `,
                [
                    chunk.map((s) => s.ip), chunk.map((s) => s.mac), chunk.map((s) => s.vlan), chunk.map((s) => s.hostname || ''),
                    chunk.map((s) => s.vendor || ''), chunk.map((s) => s.source), chunk.map((s) => s.first.toISOString()), chunk.map((s) => s.last.toISOString()),
                ],
            );
        }
        return rows.length;
    }

    private readLeases() {
        const out: Sighting[] = [];
        let text = '';
        try { text = fs.readFileSync(LEASES_FILE, 'utf8'); } catch { return out; }
        const now = new Date();
        for (const block of text.split(/\nlease /)) {
            const ip = block.match(/^(\d+\.\d+\.\d+\.\d+)/)?.[1];
            const mac = normMac(block.match(/hardware ethernet ([0-9a-f:]+);/i)?.[1]);
            const starts = leaseDate(block.match(/starts \d (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2});/)?.[1]);
            const ends = leaseDate(block.match(/ends \d (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2});/)?.[1]);
            if (!ip || !mac || !starts) continue;
            const last = ends && ends < now ? ends : now;
            if (last < starts) continue;
            out.push({
                ip, mac, vlan: vlanOf(ip), source: 'dhcp', first: starts, last,
                hostname: block.match(/client-hostname "([^"]+)"/)?.[1] || null,
                vendor: block.match(/vendor-class-identifier = "([^"]+)"/)?.[1] || null,
            });
        }
        return out;
    }

    private async readArp() {
        const out: Sighting[] = [];
        try {
            const { stdout } = await run('ip', ['-4', 'neigh', 'show'], { timeout: 10_000 });
            const now = new Date();
            for (const line of stdout.split('\n')) {
                const m = line.match(/^(192\.168\.\d+\.\d+) dev (\S+) lladdr ([0-9a-f:]{17}) (REACHABLE|STALE|DELAY|PROBE)/i);
                if (m && !m[1].endsWith('.1')) out.push({ ip: m[1], mac: normMac(m[3]), vlan: vlanOf(m[1]), source: 'arp', first: now, last: now });
            }
        } catch { /* sem ip neigh */ }
        return out;
    }

    private async readPortalSessions(sinceSql: string) {
        const out: Sighting[] = [];
        const queries = [
            `SELECT host(client_ip) AS ip, mac_address AS mac, started_at AS first, COALESCE(revoked_at, LEAST(expires_at, NOW())) AS last
               FROM collab_sessions WHERE mac_address IS NOT NULL AND client_ip IS NOT NULL AND started_at >= ${sinceSql}`,
            `SELECT host(client_ip) AS ip, mac_address AS mac, started_at AS first, COALESCE(revoked_at, last_seen_at, LEAST(expires_at, NOW())) AS last
               FROM hotspot_sessions WHERE mac_address IS NOT NULL AND client_ip IS NOT NULL AND started_at >= ${sinceSql}`,
        ];
        for (const q of queries) {
            const { rows } = await pool.query(q).catch(() => ({ rows: [] as any[] }));
            for (const r of rows) {
                const mac = normMac(r.mac);
                const first = new Date(r.first);
                const last = new Date(r.last) < first ? first : new Date(r.last);
                if (mac && r.ip) out.push({ ip: r.ip, mac, vlan: vlanOf(r.ip), source: 'portal', first, last });
            }
        }
        return out;
    }

    async collect() {
        await this.ensureReady();
        const arp = await this.readArp();
        await this.probeNames(arp).catch(() => null);
        const items = [...this.readLeases(), ...arp, ...(await this.readPortalSessions("NOW() - INTERVAL '1 day'"))];
        return this.save(items);
    }

    // Pergunta o nome aos aparelhos online que ainda não têm nome: NetBIOS (Windows) e mDNS (iPhone, Mac, alguns Android).
    private async probeNames(arp: Sighting[]) {
        if (!arp.length) return;
        const macs = arp.map((a) => a.mac);
        const { rows } = await pool.query(
            `SELECT DISTINCT mac FROM device_sightings WHERE mac = ANY($1) AND hostname IS NOT NULL AND last_seen > NOW() - INTERVAL '30 days'`,
            [macs],
        );
        const named = new Set(rows.map((r) => r.mac));
        const targets = arp.filter((a) => !named.has(a.mac)).slice(0, NAME_PROBES_PER_TICK);
        await Promise.all(targets.map(async (t) => {
            let name = '';
            try {
                const { stdout } = await run('nmblookup', ['-A', t.ip], { timeout: 3000 });
                name = stdout.split('\n').map((l) => l.match(/^\s+(\S[^<]*?)\s+<00>\s+-\s+(?!<GROUP>)/)?.[1] || '').find(Boolean) || '';
            } catch { /* sem resposta */ }
            if (!name) {
                try {
                    const { stdout } = await run('avahi-resolve-address', [t.ip], { timeout: 3000 });
                    name = (stdout.trim().split(/\s+/)[1] || '').replace(/\.local\.?$/, '');
                } catch { /* sem resposta */ }
            }
            if (name) { t.hostname = name; t.source = 'nome-na-rede'; }
        }));
    }

    // Primeira carga: o histórico que já existe (planilha de MAC por IP do DHCP e sessões dos portais).
    private async backfill() {
        const items: Sighting[] = [];
        try {
            for (const line of fs.readFileSync(MAC_HISTORY_FILE, 'utf8').split('\n')) {
                const [macRaw, ip, , host, first, last] = line.split(',');
                const mac = normMac(macRaw);
                if (!mac || !/^192\.168\./.test(ip || '') || !first) continue;
                const f = new Date(first);
                const l = new Date(last || first);
                items.push({ ip, mac, vlan: vlanOf(ip), hostname: host && host !== '\\1' ? host : null, source: 'historico-dhcp', first: f, last: l < f ? f : l });
            }
        } catch { /* sem planilha */ }
        items.push(...this.readLeases(), ...(await this.readPortalSessions("NOW() - INTERVAL '120 days'")));
        const saved = await this.save(items);
        console.log(`[DEVICE AUDIT] Histórico inicial: ${saved} registros de aparelho por IP.`);
    }

    // ─── Relatório ──────────────────────────────────────────────────────────
    async socialReport(input: { from?: string; to?: string; vlan?: string }) {
        await this.ensureReady();
        await this.collect().catch(() => 0);
        const to = input.to ? new Date(`${input.to}T23:59:59-03:00`) : new Date();
        const from = input.from ? new Date(`${input.from}T00:00:00-03:00`) : new Date(to.getTime() - 7 * 86400_000);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error('Período inválido.');
        if (to.getTime() - from.getTime() > 93 * 86400_000) throw new Error('Escolha um período de até 3 meses.');
        const vlan = input.vlan && /^\d+$/.test(input.vlan) ? Number(input.vlan) : null;

        const { rows: domainRows } = await pool.query(
            `SELECT DISTINCT e.normalized_domain AS d FROM domain_policy_entries e JOIN domain_policies p ON p.id = e.policy_id
              WHERE p.name ILIKE 'Redes Sociais' AND e.normalized_domain IS NOT NULL AND e.normalized_domain <> ''`,
        );
        const domains = domainRows.map((r) => String(r.d)).filter(Boolean);
        if (!domains.length) throw new Error('A regra "Redes Sociais" não tem domínios cadastrados.');
        const pattern = `(^|\\.)(${domains.map((d) => d.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')})$`;

        const { rows: events } = await pool.query(
            `
                SELECT host(client_ip) AS ip, vlan_id, query_name, action, policy_source,
                       date_trunc('hour', occurred_at) AS hour, COUNT(*)::int AS n,
                       MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
                FROM dns_policy_events
                WHERE occurred_at BETWEEN $1 AND $2
                  AND client_ip IS NOT NULL
                  AND host(client_ip) !~ '\\.1$'
                  AND ($3::int IS NULL OR vlan_id = $3)
                  AND query_name ~ $4
                GROUP BY 1, 2, 3, 4, 5, 6
                LIMIT 200000
            `,
            [from.toISOString(), to.toISOString(), vlan, pattern],
        );

        const ips = Array.from(new Set(events.map((e) => e.ip)));
        const { rows: sightings } = ips.length ? await pool.query(
            `SELECT host(ip) AS ip, mac, hostname, vendor_class, first_seen, last_seen FROM device_sightings
              WHERE host(ip) = ANY($1) AND last_seen >= $2::timestamptz - INTERVAL '1 day' AND first_seen <= $3::timestamptz + INTERVAL '1 day'`,
            [ips, from.toISOString(), to.toISOString()],
        ) : { rows: [] as any[] };
        const byIp = new Map<string, any[]>();
        for (const s of sightings) byIp.set(s.ip, [...(byIp.get(s.ip) || []), s]);
        const reservations = this.readReservations();
        const SLACK = 45 * 60 * 1000;
        const resolveMac = (ip: string, at: Date) => {
            const list = byIp.get(ip) || [];
            const t = at.getTime();
            const inside = list.filter((s) => new Date(s.first_seen).getTime() - SLACK <= t && t <= new Date(s.last_seen).getTime() + SLACK);
            const pick = (inside.length ? inside : list.filter((s) => new Date(s.first_seen).toDateString() === at.toDateString()))
                .sort((a, b) => Math.abs(new Date(a.last_seen).getTime() - t) - Math.abs(new Date(b.last_seen).getTime() - t))[0];
            if (pick) return normMac(pick.mac);
            // IP com reserva fixa no DHCP: só aquele aparelho recebe esse IP.
            const fixed = reservations.get(ip) || [];
            if (fixed.length === 1) return fixed[0];
            if (fixed.length > 1) return fixed.find((m) => list.some((s) => normMac(s.mac) === m)) || fixed[0];
            return '';
        };

        type Row = { key: string; mac: string; ips: Set<string>; vlans: Set<number>; networks: Map<string, number>; blocked: number; allowedVip: number; allowedOther: number; days: Set<string>; first: Date; last: Date };
        const devices = new Map<string, Row>();
        const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
        for (const e of events) {
            const mac = resolveMac(e.ip, new Date(e.hour));
            const key = mac || `ip:${e.ip}`;
            const row = devices.get(key) || { key, mac, ips: new Set(), vlans: new Set(), networks: new Map(), blocked: 0, allowedVip: 0, allowedOther: 0, days: new Set(), first: new Date(e.first_at), last: new Date(e.last_at) };
            row.ips.add(e.ip);
            if (e.vlan_id != null) row.vlans.add(Number(e.vlan_id));
            const net = networkOf(String(e.query_name || ''));
            row.networks.set(net, (row.networks.get(net) || 0) + e.n);
            if (e.action === 'blocked') row.blocked += e.n;
            else if (e.action === 'bypassed' || e.policy_source === 'vip') row.allowedVip += e.n;
            else row.allowedOther += e.n;
            row.days.add(dayFmt.format(new Date(e.hour)));
            if (new Date(e.first_at) < row.first) row.first = new Date(e.first_at);
            if (new Date(e.last_at) > row.last) row.last = new Date(e.last_at);
            devices.set(key, row);
        }

        const hintRows = ips.length ? (await pool.query(
            `SELECT host(client_ip) AS ip, query_name AS d, COUNT(*)::int AS n FROM dns_policy_events
              WHERE occurred_at BETWEEN $1 AND $2 AND host(client_ip) = ANY($3) AND query_name ~ '${TRAFFIC_HINT_SQL}'
              GROUP BY 1, 2`,
            [from.toISOString(), to.toISOString(), ips],
        ).catch(() => ({ rows: [] as any[] }))).rows : [];
        const hintByIp = new Map<string, Map<string, number>>();
        for (const h of hintRows) {
            const hit = TRAFFIC_HINTS.find(([re]) => re.test(String(h.d)));
            if (!hit) continue;
            const m = hintByIp.get(h.ip) || new Map<string, number>();
            m.set(hit[2], (m.get(hit[2]) || 0) + h.n);
            hintByIp.set(h.ip, m);
        }
        // Marca do fabricante vence "Android"/"Windows" genéricos; entre marcas, a mais consultada.
        const trafficHint = (ipList: string[]) => {
            const total = new Map<string, number>();
            for (const ip of ipList) for (const [k, v] of hintByIp.get(ip) || []) total.set(k, (total.get(k) || 0) + v);
            const ranked = Array.from(total.entries()).sort((a, b) => b[1] - a[1]);
            return (ranked.find(([k]) => k !== 'Celular Android' && k !== 'Computador Windows') || ranked[0])?.[0] || '';
        };
        const labels = await this.listLabels();

        const identity = await this.identityFor(Array.from(devices.values()).map((d) => d.mac).filter(Boolean), ips, sightings);
        const result = Array.from(devices.values()).map((d) => {
            const id = (d.mac && identity.byMac.get(d.mac)) || Array.from(d.ips).map((ip) => identity.byIp.get(ip)).find(Boolean) || {};
            const host = (d.mac && identity.hostByMac.get(d.mac)) || '';
            const vendor = (d.mac && identity.vendorByMac.get(d.mac)) || '';
            const ua = parseUserAgent((d.mac && identity.uaByMac.get(d.mac)) || '');
            const hostInfo = parseHostname(host);
            const brand = ua?.brand || brandOf(d.mac);
            const agentDevice = (id as any).device || '';
            const manual = (d.mac && labels.byMac.get(d.mac)) || Array.from(d.ips).map((ip) => labels.byIp.get(ip)).find(Boolean) || null;
            const hint = trafficHint(Array.from(d.ips));
            const model = ua?.model || hostInfo.model || (osFromVendor(vendor).startsWith('Android') ? 'Celular Android' : osFromVendor(vendor) === 'Windows' ? 'Computador' : '');
            const device = [brand && !model.toLowerCase().startsWith(brand.toLowerCase().split(' ')[0]) ? brand : '', model].filter(Boolean).join(' ').trim();
            const networks = Array.from(d.networks.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
            return {
                person: personName(manual?.person || (id as any).person || hostInfo.owner || ''),
                person_from_hostname: !manual?.person && !(id as any).person && Boolean(hostInfo.owner),
                person_detail: (id as any).detail || '',
                person_source: (id as any).source || (hostInfo.owner ? 'nome do aparelho' : ''),
                vip: Boolean((id as any).vip) || d.allowedVip > 0,
                device: manual?.device || agentDevice || (GENERIC_DEVICES.has(device) && hint ? hint : device) || hint || (d.mac && isPrivateMac(d.mac) ? 'Celular com MAC privado' : 'Aparelho não identificado'),
                device_from_traffic: !manual?.device && !agentDevice && Boolean(hint) && GENERIC_DEVICES.has(device),
                manual_label: manual ? { id: manual.id, by: manual.updated_by || manual.created_by, at: manual.updated_at } : null,
                os: ua?.os || (id as any).os || osFromVendor(vendor),
                hostname: host,
                mac: d.mac,
                mac_private: Boolean(d.mac && isPrivateMac(d.mac)),
                ips: Array.from(d.ips),
                vlans: Array.from(d.vlans).sort((a, b) => a - b),
                networks,
                blocked: d.blocked,
                allowed_vip: d.allowedVip,
                allowed_other: d.allowedOther,
                active_days: d.days.size,
                days: Array.from(d.days),
                first_at: d.first.toISOString(),
                last_at: d.last.toISOString(),
            };
        }).map((r) => ({ ...r, label: deviceLabel(r.device, r.person) }))
            .sort((a, b) => (b.blocked + b.allowed_other) - (a.blocked + a.allowed_other) || b.allowed_vip - a.allowed_vip);

        const totals = new Map<string, number>();
        for (const d of result) for (const n of d.networks) totals.set(n.name, (totals.get(n.name) || 0) + n.count);
        return {
            period: { from: from.toISOString(), to: to.toISOString() },
            vlan,
            summary: {
                devices: result.filter((d) => !d.vip).length,
                vip_devices: result.filter((d) => d.vip).length,
                blocked: result.reduce((s, d) => s + d.blocked, 0),
                allowed_vip: result.reduce((s, d) => s + d.allowed_vip, 0),
                allowed_other: result.reduce((s, d) => s + d.allowed_other, 0),
                identified: result.filter((d) => d.person).length,
                networks: Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
            },
            devices: result,
        };
    }

    private readReservations() {
        const map = new Map<string, string[]>();
        try {
            for (const m of fs.readFileSync(RESERVATIONS_FILE, 'utf8').matchAll(/hardware ethernet ([0-9a-f:]{17});\s*fixed-address (\d+\.\d+\.\d+\.\d+);/gi)) {
                const mac = normMac(m[1]);
                if (!mac) continue;
                map.set(m[2], Array.from(new Set([...(map.get(m[2]) || []), mac])));
            }
        } catch { /* sem reservas */ }
        return map;
    }

    async listLabels() {
        await this.ensureReady();
        const { rows } = await pool.query(`SELECT id, mac, host(ip) AS ip, person, device, notes, created_by, updated_by, updated_at FROM device_labels WHERE active ORDER BY updated_at DESC`);
        const byMac = new Map<string, any>();
        const byIp = new Map<string, any>();
        for (const r of rows) {
            if (r.mac) byMac.set(normMac(r.mac), r);
            else if (r.ip) byIp.set(r.ip, r);
        }
        return { rows, byMac, byIp };
    }

    // Nome dado pelo administrador: "este aparelho é o celular do João". Fica na auditoria.
    async setLabel(input: { mac?: string; ip?: string; person?: string; device?: string; notes?: string }, actor: string, actorIp = '') {
        await this.ensureReady();
        const mac = normMac(input.mac);
        const ip = !mac && /^\d+\.\d+\.\d+\.\d+$/.test(String(input.ip || '')) ? String(input.ip) : null;
        if (!mac && !ip) throw new Error('Informe o MAC ou o IP do aparelho.');
        const person = String(input.person || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const device = String(input.device || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        if (person.length < 3 && device.length < 3) throw new Error('Informe o nome do responsável ou o tipo de aparelho.');
        const notes = String(input.notes || '').trim().slice(0, 300);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: old } = await client.query(
                mac ? `SELECT * FROM device_labels WHERE active AND mac = $1` : `SELECT * FROM device_labels WHERE active AND mac IS NULL AND ip = $1::inet`,
                [mac || ip],
            );
            await client.query(
                mac ? `UPDATE device_labels SET active = FALSE, updated_by = $2, updated_at = NOW() WHERE active AND mac = $1`
                    : `UPDATE device_labels SET active = FALSE, updated_by = $2, updated_at = NOW() WHERE active AND mac IS NULL AND ip = $1::inet`,
                [mac || ip, actor],
            );
            const { rows } = await client.query(
                `INSERT INTO device_labels (mac, ip, person, device, notes, created_by, updated_by) VALUES ($1, $2::inet, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, $6) RETURNING *`,
                [mac || null, ip, person, device, notes, actor],
            );
            await client.query(
                `INSERT INTO action_audit_logs (action, requested_by, payload, result, success, ip, message, created_at)
                 VALUES ('device-label:set', $1, $2::jsonb, $3::jsonb, TRUE, $4, $5, NOW())`,
                [actor, JSON.stringify({ mac, ip, person, device, notes }), JSON.stringify({ id: rows[0].id, previous: old[0] || null }), actorIp || null,
                    `Aparelho ${mac || ip} identificado como "${[device, person].filter(Boolean).join(' de ')}"`],
            ).catch(() => null);
            await client.query('COMMIT');
            return rows[0];
        } catch (e) {
            await client.query('ROLLBACK').catch(() => null);
            throw e;
        } finally {
            client.release();
        }
    }

    async removeLabel(id: number, actor: string, actorIp = '') {
        await this.ensureReady();
        const { rows } = await pool.query(`UPDATE device_labels SET active = FALSE, updated_by = $2, updated_at = NOW() WHERE id = $1 AND active RETURNING *`, [id, actor]);
        if (!rows.length) throw new Error('Identificação não encontrada.');
        await pool.query(
            `INSERT INTO action_audit_logs (action, requested_by, payload, result, success, ip, message, created_at)
             VALUES ('device-label:remove', $1, $2::jsonb, '{}'::jsonb, TRUE, $3, $4, NOW())`,
            [actor, JSON.stringify(rows[0]), actorIp || null, `Identificação manual do aparelho ${rows[0].mac || rows[0].ip} removida`],
        ).catch(() => null);
        return rows[0];
    }

    private async identityFor(macs: string[], ips: string[], sightings: any[]) {
        type Ident = { person: string; detail?: string; source: string; vip?: boolean; device?: string; os?: string };
        const byMac = new Map<string, Ident>();
        const byIp = new Map<string, Ident>();
        const uaByMac = new Map<string, string>();
        const hostByMac = new Map<string, string>();
        const vendorByMac = new Map<string, string>();
        const setMac = (mac: string, v: any) => { const m = normMac(mac); if (m && !byMac.has(m)) byMac.set(m, v); };

        const sortedSightings = [...sightings].sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());
        for (const s of sortedSightings) {
            const m = normMac(s.mac);
            if (s.hostname && !hostByMac.has(m)) hostByMac.set(m, s.hostname);
            if (s.vendor_class && !vendorByMac.has(m)) vendorByMac.set(m, s.vendor_class);
        }
        if (macs.length) {
            const { rows } = await pool.query(
                `SELECT LOWER(mac) AS mac, hostname, vendor_class FROM device_sightings WHERE LOWER(mac) = ANY($1) AND (hostname IS NOT NULL OR vendor_class IS NOT NULL) ORDER BY last_seen DESC`,
                [macs],
            ).catch(() => ({ rows: [] as any[] }));
            for (const r of rows) {
                const m = normMac(r.mac);
                if (r.hostname && !hostByMac.has(m)) hostByMac.set(m, r.hostname);
                if (r.vendor_class && !vendorByMac.has(m)) vendorByMac.set(m, r.vendor_class);
            }
        }

        // VIPs primeiro: é a informação que o Secretário mais precisa ver.
        const { rows: vips } = await pool.query(
            `SELECT host(ip) AS ip, mac_address, COALESCE(NULLIF(responsible, ''), NULLIF(description, ''), NULLIF(hostname, '')) AS person, description
               FROM policy_exceptions WHERE active IS TRUE`,
        ).catch(() => ({ rows: [] as any[] }));
        for (const v of vips) {
            const item = { person: v.person || 'VIP', detail: v.description && v.description !== v.person ? v.description : 'VIP', source: 'VIP', vip: true };
            if (v.mac_address) setMac(v.mac_address, item);
            if (v.ip && !byIp.has(v.ip)) byIp.set(v.ip, item);
        }
        const { rows: collab } = await pool.query(
            `SELECT s.mac_address AS mac, u.full_name, u.department, s.user_agent
               FROM collab_sessions s JOIN collab_users u ON u.id = s.user_id
              WHERE s.mac_address IS NOT NULL ORDER BY s.started_at DESC LIMIT 5000`,
        ).catch(() => ({ rows: [] as any[] }));
        for (const c of collab) {
            setMac(c.mac, { person: c.full_name, detail: c.department || 'Colaborador', source: 'portal de colaboradores' });
            const m = normMac(c.mac);
            if (c.user_agent && !uaByMac.has(m)) uaByMac.set(m, c.user_agent);
        }
        const { rows: collabDevices } = await pool.query(
            `SELECT d.mac_address AS mac, u.full_name, u.department FROM collab_devices d JOIN collab_users u ON u.id = d.user_id WHERE d.mac_address IS NOT NULL`,
        ).catch(() => ({ rows: [] as any[] }));
        for (const c of collabDevices) setMac(c.mac, { person: c.full_name, detail: c.department || 'Colaborador', source: 'portal de colaboradores' });
        const { rows: visitors } = await pool.query(
            `SELECT s.mac_address AS mac, v.full_name, s.user_agent FROM hotspot_sessions s JOIN hotspot_visitors v ON v.id = s.visitor_id
              WHERE s.mac_address IS NOT NULL ORDER BY s.started_at DESC LIMIT 5000`,
        ).catch(() => ({ rows: [] as any[] }));
        for (const v of visitors) {
            setMac(v.mac, { person: v.full_name, detail: 'Visitante', source: 'hotspot de visitantes' });
            const m = normMac(v.mac);
            if (v.user_agent && !uaByMac.has(m)) uaByMac.set(m, v.user_agent);
        }
        try {
            const agents = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
            for (const a of Object.values<any>(agents || {})) {
                if (!a || a.agent_id === 'TESTE') continue;
                const user = String(a.display_user || '').trim();
                const meaningful = user && !/\uFFFD|^usu.?rio$|^user$|^admin/i.test(user);
                const item = { person: meaningful ? user : '', detail: 'Usuário do computador', source: 'agente do computador', device: `Computador ${a.computer}`, os: 'Windows' };
                if (a.mac) setMac(a.mac, item);
                if (a.ip && ips.includes(a.ip) && !byIp.has(a.ip)) byIp.set(a.ip, item);
            }
        } catch { /* sem agente */ }
        return { byMac, byIp, uaByMac, hostByMac, vendorByMac };
    }
}

export const deviceAuditService = new DeviceAuditService();
