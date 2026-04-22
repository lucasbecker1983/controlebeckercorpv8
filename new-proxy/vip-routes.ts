// =============================================================================
// BeckerCorp v8 — vip-routes.ts
// Gerenciamento de IPs VIP (bypass DNS total via Unbound local-zone override)
// =============================================================================
import { Router } from 'express';
import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';

const router = Router();

const pool = new Pool({
    database: 'controlebeckercorp_v8',
    user: 'postgres',
    password: 'becker_admin_secure',
    host: 'localhost',
});

const VIP_CONF = '/etc/unbound/becker/vip-bypass.conf';

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

    const RPZ_FILE = '/etc/unbound/becker/blocked.rpz';
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
    execSync('unbound-control reload');
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
// POST /api/dns/vip — adicionar VIP
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
    const { cidr, descricao, responsavel, motivo } = req.body;
    if (!cidr || !descricao || !responsavel) {
        return res.status(400).json({ error: 'cidr, descricao e responsavel são obrigatórios' });
    }

    // Validar CIDR básico
    const cidrClean = cidr.trim();
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
    if (!ipRegex.test(cidrClean)) {
        return res.status(400).json({ error: 'CIDR inválido. Ex: 192.168.10.40 ou 192.168.10.0/24' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO dns_vip (cidr, descricao, responsavel, motivo)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [cidrClean, descricao.trim(), responsavel.trim(), motivo?.trim() || null]
        );
        await applyVipToRpz();
        res.json({ success: true, vip: rows[0], message: `${cidrClean} adicionado ao bypass` });
    } catch (e: any) {
        if (e.code === '23505') return res.status(409).json({ error: `${cidrClean} já existe na lista VIP` });
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/dns/vip/:id — atualizar VIP (ativar/desativar/editar)
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { descricao, responsavel, motivo, ativo } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE dns_vip SET
                descricao   = COALESCE($1, descricao),
                responsavel = COALESCE($2, responsavel),
                motivo      = COALESCE($3, motivo),
                ativo       = COALESCE($4, ativo)
             WHERE id = $5 RETURNING *`,
            [descricao, responsavel, motivo, ativo, id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'VIP não encontrado' });
        await applyVipToRpz();
        res.json({ success: true, vip: rows[0] });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// DELETE /api/dns/vip/:id — remover VIP
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            `DELETE FROM dns_vip WHERE id = $1 RETURNING cidr`, [id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'VIP não encontrado' });
        await applyVipToRpz();
        res.json({ success: true, message: `${rows[0].cidr} removido do bypass` });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
