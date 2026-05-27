import { Router } from 'express';
import { execCmd } from '../../utils/sys';
import * as os from 'os';
import * as fs from 'fs';
import { env } from '../../config/env';

const router = Router();

// --- ESTADOS GLOBAIS ---
let lastMeasureTime = Date.now();
let lastNet = { [env.wanInterface]: { rx: 0, tx: 0 }, [env.lanInterface]: { rx: 0, tx: 0 } } as Record<string, { rx: number; tx: number }>;
let lastCpu = { idle: 0, total: 0 };

// --- FUNÇÕES DE LEITURA ---
const getIfaceState = (iface: string) => {
    try { return fs.readFileSync(`/sys/class/net/${iface}/operstate`, 'utf-8').trim(); } catch { return 'unknown'; }
};

const getNetworkBytes = () => {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf-8');
        const lines = data.split('\n');
        let stats = { [env.wanInterface]: { rx: 0, tx: 0 }, [env.lanInterface]: { rx: 0, tx: 0 } } as Record<string, { rx: number; tx: number }>;
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10) return;
            const iface = parts[0].replace(':', ''); 
            if (iface === env.wanInterface || iface === env.lanInterface) {
                stats[iface].rx = parseInt(parts[1]);
                stats[iface].tx = parseInt(parts[9]);
            }
        });
        return stats;
    } catch { return { [env.wanInterface]: { rx: 0, tx: 0 }, [env.lanInterface]: { rx: 0, tx: 0 } } as Record<string, { rx: number; tx: number }>; }
};

const getCpuTemp = () => {
    try {
        const raw = fs.readFileSync('/sys/class/hwmon/hwmon1/temp1_input', 'utf-8');
        return Math.round(parseInt(raw.trim()) / 1000);
    } catch {
        try { 
            const f = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
            return Math.round(parseInt(f.trim()) / 1000);
        } catch { return 0; }
    }
};

const getCpuUsage = () => {
    try {
        const data = fs.readFileSync('/proc/stat', 'utf-8');
        const line = data.split('\n').find(l => l.startsWith('cpu '));
        if (!line) return { idle: 0, total: 0 };
        const parts = line.split(/\s+/);
        const idle = parseInt(parts[4]);
        let total = 0;
        for (let i = 1; i < parts.length; i++) total += parseInt(parts[i]);
        return { idle, total };
    } catch { return { idle: 0, total: 0 }; }
};

// BYPASS DO BUG DO RYZEN
const getCpuClock = async () => {
    let clock = os.cpus()[0].speed;
    if (!clock || clock === 0) {
        try {
            const lscpu = await execCmd("lscpu | grep 'CPU max MHz' | awk '{print $4}'");
            if (lscpu) clock = parseFloat(lscpu);
            else {
                const cpuinfo = await execCmd("cat /proc/cpuinfo | grep 'cpu MHz' | head -1 | awk '{print $4}'");
                if (cpuinfo) clock = parseFloat(cpuinfo);
            }
        } catch(e) {}
    }
    return clock > 100 ? (clock / 1000).toFixed(1) : (clock > 0 ? clock.toFixed(1) : "3.9");
};

const formatBytes = (bytes: number) => {
    if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
};

const readDmiValue = (file: string) => {
    try {
        return fs.readFileSync(`/sys/devices/virtual/dmi/id/${file}`, 'utf-8').trim();
    } catch {
        return '';
    }
};

const readSysValue = (path: string) => {
    try {
        return fs.readFileSync(path, 'utf-8').trim();
    } catch {
        return '';
    }
};

const getMotherboard = () => {
    const vendor = readDmiValue('board_vendor');
    const name = readDmiValue('board_name');
    const version = readDmiValue('board_version');
    return {
        vendor: vendor || 'Fabricante não identificado',
        model: [name, version && !/default|string|none/i.test(version) ? version : ''].filter(Boolean).join(' ') || 'Modelo não identificado',
    };
};

const getPhysicalSsds = async () => {
    try {
        const rootSlaves = fs.existsSync('/sys/block/dm-0/slaves')
            ? fs.readdirSync('/sys/block/dm-0/slaves').map((name) => name.replace(/\d+$/, ''))
            : [];
        const rootDevices = new Set(rootSlaves);
        const byIdEntries = fs.existsSync('/dev/disk/by-id') ? fs.readdirSync('/dev/disk/by-id') : [];
        const serialByDevice = byIdEntries.reduce((acc, entry) => {
            if (!entry.startsWith('ata-') || entry.includes('-part')) return acc;
            try {
                const target = fs.realpathSync(`/dev/disk/by-id/${entry}`);
                const device = target.split('/').pop() || '';
                const serial = entry.split('_').pop() || '';
                if (device && serial && /[0-9A-Fa-f]{6,}/.test(serial)) acc[device] = serial;
            } catch {}
            return acc;
        }, {} as Record<string, string>);
        return fs.readdirSync('/sys/block')
            .filter((name) => name.startsWith('sd') && (rootDevices.size === 0 || rootDevices.has(name)))
            .filter((name) => readSysValue(`/sys/block/${name}/queue/rotational`) === '0')
            .map((name, index) => {
                const sizeBlocks = Number(readSysValue(`/sys/block/${name}/size`) || 0);
                const model = readSysValue(`/sys/block/${name}/device/model`) || 'SSD';
                const serial = readSysValue(`/sys/block/${name}/device/serial`) || serialByDevice[name] || '';
                return {
                    id: name,
                    label: `SSD ${index + 1}`,
                    device: `/dev/${name}`,
                    model,
                    serial,
                    size: formatBytes(sizeBlocks * 512),
                    transport: 'SATA',
                    role: 'Membro do ROOT (SISTEMA)',
                };
            });
    } catch {
        return [];
    }
};

// FORMATADOR ABSOLUTO DOS DISCOS
const getDisk = async (path: string) => {
    try {
        const check = await execCmd(`mount | grep "on ${path} " || echo ""`);
        if (!check && path !== '/') return { status: 'MISSING', size: '0 GB', used: '0 GB', percent: '0%', type: 'N/A', mount: path };
        
        // Lê os blocos crus do Linux
        const df = await execCmd(`df -B1 --output=size,used,pcent ${path} | tail -1`);
        const parts = df.trim().split(/\s+/);
        let sizeNum = 0, usedNum = 0, pcentStr = "0%";
        
        if (parts.length >= 3) {
            sizeNum = parseInt(parts[0]);
            usedNum = parseInt(parts[1]);
            pcentStr = parts[2];
        }

        return {
            status: 'OK',
            type: path === '/' ? 'SSD' : 'HDD',
            size: formatBytes(sizeNum), // UI ESPERAVA SIZE!
            used: formatBytes(usedNum), // Formatado com GB/MB!
            percent: pcentStr.includes('%') ? pcentStr : pcentStr + '%', // % Obrigatório!
            mount: path
        };
    } catch { return { status: 'MISSING', size: '0 GB', used: '0 GB', percent: '0%', type: 'ERR', mount: path }; }
};

// --- INSIGHTS ---
const generateInsights = (cpu: any, mem: any, disks: any, net: any) => {
    const insights = [];
    if (cpu.temp > 85) insights.push({ type: 'critical', msg: `ALERTA TÉRMICO: CPU em ${cpu.temp}°C.` });
    if (parseFloat(cpu.load) > 90) insights.push({ type: 'critical', msg: `CPU SATURADA (${cpu.load}%).` });
    if (parseFloat(mem.percent_used) > 92) insights.push({ type: 'critical', msg: `MEMÓRIA CRÍTICA (${mem.percent_used}).` });
    if (parseFloat(disks.system.percent) > 90) insights.push({ type: 'critical', msg: `SISTEMA CHEIO (${disks.system.percent}).` });
    if (net.wan.state !== 'up' && net.wan.state !== 'unknown') insights.push({ type: 'critical', msg: 'WAN DOWN.' });
    if (insights.length === 0) insights.push({ type: 'success', msg: 'DIAGNÓSTICO V8: Sistema operando normalmente.' });
    return insights;
};

// Init
let initialNet = getNetworkBytes();
lastNet = initialNet;
lastCpu = getCpuUsage();

router.get('/hardware', async (req, res) => {
    try {
        const hostname = os.hostname();
        const kernel = await execCmd("uname -r");
        const distro = (await execCmd("grep PRETTY_NAME /etc/os-release | cut -d'\"' -f2")) || "Linux";

        const currCpu = getCpuUsage();
        const idleDiff = currCpu.idle - lastCpu.idle;
        const totalDiff = currCpu.total - lastCpu.total;
        const cpuPercent = totalDiff > 0 ? (1 - idleDiff / totalDiff) * 100 : 0;
        lastCpu = currCpu;
        const temp = getCpuTemp();

        // CÁLCULO DE RAM
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        const now = Date.now();
        const timeDiff = (now - lastMeasureTime) / 1000;
        const currNet = getNetworkBytes();
        const safeDiff = timeDiff > 0 ? timeDiff : 1;
        const calcMbps = (c: number, p: number) => ((c - p) * 8 / safeDiff / 1000000);
        
        const netData = {
            wan: { rx: calcMbps(currNet[env.wanInterface].rx, lastNet[env.wanInterface].rx), tx: calcMbps(currNet[env.wanInterface].tx, lastNet[env.wanInterface].tx), state: getIfaceState(env.wanInterface) },
            lan: { rx: calcMbps(currNet[env.lanInterface].rx, lastNet[env.lanInterface].rx), tx: calcMbps(currNet[env.lanInterface].tx, lastNet[env.lanInterface].tx), state: getIfaceState(env.lanInterface) }
        };
        lastNet = currNet;
        lastMeasureTime = now;

        // CÁLCULO DE DISCOS
        const d1 = await getDisk('/');
        const physicalSsds = await getPhysicalSsds();

        const cpuClockFixed = await getCpuClock();
        
        // PACOTE FINAL (CRAVADO COM O QUE O REACT QUER LER)
        const cpuData = { cores: os.cpus().length, model: os.cpus()[0].model, load: cpuPercent.toFixed(1), speed: cpuClockFixed, temp };
        
        // CHAVE 'mem' em vez de 'ram' com GB aplicados e % preenchido
        const memData = { 
            total: (totalMem/1e9).toFixed(1) + ' GB', 
            used: (usedMem/1e9).toFixed(1) + ' GB', 
            percent_used: Math.round((usedMem/totalMem)*100) + '%' 
        };
        
        const disksData = { system: d1 };
        const insights = generateInsights(cpuData, memData, disksData, netData);

        res.json({
            os: { hostname, distro, kernel, arch: os.arch() },
            cpu: cpuData,
            motherboard: getMotherboard(),
            mem: memData, 
            net: netData,
            disks: disksData,
            storage: {
                root: { ...d1, label: 'Disco ROOT (SISTEMA)', layout: `${physicalSsds.length || 4} SSDs em volume unificado` },
                physical_ssds: physicalSsds,
            },
            insights: insights
        });

    } catch (e) {
        console.error("Hardware Monitor Error:", e);
        res.json({
             os: { hostname: 'Error', distro: 'Linux', kernel: '', arch: '' },
             cpu: { load: 0, temp: 0, model: '', cores: 0, speed: 0 },
             motherboard: { vendor: '', model: '' },
             mem: { percent_used: '0%', total: '0 GB', used: '0 GB' },
             net: { wan: {rx:0, tx:0}, lan: {rx:0, tx:0} },
             disks: { system: {percent:'0%', size:'0 GB', used:'0 GB'} },
             storage: { root: {percent:'0%', size:'0 GB', used:'0 GB', label: 'Disco ROOT (SISTEMA)', layout: '4 SSDs em volume unificado'}, physical_ssds: [] },
             insights: []
        });
    }
});

export default router;
