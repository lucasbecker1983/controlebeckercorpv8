import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

// --- CONFIGURAÇÕES DE ARQUITETURA ---
const TARGET_MOUNT = '/mnt/cftv_storage';
const THRESHOLD_PERCENT = 85; // Gatilho de alerta (85%)
const SAFE_PERCENT = 80;      // Nível alvo após a limpeza (80%)
const CHECK_INTERVAL_MS = 1000 * 60 * 60; // Checa a cada 1 hora

// --- FUNÇÃO DE COLETA DE VOLUMETRIA ---
const getDiskUsage = async (mountPoint: string): Promise<number> => {
    try {
        // Comando df -h extrai o percentual de uso exato do ponto de montagem
        const { stdout } = await execAsync(`df -k ${mountPoint} | tail -1 | awk '{print $5}' | sed 's/%//'`);
        const usage = parseInt(stdout.trim());
        return isNaN(usage) ? 0 : usage;
    } catch (e: any) {
        console.error(`[CFTV RETENTION] Erro ao ler volumetria de ${mountPoint}:`, e.message);
        return 0;
    }
};

// --- FUNÇÃO DE PURGA INTELIGENTE ---
const purgeOldestData = async (targetDir: string) => {
    try {
        console.log(`[CFTV RETENTION] Iniciando protocolo de purga em ${targetDir}...`);
        
        // 1. Lê todos os arquivos/pastas no diretório raiz do CFTV
        if (!fs.existsSync(targetDir)) {
            console.warn(`[CFTV RETENTION] Diretório ${targetDir} inacessível.`);
            return;
        }

        const items = fs.readdirSync(targetDir);
        if (items.length === 0) return;

        // 2. Mapeia e ordena do MAIS ANTIGO para o MAIS NOVO baseado na data de modificação (mtime)
        const stats = items.map(item => {
            const itemPath = path.join(targetDir, item);
            return {
                path: itemPath,
                mtime: fs.statSync(itemPath).mtimeMs
            };
        }).sort((a, b) => a.mtime - b.mtime); // Antigos primeiro (índice 0)

        // 3. Loop de destruição (Apaga um por um, checando o disco a cada iteração)
        for (const item of stats) {
            const currentUsage = await getDiskUsage(TARGET_MOUNT);
            
            if (currentUsage <= SAFE_PERCENT) {
                console.log(`[CFTV RETENTION] Purga concluída. Nível seguro atingido: ${currentUsage}%.`);
                break; // Sai do loop, o disco está a salvo
            }

            console.log(`[CFTV RETENTION] Nível crítico (${currentUsage}%). Purgando artefato obsoleto: ${item.path}`);
            
            // rm -rf garante deleção silenciosa de pastas cheias ou arquivos
            await execAsync(`sudo rm -rf "${item.path}"`);
            
            // Pausa de 2 segundos para dar tempo do I/O do Linux atualizar o comando 'df'
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

    } catch (e: any) {
        console.error(`[CFTV RETENTION] Falha fatal no algoritmo de purga:`, e.message);
    }
};

// --- ENGINE PRINCIPAL (WORKER) ---
export const startCftvRetentionMonitor = () => {
    console.log(`>>> [CFTV SCANNER] Ativo. Monitorando ${TARGET_MOUNT} a cada 1 hora. Threshold: ${THRESHOLD_PERCENT}%.`);

    setInterval(async () => {
        try {
            const usage = await getDiskUsage(TARGET_MOUNT);
            console.log(`[CFTV SCANNER] Relatório de I/O: ${TARGET_MOUNT} está em ${usage}%.`);

            if (usage >= THRESHOLD_PERCENT) {
                console.warn(`[CFTV SCANNER] ALERTA DE SATURAÇÃO! Limite de ${THRESHOLD_PERCENT}% excedido. Acionando purga automática.`);
                await purgeOldestData(TARGET_MOUNT);
            }
        } catch (error) {
            console.error('[CFTV SCANNER] Falha de ciclo:', error);
        }
    }, CHECK_INTERVAL_MS);
    
    // Roda uma verificação imediata ao ligar o servidor
    setTimeout(async () => {
        const usage = await getDiskUsage(TARGET_MOUNT);
        if (usage >= THRESHOLD_PERCENT) {
            console.warn(`[CFTV SCANNER] Saturação detectada no boot (${usage}%). Acionando purga.`);
            await purgeOldestData(TARGET_MOUNT);
        }
    }, 10000); // Aguarda 10s após o boot
};
