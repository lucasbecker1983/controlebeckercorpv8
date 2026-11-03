import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { pool } from '../../config/db';
import { env } from '../../config/env';

// Coletores da base de conhecimento. Todos SOMENTE LEITURA: lêem arquivos, rodam comandos de consulta
// (systemctl show, ss, pm2 jlist, docker ps, ufw status...) e consultam o catálogo do PostgreSQL. Nada é alterado.
// Cada coletor é isolado: se um falhar, os demais seguem e a base mantém o que já tinha daquele tipo.

export type KnowItem = { key: string; kind: string; title: string; source: string; body: string };

// Projetos cuja documentação e detalhes NÃO entram na base (decisão conservadora; a lista aparece na tela do GOD).
// Os fatos operacionais (serviço, porta, memória) deles continuam, porque explicam o consumo do servidor.
export const EXCLUDED_PROJECTS: RegExp[] = [
    /infinitytea/i, /^tea$/i, /sintea/i, /clinicamedica/i, /divorcio/i, /fenix/i, /astrolabia/i, /iaoffice/i, /jmb-hub-ia/i,
    /nextcloud/i, /financ/i, /BeckerFinances/i, /mail/i,
];
const BACKUP_LIKE = /(\.bak|backup|-bak|_bak|\.old|_old|archived|\.legacy|\.tar|_LIXEIRA|[-_.]20\d{6}|\.log$|^node_modules$|^\.|releases)/i;
const THIRD_PARTY = /^(flutter|node|android-sdk|containerd|netdata|lovable|livekit-audit|acme|acme-challenge|certbot|letsencrypt|html|jmb-models|codex)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', 'coverage', '.next', 'uploads', 'storage', 'logs', 'backups', 'tmp', 'vendor', 'site-packages', 'playwright-report', 'test-results', 'data', 'public', 'static', 'assets', '.tools']);
const isExcluded = (name: string) => EXCLUDED_PROJECTS.some((re) => re.test(name));

const sh = (cmd: string, args: string[], timeout = 12000): Promise<string> => new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 24 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8', SYSTEMD_COLORS: '0', SYSTEMD_PAGER: '', PAGER: 'cat' } }, (error, stdout) => {
        resolve(error && !stdout ? '' : String(stdout || ''));
    });
});

const readText = async (file: string, max = 600 * 1024) => {
    try {
        const stat = await fs.promises.stat(file);
        if (!stat.isFile() || stat.size > max) return '';
        return await fs.promises.readFile(file, 'utf-8');
    } catch {
        return '';
    }
};
const exists = async (file: string) => fs.promises.access(file).then(() => true, () => false);
const listDir = async (dir: string) => fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
const gb = (bytes: number) => `${(bytes / 1073741824).toFixed(1)} GB`;
const size = (bytes: number) => (bytes >= 1073741824 ? gb(bytes) : bytes >= 1048576 ? mb(bytes) : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const stamp = (d: Date | string | number) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });

// ------------------------------------------------------------ fatos ao vivo (usados também para ligar projeto ↔ serviço ↔ porta ↔ domínio)

type ServiceInfo = { name: string; desc: string; active: string; sub: string; pid: number; mem: number; user: string; cwd: string; exec: string; fragment: string; enabled: string; since: string; restarts: string; result: string };
type PortInfo = { proto: string; addr: string; port: number; proc: string; pid: number; unit: string; cwd: string };
type Pm2Info = { name: string; pid: number; status: string; cwd: string; script: string; restarts: number; mem: number; since: number };
type NginxSite = { file: string; domains: string[]; listens: string[]; proxies: Array<{ where: string; target: string; port: number | null }>; roots: string[]; text: string };
type DockerInfo = { name: string; image: string; status: string; ports: string };

type Facts = { services: ServiceInfo[]; ports: PortInfo[]; pm2: Pm2Info[]; nginx: NginxSite[]; docker: DockerInfo[]; domainsByPort: Map<number, Set<string>> };

const SERVICE_NOISE = /^(systemd-|getty@|serial-getty@|user@|user-runtime-dir@|modprobe@|blk-availability|console-setup|keyboard-setup|ubuntu-|cloud-|lvm2|multipathd|snapd|apparmor|apport|plymouth|dbus|polkit|rsyslog|accounts-daemon|udisks2|thermald|irqbalance|unattended|finalrd|setvtrgb|open-vm|vgauth|gpu-manager|power-profiles|upower|rtkit|colord|cups|avahi|bluetooth|ModemManager|wpa_supplicant|networkd-dispatcher|packagekit|fwupd|e2scrub|lxd|pollinate|secureboot|sysstat|motd|grub|ufw\.service|rc-local|rpc-|nfs-|run-|netplan)/;

const gatherServices = async (): Promise<ServiceInfo[]> => {
    const listed = (await sh('systemctl', ['list-units', '--type=service', '--all', '--no-legend', '--plain', '--no-pager']))
        .split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => c[0]?.endsWith('.service') && ['active', 'failed', 'activating', 'reloading'].includes(c[2]));
    const names = new Set<string>(listed.map((c) => c[0]).filter((n) => !SERVICE_NOISE.test(n) && !n.includes('@')));
    for (const entry of await listDir('/etc/systemd/system')) {
        if (entry.name.endsWith('.service') && !entry.name.includes('@') && !/\.bak|\.aposentado|-bak|~$/.test(entry.name)) names.add(entry.name);
    }
    const all = Array.from(names);
    const out: ServiceInfo[] = [];
    for (let i = 0; i < all.length; i += 50) {
        const raw = await sh('systemctl', ['show', '--no-pager', '-p', 'Id,Description,ActiveState,SubState,MainPID,MemoryCurrent,ExecStart,User,WorkingDirectory,FragmentPath,UnitFileState,ActiveEnterTimestamp,NRestarts,Result', ...all.slice(i, i + 50)]);
        for (const block of raw.split('\n\n')) {
            const v: Record<string, string> = {};
            block.split('\n').forEach((line) => { const k = line.indexOf('='); if (k > 0) v[line.slice(0, k)] = line.slice(k + 1); });
            if (!v.Id) continue;
            const argv = (v.ExecStart || '').match(/argv\[\]=(.*?) ; ignore_errors/)?.[1] || '';
            const mem = Number(v.MemoryCurrent);
            out.push({
                name: v.Id, desc: v.Description || '', active: v.ActiveState || '', sub: v.SubState || '', pid: Number(v.MainPID) || 0,
                mem: Number.isFinite(mem) && mem > 0 && mem < 1e14 ? mem : 0, user: v.User || 'root', cwd: v.WorkingDirectory || '', exec: argv,
                fragment: v.FragmentPath || '', enabled: v.UnitFileState || '', since: v.ActiveEnterTimestamp || '', restarts: v.NRestarts || '0', result: v.Result || '',
            });
        }
    }
    return out;
};

const unitOfPid = async (pid: number) => {
    const cg = await readText(`/proc/${pid}/cgroup`, 4096);
    const m = cg.match(/([^/\n]+\.service)\s*$/m) || cg.match(/([^/\n]+\.service)/);
    return m ? m[1] : '';
};
const cwdOfPid = (pid: number) => fs.promises.readlink(`/proc/${pid}/cwd`).catch(() => '');

const gatherPorts = async (): Promise<PortInfo[]> => {
    const raw = await sh('ss', ['-H', '-ltnup']);
    const out: PortInfo[] = [];
    const seen = new Set<string>();
    for (const line of raw.split('\n')) {
        const c = line.trim().split(/\s+/);
        if (c.length < 6) continue;
        const proto = c[0];
        const local = c[4];
        const idx = local.lastIndexOf(':');
        const port = Number(local.slice(idx + 1));
        if (!port) continue;
        const addr = local.slice(0, idx).replace(/^\[|\]$/g, '');
        const users = Array.from(line.matchAll(/\("([^"]+)",pid=(\d+)/g));
        const [proc, pid] = users.length ? [users[0][1], Number(users[0][2])] : ['', 0];
        const key = `${proto}:${addr}:${port}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ proto, addr, port, proc, pid, unit: pid ? await unitOfPid(pid) : '', cwd: pid ? await cwdOfPid(pid) : '' });
    }
    return out;
};

const gatherPm2 = async (): Promise<Pm2Info[]> => {
    let raw = await sh('/usr/local/bin/pm2', ['jlist']);
    if (!raw) raw = await sh('pm2', ['jlist']);
    const start = raw.indexOf('[');
    if (start < 0) return [];
    const list = JSON.parse(raw.slice(start));
    return list.map((p: any) => ({
        name: String(p.name), pid: Number(p.pid) || 0, status: String(p.pm2_env?.status || ''), cwd: String(p.pm2_env?.pm_cwd || ''),
        script: String(p.pm2_env?.pm_exec_path || ''), restarts: Number(p.pm2_env?.restart_time) || 0, mem: Number(p.monit?.memory) || 0, since: Number(p.pm2_env?.pm_uptime) || 0,
    }));
};

const stripConf = (text: string) => text.split('\n').map((l) => l.replace(/\s+#.*$/, '').replace(/\s+$/, '')).filter((l) => l.trim() && !l.trim().startsWith('#')).join('\n');

const gatherNginx = async (): Promise<NginxSite[]> => {
    const files: string[] = [];
    for (const dir of ['/etc/nginx/sites-enabled', '/etc/nginx/conf.d']) {
        for (const e of await listDir(dir)) if (!e.isDirectory() && !/\.(bak|disabled|dpkg-.*|save)$|~$/.test(e.name) && !e.name.includes('.bak')) files.push(path.join(dir, e.name));
    }
    const sites: NginxSite[] = [];
    for (const file of files) {
        const text = stripConf(await readText(file, 200 * 1024));
        if (!text) continue;
        const upstreams: Record<string, string> = {};
        for (const m of text.matchAll(/upstream\s+(\S+)\s*\{([^}]*)\}/g)) {
            const s = m[2].match(/server\s+([^;\s]+)/);
            if (s) upstreams[m[1]] = s[1];
        }
        const domains = Array.from(new Set(Array.from(text.matchAll(/server_name\s+([^;]+);/g)).flatMap((m) => m[1].trim().split(/\s+/)).filter((d) => d && d !== '_')));
        const listens = Array.from(new Set(Array.from(text.matchAll(/listen\s+([^;]+);/g)).map((m) => m[1].trim())));
        const roots = Array.from(new Set(Array.from(text.matchAll(/\broot\s+([^;]+);/g)).map((m) => m[1].trim())));
        const proxies: NginxSite['proxies'] = [];
        let where = '/';
        for (const line of text.split('\n')) {
            const loc = line.match(/^\s*location\s+(?:[=~*^]+\s+)?(\S+)\s*\{?/);
            if (loc) where = loc[1];
            const pp = line.match(/^\s*proxy_pass\s+([^;]+);/);
            if (pp) {
                let target = pp[1].trim();
                const host = target.replace(/^https?:\/\//, '').split('/')[0];
                if (upstreams[host]) target = target.replace(host, upstreams[host]);
                const port = Number(target.replace(/^https?:\/\//, '').split('/')[0].split(':')[1]) || null;
                proxies.push({ where, target, port });
            }
        }
        sites.push({ file, domains, listens, proxies, roots, text });
    }
    return sites;
};

const gatherDocker = async (): Promise<DockerInfo[]> => {
    const raw = await sh('docker', ['ps', '-a', '--format', '{{json .}}']);
    return raw.split('\n').filter(Boolean).map((l) => { try { const j = JSON.parse(l); return { name: j.Names, image: j.Image, status: j.Status, ports: j.Ports || '' }; } catch { return null; } }).filter(Boolean) as DockerInfo[];
};

// ------------------------------------------------------------ coletores de itens

const unitText = async (file: string, max = 1400) => {
    if (!file) return '';
    const t = stripConf(await readText(file, 64 * 1024)).split('\n').filter((l) => !/^\s*(Description|Documentation|After|Wants)=/.test(l)).join('\n');
    return t.length > max ? `${t.slice(0, max)}…` : t;
};

const portsOfService = (svc: ServiceInfo, f: Facts) => f.ports.filter((p) => (p.pid && p.pid === svc.pid) || (p.unit && p.unit === svc.name));
const portLabel = (p: PortInfo) => `${p.port}/${p.proto}${/^(127\.|::1)/.test(p.addr) ? ' (só local)' : ''}`;
const domainsOfPorts = (ports: PortInfo[], f: Facts) => Array.from(new Set(ports.flatMap((p) => Array.from(f.domainsByPort.get(p.port) || []))));

// ficha-resumo: uma lista compacta de tudo do tipo, para perguntas do tipo "quais ... existem?"
const summaryItems = (kind: string, title: string, intro: string, lines: string[]): KnowItem[] =>
    chunkLines(lines, 1400).map((body, i, all) => ({
        key: `${kind}:resumo:${i + 1}`, kind, title: `${title}${all.length > 1 ? ` (parte ${i + 1}/${all.length})` : ''}`, source: `${kind}:resumo`,
        body: `${intro}${all.length > 1 ? ` Parte ${i + 1} de ${all.length}.` : ''}\n${body}`,
    }));

const collectServices = async (f: Facts): Promise<KnowItem[]> => {
    const out: KnowItem[] = [];
    for (const s of f.services) {
        const ports = portsOfService(s, f);
        const domains = domainsOfPorts(ports, f);
        const unit = await unitText(s.fragment);
        const estado = s.active === 'active' ? `ativo (${s.sub})` : s.active === 'failed' ? `COM FALHA (${s.result || s.sub})` : `${s.active} (${s.sub})`;
        out.push({
            key: `servico:${s.name}`, kind: 'servico', title: `Serviço ${s.name}`, source: `systemd:${s.name}`,
            body: [
                `Serviço systemd ${s.name}${s.desc ? ` — ${s.desc}` : ''}.`,
                `Estado na indexação: ${estado}${s.since && s.active === 'active' ? `, ativo desde ${s.since}` : ''}. Reinícios automáticos: ${s.restarts}. Inicia no boot: ${s.enabled || 'n/d'}.`,
                s.pid ? `Processo principal PID ${s.pid}, usuário ${s.user}${s.mem ? `, memória ${mb(s.mem)}` : ''}.` : `Usuário ${s.user}.`,
                s.cwd && s.cwd !== '[not set]' ? `Pasta de trabalho (diretório): ${s.cwd}.` : '',
                s.exec ? `Comando: ${s.exec}` : '',
                ports.length ? `Portas que escuta: ${ports.map(portLabel).join(', ')}.` : '',
                domains.length ? `Domínios (nginx): ${domains.join(', ')}.` : '',
                s.fragment ? `Arquivo da unidade: ${s.fragment}` : '',
                unit ? `Configuração da unidade:\n${unit}` : '',
            ].filter(Boolean).join('\n'),
        });
    }
    const line = (s: ServiceInfo) => `${s.name}: ${s.active === 'active' ? 'ativo' : s.active}${s.mem ? `, ${mb(s.mem)}` : ''}${s.desc ? ` — ${s.desc.slice(0, 70)}` : ''}`;
    out.push(...summaryItems('servico', 'Resumo dos serviços systemd ativos', 'Lista resumida dos serviços systemd (servicos do servidor) ativos na indexação, com memória; quais serviços estão rodando:', f.services.filter((s) => s.active === 'active').map(line)));
    const bad = f.services.filter((s) => s.active === 'failed');
    out.push(...summaryItems('servico', 'Serviços systemd com falha', 'Serviços systemd com FALHA (failed) na indexação:', bad.length ? bad.map(line) : ['Nenhum serviço com falha na indexação.']));
    return out;
};

const collectTimers = async (): Promise<KnowItem[]> => {
    const names = (await sh('systemctl', ['list-units', '--type=timer', '--all', '--no-legend', '--plain', '--no-pager']))
        .split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((n) => n?.endsWith('.timer') && !/^(systemd-|apt-|dpkg|e2scrub|fstrim|logrotate|man-db|motd|update-notifier|ua-timer|snapd|sysstat|fwupd|apport|ubuntu-|certbot|phpsessionclean|mdcheck|lvm2|cloud-)/.test(n));
    const out: KnowItem[] = [];
    const lines: string[] = [];
    for (let i = 0; i < names.length; i += 40) {
        const raw = await sh('systemctl', ['show', '--no-pager', '-p', 'Id,Description,ActiveState,Unit,TimersCalendar,TimersMonotonic,Persistent,FragmentPath,LastTriggerUSec', ...names.slice(i, i + 40)]);
        for (const block of raw.split('\n\n')) {
            const v: Record<string, string> = {};
            block.split('\n').forEach((line) => { const k = line.indexOf('='); if (k > 0) v[line.slice(0, k)] = line.slice(k + 1); });
            if (!v.Id) continue;
            const regras = [...(v.TimersCalendar || '').matchAll(/OnCalendar=([^;}]+?)\s*(?:;|\})/g)].map((m) => `OnCalendar=${m[1]}`)
                .concat([...(v.TimersMonotonic || '').matchAll(/(On\w+USec)=([^;}]+?)\s*(?:;|\})/g)].map((m) => `${m[1].replace('USec', '')}=${m[2]}`));
            const unit = await unitText(v.FragmentPath, 600);
            lines.push(`${v.Id}: ${regras.join(', ') || 'sem regra'}${v.Description ? ` — ${v.Description.slice(0, 70)}` : ''}`);
            out.push({
                key: `timer:${v.Id}`, kind: 'timer', title: `Timer ${v.Id}`, source: `systemd:${v.Id}`,
                body: [
                    `Timer systemd (agendamento) ${v.Id}${v.Description ? ` — ${v.Description}` : ''}.`,
                    `Estado: ${v.ActiveState}. Dispara o serviço ${v.Unit || v.Id.replace(/\.timer$/, '.service')}.`,
                    regras.length ? `Quando roda: ${regras.join('; ')}.` : '',
                    `Recupera execuções perdidas (Persistent): ${v.Persistent || 'no'}.`,
                    unit ? `Configuração:\n${unit}` : '',
                ].filter(Boolean).join('\n'),
            });
        }
    }
    out.push(...summaryItems('timer', 'Resumo dos timers systemd', 'Lista completa dos timers systemd (agendamentos) do servidor, quais timers existem do SGCG e de outros projetos, e quando rodam:', lines));
    return out;
};

const collectPorts = async (f: Facts): Promise<KnowItem[]> => {
    const byPort = new Map<number, PortInfo[]>();
    f.ports.forEach((p) => byPort.set(p.port, [...(byPort.get(p.port) || []), p]));
    const out: KnowItem[] = [];
    for (const [port, list] of byPort) {
        const pm2 = list.map((p) => f.pm2.find((a) => a.pid && a.pid === p.pid)).find(Boolean);
        const docker = list.some((p) => /docker-proxy/.test(p.proc));
        const domains = Array.from(f.domainsByPort.get(port) || []);
        const lines = list.map((p) => `${p.proto.toUpperCase()} em ${p.addr}${/^(127\.|::1)/.test(p.addr) ? ' (somente local, não exposta)' : /^(0\.0\.0\.0|::|\*)$/.test(p.addr) ? ' (todas as interfaces; o firewall decide quem acessa)' : ''}: processo ${p.proc || 'desconhecido'}${p.pid ? ` (PID ${p.pid})` : ''}${p.unit ? `, serviço ${p.unit}` : ''}${p.cwd && p.cwd !== '/' ? `, pasta ${p.cwd}` : ''}`);
        out.push({
            key: `porta:${port}`, kind: 'porta', title: `Porta ${port}`, source: `ss:${port}`,
            body: [
                `Porta ${port} em uso. Quem escuta (qual serviço/projeto usa a porta ${port}):`,
                ...lines,
                pm2 ? `Gerenciado pelo pm2 como "${pm2.name}" (pasta ${pm2.cwd}).` : '',
                docker ? 'Publicada por contêiner Docker.' : '',
                domains.length ? `Atendida pelo nginx nos domínios: ${domains.join(', ')}.` : '',
            ].filter(Boolean).join('\n'),
        });
    }
    const lines = Array.from(byPort.entries()).sort((a, b) => a[0] - b[0]).map(([port, list]) => {
        const p = list[0];
        const pm2 = f.pm2.find((a) => a.pid && a.pid === p.pid);
        const dom = Array.from(f.domainsByPort.get(port) || []).slice(0, 2).join(', ');
        return `${port}/${Array.from(new Set(list.map((x) => x.proto))).join('+')} ${/^(127\.|::1)/.test(p.addr) ? 'local' : 'exposta'}: ${pm2 ? `pm2 ${pm2.name}` : p.unit || p.proc || '?'}${dom ? ` → ${dom}` : ''}`;
    });
    out.push(...summaryItems('porta', 'Resumo das portas em uso', 'Lista das portas TCP/UDP em uso no servidor (porta, se é local ou exposta, quem usa e domínio), qual porta é de qual serviço ou projeto:', lines));
    return out;
};

const collectPm2 = async (f: Facts): Promise<KnowItem[]> => [...summaryItems('pm2', 'Resumo dos processos pm2', 'Lista dos processos gerenciados pelo pm2 (quais processos rodam no pm2), com estado, memória e porta:', f.pm2.map((a) => `${a.name}: ${a.status}, ${mb(a.mem)}, ${a.restarts} reinício(s)${f.ports.filter((p) => p.pid === a.pid).length ? `, porta ${f.ports.filter((p) => p.pid === a.pid).map((p) => p.port).join('/')}` : ''}, pasta ${a.cwd}`)), ...f.pm2.map((a) => {
    const ports = f.ports.filter((p) => p.pid === a.pid);
    const domains = domainsOfPorts(ports, f);
    return {
        key: `pm2:${a.name}`, kind: 'pm2', title: `Processo pm2 ${a.name}`, source: `pm2:${a.name}`,
        body: [
            `Processo pm2 "${a.name}": ${a.status}${a.pid ? `, PID ${a.pid}` : ''}, ${a.restarts} reinício(s), memória ${mb(a.mem)}${a.since && a.status === 'online' ? `, no ar desde ${stamp(a.since)}` : ''}.`,
            `Pasta (diretório): ${a.cwd}. Script: ${a.script}.`,
            ports.length ? `Porta(s): ${ports.map(portLabel).join(', ')}.` : '',
            domains.length ? `Domínios: ${domains.join(', ')}.` : '',
        ].filter(Boolean).join('\n'),
    };
})];

const collectNginx = async (f: Facts): Promise<KnowItem[]> => [...summaryItems('nginx', 'Resumo dos sites nginx', 'Lista dos domínios atendidos pelo nginx e para onde cada um encaminha (domínio, porta do backend ou pasta estática):', f.nginx.map((s) => `${s.domains.slice(0, 3).join(', ') || path.basename(s.file)} → ${Array.from(new Set(s.proxies.map((p) => p.target.replace(/^https?:\/\//, '').split('/')[0]))).slice(0, 3).join(', ') || s.roots[0] || 'n/d'}`)), ...f.nginx.map((s) => ({
    key: `nginx:${s.file}`, kind: 'nginx', title: `Site nginx ${path.basename(s.file)}${s.domains[0] ? ` (${s.domains[0]})` : ''}`, source: s.file,
    body: [
        `Configuração do nginx em ${s.file}.`,
        s.domains.length ? `Domínios (server_name): ${s.domains.join(', ')}.` : '',
        s.listens.length ? `Escuta: ${s.listens.join('; ')}.` : '',
        s.proxies.length ? `Encaminha (proxy_pass): ${s.proxies.slice(0, 12).map((p) => `${p.where} → ${p.target}`).join('; ')}.` : '',
        s.roots.length ? `Arquivos estáticos (root): ${s.roots.join(', ')}.` : '',
        `Configuração:\n${s.text.length > 2200 ? `${s.text.slice(0, 2200)}…` : s.text}`,
    ].filter(Boolean).join('\n'),
}))];

const collectDocker = async (f: Facts): Promise<KnowItem[]> => f.docker.map((c) => ({
    key: `docker:${c.name}`, kind: 'docker', title: `Contêiner Docker ${c.name}`, source: `docker:${c.name}`,
    body: `Contêiner Docker ${c.name}: imagem ${c.image}. Estado: ${c.status}. Portas: ${c.ports || 'nenhuma publicada'}.`,
}));

// ------------------------------------------------------------ banco de dados (só catálogo: nomes, tamanhos, colunas; nunca linhas)

let knownDatabases: string[] = [];

const collectDatabases = async (): Promise<KnowItem[]> => {
    const out: KnowItem[] = [];
    const dbs = await pool.query(`SELECT d.datname AS name, pg_database_size(d.datname) AS size, pg_get_userbyid(d.datdba) AS owner
                                    FROM pg_database d WHERE NOT d.datistemplate ORDER BY 1`);
    knownDatabases = dbs.rows.map((r: any) => String(r.name));
    for (const d of dbs.rows) {
        out.push({
            key: `banco:${d.name}`, kind: 'banco', title: `Banco PostgreSQL ${d.name}`, source: `postgres:${d.name}`,
            body: `Banco de dados PostgreSQL "${d.name}" no servidor local (127.0.0.1:5432). Tamanho: ${size(Number(d.size))}. Dono: ${d.owner}. Só o catálogo é conhecido; o conteúdo de outros projetos só é lido por fontes liberadas (consultar_projeto).`,
        });
    }
    out.push(...summaryItems('banco', 'Resumo dos bancos PostgreSQL', 'Lista dos bancos de dados PostgreSQL do servidor (quais bancos existem) com tamanho:', dbs.rows.map((d: any) => `${d.name}: ${size(Number(d.size))}, dono ${d.owner}`)));
    const current = await pool.query('SELECT current_database() AS db');
    const db = current.rows[0].db;
    const tables = await pool.query(`
        SELECT c.relname AS name, c.reltuples::bigint AS rows, pg_total_relation_size(c.oid) AS size, obj_description(c.oid) AS comment,
               (SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY a.attnum)
                  FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS cols,
               (SELECT string_agg(t.tgname, ', ') FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS triggers,
               (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS indexes
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname`);
    for (const t of tables.rows) {
        const cols = String(t.cols || '');
        out.push({
            key: `tabela:${db}.${t.name}`, kind: 'tabela', title: `Tabela ${t.name} (${db})`, source: `postgres:${db}.${t.name}`,
            body: [
                `Tabela ${t.name} do banco ${db} (esquema do SGCG).${t.comment ? ` ${t.comment}.` : ''}`,
                `Aproximadamente ${Number(t.rows) >= 0 ? Number(t.rows).toLocaleString('pt-BR') : 'n/d'} linhas, ${size(Number(t.size))} em disco, ${t.indexes} índice(s).`,
                t.triggers ? `Gatilhos (triggers): ${t.triggers}.` : '',
                `Colunas: ${cols.length > 1500 ? `${cols.slice(0, 1500)}…` : cols}.`,
            ].filter(Boolean).join('\n'),
        });
    }
    return out;
};

// ------------------------------------------------------------ firewall, configurações e sistema

const chunkLines = (lines: string[], max: number) => {
    const parts: string[] = [];
    let cur = '';
    for (const line of lines) {
        if (cur.length + line.length + 1 > max && cur) { parts.push(cur); cur = ''; }
        cur += `${cur ? '\n' : ''}${line}`;
    }
    if (cur) parts.push(cur);
    return parts;
};

const collectFirewall = async (): Promise<KnowItem[]> => {
    const raw = await sh('ufw', ['status', 'numbered']);
    const lines = raw.split('\n').filter((l) => l.trim());
    if (!lines.length) return [];
    return chunkLines(lines, 1500).map((body, i, all) => ({
        key: `firewall:ufw:${i + 1}`, kind: 'firewall', title: `Firewall UFW (parte ${i + 1}/${all.length})`, source: 'ufw:status',
        body: `Regras do firewall UFW do servidor (a regra do UFW nunca deve ser removida do sistema), parte ${i + 1} de ${all.length}:\n${body}`,
    }));
};

const CONFIG_FILES: Array<{ file: string; label: string }> = [
    { file: '/etc/unbound/unbound.conf', label: 'Unbound (DNS principal)' },
    { file: '/etc/unbound/sgcg-vip-clean.conf', label: 'Unbound sgcg-vip-dns (DNS dos VIPs, porta 5355)' },
    { file: '/etc/squid/squid.conf', label: 'Squid (proxy)' },
    { file: '/etc/dhcp/dhcpd.conf', label: 'DHCP' },
    { file: '/etc/prometheus/prometheus.yml', label: 'Prometheus' },
    { file: '/etc/ssh/sshd_config', label: 'SSH' },
    { file: '/etc/nginx/nginx.conf', label: 'nginx (configuração geral)' },
    { file: '/etc/fstab', label: 'Montagens de disco e swap (fstab)' },
    { file: '/etc/sysctl.conf', label: 'Parâmetros do kernel (sysctl)' },
];

const collectConfigs = async (): Promise<KnowItem[]> => {
    const list = [...CONFIG_FILES];
    for (const [dir, label, re] of [
        ['/etc/unbound/unbound.conf.d', 'Unbound (DNS principal)', /\.conf$/], ['/etc/netplan', 'Rede (netplan)', /\.ya?ml$/],
        ['/etc/cron.d', 'Cron', /^[^.]+$/], ['/etc/sysctl.d', 'Parâmetros do kernel (sysctl)', /\.conf$/],
    ] as Array<[string, string, RegExp]>) {
        for (const e of await listDir(dir)) if (!e.isDirectory() && re.test(e.name) && !/bak|~$/.test(e.name)) list.push({ file: path.join(dir, e.name), label });
    }
    const out: KnowItem[] = [];
    for (const { file, label } of list) {
        const text = stripConf(await readText(file, 300 * 1024));
        if (!text) continue;
        const parts = chunkLines(text.split('\n'), 1500);
        parts.slice(0, 12).forEach((body, i) => out.push({
            key: `config:${file}:${i + 1}`, kind: 'config', title: `Configuração ${label} — ${file}${parts.length > 1 ? ` (parte ${i + 1}/${parts.length})` : ''}`, source: file,
            body: `Arquivo de configuração ${file} (${label})${parts.length > 1 ? `, parte ${i + 1} de ${parts.length}` : ''}, sem comentários:\n${body}`,
        }));
    }
    return out;
};

const collectSystem = async (): Promise<KnowItem[]> => {
    const mem = await readText('/proc/meminfo', 65536);
    const kb = (name: string) => Number(mem.match(new RegExp(`^${name}:\\s+(\\d+) kB`, 'm'))?.[1] || 0) * 1024;
    const cpu = await readText('/proc/cpuinfo', 4 * 1024 * 1024);
    const model = cpu.match(/model name\s*:\s*(.+)/)?.[1] || 'n/d';
    const cores = (cpu.match(/^processor\s*:/gm) || []).length;
    const osName = (await readText('/etc/os-release', 4096)).match(/PRETTY_NAME="?([^"\n]+)/)?.[1] || '';
    const kernel = (await sh('uname', ['-r'])).trim();
    const swappiness = (await readText('/proc/sys/vm/swappiness', 64)).trim();
    const swap = (await sh('swapon', ['--show', '--noheadings', '--bytes'])).split('\n').filter(Boolean).map((l) => { const c = l.trim().split(/\s+/); return `${c[0]} (${c[1]}) ${gb(Number(c[2]))}`; });
    const disks = (await sh('df', ['-B1', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'squashfs', '-x', 'overlay', '-x', 'efivarfs', '--output=source,fstype,size,target']))
        .split('\n').slice(1).filter(Boolean).map((l) => { const c = l.trim().split(/\s+/); return `${c[3]} (${c[0]}, ${c[1]}, ${gb(Number(c[2]))})`; });
    const ifaces = (await sh('ip', ['-br', 'addr'])).split('\n').filter(Boolean).map((l) => l.trim().replace(/\s+/g, ' '));
    const gateway = (await sh('ip', ['route', 'show', 'default'])).trim().split('\n')[0] || '';
    const unitsFailed = (await sh('systemctl', ['--failed', '--no-legend', '--plain', '--no-pager'])).split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/)[0]);
    return [{
        key: 'sistema:visao-geral', kind: 'sistema', title: 'Servidor: hardware, memória, swap, discos e rede', source: 'sistema:visao-geral',
        body: [
            `Servidor gateway Linux${osName ? ` (${osName})` : ''}, kernel ${kernel}. CPU: ${model}, ${cores} núcleos.`,
            `Memória RAM total: ${gb(kb('MemTotal'))}. Swap total: ${gb(kb('SwapTotal'))}${swap.length ? ` (${swap.join('; ')})` : ''}. swappiness (vm.swappiness): ${swappiness}.`,
            `Discos e montagens: ${disks.join('; ')}.`,
            `Interfaces de rede do servidor (nome, estado, endereços): ${ifaces.join(' | ')}.`,
            gateway ? `Rota padrão (saída para a internet): ${gateway}.` : '',
            unitsFailed.length ? `Unidades systemd com falha na indexação: ${unitsFailed.join(', ')}.` : 'Nenhuma unidade systemd com falha na indexação.',
            'Valores de uso instantâneo (memória em uso, CPU, disco livre) NÃO estão aqui: use a ferramenta estado_do_servidor.',
        ].filter(Boolean).join('\n'),
    }];
};

// ------------------------------------------------------------ documentação e scripts

const projectDirs = async (): Promise<Array<{ dir: string; name: string }>> => {
    const out: Array<{ dir: string; name: string }> = [];
    const seen = new Set<string>();
    const add = (dir: string, name: string) => { if (!seen.has(dir)) { seen.add(dir); out.push({ dir, name }); } };
    for (const base of ['/opt', '/var/www']) {
        for (const e of await listDir(base)) {
            if (!e.isDirectory() || BACKUP_LIKE.test(e.name) || THIRD_PARTY.test(e.name) || e.name === 'projetosjmb') continue;
            add(path.join(base, e.name), e.name);
        }
    }
    for (const e of await listDir('/opt/projetosjmb')) if (e.isDirectory() && !BACKUP_LIKE.test(e.name)) add(path.join('/opt/projetosjmb', e.name), e.name);
    return out;
};

const walkMarkdown = async (root: string, limit = 60) => {
    const files: string[] = [];
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    while (queue.length && files.length < limit) {
        const { dir, depth } = queue.shift()!;
        const entries = await listDir(dir);
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isFile() && /\.md$/i.test(e.name) && !/(secret|senha|credential|password|dump|changelog)/i.test(e.name)) files.push(full);
            else if (e.isDirectory() && depth < 4 && !SKIP_DIRS.has(e.name) && !BACKUP_LIKE.test(e.name) && !isExcluded(e.name)) queue.push({ dir: full, depth: depth + 1 });
        }
    }
    return files.slice(0, limit);
};

const splitLong = (line: string, max = 1500) => {
    if (line.length <= max) return [line];
    const parts: string[] = [];
    let rest = line;
    while (rest.length > max) {
        const cut = rest.lastIndexOf(' ', max);
        const at = cut > max * 0.5 ? cut : max;
        parts.push(rest.slice(0, at));
        rest = rest.slice(at).trimStart();
    }
    if (rest) parts.push(rest);
    return parts;
};

const chunkMarkdown = (name: string, text: string) => {
    const chunks: Array<{ title: string; body: string }> = [];
    let heading = '';
    let buf: string[] = [];
    let size = 0;
    const flush = () => {
        const body = buf.join('\n').trim();
        if (body.length >= 60) chunks.push({ title: `${name}${heading ? ` › ${heading}` : ''}`, body });
        buf = [];
        size = 0;
    };
    for (const raw of text.split(/\r?\n/)) {
        const h = raw.match(/^#{1,4}\s+(.+)/);
        if (h && size > 350) flush();
        if (h) heading = h[1].trim().slice(0, 120);
        for (const line of splitLong(raw)) {
            if (size + line.length > 1700 && size > 0) flush();
            buf.push(line);
            size += line.length + 1;
        }
        if (size > 1300 && raw.trim() === '') flush();
    }
    flush();
    return chunks;
};

const collectDocs = async (): Promise<KnowItem[]> => {
    const out: KnowItem[] = [];
    const files: Array<{ file: string; rel: string; project: string }> = [];
    for (const p of await projectDirs()) {
        if (isExcluded(p.name)) continue;
        for (const f of await walkMarkdown(p.dir)) files.push({ file: f, rel: path.relative(path.dirname(p.dir), f), project: p.name });
    }
    files.push({ file: '/home/lucas.becker/inventario-projetos.md', rel: 'inventario-projetos.md', project: 'inventario' });
    const seenBodies = new Set<string>();
    for (const { file, rel } of files) {
        const text = await readText(file, 2 * 1024 * 1024);
        if (!text) continue;
        const stat = await fs.promises.stat(file).catch(() => null);
        // cópias do mesmo projeto (pastas de preview, -dev) repetem o texto: só o primeiro entra
        chunkMarkdown(rel, text).slice(0, 900).filter((c) => { const k = c.body.replace(/\s+/g, ' '); if (seenBodies.has(k)) return false; seenBodies.add(k); return true; }).forEach((c, i) => out.push({
            key: `doc:${rel}#${i + 1}`, kind: 'doc', title: c.title, source: rel,
            body: `${c.body}${stat ? `\n(documento ${rel}, modificado em ${stamp(stat.mtime)})` : ''}`,
        }));
    }
    return out;
};

const scriptHeader = (text: string) => {
    const keep: string[] = [];
    let inDoc = false;
    for (const raw of text.split('\n').slice(0, 70)) {
        const line = raw.trim();
        if (line.startsWith('#!')) continue;
        if (/^("""|''')/.test(line)) { inDoc = !inDoc || !/("""|''')\s*$/.test(line.slice(3)) ? !inDoc : false; keep.push(line.replace(/^("""|''')/, '').replace(/("""|''')$/, '')); continue; }
        if (inDoc) { keep.push(line); continue; }
        if (/^(#|\/\/|\/\*|\*)/.test(line)) { keep.push(line.replace(/^(#+|\/\/+|\/\*+|\*+\/?)\s?/, '')); continue; }
        if (!line) { if (keep.length) keep.push(''); continue; }
        break;
    }
    return keep.join('\n').trim();
};

const collectScripts = async (): Promise<KnowItem[]> => {
    const out: KnowItem[] = [];
    const dirs = [path.join(env.projectRoot, 'scripts'), path.join(env.projectRoot, 'backend-proxy', 'scripts'), '/usr/local/bin', '/usr/local/sbin'];
    for (const dir of dirs) {
        for (const e of await listDir(dir)) {
            if (!e.isFile() || /\.(bak|old|orig|swp)$|~$/.test(e.name)) continue;
            const file = path.join(dir, e.name);
            const text = await readText(file, 300 * 1024);
            if (!text || text.includes('\0')) continue;
            if (dir.startsWith('/usr/local') && !text.startsWith('#!')) continue;
            const header = scriptHeader(text);
            if (header.length < 25) continue;
            const stat = await fs.promises.stat(file).catch(() => null);
            out.push({
                key: `script:${file}`, kind: 'script', title: `Script ${e.name}`, source: file,
                body: `Script ${file}${stat ? ` (modificado em ${stamp(stat.mtime)})` : ''}. O que faz:\n${header.length > 1600 ? `${header.slice(0, 1600)}…` : header}`,
            });
        }
    }
    return out;
};

// ------------------------------------------------------------ fichas de projeto (liga pasta ↔ serviço ↔ porta ↔ domínio ↔ banco)

const readJson = async (file: string) => { try { return JSON.parse(await readText(file, 512 * 1024)); } catch { return null; } };
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const FRAMEWORKS = ['express', 'fastify', 'next', 'react', 'vite', 'vue', 'nestjs', '@nestjs/core', 'tailwindcss', 'prisma', 'sequelize', 'typeorm', 'pg', 'socket.io', 'baileys', '@whiskeysockets/baileys', 'whatsapp-web.js', 'puppeteer'];

const collectProjects = async (f: Facts): Promise<KnowItem[]> => {
    const out: KnowItem[] = [];
    for (const p of await projectDirs()) {
        const within = (target: string) => !!target && (target === p.dir || target.startsWith(`${p.dir}/`));
        const svcs = f.services.filter((s) => within(s.cwd) || s.exec.includes(`${p.dir}/`) || within(s.exec.split(' ').find((x) => x.startsWith('/')) || ''));
        const apps = f.pm2.filter((a) => within(a.cwd) || within(a.script));
        const pids = new Set<number>([...svcs.map((s) => s.pid), ...apps.map((a) => a.pid)].filter(Boolean));
        const ports = f.ports.filter((x) => pids.has(x.pid) || within(x.cwd) || svcs.some((s) => x.unit === s.name));
        const domains = new Set<string>(domainsOfPorts(ports, f));
        f.nginx.forEach((n) => { if (n.roots.some(within)) n.domains.forEach((d) => domains.add(d)); });
        const dbs = knownDatabases.filter((d) => squash(d).length >= 5 && (squash(d) === squash(p.name) || squash(p.name).includes(squash(d)) || squash(d).includes(squash(p.name))) && squash(p.name).length >= 5);

        const sensitive = isExcluded(p.name);
        let stack: string[] = [];
        let about = '';
        let readme = '';
        if (!sensitive) {
            const roots = [p.dir, ...['backend', 'frontend', 'api', 'server', 'web', 'app'].map((d) => path.join(p.dir, d))];
            const names: string[] = [];
            const fw = new Set<string>();
            for (const r of roots) {
                const pkg = await readJson(path.join(r, 'package.json'));
                if (pkg) {
                    stack.push('Node.js');
                    if (pkg.name) names.push(`${path.relative(p.dir, r) || '.'}: ${pkg.name}${pkg.description ? ` — ${String(pkg.description).slice(0, 120)}` : ''}${pkg.scripts?.start ? ` (start: ${String(pkg.scripts.start).slice(0, 80)})` : ''}`);
                    Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).filter((d) => FRAMEWORKS.includes(d)).forEach((d) => fw.add(d));
                }
                if (await exists(path.join(r, 'requirements.txt')) || await exists(path.join(r, 'pyproject.toml'))) stack.push('Python');
                if (await exists(path.join(r, 'composer.json'))) stack.push('PHP');
                if (await exists(path.join(r, 'go.mod'))) stack.push('Go');
                if (await exists(path.join(r, 'docker-compose.yml')) || await exists(path.join(r, 'docker-compose.yaml')) || await exists(path.join(r, 'Dockerfile'))) stack.push('Docker');
            }
            if (!stack.length && await exists(path.join(p.dir, 'index.html'))) stack.push('site estático');
            stack = Array.from(new Set(stack));
            about = [names.length ? `Pacotes: ${names.slice(0, 4).join(' | ')}.` : '', fw.size ? `Bibliotecas principais: ${Array.from(fw).slice(0, 10).join(', ')}.` : ''].filter(Boolean).join(' ');
            const rd = await readText(path.join(p.dir, 'README.md'), 200 * 1024) || await readText(path.join(p.dir, 'readme.md'), 200 * 1024);
            readme = rd.split('\n').filter((l) => l.trim() && !/^(#|\[!\[|!\[|<|---|===)/.test(l.trim())).slice(0, 4).join(' ').slice(0, 380);
        }
        const lastChange = (await fs.promises.stat(path.join(p.dir, '.git', 'logs', 'HEAD')).catch(() => null))
            || (await fs.promises.stat(path.join(p.dir, 'package.json')).catch(() => null)) || (await fs.promises.stat(p.dir).catch(() => null));

        out.push({
            key: `projeto:${p.dir}`, kind: 'projeto', title: `Projeto ${p.name}`, source: p.dir,
            body: [
                `Projeto "${p.name}" fica na pasta (diretório) ${p.dir}.`,
                sensitive ? 'Projeto marcado como sensível: README e documentos não são indexados (só fatos operacionais abaixo).' : '',
                stack.length ? `Tecnologia: ${stack.join(', ')}.` : '',
                about,
                readme ? `Resumo do README: ${readme}` : '',
                svcs.length ? `Serviços systemd: ${svcs.map((s) => `${s.name} (${s.active}${s.mem ? `, ${mb(s.mem)}` : ''})`).join('; ')}.` : '',
                apps.length ? `Processos pm2: ${apps.map((a) => `${a.name} (${a.status}, ${mb(a.mem)})`).join('; ')}.` : '',
                ports.length ? `Portas que usa: ${Array.from(new Set(ports.map(portLabel))).join(', ')}.` : '',
                domains.size ? `Domínios: ${Array.from(domains).join(', ')}.` : '',
                dbs.length ? `Banco PostgreSQL provável: ${dbs.join(', ')}.` : '',
                !svcs.length && !apps.length && !ports.length ? 'Nenhum serviço, processo pm2 ou porta ativa associado a esta pasta na indexação (projeto parado ou só arquivos).' : '',
                lastChange ? `Última atividade registrada: ${stamp(lastChange.mtime)}.` : '',
            ].filter(Boolean).join('\n'),
        });
    }
    const lines = out.map((it) => {
        const g = (re: RegExp) => it.body.match(re)?.[1] || '';
        const portas = g(/Portas que usa: ([^\n]+)\./);
        const dom = g(/Domínios: ([^\n]+)\./);
        return `${it.title.replace('Projeto ', '')}: ${it.source}${portas ? `, porta ${portas}` : ''}${dom ? `, ${dom}` : ''}${/Nenhum serviço, processo pm2/.test(it.body) ? ' (parado/sem serviço)' : ''}`;
    });
    out.push(...summaryItems('projeto', 'Resumo dos projetos do servidor', 'Lista de todos os projetos do servidor com a pasta (diretório), porta e domínio; quais projetos existem e quais estão parados:', lines));
    return out;
};

// ------------------------------------------------------------ orquestração

export const collectKnowledge = async (): Promise<{ items: KnowItem[]; kinds: string[]; errors: Record<string, string> }> => {
    const errors: Record<string, string> = {};
    const failed = new Set<string>();
    const f: Facts = { services: [], ports: [], pm2: [], nginx: [], docker: [], domainsByPort: new Map() };

    const need = async (name: string, fn: () => Promise<void>) => {
        try { await fn(); } catch (error: any) { failed.add(name); errors[`fatos:${name}`] = String(error?.message || error).slice(0, 200); }
    };
    const nonEmpty = <T,>(list: T[]) => { if (!list.length) throw new Error('sem dados'); return list; };
    await Promise.all([
        need('servicos', async () => { f.services = nonEmpty(await gatherServices()); }),
        need('portas', async () => { f.ports = nonEmpty(await gatherPorts()); }),
        need('pm2', async () => { f.pm2 = nonEmpty(await gatherPm2()); }),
        need('nginx', async () => { f.nginx = nonEmpty(await gatherNginx()); }),
        need('docker', async () => { f.docker = nonEmpty(await gatherDocker()); }),
    ]);
    for (const site of f.nginx) {
        for (const pr of site.proxies) {
            if (!pr.port) continue;
            const set = f.domainsByPort.get(pr.port) || new Set<string>();
            site.domains.forEach((d) => set.add(d));
            f.domainsByPort.set(pr.port, set);
        }
    }

    const items: KnowItem[] = [];
    const kinds: string[] = [];
    const steps: Array<{ name: string; kinds: string[]; needs?: string[]; run: () => Promise<KnowItem[]> }> = [
        { name: 'servicos', kinds: ['servico'], needs: ['servicos'], run: () => collectServices(f) },
        { name: 'timers', kinds: ['timer'], run: () => collectTimers() },
        { name: 'portas', kinds: ['porta'], needs: ['portas'], run: () => collectPorts(f) },
        { name: 'pm2', kinds: ['pm2'], needs: ['pm2'], run: () => collectPm2(f) },
        { name: 'nginx', kinds: ['nginx'], needs: ['nginx'], run: () => collectNginx(f) },
        { name: 'docker', kinds: ['docker'], needs: ['docker'], run: () => collectDocker(f) },
        { name: 'banco', kinds: ['banco', 'tabela'], run: () => collectDatabases() },
        { name: 'firewall', kinds: ['firewall'], run: () => collectFirewall() },
        { name: 'configs', kinds: ['config'], run: () => collectConfigs() },
        { name: 'sistema', kinds: ['sistema'], run: () => collectSystem() },
        { name: 'docs', kinds: ['doc'], run: () => collectDocs() },
        { name: 'scripts', kinds: ['script'], run: () => collectScripts() },
        { name: 'projetos', kinds: ['projeto'], needs: ['servicos', 'portas', 'pm2', 'nginx'], run: () => collectProjects(f) },
    ];
    for (const step of steps) {
        if (step.needs?.some((n) => failed.has(n))) { errors[step.name] = 'dados de apoio indisponíveis; mantido o que já existia'; continue; }
        try {
            const got = await step.run();
            if (!got.length && !['timers', 'firewall', 'docker'].includes(step.name)) throw new Error('nenhum item coletado');
            items.push(...got);
            kinds.push(...step.kinds);
        } catch (error: any) {
            errors[step.name] = String(error?.message || error).slice(0, 200);
        }
    }
    return { items, kinds, errors };
};
