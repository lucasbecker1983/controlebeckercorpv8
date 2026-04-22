const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Configuração de Saída
const OUTPUT_DIR = '/opt/controlebeckercorp-v8/public'; // Salva onde o Nginx possa servir (opcional)
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'DOCUMENTACAO_TECNICA_V8.pdf');

// Inicializa PDF
const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream(OUTPUT_FILE));

// --- HELPERS ---
function addTitle(text) {
    doc.addPage();
    doc.fontSize(20).text(text, { underline: true }).moveDown();
}

function addSection(title, content) {
    doc.fontSize(14).fillColor('black').text(title, { bold: true }).moveDown(0.5);
    doc.fontSize(10).fillColor('#444').text(content).moveDown();
}

function addCodeFile(filePath, description) {
    try {
        doc.fontSize(12).fillColor('#000').text(`Arquivo: ${path.basename(filePath)}`, { bold: true });
        if(description) doc.fontSize(10).fillColor('#666').text(description).moveDown(0.5);
        
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');
            // Limpeza básica para não quebrar o PDF com caracteres estranhos
            content = content.replace(/[^\x20-\x7E\n\r\t]/g, '');
            
            doc.fontSize(8).font('Courier').fillColor('#333').text(content, {
                indent: 20,
                width: 500,
                align: 'left'
            });
        } else {
            doc.fontSize(10).fillColor('red').text(`[ARQUIVO NÃO ENCONTRADO: ${filePath}]`);
        }
        doc.moveDown();
    } catch (e) {
        doc.fontSize(10).fillColor('red').text(`[ERRO AO LER: ${filePath}]`);
    }
}

// --- CONTEÚDO DA DOCUMENTAÇÃO ---

// Capa
doc.fontSize(30).text('BECKER CORP V8', { align: 'center' });
doc.fontSize(20).text('DOCUMENTAÇÃO TÉCNICA DO SISTEMA', { align: 'center' });
doc.moveDown();
doc.fontSize(12).text(`Gerado em: ${new Date().toLocaleString()}`, { align: 'center' });
doc.moveDown(2);
doc.fontSize(12).text('Abrangência: Backend, Frontend, Proxy, Banco de Dados e Scripts.', { align: 'center' });

// 1. Backend Principal
addTitle('1. BACKEND PRINCIPAL (API Core - Porta 6778)');
addCodeFile('/opt/controlebeckercorp-v8/backend/src/server.ts', 'Entry Point: Servidor Express e Rotas Principais');
addCodeFile('/opt/controlebeckercorp-v8/backend/src/modules/proxy/routes.ts', 'Módulo Proxy (Rotas Antigas/Compatibilidade)');
addCodeFile('/opt/controlebeckercorp-v8/backend/src/modules/control/monitor.ts', 'IA Sentinela: Lógica de Monitoramento');

// 2. Backend Proxy (Microsserviço)
addTitle('2. MICROSSERVIÇO PROXY (Engine - Porta 6779)');
addCodeFile('/opt/controlebeckercorp-v8/backend-proxy/src/server.ts', 'Servidor Dedicado ao Squid e Logs em Tempo Real');
addCodeFile('/opt/controlebeckercorp-v8/backend-proxy/src/routes/proxy-routes.ts', 'Rotas Renomeadas (Proxy Routes)');
addCodeFile('/opt/controlebeckercorp-v8/backend-proxy/src/ingester.ts', 'Robô Ingestor de Logs (Tail -> Postgres)');

// 3. Frontend
addTitle('3. FRONTEND (React V8)');
addCodeFile('/opt/controlebeckercorp-v8/frontend/src/pages/Proxy.jsx', 'Interface de Gestão do Proxy');
addCodeFile('/opt/controlebeckercorp-v8/frontend/src/pages/Control.jsx', 'Painel de Controle e Botão de Pânico');

// 4. Scripts de Automação
addTitle('4. SCRIPTS DE INFRAESTRUTURA');
addCodeFile('/opt/controlebeckercorp-v8/legacy-quarantine/scripts/panic_on.sh', 'Protocolo Pânico Legado (Quarentena)');
addCodeFile('/opt/controlebeckercorp-v8/legacy-quarantine/scripts/panic_off.sh', 'Protocolo Pânico Legado (Quarentena)');

// Finaliza
doc.end();
console.log(`>>> PDF Gerado com sucesso em: ${OUTPUT_FILE}`);
