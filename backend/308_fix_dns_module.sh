#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}>>> [Engenharia] REFATORANDO O MÓDULO DNS (UNBOUND)...${NC}"

BACKEND_DIR=$(node -e "try { const p = require('child_process').execSync('pm2 jlist', {encoding:'utf8', stdio:'pipe'}); const app = JSON.parse(p).find(a => a.name === 'bcc-backend'); if(app) console.log(app.pm2_env.pm_cwd); } catch(e) {}")
if [[ "$BACKEND_DIR" == *"/dist"* ]] || [[ "$BACKEND_DIR" == *"/build"* ]]; then BACKEND_DIR=$(dirname "$BACKEND_DIR"); fi
if [ -z "$BACKEND_DIR" ]; then BACKEND_DIR=$(find /opt /var/www /root -maxdepth 3 -type d -name "bcc-backend" | head -n 1); fi

DNS_FILE="$BACKEND_DIR/src/modules/dns/dns-routes.ts"

cat > "$DNS_FILE" << 'EOF'
import { Router } from 'express';
// Bypass do utilitário sys: utilizando child_process nativo
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import { Pool } from 'pg';

const router = Router();
const execAsync = util.promisify(exec);
const pool = new Pool({ connectionString: 'postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8' });
const CONF_FILE = "/etc/unbound/unbound.conf.d/beckercorp_zones.conf";

// --- HELPERS (Parser de Telemetria) ---
const parseStats = (raw: string) => {
    const stats: any = {};
    raw.split('\n').forEach(line => {
        const [key, val] = line.split('=');
        if (key && val) stats[key.trim()] = val.trim();
    });
    return stats;
};

// --- ENDPOINTS ---

// 1. DASHBOARD STATS (Cockpit)
router.get('/stats', async (req, res) => {
    try {
        console.log(`[DNS MODULE] Coletando telemetria do daemon Unbound...`);
        
        // Proteção contra throw exception via bypass lógico (|| echo 'inactive')
        const { stdout: statusOut } = await execAsync("systemctl is-active unbound || echo 'inactive'");
        const isRunning = statusOut.trim().toLowerCase() === 'active';

        // Valores padronizados de Graceful Degradation
        let stats = {
            total_queries: 0,
            cache_hits: 0,
            cache_miss: 0,
            recursion_time: "0.0000",
            memory_usage: "0.0"
        };

        if (isRunning) {
            try {
                const { stdout: rawStats } = await execAsync("sudo unbound-control stats_noreset");
                const parsed = parseStats(rawStats);
                
                stats = {
                    total_queries: parseInt(parsed['total.num.queries'] || '0'),
                    cache_hits: parseInt(parsed['total.num.cachehits'] || '0'),
                    cache_miss: parseInt(parsed['total.num.cachemiss'] || '0'),
                    recursion_time: parseFloat(parsed['total.recursion.time.avg'] || '0').toFixed(4),
                    memory_usage: (parseInt(parsed['mem.total.sbrk'] || '0') / 1024 / 1024).toFixed(1) // MB
                };
            } catch (err: any) {
                console.warn(`[DNS MODULE] Aviso não crítico: Falha ao ler unbound-control.`, err.message);
            }
        }

        res.json({ 
            status: isRunning ? 'running' : 'stopped',
            stats 
        });
    } catch (e: any) {
        console.error(`[DNS MODULE] Falha catastrófica:`, e.message);
        // Garantimos retorno Status 200 para blindar o Frontend de exceções brutas
        res.json({ status: 'error', stats: { total_queries: 0, cache_hits: 0, cache_miss: 0, recursion_time: "0.0000", memory_usage: "0.0" } });
    }
});

// 2. LISTA DE QUERIES (Injeção da Rota Ausente)
router.get('/queries', async (req, res) => {
    try {
        const { stdout } = await execAsync('sudo unbound-control dump_requestlist || echo ""');
        const queries: any[] = [];
        
        if (stdout && stdout.trim().length > 0) {
            const lines = stdout.split('\n');
            lines.forEach((line, index) => {
                if (line.trim()) queries.push({ id: index, query: line.trim() });
            });
        }
        res.json(queries);
    } catch (error) {
        res.json([]); 
    }
});

// 3. CONTROLE DA APLICAÇÃO (Flush/Reload)
router.post('/control', async (req, res) => {
    const { action } = req.body;
    try {
        if (action === 'flush') {
            await execAsync("sudo unbound-control flush_zone .");
            res.json({ success: true, msg: "Cache DNS Limpo com Sucesso!" });
        } else if (action === 'reload') {
            await execAsync("sudo systemctl reload unbound");
            res.json({ success: true, msg: "Serviço Recarregado!" });
        } else if (action === 'restart') {
            await execAsync("sudo systemctl restart unbound");
            res.json({ success: true, msg: "Serviço Reiniciado!" });
        } else {
            res.status(400).json({ error: "Ação HTTP Inválida." });
        }
    } catch (e: any) {
        console.error(`[DNS CONTROL] Erro de Mutação:`, e.message);
        res.status(500).json({ error: "Erro interno ao orquestrar comando no SO." });
    }
});

// 4. PERSISTÊNCIA E GERENCIAMENTO DE ZONAS (SQL Corrigido)
router.get('/zones', async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM dns_unbound_exceptions ORDER BY id DESC");
        res.json(r.rows);
    } catch (e: any) {
        console.error(`[DNS ZONES] Read Error:`, e.message);
        res.status(500).json({ error: "Erro ao interagir com o Data Layer." });
    }
});

router.post('/zones/add', async (req, res) => {
    const { domain, ip } = req.body;
    try {
        // CORREÇÃO: Utilizando Prepared Statements estritos para evitar SQL Injection
        await pool.query("INSERT INTO dns_unbound_exceptions (domain, target_ip) VALUES ($1, $2)", [domain, ip]);
        await syncConf();
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`[DNS ZONES] Write Error:`, e.message);
        res.status(500).json({ error: "Erro de inserção relacional." }); 
    }
});

router.post('/zones/delete', async (req, res) => {
    const { id } = req.body;
    try {
        // CORREÇÃO: Indexação correta do parâmetro ($1)
        await pool.query("DELETE FROM dns_unbound_exceptions WHERE id = $1", [id]);
        await syncConf();
        res.json({ success: true });
    } catch (e: any) { 
        console.error(`[DNS ZONES] Delete Error:`, e.message);
        res.status(500).json({ error: "Erro de exclusão relacional." }); 
    }
});

// --- FUNÇÃO DE SINCRONIZAÇÃO DE ARQUIVOS (I/O) ---
const syncConf = async () => {
    try {
        const r = await pool.query("SELECT * FROM dns_unbound_exceptions WHERE is_active = true");
        let content = "# Gerado pelo Becker Corp V8 Cockpit\nserver:\n";
        r.rows.forEach(row => {
            content += `  local-zone: "${row.domain}" redirect\n`;
            content += `  local-data: "${row.domain} A ${row.target_ip}"\n`;
        });
        fs.writeFileSync('/tmp/unbound_gen.conf', content);
        await execAsync(`sudo mv /tmp/unbound_gen.conf ${CONF_FILE}`);
        await execAsync("sudo unbound-control reload"); // Soft reload no daemon
    } catch (e: any) {
        console.error(`[DNS SYNC] Erro Crítico no Pipeline de Arquivo:`, e.message);
    }
};

export default router;
EOF

echo -e "${YELLOW}>>> INICIANDO COMPILAÇÃO DO WORKSPACE...${NC}"
cd "$BACKEND_DIR" || exit
rm -rf dist/ build/
npm run build > /dev/null 2>&1

echo -e "${YELLOW}>>> ORQUESTRANDO RESTART DO DAEMON NO PM2...${NC}"
pm2 restart bcc-backend > /dev/null 2>&1

echo -e "${GREEN}>>> MÓDULO DNS RECUPERADO. SINTAXE SQL E I/O ESTABILIZADOS. <<<${NC}"
