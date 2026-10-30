// Texto de governança que acompanha um motivo (base legal, solicitante, alçada...). O backend guarda tudo em um único
// campo de texto; estas funções montam e leem esse formato sem mudar o que já foi gravado.

export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseGovernanceText(value) {
  const raw = String(value || '').trim();
  if (!raw) return { summary: '', metadata: {} };
  const marker = '\n[Governanca]\n';
  const [summaryPart, metaPart] = raw.includes(marker) ? raw.split(marker) : [raw, ''];
  const metadata = {};
  metaPart.split('\n').forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) return;
    metadata[normalizeText(match[1])] = match[2].trim();
  });
  return { summary: summaryPart.trim(), metadata };
}

export function buildGovernanceText(summary, metadata = {}) {
  const cleanedSummary = String(summary || '').trim();
  const entries = Object.entries(metadata)
    .map(([key, value]) => [String(key || '').trim(), String(value || '').trim()])
    .filter(([, value]) => value);
  if (!entries.length) return cleanedSummary;
  const formatted = entries.map(([key, value]) => `${key}: ${value}`).join('\n');
  return `${cleanedSummary}${cleanedSummary ? '\n\n' : ''}[Governanca]\n${formatted}`.trim();
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
}

export function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return 'Manual';
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return 'Expirado';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export const BASE = '/api/bloqueios-liberacoes';
