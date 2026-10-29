import { api } from '../../services/api';

/*
 * Utilitários do módulo Políticas de Acesso (motor de bloqueios em /api/bloqueios-liberacoes).
 */

const BASE = '/api/bloqueios-liberacoes';
export const brGet = (path) => api.get(`${BASE}/${path}`).then((r) => r.data);
export const brSend = (method, path, body) => api.request({ method, url: `${BASE}/${path}`, data: body }).then((r) => r.data);

// Recompila as regras e recarrega DNS e firewall. Leva de alguns segundos a 1 minuto.
export const applyRules = (body) => brSend('post', 'apply', body);

export const VLAN_NAMES = { 10: 'Secretaria', 30: 'Celulares', 40: 'Câmeras', 50: 'SINE', 70: 'Visitantes', 80: 'VoIP', 99: 'Infraestrutura' };
export const vlanName = (id, fallback) => VLAN_NAMES[Number(id)] || fallback || `VLAN ${id}`;

export function VlanChip({ id, label, muted = false, small = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 ${small ? 'py-0 text-[11px]' : 'py-0.5 text-[11.5px]'} font-semibold ${muted ? 'border-outline text-on-surface/40' : 'border-outline text-on-surface/75'}`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: `var(--vlan-${id}, var(--md-outline))`, opacity: muted ? 0.4 : 1 }} />
      {label ?? `VLAN ${id}`}
    </span>
  );
}

// Pornografia nunca pode ser liberada (mesma trava do backend).
export const mentionsPornography = (...values) => /porn|xxx|sexo|adult|nsfw|hentai/i.test(values.flat().join(' '));

export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
export const addMonthsISO = (months, from = todayISO()) => {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
export const daysUntil = (iso) => {
  if (!iso) return null;
  const target = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${todayISO()}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86400000);
};
export const dateBR = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR') : '—');
export const timeBR = (value) => (value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

export const remaining = (expiresAt, now = Date.now()) => {
  const ms = new Date(expiresAt).getTime() - now;
  if (!(ms > 0)) return 'expirada';
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
export const MAC = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
export const normMac = (value) => String(value || '').trim().toUpperCase().replace(/-/g, ':');

// MAC privado/aleatório (bit "administrado localmente" ligado): celulares novos usam e ele pode mudar.
export const isPrivateMac = (value) => {
  const first = parseInt(normMac(value).slice(0, 2), 16);
  return Number.isFinite(first) && (first & 0x02) === 0x02;
};
