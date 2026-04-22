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

        // Converte pra MB ou GB dinamicamente
        const formatSize = (bytes: number) => {
            if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
            if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
            return (bytes / 1024).toFixed(1) + ' KB';
        };

        return {
            status: 'OK',
            type: path === '/' ? 'SSD' : 'HDD',
            size: formatSize(sizeNum), // UI ESPERAVA SIZE!
            used: formatSize(usedNum), // Formatado com GB/MB!
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
        const d2 = await getDisk(env.cftvMount);
        const d3 = await getDisk(env.nextcloudMount);

        const cpuClockFixed = await getCpuClock();
        
        // PACOTE FINAL (CRAVADO COM O QUE O REACT QUER LER)
        const cpuData = { cores: os.cpus().length, model: os.cpus()[0].model, load: cpuPercent.toFixed(1), speed: cpuClockFixed, temp };
        
        // CHAVE 'mem' em vez de 'ram' com GB aplicados e % preenchido
        const memData = { 
            total: (totalMem/1e9).toFixed(1) + ' GB', 
            used: (usedMem/1e9).toFixed(1) + ' GB', 
            percent_used: Math.round((usedMem/totalMem)*100) + '%' 
        };
        
        const disksData = { system: d1, cftv: d2, nextcloud: d3 };
        const insights = generateInsights(cpuData, memData, disksData, netData);

        res.json({
            os: { hostname, distro, kernel, arch: os.arch() },
            cpu: cpuData,
            mem: memData, 
            net: netData,
            disks: disksData,
            insights: insights
        });

    } catch (e) {
        console.error("Hardware Monitor Error:", e);
        res.json({
             os: { hostname: 'Error', distro: 'Linux', kernel: '', arch: '' },
             cpu: { load: 0, temp: 0, model: '', cores: 0, speed: 0 },
             mem: { percent_used: '0%', total: '0 GB', used: '0 GB' },
             net: { wan: {rx:0, tx:0}, lan: {rx:0, tx:0} },
             disks: { system: {percent:'0%', size:'0 GB', used:'0 GB'}, cftv: {percent:'0%', size:'0 GB', used:'0 GB'}, nextcloud: {percent:'0%', size:'0 GB', used:'0 GB'} },
             insights: []
        });
    }
});

export default router;
