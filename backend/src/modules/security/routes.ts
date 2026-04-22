import { Router } from 'express';
import { execCmd } from '../../utils/sys';

const router = Router();

// --- PARSER INDESTRUTÍVEL (SEM REGEX COMPLEXA) ---
const parseUfw = (raw: string) => {
    return raw.split('\n')
        .filter(l => l.trim().startsWith('[')) // Pega apenas linhas que começam com [ID]
        .map(line => {
            try {
                // Exemplo: [ 1] 80/tcp                   ALLOW IN    Anywhere
                
                // 1. Extrair ID (O que está entre colchetes)
                const idMatch = line.match(/\[\s*(\d+)\s*\]/);
                if (!idMatch) return null;
                const id = idMatch[1];

                // 2. Limpar a linha removendo o ID para processar o resto
                // Remove "[ 1]" e espaços extras
                const content = line.replace(/\[\s*\d+\s*\]/, '').trim();
                
                // 3. Detectar AÇÃO (ALLOW ou DENY)
                let action = 'UNKNOWN';
                if (content.includes('ALLOW')) action = 'ALLOW';
                else if (content.includes('DENY')) action = 'DENY';
                else if (content.includes('REJECT')) action = 'DENY'; // Reject conta como bloqueio

                // 4. "Explodir" por espaços para tentar pegar Porta e Origem
                // partes esperadas: [Porta, Action, Direction, From...]
                const parts = content.split(/\s+/);
                const port = parts[0]; // A primeira coisa depois do ID é sempre a porta/destino

                // 5. Tentar achar a Origem (Source)
                // Geralmente é tudo depois da direção (IN/OUT). 
                // Se a linha tem "Anywhere", é a origem.
                // Pegamos as últimas partes se possível.
                let source = 'Anywhere';
                if (parts.length >= 3) {
                    // Pega do índice 3 em diante (pula Porta, Action, Direction)
                    // Ex: 80/tcp ALLOW IN Anywhere
                    // parts[0]=80/tcp, parts[1]=ALLOW, parts[2]=IN, parts[3]=Anywhere
                    const sourceIndex = parts.findIndex(p => p === 'IN' || p === 'OUT');
                    if (sourceIndex !== -1 && parts[sourceIndex + 1]) {
                        source = parts.slice(sourceIndex + 1).join(' ');
                    } else {
                        // Fallback: pega o último item
                        source = parts[parts.length - 1];
                    }
                }

                return { id, port, action, source };

            } catch (e) {
                return null;
            }
        })
        .filter(x => x !== null);
};

// --- ROTAS ---

router.get('/ufw', async (req, res) => {
    try {
        const raw = await execCmd("sudo ufw status numbered");
        const rules = parseUfw(raw);
        res.json({ rules }); 
    } catch (e) { 
        res.json({ rules: [] }); 
    }
});

router.post('/ufw/add', async (req, res) => {
    const { port, proto, action } = req.body;
    if (!port || !action) return res.status(400).json({ error: "Dados incompletos" });

    try {
        // action vem do front como 'allow' ou 'deny' (lowercase)
        const cmd = `sudo ufw ${action} ${port}/${proto || 'tcp'}`;
        await execCmd(cmd);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Falha ao aplicar regra" });
    }
});

router.post('/ufw/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID necessário" });

    try {
        // Confirmação automática com 'yes'
        await execCmd(`echo "y" | sudo ufw delete ${id}`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Falha ao remover regra" });
    }
});

export default router;
