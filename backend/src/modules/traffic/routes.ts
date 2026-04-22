import { Router } from 'express';
import { execCmd } from '../../utils/sys';

const router = Router();

router.get('/', async (req, res) => {
    try {
        // AQUI ESTAVA O ERRO: Faltava o 'await' antes de execCmd
        const raw = await execCmd('cat /proc/net/dev');
        
        // Agora 'raw' é uma string, então .split funciona
        const lines = raw.split('\n').slice(2); // Pula cabeçalhos

        const data = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10) return null;
            
            const interfaceName = parts[0].replace(':', '');
            return {
                interface: interfaceName,
                rx_bytes: parseInt(parts[1]),
                tx_bytes: parseInt(parts[9])
            };
        }).filter(item => item !== null);

        res.json(data);
    } catch (error) {
        console.error("Traffic Error:", error);
        res.status(500).json({ error: "Failed to read traffic" });
    }
});

export default router;
