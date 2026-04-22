import { Router } from 'express';
import { execCmd } from '../../utils/sys';

const router = Router();

router.get('/vlans-detail', async (req, res) => {
    try {
        console.log(`[NETWORK MODULE] Iniciando coleta nativa de telemetria de interfaces...`);

        // 1. Leitura do Kernel via Child Process (Tratamento direto de stdout)
        const devData = await execCmd("cat /proc/net/dev");
        const lines = devData.split('\n').slice(2);

        // 2. Coleta de IPs (Em lote, garantindo retorno vazio caso o comando falhe)
        let ipLines: string[] = [];
        try {
            const ipData = await execCmd("ip -o -4 addr show");
            ipLines = ipData.split('\n');
        } catch (e) { console.warn("[NETWORK] Aviso: Falha não crítica ao coletar IPs."); }

        // 3. Coleta de Status da Porta Link
        let linkLines: string[] = [];
        try {
            const linkData = await execCmd("ip -o link show");
            linkLines = linkData.split('\n');
        } catch (e) { console.warn("[NETWORK] Aviso: Falha não crítica ao coletar status de Link."); }

        // Mapeamento Funcional em Memória (Sem I/O overhead)
        const stats = lines.map(line => {
            if (!line.includes(':')) return null;

            const parts = line.split(':');
            const ifaceRaw = parts[0].trim();
            const iface = ifaceRaw.split('@')[0];

            const values = parts[1].trim().split(/\s+/);
            const rxBytes = parseInt(values[0]) || 0;
            const txBytes = parseInt(values[8]) || 0;

            // Associação do IP
            let ip = '';
            const ipMatch = ipLines.find(l => l.includes(` ${iface} `) || l.includes(` ${ifaceRaw} `));
            if (ipMatch) {
                const match = ipMatch.match(/inet\s+([0-9.]+)/);
                if (match) ip = match[1];
            }

            // Associação de Estado da Interface (UP/DOWN)
            let operstate = 'unknown';
            const linkMatch = linkLines.find(l => l.includes(`: ${iface}:`) || l.includes(`: ${iface}@`));
            if (linkMatch) {
                if (linkMatch.includes('state UP')) operstate = 'up';
                else if (linkMatch.includes('state DOWN')) operstate = 'down';
            }

            return {
                iface: iface,
                operstate: operstate,
                ip: ip,
                bytes_recv: rxBytes,
                bytes_sent: txBytes
            };
        }).filter(Boolean);

        console.log(`[NETWORK MODULE] Sucesso. Transmitindo payload de ${stats.length} interfaces.`);
        
        // Padrão Ouro: Sempre devolve o Array
        return res.json(stats);

    } catch (error: any) {
        console.error("[CRÍTICO] Falha catastrófica no pipeline de rede:", error.message);
        // Graceful Degradation: Devolve Array vazio e Status 200, protegendo a estabilidade da UI
        return res.json([]);
    }
});

export default router;
