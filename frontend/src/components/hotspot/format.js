// Formatações do Hotspot de visitantes.

export function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function formatPhone(value) {
  const rawDigits = String(value || '').replace(/\D/g, '');
  const digits = rawDigits.startsWith('55') && rawDigits.length > 11 ? rawDigits.slice(2, 13) : rawDigits.slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return digits.replace(/^(\d{2})(\d+)/, '($1) $2');
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  return digits.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
}

export function formatMac(value) {
  const hex = String(value || '').replace(/[^0-9a-f]/gi, '').slice(0, 12).toLowerCase();
  return hex.match(/.{1,2}/g)?.join(':') || '';
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatPersonName(value) {
  const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token, index, tokens) => {
      const lower = token.toLocaleLowerCase('pt-BR');
      if (index > 0 && index < tokens.length - 1 && particles.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

export function sessionState(status, expiresAt) {
  if (status === 'revoked') return { label: 'Revogada', tone: 'neutral' };
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return { label: 'Expirada', tone: 'neutral' };
  if (status === 'active') return { label: 'Conectada', tone: 'success' };
  return { label: status || '—', tone: 'neutral' };
}

export const AUTH_METHOD = {
  first_register: 'Primeiro cadastro',
  reactivated_register: 'Recadastro',
  cpf_password: 'CPF e senha',
  mac_auto: 'Reconhecimento automático',
  mac_confirm: 'Retorno confirmado',
  password_recovery: 'Recuperação de senha',
};
export const authMethodLabel = (method) => AUTH_METHOD[method] || method || '—';

export function matchesText(row, query, fields) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('pt-BR');
  if (!normalizedQuery) return true;
  const numericQuery = normalizedQuery.replace(/\D/g, '');
  return fields.some((field) => {
    const value = String(row[field] || '').toLocaleLowerCase('pt-BR');
    if (value.includes(normalizedQuery)) return true;
    return numericQuery && value.replace(/\D/g, '').includes(numericQuery);
  });
}

export const dateTimeBR = (value) => (value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
