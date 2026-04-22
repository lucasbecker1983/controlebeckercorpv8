// =============================================================================
// BeckerCorp v8 — whitelist-routes.ts
// Gerencia o arquivo RPZ de domínios permitidos (passthru)
// =============================================================================
import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';

const router = Router();

const WHITELIST_FILE = '/etc/unbound/becker/allowed.rpz';
const WHITELIST_ORIGIN = 'rpz.becker.allowed.';

// Categorias pré-definidas (readonly — só via API de add/remove custom)
const BUILTIN_CATEGORIES: Record<string, string[]> = {
  'Bancos': [
    'bancodobrasil.com.br','bb.com.br','caixa.gov.br','itau.com.br',
    'bradesco.com.br','sicoob.com.br','sicredi.com.br','santander.com.br',
    'banrisul.com.br','inter.co','bancointer.com.br','nubank.com.br',
    'nu.com.br','c6bank.com.br',
  ],
  'Conectividade Social': [
    'conectividade.caixa.gov.br','cnes.caixa.gov.br',
    'canais.caixa.gov.br','fgts.caixa.gov.br',
  ],
  'Gov.br / Federal': [
    'gov.br','fazenda.gov.br','receita.fazenda.gov.br','esocial.gov.br',
    'nfe.fazenda.gov.br','nfce.fazenda.gov.br','sped.fazenda.gov.br',
    'inss.gov.br','previdencia.gov.br','dataprev.gov.br','serpro.gov.br',
    'trt.jus.br','tst.jus.br','stf.jus.br','cnj.jus.br','nfse.gov.br',
  ],
  'Gov.br / Paraná': [
    'pr.gov.br','tce.pr.gov.br','tjpr.jus.br',
  ],
  'Microsoft / Office 365': [
    'microsoft.com','microsoftonline.com','office.com','office365.com',
    'live.com','outlook.com','hotmail.com','sharepoint.com','onedrive.com',
    'azure.com','azureedge.net','windowsupdate.com',
  ],
  'Google Workspace': [
    'google.com','google.com.br','googleapis.com','googleusercontent.com',
    'gstatic.com','gmail.com','googlemail.com',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readWhitelistDomains(): string[] {
  if (!fs.existsSync(WHITELIST_FILE)) return [];
  return fs.readFileSync(WHITELIST_FILE, 'utf8')
    .split('\n')
    .filter(l =>
      l.includes('rpz-passthru') &&
      !l.startsWith('*') &&
      !l.startsWith(';') &&
      !l.startsWith('$') &&
      !l.startsWith('@') &&
      l.trim()
    )
    .map(l => l.split(/\s+/)[0].replace(/\.$/, ''));
}

function appendToWhitelist(domain: string): void {
  const entry = `${domain}          CNAME rpz-passthru.\n*.${domain}        CNAME rpz-passthru.\n`;
  fs.appendFileSync(WHITELIST_FILE, '\n; custom\n' + entry);
}

function removeFromWhitelist(domain: string): void {
  if (!fs.existsSync(WHITELIST_FILE)) return;
  const lines = fs.readFileSync(WHITELIST_FILE, 'utf8').split('\n');
  const filtered = lines.filter(l => {
    const d = l.split(/\s+/)[0].replace(/^\*\./, '').replace(/\.$/, '');
    return d !== domain;
  });
  fs.writeFileSync(WHITELIST_FILE, filtered.join('\n'));
}

function reloadUnbound(): void {
  execSync('unbound-control reload 2>/dev/null');
}

// ---------------------------------------------------------------------------
// GET /api/dns/whitelist
// Retorna domínios custom (não built-in) + categorias com status
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const allDomains = readWhitelistDomains();
    const builtinFlat = Object.values(BUILTIN_CATEGORIES).flat();
    const custom = allDomains.filter(d => !builtinFlat.includes(d));

    const categories = Object.entries(BUILTIN_CATEGORIES).map(([name, domains]) => ({
      name,
      domains,
      count: domains.length,
    }));

    res.json({
      categories,
      custom,
      total: allDomains.length,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/whitelist/add
// Adiciona domínio custom ao allowed.rpz
// ---------------------------------------------------------------------------
router.post('/add', (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain obrigatório' });
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  try {
    const existing = readWhitelistDomains();
    if (existing.includes(d)) return res.status(409).json({ error: `${d} já está na whitelist` });
    appendToWhitelist(d);
    reloadUnbound();
    res.json({ success: true, message: `${d} adicionado à whitelist` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// POST /api/dns/whitelist/remove
// Remove domínio custom do allowed.rpz (não remove built-ins)
// ---------------------------------------------------------------------------
router.post('/remove', (req, res) => {
  const { domain } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain obrigatório' });
  const d = domain.trim().toLowerCase();
  try {
    const builtinFlat = Object.values(BUILTIN_CATEGORIES).flat();
    if (builtinFlat.includes(d)) {
      return res.status(403).json({ error: `${d} é um domínio protegido (built-in). Não pode ser removido pela interface.` });
    }
    removeFromWhitelist(d);
    reloadUnbound();
    res.json({ success: true, message: `${d} removido da whitelist` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
