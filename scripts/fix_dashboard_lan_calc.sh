#!/bin/bash

# ==============================================================================
#  BECKER CORP V8 - FIX DASHBOARD LAN DOUBLE COUNT
#  Descrição: Corrige gráfico da LAN somando apenas VLANs (evita duplicidade com a física).
# ==============================================================================

BASE_DIR="/opt/controlebeckercorp-v8"
DASH_MOD="$BASE_DIR/backend/src/modules/dashboard"

echo -e "\033[0;34m=== CORRIGINDO CÁLCULO DE TRÁFEGO DA LAN (DASHBOARD) ===\033[0m"

mkdir -p $DASH_MOD

echo -e "\033[1;33m-> Reescrevendo lógica do Dashboard (Soma de VLANs)...\033[0m"

cat <<EOF > $DASH_MOD/routes.ts
import { Router } from 'express';
import * as fs from 'fs';
import { execCmd } from '../../utils/sys';

const router = Router();

// --- ESTADOS VOLÁTEIS (RAM) ---
let lastTime = Date.now();
let lastStats = {
    wan_rx: 0, wan_tx: 0,
    lan_rx: 0, lan_tx: 0
};

// --- LEITURA DE REDE ---
const getTraffic = () => {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf-8');
        const lines = data.split('\\n');
        
        let wan = { rx: 0, tx: 0 };
        let lanSum = { rx: 0, tx: 0 }; // Soma apenas das VLANs

        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10) return;
            
            const iface = parts[0].replace(':', '');
            const rx = parseInt(parts[1]);
            const tx = parseInt(parts[9]);

            // WAN: Interface Física Direta
            if (iface === 'enp8s0') {
                wan.rx = rx;
                wan.tx = tx;
            }

            // LAN: Soma APENAS as VLANs (enp6s0.10, .30, etc)
            // Ignora a física 'enp6s0' para não dobrar o valor
            if (iface.startsWith('enp6s0.')) {
                lanSum.rx += rx;
                lanSum.tx += tx;
            }
        });

        return { wan, lan: lanSum };
    } catch (e) {
        return { wan: { rx: 0, tx: 0 }, lan: { rx: 0, tx: 0 } };
    }
};

// Inicializa na primeira carga
let currentRaw = getTraffic();
lastStats = { 
    wan_rx: currentRaw.wan.rx, wan_tx: currentRaw.wan.tx,
    lan_rx: currentRaw.lan.rx, lan_tx: currentRaw.lan.tx
};

router.get('/network', async (req, res) => {
    try {
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000; // Segundos
        
        // Evita divisão por zero se chamado muito rápido
        if (timeDiff < 0.5) {
            return res.json({ wan: { down: 0, up: 0 }, lan: { down: 0, up: 0 } });
        }

        const curr = getTraffic();

        // Cálculo Mbps: (Delta Bytes * 8 bits) / Segundos / 1e6
        const calc = (currBytes: number, prevBytes: number) => {
            const diff = currBytes - prevBytes;
            return diff > 0 ? ((diff * 8) / timeDiff / 1000000) : 0;
        };

        const metrics = {
            wan: {
                down: calc(curr.wan.rx, lastStats.wan_rx),
                up: calc(curr.wan.tx, lastStats.wan_tx)
            },
            lan: {
                down: calc(curr.lan.rx, lastStats.lan_rx), // Soma das VLANs (Download)
                up: calc(curr.lan.tx, lastStats.lan_tx)     // Soma das VLANs (Upload)
            }
        };

        // Atualiza estado anterior
        lastStats = {
            wan_rx: curr.wan.rx, wan_tx: curr.wan.tx,
            lan_rx: curr.lan.rx, lan_tx: curr.lan.tx
        };
        lastTime = now;

        res.json(metrics);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro leitura rede" });
    }
});

// --- OUTROS DADOS DO DASHBOARD ---
router.get('/stats', async (req, res) => {
    // Mock ou dados reais de contagem
    res.json({
        users: 15,
        devices: 42,
        alerts: 0
    });
});

export default router;
EOF

# 2. RECOMPILAR
echo -e "\033[1;33m-> Recompilando Backend...\033[0m"
cd $BASE_DIR/backend
npm run build

echo -e "\033[1;33m-> Reiniciando Serviço...\033[0m"
pm2 restart bcc-backend

echo -e "\033[0;32m✅ DASHBOARD CORRIGIDO! (LAN = Soma de VLANs)\033[0m"
