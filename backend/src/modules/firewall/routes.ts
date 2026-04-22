import { Router } from 'express';
import { execCmd } from '../../utils/sys';

const router = Router();

// --- PARSER BLINDADO (ID STRICT + KEYWORD FLEXIBLE) ---
const parseUfw = (raw: string) => {
    const lines = raw.split('\n');
    
    return lines
        .map(line => line.trim())
        .filter(line => line.startsWith('[')) // Só olha linhas numeradas
        .map(line => {
            try {
                // PASSO 1: EXTRAÇÃO DO ID (O mais importante)
                // Regex: Começa com [, espaços opcionais, DÍGITOS, espaços opcionais, ]
                const idMatch = line.match(/^\[\s*(\d+)\s*\]/);
                
                if (!idMatch) return null; // Se não achou ID, ignora a linha (segurança)
                
                const id = idMatch[1]; // O número real (ex: "1", "12")

                // PASSO 2: SEPARAR O CONTEÚDO
                // Remove a parte do ID da string para analisar o resto
                // Ex: "80/tcp ALLOW IN Anywhere"
                const content = line.substring(idMatch[0].length).trim();
                
                // PASSO 3: CLASSIFICAÇÃO (KEYWORD)
                let action = 'UNKNOWN';
                const upperContent = content.toUpperCase();
                
                if (upperContent.includes('ALLOW')) action = 'ALLOW';
                else if (upperContent.includes('DENY')) action = 'DENY';
                else if (upperContent.includes('REJECT')) action = 'DENY';
                else if (upperContent.includes('LIMIT')) action = 'ALLOW';

                // PASSO 4: EXTRAÇÃO DE DADOS (BEST EFFORT)
                const parts = content.split(/\s+/);
                const target = parts[0]; // Porta/App é sempre o primeiro item

                // Tenta achar a origem (tudo depois de IN/OUT)
                let source = 'Anywhere';
                const dirIndex = parts.findIndex(p => p.toUpperCase() === 'IN' || p.toUpperCase() === 'OUT');
                
                if (dirIndex !== -1 && parts[dirIndex + 1]) {
                    source = parts.slice(dirIndex + 1).join(' ');
                } else {
                    // Fallback para linhas estranhas (ex: IPv6)
                    const last = parts[parts.length - 1];
                    if (!['IN', 'OUT', 'ALLOW', 'DENY'].includes(last.toUpperCase())) {
                        source = last;
                    }
                }

                return { id, target, action, source };

            } catch (e) {
                console.error("Erro parsing linha:", line, e);
                return null;
            }
        })
        .filter(x => x !== null);
};

// --- ROTAS ---

router.get('/', async (req, res) => {
    try {
        const raw = await execCmd("sudo ufw status numbered");
        const rules = parseUfw(raw);
        res.json({ rules });
    } catch (e) {
        console.error("Erro UFW Get:", e);
        res.json({ rules: [] });
    }
});

router.post('/add', async (req, res) => {
    const { port, proto, action, priority } = req.body;
    // action: vem 'ALLOW' ou 'DENY' do front
    const act = action.toLowerCase(); 
    
    try {
        // Monta o comando base
        // Ex: sudo ufw allow 80/tcp
        let cmd = `sudo ufw ${act} ${port}/${proto || 'tcp'}`;
        
        // Se for prioridade, INSERE na posição 1 (respeitando a lógica de IDs)
        if (priority) {
            cmd = `sudo ufw insert 1 ${act} ${port}/${proto || 'tcp'}`;
        }

        await execCmd(cmd);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao adicionar" }); }
});

router.post('/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "ID obrigatório" });

    try {
        // O ID aqui vem direto do parseUfw, garantindo que é o ID real do sistema
        await execCmd(`echo "y" | sudo ufw delete ${id}`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro ao deletar" }); }
});

router.post('/promote', async (req, res) => {
    const { id, ruleData } = req.body;
    try {
        // Remove da posição atual
        await execCmd(`echo "y" | sudo ufw delete ${id}`);
        
        // Recria na posição 1
        const act = ruleData.action.toLowerCase();
        let cmd = `sudo ufw insert 1 ${act} ${ruleData.target}`;
        
        // Tratamento simples para origem, se houver
        if (ruleData.source && !ruleData.source.includes('Anywhere')) {
             cmd = `sudo ufw insert 1 ${act} from ${ruleData.source} to any port ${ruleData.target.split('/')[0]}`;
        }
        
        await execCmd(cmd);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: "Erro promote" }); }
});

export default router;
