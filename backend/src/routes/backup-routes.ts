import { Router } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();
const BACKUP_DIR = '/opt/controlebeckercorp-v8/backups';

// Controlador Mestre de Downloads
const handleDownload = (req, res) => {
    try {
        // Captura o nome do arquivo venha de onde vier (URL, Body JSON ou Query Param)
        const reqFilename = req.params.filename || req.body.filename || req.body.file || req.body.name || req.query.file;
        
        if (!reqFilename) {
            return res.status(400).json({ error: 'Nome do arquivo não especificado na requisição.' });
        }

        // Blindagem contra ataques de Path Traversal
        if (reqFilename.includes('..') || reqFilename.includes('/')) {
            return res.status(403).json({ error: 'Acesso bloqueado pela camada de segurança.' });
        }

        console.log(`[DOWNLOAD] Requisição interceptada para: ${reqFilename} (Método: ${req.method})`);

        // 1. Tenta o arquivo exato primeiro
        const exactPath = path.join(BACKUP_DIR, reqFilename);
        if (fs.existsSync(exactPath)) {
            console.log(`[DOWNLOAD] Arquivo exato localizado. Iniciando stream.`);
            return res.download(exactPath, reqFilename);
        }

        // 2. Mágica de Tradução (Se pediu .sql.gz, entrega o .tar.gz do mesmo dia)
        const dateMatch = reqFilename.match(/_(\d{4})(\d{2})(\d{2})_/);
        if (dateMatch) {
            const searchPrefix = `becker_v8_full_${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
            
            if (fs.existsSync(BACKUP_DIR)) {
                const files = fs.readdirSync(BACKUP_DIR);
                const dayFiles = files.filter(f => f.startsWith(searchPrefix) && f.endsWith('.tar.gz'));

                if (dayFiles.length > 0) {
                    // Ordena pela data de criação no Linux (do mais novo pro mais velho)
                    dayFiles.sort((a, b) => fs.statSync(path.join(BACKUP_DIR, b)).mtimeMs - fs.statSync(path.join(BACKUP_DIR, a)).mtimeMs);
                    
                    const bestFile = dayFiles[0];
                    const targetPath = path.join(BACKUP_DIR, bestFile);
                    
                    console.log(`[DOWNLOAD] Tradução concluída. Enviando arquivo real: ${bestFile}`);
                    return res.download(targetPath, bestFile);
                }
            }
        }

        console.log(`[DOWNLOAD] Falha: Nenhum arquivo no disco corresponde a esta data.`);
        return res.status(404).json({ error: 'Arquivo de backup não encontrado no servidor.' });

    } catch (error) {
        console.error(`[DOWNLOAD] Erro interno no pipeline:`, error);
        return res.status(500).json({ error: 'Erro crítico no processamento do download.' });
    }
};

// Amarramos todas as portas de entrada possíveis para a mesma função
router.get('/download/:filename', handleDownload);
router.get('/download', handleDownload);
router.post('/download', handleDownload);
router.post('/download/:filename', handleDownload);

export default router;
