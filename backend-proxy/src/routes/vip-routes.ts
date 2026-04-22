// =============================================================================
// BeckerCorp v8 — vip-routes.ts
// Gerenciamento de IPs VIP (bypass DNS total via Unbound local-zone override)
// =============================================================================
import { Router } from 'express';
import fs from 'fs';
import { pool } from '../config/db';
import { execCmd } from '../utils/sys';
import { env } from '../config/env';

const router = Router();
const VIP_CONF = env.vipConf;
const policyWriteMoved = (_req: any, res: any) => res.status(410).json({
    error: 'Operação movida para Bloqueios & Liberações.',
    owner: 'bloqueios-liberacoes',
});

// Regenera o arquivo de config do Unbound com todos os VIPs ativos
async function regenUnboundVip(): Promise<void> {
    const { rows } = await pool.query(
        `SELECT cidr FROM dns_vip WHERE ativo = TRUE ORDER BY cidr`
    );

    // Para VIPs, usamos "access-control-tag" não é suficiente no Unbound livre.
    // A abordagem correta: criar uma view separada por IP que ignora RPZ.
    // Como alternativa simples e funcional: injetar os IPs como acl "rebind-override"
    // e usar local-zone passthrough para os IPs do cliente — isso não existe no Unbound.
    //
    // SOLUÇÃO REAL: usar "rpz-client-ip" no arquivo RPZ para PASSTHROUGH de IPs VIP.
    // Formato no blocked.rpz:
    //   32.40.10.168.192.rpz-client-ip   CNAME rpz-passthru.
    //   (endereço invertido por octeto + prefixo /32 para IP único)
    //   Ou para range /24:
    //   24.0.0.168.192.rpz-client-ip     CNAME rpz-passthru.

    let lines = [
        '; BeckerCorp VIP Bypass — gerado automaticamente',
        '; NÃO EDITAR MANUALMENTE',
        '',
    ];

    for (const row of rows) {
        const cidr = row.cidr;
        const rpzEntry = cidrToRpzClientIp(cidr);
        if (rpzEntry) lines.push(rpzEntry);
    }

    fs.writeFileSync(VIP_CONF, lines.join('\n') + '\n');
}

// Converte CIDR para entrada RPZ client-ip
// Ex: 192.168.10.40    → 32.40.10.168.192.rpz-client-ip  CNAME rpz-passthru.
// Ex: 192.168.10.0/24  → 24.0.10.168.192.rpz-client-ip   CNAME rpz-passthru.
function cidrToRpzClientIp(cidr: string): string | null {
    try {
        let ip: string, prefix: number;
        if (cidr.includes('/')) {
            [ip, prefix as any] = cidr.split('/');
            prefix = parseInt(cidr.split('/')[1]);
        } else {
            ip = cidr;
            prefix = 32;
        }
        const parts = ip.split('.').reverse().join('.');
        return `${prefix}.${parts}.rpz-client-ip  CNAME rpz-passthru.`;
    } catch { return null; }
}

// Injeta as entradas VIP no arquivo RPZ principal e recarrega Unbound
async function applyVipToRpz(): Promise<void> {
    await regenUnboundVip();

    const RPZ_FILE = env.blockedRpzFile;
    let content = fs.readFileSync(RPZ_FILE, 'utf8');

    // Remover bloco VIP anterior
    content = content.replace(/; === VIP BYPASS[\s\S]*?; === FIM VIP BYPASS\n?/g, '');

    // Ler VIPs
    const { rows } = await pool.query(
        `SELECT cidr, descricao FROM dns_vip WHERE ativo = TRUE ORDER BY cidr`
    );

    if (rows.length > 0) {
        const vipBlock = [
            '',
            '; === VIP BYPASS ===',
            ...rows.map(r => {
                const entry = cidrToRpzClientIp(r.cidr);
                return `; ${r.descricao}\n${entry}`;
            }),
            '; === FIM VIP BYPASS',
            '',
        ].join('\n');
        content += vipBlock;
    }

    fs.writeFileSync(RPZ_FILE, content);
    await execCmd('unbound-control reload');
}

// ---------------------------------------------------------------------------
// GET /api/dns/vip — listar todos os VIPs
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM dns_vip ORDER BY ativo DESC, descricao ASC`
        );
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/vip — legado bloqueado: operação movida para Bloqueios & Liberações
// ---------------------------------------------------------------------------
router.post('/', policyWriteMoved);

// ---------------------------------------------------------------------------
// PATCH /api/dns/vip/:id — legado bloqueado: operação movida para Bloqueios & Liberações
// ---------------------------------------------------------------------------
router.patch('/:id', policyWriteMoved);

// ---------------------------------------------------------------------------
// DELETE /api/dns/vip/:id — legado bloqueado: operação movida para Bloqueios & Liberações
// ---------------------------------------------------------------------------
router.delete('/:id', policyWriteMoved);

export default router;
