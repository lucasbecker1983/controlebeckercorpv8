import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

// Lista de diretórios onde a Becker Corp guarda os tesouros (backups)
const BACKUP_DIRS = [
    '/opt/controlebeckercorp-v8/backups',
    '/var/backups/postgres',
    '/var/backups/postgresql',
    '/root/backups',
    path.join(__dirname, '../../backups')
];

// GET /api/backups/download/:filename
router.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // BLINDAGEM SOC: Proteção contra Path Traversal (Hacking)
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(403).json({ error: 'Operação bloqueada por segurança.' });
    }

    let fileFound = false;

    // Vasculha as pastas conhecidas atrás do arquivo solicitado
    for (const dir of BACKUP_DIRS) {
        const filePath = path.join(dir, filename);
        
        if (fs.existsSync(filePath)) {
            fileFound = true;
            // Força o download nativo no navegador (cabeçalho Content-Disposition)
            res.download(filePath, filename, (err) => {
                if (err) {
                    console.error(`[RADAR] Erro ao transferir o backup ${filename}:`, err);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Falha ao transferir o arquivo de backup.' });
                    }
                }
            });
            break; // Achou o arquivo, para a busca
        }
    }

    // Se varreu tudo e não achou
    if (!fileFound) {
        res.status(404).json({ error: 'Arquivo de backup não encontrado no servidor físico.' });
    }
});

export default router;
