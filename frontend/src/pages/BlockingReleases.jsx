import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  Cpu,
  Database,
  Download,
  EyeOff,
  Filter,
  Flame,
  Globe2,
  Layers3,
  Zap,
  Timer,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Power,
  RefreshCcw,
  RotateCcw,
  ScanSearch,
  ScrollText,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Waypoints,
  Wifi,
} from 'lucide-react';
import { authFetch } from '../services/authFetch';
import {
  ActionButton,
  cx,
  DataToolbar,
  DialogShell,
  EmptyStateBlock,
  HintTooltip,
  InlineStat,
  ListRow,
  MetricCard,
  ModuleHero,
  MiniTrendList,
  QuickActionBar,
  SegmentedTabs,
  SectionCard,
  StateBadge,
  ThemeAwareSurface,
  VipImpactBadge,
} from '../components/blocking/BlockingUi';

const API = '';
const googleFontStyle = {
  fontFamily: '"Google Sans Text", "Google Sans", "Roboto", "Helvetica Neue", Arial, sans-serif',
};

const TABS = [
  { key: 'overview', label: 'Painel Executivo', icon: ShieldCheck },
  { key: 'policies', label: 'Políticas & Escopos', icon: Layers3 },
  { key: 'vlans', label: 'Escopos de Rede', icon: Network },
  { key: 'vips', label: 'Exceções VIP', icon: ShieldAlert },
  { key: 'sporadic', label: 'Exceções Esporádicas', icon: Zap },
  { key: 'observability', label: 'Observabilidade', icon: Wifi },
  { key: 'engine', label: 'Motor de Controle', icon: Cpu },
  { key: 'contingency', label: 'Contingência DNS', icon: Flame },
  { key: 'metrics', label: 'Telemetria', icon: Activity },
  { key: 'ignored', label: 'Domínios Ignorados', icon: EyeOff },
];

const MODE_LABELS = {
  'acl-only': 'ACL',
  'acl-plus-dns': 'ACL + DNS',
  'intercept-selective': 'Interceptação Seletiva',
};

const MANAGED_VLAN_IDS = [10, 30, 50, 70];
const FALLBACK_INTERNAL_DNS_BY_VLAN = {
  10: '192.168.10.1',
  30: '192.168.30.1',
  50: '192.168.50.1',
  70: '192.168.70.1',
};

const CONTINGENCY_PROVIDERS = [
  { key: 'google', label: 'Google DNS' },
  { key: 'cloudflare', label: 'Cloudflare' },
  { key: 'quad9', label: 'Quad9' },
];

// ── DnsIgnoredTab ─────────────────────────────────────────────────────────────

const MATCH_TYPE_LABELS = {
  exact: 'Exato',
  contains: 'Contém',
  suffix: 'Sufixo',
  prefix: 'Prefixo',
};

const MATCH_TYPE_EXAMPLES = {
  exact: 'ex: neverssl.com',
  contains: 'ex: vlan (ignora tudo com "vlan")',
  suffix: 'ex: .local (ignora *.local)',
  prefix: 'ex: api- (ignora api-*)',
};

function DnsIgnoredTab() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [form, setForm] = useState({ pattern: '', match_type: 'contains', reason: '' });
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/dns/ignored');
      const json = await res.json();
      setPatterns(json.patterns || []);
    } catch {
      setError('Falha ao carregar padrões.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.pattern.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await authFetch('/api/dns/ignored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      setForm({ pattern: '', match_type: 'contains', reason: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Erro ao adicionar padrão.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id) => {
    try {
      await authFetch(`/api/dns/ignored/${id}/toggle`, { method: 'PATCH' });
      await load();
    } catch {
      setError('Falha ao alternar padrão.');
    }
  };

  const remove = async (id) => {
    setRemoving(id);
    try {
      await authFetch(`/api/dns/ignored/${id}`, { method: 'DELETE' });
      await load();
    } catch {
      setError('Falha ao remover padrão.');
    } finally {
      setRemoving(null);
    }
  };

  const active = patterns.filter((p) => p.active);
  const inactive = patterns.filter((p) => !p.active);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Novo padrão ignorado"
        subtitle="Domínios que corresponderem serão excluídos do radar, métricas e relatórios de acesso."
      >
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-on-surface/50">Padrão</label>
            <input
              type="text"
              value={form.pattern}
              onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value.toLowerCase() }))}
              placeholder={MATCH_TYPE_EXAMPLES[form.match_type]}
              required
              className="h-10 w-full rounded-xl border border-outline/20 bg-surface-high/60 px-3 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-on-surface/50">Tipo</label>
            <select
              value={form.match_type}
              onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value }))}
              className="h-10 rounded-xl border border-outline/20 bg-surface-high/60 px-3 text-sm text-on-surface outline-none focus:border-primary/40"
            >
              {Object.entries(MATCH_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-on-surface/50">Motivo (opcional)</label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Descreva brevemente o motivo"
              className="h-10 w-full rounded-xl border border-outline/20 bg-surface-high/60 px-3 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex items-end">
            <ActionButton tone="primary" icon={Plus} type="submit" disabled={saving || !form.pattern.trim()}>
              {saving ? 'Adicionando...' : 'Adicionar'}
            </ActionButton>
          </div>
        </form>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </SectionCard>

      <SectionCard
        title={`Padrões ativos — ${active.length}`}
        subtitle="Consultas DNS que correspondem a qualquer padrão abaixo são filtradas automaticamente."
        actions={<ActionButton tone="ghost" icon={RefreshCcw} onClick={load} disabled={loading}>Atualizar</ActionButton>}
      >
        {loading ? (
          <div className="py-8 text-center text-sm text-on-surface/40">Carregando...</div>
        ) : active.length === 0 ? (
          <EmptyStateBlock icon={EyeOff} title="Nenhum padrão ativo" description="Adicione padrões acima para suprimir ruído de hardware dos relatórios." />
        ) : (
          <div className="divide-y divide-outline/10">
            {active.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary">{MATCH_TYPE_LABELS[p.match_type] || p.match_type}</span>
                <span className="flex-1 font-mono text-sm text-on-surface">{p.pattern}</span>
                {p.reason && <span className="hidden text-xs text-on-surface/45 sm:block">{p.reason}</span>}
                <button
                  onClick={() => toggle(p.id)}
                  title="Desativar temporariamente"
                  className="rounded-lg p-1.5 text-on-surface/40 transition hover:bg-warning/10 hover:text-warning"
                ><Power size={14} /></button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={removing === p.id}
                  title="Remover permanentemente"
                  className="rounded-lg p-1.5 text-on-surface/40 transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {inactive.length > 0 && (
        <SectionCard title={`Padrões desativados — ${inactive.length}`} subtitle="Clique em ativar para reativar o filtro.">
          <div className="divide-y divide-outline/10">
            {inactive.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-3 opacity-50">
                <span className="rounded-lg border border-outline/20 px-2 py-0.5 text-[10px] font-black uppercase text-on-surface/40">{MATCH_TYPE_LABELS[p.match_type] || p.match_type}</span>
                <span className="flex-1 font-mono text-sm text-on-surface/50 line-through">{p.pattern}</span>
                {p.reason && <span className="hidden text-xs text-on-surface/35 sm:block">{p.reason}</span>}
                <button
                  onClick={() => toggle(p.id)}
                  title="Reativar padrão"
                  className="rounded-lg p-1.5 text-on-surface/40 transition hover:bg-success/10 hover:text-success"
                ><Power size={14} /></button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={removing === p.id}
                  title="Remover permanentemente"
                  className="rounded-lg p-1.5 text-on-surface/40 transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

const VIP_RUNTIME_BADGES = [
  { label: 'VIP real', tone: 'primary' },
  { label: 'Firewall livre', tone: 'success' },
  { label: 'Unbound recursivo liberado', tone: 'success' },
  { label: 'RPZ passthrough', tone: 'warning' },
  { label: 'Sem proxy', tone: 'neutral' },
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
}

function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return 'Manual';
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return 'Expirado';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function toSubnetGateway(subnetCidr) {
  const match = String(subnetCidr || '').trim().match(/^(\d+\.\d+\.\d+)\.0\/\d+$/);
  return match ? `${match[1]}.1` : '—';
}

function vlanIsInStandard(vlan) {
  return Boolean(vlan && vlan.blocking_enabled !== false && vlan.monitoring_enabled !== false && vlan.exempt !== true);
}

function isHealthyState(value) {
  return ['active', 'healthy', 'ok', 'enabled', 'present'].some((token) => String(value || '').toLowerCase().includes(token));
}

function toneFromStatus(value) {
  if (isHealthyState(value)) return 'success';
  if (String(value || '').toLowerCase().includes('warn')) return 'warning';
  if (String(value || '').toLowerCase().includes('degrad') || String(value || '').toLowerCase().includes('fail')) return 'danger';
  return 'neutral';
}

function policyAppliesToScope(policy, scopeType, scopeValue) {
  if (!policy?.enabled) return false;
  if (scopeType === 'global') return policy.scope_type === 'global';
  if (policy.scope_type === 'global') return true;
  return (policy.vlan_ids || []).map(Number).includes(Number(scopeValue));
}

function policyScopeBadge(policy) {
  if (policy.scope_type === 'global') return 'Global';
  const vlans = (policy.vlan_ids || []).filter((value) => Number.isFinite(Number(value)));
  return vlans.length ? `VLAN ${vlans.join(', ')}` : 'VLAN sem seleção';
}

function policyTypeLabel(type) {
  return type === 'allow' ? 'Liberar' : 'Bloquear';
}

function policyTypeTone(type) {
  return type === 'allow' ? 'success' : 'danger';
}

function actionTone(action) {
  if (action === 'blocked') return 'danger';
  if (action === 'allowed') return 'success';
  if (action === 'bypassed') return 'warning';
  return 'neutral';
}

function actionLabel(action) {
  if (action === 'blocked') return 'Block';
  if (action === 'allowed') return 'Pass';
  if (action === 'bypassed') return 'Bypass';
  return action || '—';
}

function governanceStatusTone(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('aprov') || normalized.includes('vigor')) return 'success';
  if (normalized.includes('analise') || normalized.includes('revis')) return 'warning';
  if (normalized.includes('revog') || normalized.includes('expir')) return 'danger';
  return 'neutral';
}

function splitDomains(value) {
  return Array.from(new Set(String(value || '')
    .split(/[\n,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)));
}

function parseGovernanceText(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return {
      summary: '',
      metadata: {},
    };
  }

  const marker = '\n[Governanca]\n';
  const [summaryPart, metaPart] = raw.includes(marker)
    ? raw.split(marker)
    : [raw, ''];

  const metadata = {};
  metaPart.split('\n').forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) return;
    const key = normalizeText(match[1]);
    metadata[key] = match[2].trim();
  });

  return {
    summary: summaryPart.trim(),
    metadata,
  };
}

function buildGovernanceText(summary, metadata = {}) {
  const cleanedSummary = String(summary || '').trim();
  const entries = Object.entries(metadata)
    .map(([key, value]) => [String(key || '').trim(), String(value || '').trim()])
    .filter(([, value]) => value);

  if (!entries.length) return cleanedSummary;

  const formattedMetadata = entries
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  return `${cleanedSummary}${cleanedSummary ? '\n\n' : ''}[Governanca]\n${formattedMetadata}`.trim();
}

function toDateInputValue(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toDateTimeInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - (offset * 60 * 1000));
  return local.toISOString().slice(0, 16);
}

function governanceFromRecord(record, sourceText = '') {
  const parsed = parseGovernanceText(sourceText);
  return {
    summary: record?.governance_summary || parsed.summary || '',
    legal_basis: record?.legal_basis || parsed.metadata.baselegal || '',
    requested_by: record?.requested_by || parsed.metadata.solicitante || '',
    approval_scope: record?.approval_scope || parsed.metadata.alcadadeaprovacao || '',
    lifecycle_status: record?.lifecycle_status || parsed.metadata.statusinstitucional || '',
    review_date: toDateInputValue(record?.review_date || parsed.metadata.revisaoprevista || ''),
    approved_by: record?.approved_by || '',
    approved_at: toDateTimeInputValue(record?.approved_at || ''),
    effective_from: toDateTimeInputValue(record?.effective_from || ''),
    expires_at: toDateTimeInputValue(record?.expires_at || record?.valid_until || ''),
    revoked_by: record?.revoked_by || '',
    revoked_at: toDateTimeInputValue(record?.revoked_at || ''),
  };
}

function TextInput({ value, onChange, placeholder, className = '', type = 'text', ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      {...props}
      className={`min-h-[var(--control-height)] w-full rounded-2xl border border-outline/16 bg-surface/80 px-4 py-2.5 text-sm text-on-surface outline-none transition focus:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-container ${className}`}
    />
  );
}

function SelectInput({ value, onChange, children, className = '', ...props }) {
  return (
    <select
      value={value}
      onChange={onChange}
      {...props}
      className={`min-h-[var(--control-height)] w-full rounded-2xl border border-outline/16 bg-surface/80 px-4 py-2.5 text-sm text-on-surface outline-none transition focus:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-container ${className}`}
    >
      {children}
    </select>
  );
}

function TextArea({ value, onChange, rows = 4, placeholder, ...props }) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      {...props}
      className="w-full rounded-[var(--surface-radius)] border border-outline/16 bg-surface/80 px-4 py-3.5 text-sm text-on-surface outline-none transition focus:border-primary/30 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-container"
    />
  );
}

function summarizeVlanStatus(vlan) {
  if (!vlan.inStandard) return 'Fora do padrão do módulo';
  if (vlan.blocking_enabled && vlan.monitoring_enabled) return 'Monitoramento e bloqueio ativos';
  if (vlan.monitoring_enabled && !vlan.blocking_enabled) return 'Monitoramento ativo, bloqueio reduzido';
  if (!vlan.monitoring_enabled && vlan.blocking_enabled) return 'Bloqueio ativo, monitoramento reduzido';
  return 'Operação reduzida';
}

function summarizeVlanControls(vlan) {
  if (!vlan.inStandard) return 'Sem monitoramento e sem enforcement';
  const items = [];
  items.push(vlan.monitoring_enabled ? 'Monitora' : 'Sem monitoramento');
  items.push(vlan.blocking_enabled ? 'Bloqueia' : 'Sem bloqueio');
  if (vlan.exempt) items.push('Em exceção');
  return items.join(' • ');
}

function shortVlanDescription(vlan) {
  return vlan.notes?.trim() || (vlan.inStandard ? 'Escopo operacional configurado para esta rede.' : 'Rede cadastrada sem participar do padrão operacional.');
}

function VlanOverflowMenu({ vlan, onEditVlan, onViewVips, onToggleStandard, onDelete }) {
  const canDelete = !String(vlan.id).startsWith('virtual-');

  return (
    <details className="group relative">
      <summary className="flex h-[var(--control-height)] w-[var(--control-height)] cursor-pointer list-none items-center justify-center rounded-full border border-outline/12 bg-surface-high/72 text-on-surface/68 transition hover:border-primary/18 hover:text-primary">
        <MoreHorizontal size={16} />
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-52 rounded-[calc(var(--surface-radius)-2px)] border border-outline/12 bg-surface-highest/98 p-2 shadow-[var(--shadow-medium)] backdrop-blur-[var(--blur-soft)]">
        <button type="button" onClick={onEditVlan} className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-on-surface transition hover:bg-surface-high/72">
          Editar VLAN
        </button>
        <button type="button" onClick={onViewVips} className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-on-surface transition hover:bg-surface-high/72">
          Ver VIPs
        </button>
        <button type="button" onClick={onToggleStandard} className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-on-surface transition hover:bg-surface-high/72">
          {vlan.inStandard ? 'Desligar do padrão' : 'Entrar no padrão'}
        </button>
        {canDelete ? (
          <button type="button" onClick={onDelete} className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-danger transition hover:bg-danger/10">
            Excluir VLAN
          </button>
        ) : null}
      </div>
    </details>
  );
}

function LoadingListSkeleton({ rows = 4, compact = false }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className={`animate-pulse rounded-[calc(var(--surface-radius)-2px)] border border-outline/10 bg-surface-high/50 p-[var(--spacing-card)] ${compact ? '' : 'min-h-[108px]'}`}>
          <div className="flex flex-col gap-3">
            <div className="h-4 w-40 rounded-full bg-surface-highest/30" />
            <div className="h-3 w-64 max-w-full rounded-full bg-surface-highest/20" />
            <div className="grid gap-2 md:grid-cols-2">
              <div className="h-3 rounded-full bg-surface-highest/20" />
              <div className="h-3 rounded-full bg-surface-highest/20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmationDialog({ open, tone = 'warning', title, subtitle, bullets = [], confirmLabel = 'Confirmar', loading = false, onClose, onConfirm }) {
  return (
    <DialogShell
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="max-w-2xl"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone={tone === 'danger' ? 'danger' : 'warning'} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processando...' : confirmLabel}
          </ActionButton>
        </div>
      )}
    >
      <div className="space-y-4">
        <ThemeAwareSurface tone={tone === 'danger' ? 'danger' : 'warning'} className="p-[var(--spacing-card)]">
          <div className="text-sm leading-6 text-on-surface/72">{subtitle}</div>
        </ThemeAwareSurface>
        {bullets.length ? (
          <div className="space-y-2">
            {bullets.map((bullet) => (
              <ListRow key={bullet}>
                <div className="text-sm text-on-surface/72">{bullet}</div>
              </ListRow>
            ))}
          </div>
        ) : null}
      </div>
    </DialogShell>
  );
}

function PolicyScopeEditorDialog({ open, scopeLabel, scopeType, scopeMeta = null, policies, inheritedPolicies = [], initialState, onClose, onSubmit, saving }) {
  const [draft, setDraft] = useState({});
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [ready, setReady] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!open) return;
    setDraft(initialState);
    setSearch('');
    setViewFilter('all');
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), 140);
    return () => window.clearTimeout(timer);
  }, [open, initialState]);

  const changeValue = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const filteredPolicies = policies.filter((policy) => {
    const needle = normalizeText(deferredSearch);
    if (!needle) return true;
    return [policy.name, policy.description, policy.policy_type, ...(policy.domains || [])]
      .some((value) => normalizeText(value).includes(needle));
  }).filter((policy) => {
    if (viewFilter === 'allow') return policy.policy_type === 'allow';
    if (viewFilter === 'block') return policy.policy_type === 'block';
    return true;
  });
  const enabledCount = policies.filter((policy) => draft[policy.id] === 'on').length;
  const changedPolicies = policies.filter((policy) => (draft[policy.id] || 'off') !== (initialState[policy.id] || 'off'));
  const groupedPolicies = [
    { key: 'allow', label: 'Liberados', tone: 'success' },
    { key: 'block', label: 'Bloqueados', tone: 'danger' },
  ].map((group) => ({
    ...group,
    items: filteredPolicies.filter((policy) => policy.policy_type === group.key),
  })).filter((group) => group.items.length);
  const allowCount = policies.filter((policy) => draft[policy.id] === 'on' && policy.policy_type === 'allow').length;
  const blockCount = policies.filter((policy) => draft[policy.id] === 'on' && policy.policy_type === 'block').length;
  const changedAllowCount = changedPolicies.filter((policy) => (draft[policy.id] || 'off') === 'on' && policy.policy_type === 'allow').length;
  const changedBlockCount = changedPolicies.filter((policy) => (draft[policy.id] || 'off') === 'on' && policy.policy_type === 'block').length;
  const headerBadges = (
    <div className="flex flex-wrap gap-1.5">
      {scopeMeta?.inStandard !== undefined ? <StateBadge label={scopeMeta.inStandard ? 'No padrão' : 'Fora do padrão'} tone={scopeMeta.inStandard ? 'success' : 'warning'} /> : null}
      <StateBadge label={`${enabledCount} regra(s)`} tone="primary" />
      <StateBadge label={`${allowCount} lib.`} tone="success" />
      <StateBadge label={`${blockCount} bloq.`} tone="danger" />
    </div>
  );

  return (
    <DialogShell
      open={open}
      title={scopeType === 'global' ? 'Editar escopo global' : `Editar escopo • ${scopeLabel}`}
      subtitle={scopeType === 'global' ? 'Edite políticas globais.' : 'Edite regras locais desta VLAN.'}
      onClose={onClose}
      align="center"
      size="max-w-[min(94vw,1120px)]"
      panelClassName="mx-auto"
      bodyClassName="px-0 py-0"
      headerContent={headerBadges}
      bodyScrollable={false}
      footer={(
        <div className="flex items-center justify-end gap-2">
          <ActionButton onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone="primary" onClick={() => onSubmit(draft)} disabled={saving || !changedPolicies.length}>
            {saving ? 'Salvando...' : 'Salvar escopo'}
          </ActionButton>
        </div>
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-outline/10 bg-surface-high/95 px-4 py-3 backdrop-blur-[var(--blur-soft)] sm:px-5">
          {scopeMeta ? (
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-sm text-on-surface/60">
              <div className="min-w-0">
                <div className="truncate font-semibold text-on-surface">{scopeMeta.label || scopeLabel}</div>
                <div className="truncate text-xs uppercase tracking-[0.14em] text-on-surface/42">
                  {scopeMeta.controlsSummary || 'Sem resumo operacional'} • VIPs {scopeMeta.vipCount || 0}
                </div>
              </div>
              <div className="text-xs uppercase tracking-[0.14em] text-on-surface/42">{filteredPolicies.length} resultados</div>
            </div>
          ) : null}
          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="relative min-w-0">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <TextInput data-autofocus="true" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar regra, política ou domínio" className="pl-11" />
            </div>
            <div className="inline-flex w-full overflow-x-auto rounded-full border border-outline/12 bg-surface-high/70 p-1 lg:w-auto">
              <button type="button" onClick={() => setViewFilter('all')} className={`min-h-[calc(var(--control-height)-0.5rem)] shrink-0 rounded-full px-3.5 text-[11px] font-black uppercase tracking-[0.14em] ${viewFilter === 'all' ? 'bg-primary text-on-primary' : 'text-on-surface/64'}`}>Todos</button>
              <button type="button" onClick={() => setViewFilter('allow')} className={`min-h-[calc(var(--control-height)-0.5rem)] shrink-0 rounded-full px-3.5 text-[11px] font-black uppercase tracking-[0.14em] ${viewFilter === 'allow' ? 'bg-info/16 text-info' : 'text-on-surface/64'}`}>Liberados</button>
              <button type="button" onClick={() => setViewFilter('block')} className={`min-h-[calc(var(--control-height)-0.5rem)] shrink-0 rounded-full px-3.5 text-[11px] font-black uppercase tracking-[0.14em] ${viewFilter === 'block' ? 'bg-danger/14 text-danger' : 'text-on-surface/64'}`}>Bloqueados</button>
            </div>
          <div className="text-right text-xs uppercase tracking-[0.14em] text-on-surface/42">
            {changedPolicies.length ? `${changedPolicies.length} alteradas` : `${filteredPolicies.length} regras`}
          </div>
        </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <div className="space-y-3">
            {scopeType === 'vlan' && inheritedPolicies.length ? (
              <div className="border-b border-outline/10 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Herdadas do global</div>
                  <div className="text-xs uppercase tracking-[0.14em] text-on-surface/42">{inheritedPolicies.length} regra(s)</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {inheritedPolicies.map((policy) => (
                    <StateBadge key={`inherited-${policy.id}`} label={`${policyTypeLabel(policy.policy_type)} ${policy.name}`} tone={policyTypeTone(policy.policy_type)} />
                  ))}
                </div>
              </div>
            ) : null}

            {!ready ? <LoadingListSkeleton rows={6} compact /> : null}

            {ready && filteredPolicies.length ? groupedPolicies.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-outline/10 bg-surface-high/96 px-1 py-2 backdrop-blur-[var(--blur-soft)]">
                  <div className="text-sm font-black text-on-surface">{group.label}</div>
                  <div className="text-xs uppercase tracking-[0.14em] text-on-surface/42">{group.items.length} item(ns)</div>
                </div>
                <div className="divide-y divide-outline/8">
                  {group.items.map((policy) => {
                    const value = draft[policy.id] || 'off';
                    const previous = initialState[policy.id] || 'off';
                    const changed = value !== previous;
                    return (
                      <div
                        key={policy.id}
                        className={cx(
                          'grid gap-3 px-1 py-2.5 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto]',
                          changed ? 'bg-primary/5' : 'bg-transparent',
                        )}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={value === 'on'}
                          onClick={() => changeValue(policy.id, value === 'on' ? 'off' : 'on')}
                          className={cx(
                            'mt-0.5 inline-flex h-6 w-11 items-center rounded-full border px-0.5 transition',
                            value === 'on'
                              ? policy.policy_type === 'allow'
                                ? 'border-info/18 bg-info/20'
                                : 'border-danger/18 bg-danger/20'
                              : 'border-outline/14 bg-surface',
                          )}
                        >
                          <span className={cx('h-[18px] w-[18px] rounded-full bg-white shadow transition-transform', value === 'on' ? 'translate-x-[18px]' : 'translate-x-0')} />
                        </button>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-on-surface">{policy.name}</span>
                            <span className={`text-[11px] font-black uppercase tracking-[0.14em] ${policy.policy_type === 'allow' ? 'text-info' : 'text-danger'}`}>
                              {policy.policy_type === 'allow' ? 'Liberado' : 'Bloqueado'}
                            </span>
                            {changed ? <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">Alterado</span> : null}
                          </div>
                          {policy.description ? <div className="mt-0.5 line-clamp-1 text-sm text-on-surface/60">{policy.description}</div> : null}
                          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-on-surface/42">
                            {policy.domains?.length || policy.domain_count || 0} domínio(s) • {policyScopeBadge(policy)}
                          </div>
                        </div>
                        <div className="flex items-start justify-between gap-2 sm:flex-col sm:items-end">
                          <span className={`text-[11px] font-black uppercase tracking-[0.14em] ${value === 'on' ? 'text-primary' : 'text-on-surface/46'}`}>
                            {value === 'on' ? 'Aplicada' : 'Fora'}
                          </span>
                          {changed ? (
                            <button
                              type="button"
                              onClick={() => changeValue(policy.id, previous)}
                              className="text-xs font-black uppercase tracking-[0.14em] text-primary transition hover:opacity-80"
                            >
                              Desfazer
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : null}

            {ready && !filteredPolicies.length ? (
              <EmptyStateBlock
                icon={ShieldCheck}
                title={search ? 'Nenhuma regra encontrada' : 'Nenhuma política editável neste escopo'}
                description={scopeType === 'global'
                  ? 'Crie uma política global ou altere o escopo de uma política existente.'
                  : 'Crie uma política com escopo VLAN(s) para poder aplicá-la aqui.'}
              />
            ) : null}

            {changedPolicies.length ? (
              <div className="sticky bottom-0 z-[2] border-t border-outline/10 bg-surface-high/96 px-1 py-2 backdrop-blur-[var(--blur-soft)]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface/68">
                  <span className="font-semibold text-on-surface">{changedPolicies.length} alteração(ões) pendente(s)</span>
                  <span>{changedAllowCount} liberada(s)</span>
                  <span>{changedBlockCount} bloqueada(s)</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

function DomainPolicyEditorDialog({ open, item, vlans, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    name: '',
    policy_type: 'block',
    scope_type: 'global',
    vlan_ids: [],
    domainsText: '',
    description: '',
    enabled: true,
  });

  useEffect(() => {
    if (!open) return;
    const governance = governanceFromRecord(item, item?.description || '');
    setForm({
      name: item?.name || '',
      policy_type: item?.policy_type || 'block',
      scope_type: item?.scope_type || 'global',
      vlan_ids: (item?.vlan_ids || []).map((value) => Number(value)).filter((value) => Number.isFinite(value)),
      domainsText: (item?.domains || item?.entries?.map((entry) => entry.domain || entry.normalized_domain) || []).join('\n'),
      description: governance.summary || '',
      enabled: item?.enabled ?? true,
    });
  }, [open, item]);

  const domains = splitDomains(form.domainsText);
  const toggleVlan = (vlanId) => {
    setForm((current) => ({
      ...current,
      vlan_ids: current.vlan_ids.includes(vlanId)
        ? current.vlan_ids.filter((itemId) => itemId !== vlanId)
        : [...current.vlan_ids, vlanId].sort((left, right) => left - right),
    }));
  };

  const submit = () => onSubmit({
    name: form.name.trim(),
    policy_type: form.policy_type,
    scope_type: form.scope_type,
    vlan_ids: form.scope_type === 'vlan'
      ? form.vlan_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value)).sort((left, right) => left - right)
      : [],
    domains,
    description: form.description.trim(),
    governance_summary: form.description.trim(),
    enabled: form.enabled,
  });

  return (
    <DialogShell
      open={open}
      title={item ? 'Editar Política' : 'Nova Política'}
      subtitle="Fluxo enxuto: nome, tipo, escopo, domínios/URLs e justificativa. Usuário, horário e IP são registrados automaticamente na LGPD."
      onClose={onClose}
      size="max-w-[1080px]"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <StateBadge label={`${domains.length} domínio(s)`} tone={domains.length ? 'primary' : 'neutral'} />
            <StateBadge label={form.enabled ? 'Ativa' : 'Inativa'} tone={form.enabled ? 'success' : 'neutral'} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={onClose}>Cancelar</ActionButton>
            <ActionButton
              tone="primary"
              onClick={submit}
              disabled={saving || !form.name.trim() || !domains.length || (form.scope_type === 'vlan' && !form.vlan_ids.length)}
            >
              {saving ? 'Salvando...' : item ? 'Salvar Política' : 'Criar Política'}
            </ActionButton>
          </div>
        </div>
      )}
    >
      <div className="space-y-6">
        <ThemeAwareSurface tone="primary" className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Política Institucional</div>
              <div className="mt-2 text-sm leading-6 text-on-surface/68">
                A autoria não é digitada aqui: o sistema registra automaticamente usuário autenticado, data/hora e IP de origem na trilha LGPD.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StateBadge label={policyTypeLabel(form.policy_type)} tone={policyTypeTone(form.policy_type)} />
              <StateBadge label={form.scope_type === 'vlan' ? `VLAN ${form.vlan_ids.join(', ') || '—'}` : 'Global'} tone="neutral" />
            </div>
          </div>
        </ThemeAwareSurface>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="space-y-5">
            <label className="flex flex-col gap-2.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Nome da Política</span>
              <TextInput value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Bloquear redes sociais visitantes" />
              <p className="text-xs leading-5 text-on-surface/58">Use um nome objetivo. Exemplo: `Bloquear TikTok Visitantes` ou `Liberar Portal do Fornecedor`.</p>
            </label>

            <label className="flex flex-col gap-2.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Domínios e URLs</span>
              <TextArea value={form.domainsText} onChange={(event) => setForm((current) => ({ ...current, domainsText: event.target.value }))} rows={10} placeholder={'api.pontorh.com.br\napp.pontorh.com.br\nhttps://portal.exemplo.gov.br/relatorios'} />
              <p className="text-xs leading-5 text-on-surface/58">Informe um domínio ou URL por linha. Domínios seguem para DNS e proxy; URLs entram no proxy complementar como ACL de URL.</p>
            </label>

            <div className="rounded-[28px] border border-outline/14 bg-surface/50 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Prévia das entradas</div>
                  <p className="mt-1 text-xs leading-5 text-on-surface/58">A lista abaixo ajuda a validar rapidamente os domínios e URLs que serão salvos na política.</p>
                </div>
                <StateBadge label={`${domains.length} domínio(s)`} tone={domains.length ? 'primary' : 'neutral'} />
              </div>
              <div className="mt-4 flex max-h-[180px] flex-wrap gap-2.5 overflow-y-auto pr-1">
                {domains.length ? domains.slice(0, 24).map((domain) => (
                  <StateBadge key={domain} label={domain} tone={policyTypeTone(form.policy_type)} className="px-3.5 py-1.5 text-[10px]" />
                )) : <StateBadge label="Nenhum domínio informado" tone="neutral" />}
                {domains.length > 24 ? <StateBadge label={`+${domains.length - 24}`} tone="neutral" className="px-3.5 py-1.5 text-[10px]" /> : null}
              </div>
            </div>

            <label className="flex flex-col gap-2.5">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Descrição/Motivo</span>
              <TextArea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Justificativa operacional, chamado ou decisão administrativa relacionada." />
              <p className="text-xs leading-5 text-on-surface/58">Explique por que a regra existe. O usuário, horário e IP entram automaticamente na LGPD.</p>
            </label>
          </div>

          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <label className="flex flex-col gap-2.5">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Tipo</span>
                <SelectInput value={form.policy_type} onChange={(event) => setForm((current) => ({ ...current, policy_type: event.target.value }))}>
                  <option value="allow">Liberar</option>
                  <option value="block">Bloquear</option>
                </SelectInput>
                <p className="text-xs leading-5 text-on-surface/58">`Liberar` cria exceção positiva. `Bloquear` força bloqueio mesmo que o domínio seja recorrente.</p>
              </label>

              <label className="flex flex-col gap-2.5">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Escopo</span>
                <SelectInput value={form.scope_type} onChange={(event) => setForm((current) => ({ ...current, scope_type: event.target.value, vlan_ids: [] }))}>
                  <option value="global">Global</option>
                  <option value="vlan">VLAN(s)</option>
                </SelectInput>
                <p className="text-xs leading-5 text-on-surface/58">`Global` vale para todo o módulo. `VLAN(s)` restringe a política apenas às VLANs selecionadas abaixo.</p>
              </label>
            </div>

            <div className={`rounded-[28px] border p-4 sm:p-5 ${form.scope_type === 'vlan' ? 'border-outline/14 bg-surface/52' : 'border-outline/10 bg-surface/34 opacity-70'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">VLAN(s)</span>
                  <p className="mt-1 text-xs leading-5 text-on-surface/58">Selecione uma ou mais VLANs somente quando o escopo estiver em `VLAN(s)`. Sem seleção, a política não pode ser salva.</p>
                </div>
                <StateBadge label={form.scope_type === 'vlan' ? `${form.vlan_ids.length} selecionada(s)` : 'Escopo global'} tone={form.scope_type === 'vlan' && form.vlan_ids.length ? 'primary' : 'neutral'} />
              </div>
              <div className="mt-4 rounded-[24px] border border-outline/12 bg-container/60 p-3">
                <div className="flex max-h-[220px] flex-wrap gap-3 overflow-y-auto pr-1">
                  {vlans.map((vlan) => (
                    <button
                      key={vlan.vlan_id}
                      type="button"
                      onClick={() => form.scope_type === 'vlan' && toggleVlan(vlan.vlan_id)}
                      disabled={form.scope_type !== 'vlan'}
                      aria-pressed={form.vlan_ids.includes(vlan.vlan_id)}
                      className={`min-h-11 rounded-2xl border px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-container ${
                        form.vlan_ids.includes(vlan.vlan_id)
                          ? 'border-primary/18 bg-primary text-on-primary shadow-lg shadow-primary/20'
                          : 'border-outline/16 bg-container/72 text-on-surface/68 hover:border-primary/20 hover:text-primary'
                      }`}
                    >
                      VLAN {vlan.vlan_id}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-outline/14 bg-surface/52 p-4 sm:p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Estado da política</div>
              <p className="mt-2 text-xs leading-5 text-on-surface/58">Mantenha a política salva, mas controle se ela entra ou não no enforcement atual.</p>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, enabled: !current.enabled }))}
                aria-pressed={form.enabled}
                className={`mt-4 inline-flex min-h-11 items-center rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-container ${
                  form.enabled ? 'border-info/20 bg-info/12 text-info' : 'border-outline/16 bg-container/72 text-on-surface/62'
                }`}
              >
                {form.enabled ? 'Ativa' : 'Inativa'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

function AuditPolicyAttachDialog({ open, event, policies, vlans, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    mode: 'existing',
    policy_id: '',
    policy_type: 'allow',
    name: '',
    scope_type: 'global',
    vlan_ids: [],
    description: '',
  });

  useEffect(() => {
    if (!open) return;
    const vlanId = Number(event?.vlan_id);
    const hasVlan = Number.isFinite(vlanId) && vlanId > 0;
    const compatible = (policies || []).filter((policy) => policy.policy_type === 'allow' && policy.enabled);
    setForm({
      mode: compatible.length ? 'existing' : 'new',
      policy_id: compatible[0]?.id ? String(compatible[0].id) : '',
      policy_type: 'allow',
      name: event?.domain ? `Liberar ${event.domain}` : 'Nova política',
      scope_type: hasVlan ? 'vlan' : 'global',
      vlan_ids: hasVlan ? [vlanId] : [],
      description: `Domínio incluído a partir do relatório de dados${event?.client_ip ? ` do IP ${event.client_ip}` : ''}.`,
    });
  }, [open, event, policies]);

  if (!event) return null;
  const domain = event.domain || event.url_or_host || '';
  const compatiblePolicies = (policies || []).filter((policy) => policy.policy_type === form.policy_type);
  const toggleVlan = (vlanId) => {
    setForm((current) => ({
      ...current,
      vlan_ids: current.vlan_ids.includes(vlanId)
        ? current.vlan_ids.filter((item) => item !== vlanId)
        : [...current.vlan_ids, vlanId].sort((left, right) => left - right),
    }));
  };

  return (
    <DialogShell
      open={open}
      title="Adicionar domínio a uma política"
      subtitle="Inclua o domínio identificado no relatório de dados em uma política existente ou crie uma política nomeada. Assim a governança trata o acesso por regra formal, e não por exceção improvisada."
      onClose={onClose}
      size="max-w-4xl"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <StateBadge label={domain || 'domínio não identificado'} tone="primary" />
            <StateBadge label={form.mode === 'existing' ? 'Política existente' : 'Nova política'} tone="neutral" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={onClose}>Cancelar</ActionButton>
            <ActionButton
              tone="primary"
              onClick={() => onSubmit({ ...form, domain })}
              disabled={saving || !domain || (form.mode === 'existing' && !form.policy_id) || (form.mode === 'new' && (!form.name.trim() || (form.scope_type === 'vlan' && !form.vlan_ids.length)))}
            >
              {saving ? 'Salvando...' : 'Salvar domínio'}
            </ActionButton>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        <ThemeAwareSurface tone="primary" className="p-5">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Domínio identificado no relatório de dados</div>
          <div className="mt-2 break-all text-xl font-black text-on-surface">{domain || 'domínio não identificado'}</div>
          <p className="mt-2 text-sm leading-6 text-on-surface/68">
            Origem: {event.client_ip || 'IP não identificado'}{event.vlan_id ? ` • VLAN ${event.vlan_id}` : ''}. A ação abaixo atualiza a política e sincroniza as regras legadas usadas pelo runtime.
          </p>
        </ThemeAwareSurface>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, mode: 'existing' }))}
            className={`rounded-[22px] border p-4 text-left transition ${form.mode === 'existing' ? 'border-primary/30 bg-primary/10' : 'border-outline/14 bg-container/64'}`}
          >
            <div className="text-sm font-black text-on-surface">Incluir em política existente</div>
            <div className="mt-2 text-sm leading-6 text-on-surface/62">Use quando o domínio pertence a uma whitelist/blacklist já criada.</div>
          </button>
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, mode: 'new' }))}
            className={`rounded-[22px] border p-4 text-left transition ${form.mode === 'new' ? 'border-primary/30 bg-primary/10' : 'border-outline/14 bg-container/64'}`}
          >
            <div className="text-sm font-black text-on-surface">Criar política nomeada</div>
            <div className="mt-2 text-sm leading-6 text-on-surface/62">Use somente quando ainda não existe uma política adequada.</div>
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Tipo</span>
            <SelectInput value={form.policy_type} onChange={(eventValue) => setForm((current) => ({ ...current, policy_type: eventValue.target.value, policy_id: '' }))}>
              <option value="allow">Whitelist / Liberação</option>
              <option value="block">Blacklist / Bloqueio</option>
            </SelectInput>
          </label>
          {form.mode === 'existing' ? (
            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Política existente</span>
              <SelectInput value={form.policy_id} onChange={(eventValue) => setForm((current) => ({ ...current, policy_id: eventValue.target.value }))}>
                <option value="">Selecione</option>
                {compatiblePolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>{policy.name} ({policyScopeBadge(policy)})</option>
                ))}
              </SelectInput>
            </label>
          ) : (
            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Nome da nova política</span>
              <TextInput value={form.name} onChange={(eventValue) => setForm((current) => ({ ...current, name: eventValue.target.value }))} placeholder="Liberar sistema RH" />
            </label>
          )}
        </div>

        {form.mode === 'new' ? (
          <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
            <label className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Escopo</span>
              <SelectInput value={form.scope_type} onChange={(eventValue) => setForm((current) => ({ ...current, scope_type: eventValue.target.value, vlan_ids: [] }))}>
                <option value="global">Global</option>
                <option value="vlan">VLAN(s)</option>
              </SelectInput>
            </label>
            <div className={form.scope_type === 'vlan' ? 'space-y-2' : 'space-y-2 opacity-55'}>
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">VLAN(s)</span>
              <div className="flex flex-wrap gap-2">
                {vlans.filter(vlanIsInStandard).map((vlan) => (
                  <button
                    key={vlan.vlan_id}
                    type="button"
                    onClick={() => form.scope_type === 'vlan' && toggleVlan(vlan.vlan_id)}
                    disabled={form.scope_type !== 'vlan'}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] transition ${
                      form.vlan_ids.includes(vlan.vlan_id)
                        ? 'border-primary/18 bg-primary text-on-primary'
                        : 'border-outline/16 bg-container/72 text-on-surface/65'
                    }`}
                  >
                    VLAN {vlan.vlan_id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Motivo</span>
          <TextArea value={form.description} onChange={(eventValue) => setForm((current) => ({ ...current, description: eventValue.target.value }))} rows={3} />
        </label>
      </div>
    </DialogShell>
  );
}

function VipEditorDialog({ open, item, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    ip: '',
    description: '',
    reason: '',
    legal_basis: '',
    requested_by: '',
    approval_scope: '',
    lifecycle_status: '',
    review_date: '',
    approved_by: '',
    approved_at: '',
    effective_from: '',
    expires_at: '',
    revoked_by: '',
    revoked_at: '',
  });

  useEffect(() => {
    if (!open) return;
    const governance = governanceFromRecord(item, item?.notes || item?.reason || '');
    setForm({
      ip: item?.ip || '',
      description: item?.description || item?.hostname || '',
      reason: governance.summary || '',
      legal_basis: governance.legal_basis || '',
      requested_by: governance.requested_by || '',
      approval_scope: governance.approval_scope || '',
      lifecycle_status: governance.lifecycle_status || '',
      review_date: governance.review_date || '',
      approved_by: governance.approved_by || '',
      approved_at: governance.approved_at || '',
      effective_from: governance.effective_from || '',
      expires_at: governance.expires_at || '',
      revoked_by: governance.revoked_by || '',
      revoked_at: governance.revoked_at || '',
    });
  }, [open, item]);

  return (
    <DialogShell
      open={open}
      title={item ? 'Editar VIP' : 'Adicionar VIP'}
      subtitle="VIP é bypass total real: sai direto pelo firewall e pode usar o Unbound recursivo local sem bloqueios de RPZ, proxy ou interceptação."
      onClose={onClose}
      size="max-w-3xl"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton onClick={onClose}>Cancelar</ActionButton>
          <ActionButton
            tone="primary"
            onClick={() => onSubmit({
              ...form,
              reason: buildGovernanceText(form.reason, {
                'Base legal': form.legal_basis,
                Solicitante: form.requested_by,
                'Alcada de aprovacao': form.approval_scope,
                'Status institucional': form.lifecycle_status,
                'Revisao prevista': form.review_date,
              }),
              governance_summary: form.reason.trim(),
              legal_basis: form.legal_basis.trim(),
              requested_by: form.requested_by.trim(),
              approval_scope: form.approval_scope.trim(),
              lifecycle_status: form.lifecycle_status,
              review_date: form.review_date || null,
              approved_by: form.approved_by.trim(),
              approved_at: form.approved_at || null,
              effective_from: form.effective_from || null,
              expires_at: form.expires_at || null,
              revoked_by: form.revoked_by.trim(),
              revoked_at: form.revoked_at || null,
            })}
            disabled={saving || !form.ip.trim()}
          >
            {saving ? 'Salvando...' : item ? 'Salvar VIP' : 'Criar VIP'}
          </ActionButton>
        </div>
      )}
    >
      <div className="space-y-5">
        <ThemeAwareSurface tone="primary" className="p-5">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Impacto automático de VIP real</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {VIP_RUNTIME_BADGES.map((badge) => (
              <VipImpactBadge key={badge.label} label={badge.label} tone={badge.tone} />
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-on-surface/68">
            Salvar aqui já transforma o IP em exceção administrativa forte em todas as camadas gerenciadas pelo módulo.
          </p>
        </ThemeAwareSurface>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">IP</span>
            <TextInput value={form.ip} onChange={(event) => setForm((current) => ({ ...current, ip: event.target.value }))} placeholder="192.168.30.25" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Descrição</span>
            <TextInput value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Notebook da diretoria" />
          </label>
        </div>
        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Motivo</span>
          <TextArea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="Justificativa operacional do VIP." />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Base legal / diretriz</span>
            <TextInput value={form.legal_basis} onChange={(event) => setForm((current) => ({ ...current, legal_basis: event.target.value }))} placeholder="Fundamento institucional da exceção" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Solicitante</span>
            <TextInput value={form.requested_by} onChange={(event) => setForm((current) => ({ ...current, requested_by: event.target.value }))} placeholder="Autoridade ou unidade responsável" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Alçada de aprovação</span>
            <TextInput value={form.approval_scope} onChange={(event) => setForm((current) => ({ ...current, approval_scope: event.target.value }))} placeholder="Nível de aprovação exigido" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Status institucional</span>
            <SelectInput value={form.lifecycle_status} onChange={(event) => setForm((current) => ({ ...current, lifecycle_status: event.target.value }))}>
              <option value="">Não definido</option>
              <option value="Em análise">Em análise</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Em vigor">Em vigor</option>
              <option value="Em revisão">Em revisão</option>
              <option value="Revogado">Revogado</option>
              <option value="Expirado">Expirado</option>
            </SelectInput>
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Revisão prevista</span>
            <TextInput type="date" value={form.review_date} onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))} />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Aprovado por</span>
            <TextInput value={form.approved_by} onChange={(event) => setForm((current) => ({ ...current, approved_by: event.target.value }))} placeholder="Autoridade aprovadora" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Aprovado em</span>
            <TextInput type="datetime-local" value={form.approved_at} onChange={(event) => setForm((current) => ({ ...current, approved_at: event.target.value }))} />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Vigência inicial</span>
            <TextInput type="datetime-local" value={form.effective_from} onChange={(event) => setForm((current) => ({ ...current, effective_from: event.target.value }))} />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Vigência final</span>
            <TextInput type="datetime-local" value={form.expires_at} onChange={(event) => setForm((current) => ({ ...current, expires_at: event.target.value }))} />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Revogado por</span>
            <TextInput value={form.revoked_by} onChange={(event) => setForm((current) => ({ ...current, revoked_by: event.target.value }))} placeholder="Autoridade que revogou" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Revogado em</span>
            <TextInput type="datetime-local" value={form.revoked_at} onChange={(event) => setForm((current) => ({ ...current, revoked_at: event.target.value }))} />
          </label>
        </div>
      </div>
    </DialogShell>
  );
}

function VlanEditorDialog({ open, item, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    vlan_id: '',
    label: '',
    interface_name: '',
    subnet_cidr: '',
    notes: '',
    exempt: false,
    blocking_enabled: true,
    monitoring_enabled: true,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      vlan_id: item?.vlan_id || '',
      label: item?.label || '',
      interface_name: item?.interface_name || '',
      subnet_cidr: item?.subnet_cidr || '',
      notes: item?.notes || '',
      exempt: item?.exempt ?? false,
      blocking_enabled: item?.blocking_enabled ?? true,
      monitoring_enabled: item?.monitoring_enabled ?? true,
    });
  }, [open, item]);

  const vlanId = Number(form.vlan_id);
  const inStandard = vlanIsInStandard(form);
  const setStandard = (enabled) => {
    setForm((current) => ({
      ...current,
      blocking_enabled: enabled,
      monitoring_enabled: enabled,
      exempt: !enabled,
    }));
  };

  return (
    <DialogShell
      open={open}
      title={item ? `Editar VLAN ${item.vlan_id}` : 'Nova VLAN'}
      subtitle="CRUD completo de VLAN: ID, nome, interface, subnet e comportamento operacional do módulo."
      onClose={onClose}
      size="max-w-4xl"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton onClick={onClose}>Cancelar</ActionButton>
          <ActionButton
            tone="primary"
            onClick={() => onSubmit({
              vlan_id: vlanId,
              label: form.label.trim(),
              interface_name: form.interface_name.trim(),
              subnet_cidr: form.subnet_cidr.trim(),
              notes: form.notes.trim(),
              exempt: form.exempt,
              blocking_enabled: form.blocking_enabled,
              monitoring_enabled: form.monitoring_enabled,
            })}
            disabled={saving || !Number.isInteger(vlanId) || vlanId <= 0 || vlanId > 4094 || !form.label.trim() || !form.subnet_cidr.trim()}
          >
            {saving ? 'Salvando...' : item ? 'Salvar VLAN' : 'Criar VLAN'}
          </ActionButton>
        </div>
      )}
    >
      <ThemeAwareSurface tone={inStandard ? 'success' : 'warning'} className="mb-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] opacity-70">Participação no padrão</div>
            <div className="mt-2 text-lg font-black">
              {inStandard ? 'Esta VLAN entra no monitoramento, liberações e bloqueios.' : 'Esta VLAN fica desligada do padrão do módulo.'}
            </div>
            <p className="mt-2 text-sm leading-6 opacity-75">
              Use desligado para câmeras, VoIP, CFTV ou redes que devem aparecer no cadastro sem receber políticas do módulo.
            </p>
          </div>
          <ActionButton tone={inStandard ? 'warning' : 'success'} onClick={() => setStandard(!inStandard)}>
            {inStandard ? 'Desligar do padrão' : 'Entrar no padrão'}
          </ActionButton>
        </div>
      </ThemeAwareSurface>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">ID da VLAN</span>
          <TextInput value={form.vlan_id} onChange={(event) => setForm((current) => ({ ...current, vlan_id: event.target.value }))} placeholder="90" />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Nome</span>
          <TextInput value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Financeiro" />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Interface</span>
          <TextInput value={form.interface_name} onChange={(event) => setForm((current) => ({ ...current, interface_name: event.target.value }))} placeholder="enp6s0.90" />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Subnet CIDR</span>
          <TextInput value={form.subnet_cidr} onChange={(event) => setForm((current) => ({ ...current, subnet_cidr: event.target.value }))} placeholder="192.168.90.0/24" />
        </label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <button type="button" onClick={() => setForm((current) => ({ ...current, blocking_enabled: !current.blocking_enabled }))} className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] ${form.blocking_enabled ? 'border-info/20 bg-info/12 text-info' : 'border-outline/16 bg-container/72 text-on-surface/62'}`}>Bloqueio {form.blocking_enabled ? 'ativo' : 'inativo'}</button>
        <button type="button" onClick={() => setForm((current) => ({ ...current, monitoring_enabled: !current.monitoring_enabled }))} className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] ${form.monitoring_enabled ? 'border-info/20 bg-info/12 text-info' : 'border-outline/16 bg-container/72 text-on-surface/62'}`}>Monitoramento {form.monitoring_enabled ? 'ativo' : 'inativo'}</button>
        <button type="button" onClick={() => setForm((current) => ({ ...current, exempt: !current.exempt }))} className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-[0.14em] ${form.exempt ? 'border-amber-500/20 bg-amber-500/12 text-amber-700 dark:text-amber-300' : 'border-outline/16 bg-container/72 text-on-surface/62'}`}>Exceção {form.exempt ? 'ativa' : 'inativa'}</button>
      </div>
      <label className="mt-4 block space-y-2">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Notas</span>
        <TextArea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={4} placeholder="Contexto operacional da VLAN." />
      </label>
    </DialogShell>
  );
}

function ContingencyDialog({ open, mode, vlans, onClose, onSubmit, saving }) {
  const [form, setForm] = useState({
    scope_type: 'global',
    vlan_ids: [],
    providers: ['google', 'cloudflare', 'quad9'],
    duration_minutes: '15',
    reason: '',
    legal_basis: '',
    requested_by: '',
    approval_scope: '',
    lifecycle_status: '',
    review_date: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm((current) => ({
      ...current,
      scope_type: mode === 'renew' ? 'global' : 'global',
      vlan_ids: [],
      providers: ['google', 'cloudflare', 'quad9'],
      duration_minutes: '15',
      reason: '',
      legal_basis: '',
      requested_by: '',
      approval_scope: '',
      lifecycle_status: '',
      review_date: '',
    }));
  }, [open, mode]);

  const toggleProvider = (provider) => {
    setForm((current) => ({
      ...current,
      providers: current.providers.includes(provider)
        ? current.providers.filter((item) => item !== provider)
        : [...current.providers, provider],
    }));
  };

  const toggleVlan = (vlanId) => {
    setForm((current) => ({
      ...current,
      vlan_ids: current.vlan_ids.includes(vlanId)
        ? current.vlan_ids.filter((item) => item !== vlanId)
        : [...current.vlan_ids, vlanId],
    }));
  };

  const title = mode === 'renew' ? 'Renovar contingência DNS' : 'Ativar contingência DNS';
  const subtitle = mode === 'renew'
    ? 'Renove o prazo da contingência mantendo o comportamento emergencial auditado.'
    : 'Libere temporariamente resolvedores públicos quando o Unbound estiver degradado.';

  return (
    <DialogShell
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="max-w-4xl"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton onClick={onClose}>Cancelar</ActionButton>
          <ActionButton
            tone={mode === 'renew' ? 'warning' : 'danger'}
            onClick={() => onSubmit({
              ...form,
              reason: buildGovernanceText(form.reason, {
                'Base legal': form.legal_basis,
                Solicitante: form.requested_by,
                'Alcada de aprovacao': form.approval_scope,
                'Status institucional': form.lifecycle_status,
                'Revisao prevista': form.review_date,
              }),
            })}
            disabled={saving || !form.reason.trim() || (!form.providers.length && mode !== 'renew')}
          >
            {saving ? 'Processando...' : mode === 'renew' ? 'Renovar' : 'Ativar Contingência'}
          </ActionButton>
        </div>
      )}
    >
      <div className="space-y-5">
        {mode !== 'renew' ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Escopo</span>
                <SelectInput value={form.scope_type} onChange={(event) => setForm((current) => ({ ...current, scope_type: event.target.value, vlan_ids: [] }))}>
                  <option value="global">Global</option>
                  <option value="vlan">Somente VLANs específicas</option>
                </SelectInput>
              </label>
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Duração</span>
                <SelectInput value={form.duration_minutes} onChange={(event) => setForm((current) => ({ ...current, duration_minutes: event.target.value }))}>
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="60">60 minutos</option>
                  <option value="manual">Manual</option>
                </SelectInput>
              </label>
            </div>
            {form.scope_type === 'vlan' ? (
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Selecione as VLANs</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {vlans.map((vlan) => (
                    <button
                      key={vlan.id}
                      type="button"
                      onClick={() => toggleVlan(vlan.vlan_id)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${
                        form.vlan_ids.includes(vlan.vlan_id)
                          ? 'border-primary/18 bg-primary text-on-primary'
                          : 'border-outline/16 bg-container/72 text-on-surface/65'
                      }`}
                    >
                      VLAN {vlan.vlan_id}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Resolvedores públicos autorizados</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONTINGENCY_PROVIDERS.map((provider) => (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => toggleProvider(provider.key)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] ${
                      form.providers.includes(provider.key)
                        ? 'border-danger/18 bg-danger text-white'
                        : 'border-outline/16 bg-container/72 text-on-surface/65'
                    }`}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Novo prazo</span>
            <SelectInput value={form.duration_minutes} onChange={(event) => setForm((current) => ({ ...current, duration_minutes: event.target.value }))}>
              <option value="15">15 minutos</option>
              <option value="30">30 minutos</option>
              <option value="60">60 minutos</option>
              <option value="manual">Manual</option>
            </SelectInput>
          </label>
        )}
        <label className="space-y-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Motivo</span>
          <TextArea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} rows={4} placeholder="Explique por que a contingência precisa ficar ativa." />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Base legal / diretriz</span>
            <TextInput value={form.legal_basis} onChange={(event) => setForm((current) => ({ ...current, legal_basis: event.target.value }))} placeholder="Fundamento institucional da contingência" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Solicitante</span>
            <TextInput value={form.requested_by} onChange={(event) => setForm((current) => ({ ...current, requested_by: event.target.value }))} placeholder="Gestão ou unidade responsável" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Alçada de aprovação</span>
            <TextInput value={form.approval_scope} onChange={(event) => setForm((current) => ({ ...current, approval_scope: event.target.value }))} placeholder="Diretoria, comitê ou instância formal" />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Status institucional</span>
            <SelectInput value={form.lifecycle_status} onChange={(event) => setForm((current) => ({ ...current, lifecycle_status: event.target.value }))}>
              <option value="">Não definido</option>
              <option value="Em análise">Em análise</option>
              <option value="Aprovado">Aprovado</option>
              <option value="Em vigor">Em vigor</option>
              <option value="Em revisão">Em revisão</option>
              <option value="Revogado">Revogado</option>
              <option value="Expirado">Expirado</option>
            </SelectInput>
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Revisão prevista</span>
            <TextInput value={form.review_date} onChange={(event) => setForm((current) => ({ ...current, review_date: event.target.value }))} placeholder="2026-12-31" />
          </label>
        </div>
      </div>
    </DialogShell>
  );
}

const SPORADIC_CATEGORIES = [
  {
    key: 'youtube',
    label: 'YouTube',
    description: 'youtube.com, youtu.be, googlevideo.com',
    domains: ['youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com'],
  },
  {
    key: 'redes_sociais',
    label: 'Redes Sociais',
    description: 'Instagram, Facebook, X (Twitter), TikTok, LinkedIn',
    domains: ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'linkedin.com', 'cdninstagram.com', 'fbcdn.net'],
  },
  {
    key: 'streaming',
    label: 'Streaming de Vídeo',
    description: 'Netflix, Twitch, Globoplay, Spotify',
    domains: ['netflix.com', 'twitch.tv', 'globoplay.globo.com', 'spotify.com'],
  },
  {
    key: 'noticias',
    label: 'Portais de Notícias',
    description: 'UOL, G1, R7, Terra, Folha, Estadão',
    domains: ['uol.com.br', 'g1.globo.com', 'r7.com', 'terra.com.br', 'folha.uol.com.br', 'estadao.com.br'],
  },
];

const SPORADIC_DURATIONS = [
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas (turno)' },
  { value: 1440, label: '1 dia' },
];

function SporadicExceptionEditorDialog({ open, onClose, onSubmit, saving }) {
  const emptyForm = {
    ip: '',
    requested_by: '',
    justification: '',
    duration_minutes: 60,
    approved_categories: [],
    custom_domains_raw: '',
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) setForm(emptyForm);
  }, [open]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleCategory = (key) => {
    set('approved_categories', form.approved_categories.includes(key)
      ? form.approved_categories.filter((k) => k !== key)
      : [...form.approved_categories, key]);
  };

  const handleSubmit = () => {
    const customDomains = form.custom_domains_raw
      .split(/[\n,;\s]+/)
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
      .filter(Boolean);
    onSubmit({
      ip: form.ip.trim(),
      requested_by: form.requested_by.trim(),
      justification: form.justification.trim(),
      duration_minutes: Number(form.duration_minutes),
      approved_categories: form.approved_categories,
      custom_domains: customDomains,
    });
  };

  const isValid = form.ip.trim() && form.requested_by.trim() && form.justification.trim()
    && (form.approved_categories.length > 0 || form.custom_domains_raw.trim());

  return (
    <DialogShell
      open={open}
      title="Nova Exceção Esporádica"
      subtitle="Libera acesso temporário a conteúdos bloqueados para um colaborador específico pelo IP."
      onClose={onClose}
      size="max-w-2xl"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone="warning" onClick={handleSubmit} disabled={saving || !isValid}>
            {saving ? 'Salvando e aplicando...' : 'Salvar e aplicar agora'}
          </ActionButton>
        </div>
      )}
    >
      <div className="space-y-5">
        <ThemeAwareSurface tone="warning" className="p-[var(--spacing-card)]">
          <div className="flex items-start gap-3">
            <Zap size={18} className="mt-0.5 shrink-0 text-warning" />
            <div className="text-sm leading-6 text-on-surface/72">
              Ao salvar, o motor ACL+DNS é atualizado <span className="font-semibold text-on-surface">imediatamente</span>. O IP informado receberá bypass temporário pelo período selecionado. Todas as ações são registradas na trilha de auditoria.
            </div>
          </div>
        </ThemeAwareSurface>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/60">
              IP da máquina do colaborador
              <HintTooltip text="Digite o endereço IPv4 exato da máquina que receberá o acesso liberado. Ex: 192.168.10.50" />
            </label>
            <TextInput
              value={form.ip}
              onChange={(e) => set('ip', e.target.value)}
              placeholder="192.168.10.50"
              type="text"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/60">
              Quem solicitou
              <HintTooltip text="Nome completo do colaborador ou responsável que fez a solicitação de exceção." />
            </label>
            <TextInput
              value={form.requested_by}
              onChange={(e) => set('requested_by', e.target.value)}
              placeholder="Nome do solicitante"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/60">
            Duração da exceção
            <HintTooltip text="Após o tempo selecionado, o acesso é bloqueado automaticamente. Requer novo pedido para renovar." />
          </label>
          <SelectInput value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)}>
            {SPORADIC_DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </SelectInput>
        </div>

        <div>
          <label className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/60">
            Políticas a liberar
            <HintTooltip text="Selecione as categorias de conteúdo que serão liberadas. Pelo menos uma categoria ou domínio personalizado é obrigatório." />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {SPORADIC_CATEGORIES.map((cat) => {
              const selected = form.approved_categories.includes(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  className={cx(
                    'rounded-[calc(var(--surface-radius)-2px)] border p-3 text-left transition',
                    selected
                      ? 'border-warning/28 bg-warning/10'
                      : 'border-outline/12 bg-surface-high/50 hover:border-outline/24',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-on-surface">{cat.label}</span>
                    {selected ? <CheckCircle2 size={16} className="shrink-0 text-warning" /> : null}
                  </div>
                  <div className="mt-1 text-xs text-on-surface/52">{cat.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/60">
            Domínios personalizados (opcional)
            <HintTooltip text="Adicione domínios específicos não cobertos pelas categorias acima. Um por linha ou separados por vírgula." />
          </label>
          <TextArea
            value={form.custom_domains_raw}
            onChange={(e) => set('custom_domains_raw', e.target.value)}
            rows={3}
            placeholder="exemplo.com.br&#10;outrodominio.com"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/60">
            Justificativa
            <HintTooltip text="Descreva o motivo da solicitação. Esta informação é registrada na trilha institucional de auditoria." />
          </label>
          <TextArea
            value={form.justification}
            onChange={(e) => set('justification', e.target.value)}
            rows={3}
            placeholder="Descreva o motivo da liberação temporária..."
          />
        </div>
      </div>
    </DialogShell>
  );
}

function SporadicStatusBadge({ item }) {
  const now = Date.now();
  const expiresAt = item.expires_at ? new Date(item.expires_at).getTime() : 0;
  if (item.revoked_by || item.revoked_at) return <StateBadge label="Revogada" tone="danger" />;
  if (!item.active || expiresAt <= now) return <StateBadge label="Expirada" tone="neutral" />;
  return <StateBadge label="Ativa" tone="warning" />;
}

function sporadicIsActive(item) {
  if (item.revoked_by || item.revoked_at || !item.active) return false;
  const expiresAt = item.expires_at ? new Date(item.expires_at).getTime() : 0;
  return expiresAt > Date.now();
}

function sporadicRemainingSeconds(item) {
  if (!item.expires_at) return null;
  const diff = Math.floor((new Date(item.expires_at).getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : 0;
}

function SporadicTab({ sporadicExceptions, onNew, onRevoke, working }) {
  const sorted = [...sporadicExceptions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="space-y-5 xl:space-y-6">
      <SectionCard
        title="Exceções Esporádicas"
        subtitle="Liberações temporárias de acesso para colaboradores específicos por IP. Ao salvar, o motor ACL+DNS é atualizado imediatamente."
        actions={(
          <QuickActionBar
            items={[
              { label: 'Nova Exceção', tone: 'warning', icon: Zap, onClick: onNew },
            ]}
          />
        )}
      >
        <div className="space-y-4 xl:space-y-5">
          <ThemeAwareSurface tone="warning" className="p-[var(--spacing-card)]">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-warning">Bypass VIP temporário</div>
                <div className="mt-2 text-xl font-black text-on-surface">Acesso liberado imediatamente ao salvar</div>
                <div className="mt-2 text-sm leading-6 text-on-surface/68">
                  O IP do colaborador entra na lista VIP de bypass do motor ACL+DNS pelo período definido. Ao expirar ou ser revogada, o bloqueio institucional é restaurado automaticamente.
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <InlineStat label="Total" value={sporadicExceptions.length} tone="neutral" />
                <InlineStat label="Ativas" value={sporadicExceptions.filter(sporadicIsActive).length} tone="warning" />
                <InlineStat label="Expiradas" value={sporadicExceptions.filter((item) => !sporadicIsActive(item)).length} tone="neutral" />
              </div>
            </div>
          </ThemeAwareSurface>

          <div className="space-y-2.5">
            {sorted.length ? sorted.map((item) => {
              const active = sporadicIsActive(item);
              const remaining = sporadicRemainingSeconds(item);
              const categories = Array.isArray(item.approved_categories) ? item.approved_categories : [];
              const customDomains = Array.isArray(item.custom_domains) ? item.custom_domains : [];
              return (
                <ListRow key={item.id}>
                  <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-black text-on-surface">{item.ip}</span>
                        <SporadicStatusBadge item={item} />
                        {active ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-warning">
                            <Timer size={13} />
                            {formatRemaining(remaining)} restante
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-on-surface/62">
                        Solicitado por: <span className="font-semibold text-on-surface">{item.requested_by}</span>
                      </div>
                      {categories.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {categories.map((cat) => {
                            const catInfo = SPORADIC_CATEGORIES.find((c) => c.key === cat);
                            return <StateBadge key={cat} label={catInfo?.label || cat} tone="warning" />;
                          })}
                        </div>
                      ) : null}
                      {customDomains.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {customDomains.slice(0, 6).map((domain) => (
                            <StateBadge key={domain} label={domain} tone="neutral" />
                          ))}
                          {customDomains.length > 6 ? <StateBadge label={`+${customDomains.length - 6} domínios`} tone="neutral" /> : null}
                        </div>
                      ) : null}
                      {item.justification ? (
                        <div className="mt-2 text-sm leading-6 text-on-surface/52 italic">{item.justification}</div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-on-surface/44">
                        <span>Criada em {formatDate(item.created_at)}</span>
                        <span>Expira em {formatDate(item.expires_at)}</span>
                        {item.revoked_by ? <span>Revogada por {item.revoked_by}</span> : null}
                      </div>
                    </div>
                    {active ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton tone="danger" icon={Ban} onClick={() => onRevoke(item)} disabled={working}>
                          Revogar
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>
                </ListRow>
              );
            }) : (
              <EmptyStateBlock
                icon={Zap}
                title="Nenhuma exceção esporádica"
                description="Crie uma exceção para liberar acesso temporário a conteúdos bloqueados para um colaborador específico."
                action={<ActionButton tone="warning" icon={Zap} onClick={onNew}>Nova Exceção</ActionButton>}
              />
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function useModuleData() {
  const [data, setData] = useState({
    status: null,
    overview: null,
    domainPolicies: [],
    blocklist: [],
    allowlist: [],
    vlans: [],
    exceptions: [],
    sporadicExceptions: [],
    metrics: null,
    audit: [],
    auditEvents: { events: [], summary: {} },
    realtimeRadar: { events: [], summary: {} },
    health: null,
    contingency: null,
    contingencyAudit: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingState, setLoadingState] = useState({ critical: true, secondary: false });
  const [banner, setBanner] = useState(null);

  const flash = (text, tone = 'neutral') => {
    setBanner({ text, tone });
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => setBanner(null), 3600);
  };

  const fetchJson = async (endpoint, timeoutMs = 9000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await authFetch(`${API}/api/bloqueios-liberacoes/${endpoint}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Falha em ${endpoint}`);
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setLoadingState({ critical: true, secondary: true });

    const criticalRequests = [
      { key: 'domainPolicies', endpoint: 'domain-policies' },
      { key: 'blocklist', endpoint: 'blocklist' },
      { key: 'allowlist', endpoint: 'allowlist' },
      { key: 'vlans', endpoint: 'vlans' },
      { key: 'exceptions', endpoint: 'exceptions' },
      { key: 'sporadicExceptions', endpoint: 'sporadic-exceptions' },
    ];
    const critical = await Promise.allSettled(
      criticalRequests.map((request) => fetchJson(request.endpoint)),
    );
    const criticalFailures = [];

    setData((current) => {
      const next = { ...current };
      critical.forEach((result, index) => {
        const { key, endpoint } = criticalRequests[index];
        if (result.status === 'fulfilled') {
          next[key] = Array.isArray(result.value) ? result.value : current[key];
          return;
        }
        criticalFailures.push(endpoint);
      });
      return next;
    });

    setLoading(false);
    setLoadingState((current) => ({ ...current, critical: false }));

    const secondaryRequests = [
      { key: 'status', endpoint: 'status', timeoutMs: 15000 },
      { key: 'overview', endpoint: 'overview', timeoutMs: 15000 },
      { key: 'metrics', endpoint: 'metrics?range=24h', timeoutMs: 12000 },
      { key: 'audit', endpoint: 'audit', timeoutMs: 12000 },
      { key: 'auditEvents', endpoint: 'audit/events?period=24h&limit=300', timeoutMs: 12000 },
      { key: 'realtimeRadar', endpoint: 'radar/realtime?window_minutes=10&limit=150', timeoutMs: 12000 },
      { key: 'health', endpoint: 'health', timeoutMs: 15000 },
      { key: 'contingency', endpoint: 'contingency/status', timeoutMs: 12000 },
      { key: 'contingencyAudit', endpoint: 'contingency/audit', timeoutMs: 12000 },
    ];
    const secondary = await Promise.allSettled(
      secondaryRequests.map((request) => fetchJson(request.endpoint, request.timeoutMs)),
    );
    const secondaryFailures = [];

    setData((current) => {
      const next = { ...current };
      secondary.forEach((result, index) => {
        const { key, endpoint } = secondaryRequests[index];
        if (result.status !== 'fulfilled') {
          secondaryFailures.push(endpoint);
          return;
        }

        const value = result.value;
        if (key === 'audit') next.audit = Array.isArray(value) ? value : current.audit;
        else if (key === 'auditEvents') next.auditEvents = value?.events ? value : current.auditEvents;
        else if (key === 'realtimeRadar') next.realtimeRadar = value?.events ? value : current.realtimeRadar;
        else if (key === 'contingencyAudit') next.contingencyAudit = Array.isArray(value) ? value : current.contingencyAudit;
        else next[key] = value ?? current[key];
      });
      return next;
    });

    const failedEndpoints = [...criticalFailures, ...secondaryFailures];
    if (failedEndpoints.length) {
      flash(`Falha parcial ao carregar: ${failedEndpoints.join(', ')}`, 'warning');
    }

    setLoadingState({ critical: false, secondary: false });
  };

  useEffect(() => {
    loadAll().catch((error) => flash(error.message || 'Falha ao carregar módulo', 'danger'));
  }, []);

  return { data, setData, loadAll, loading, loadingState, banner, flash };
}

const MODULE_CONTEXT = {
  eyebrow: (
    <span className="inline-flex items-center gap-2">
      <ShieldCheck size={14} />
      Governança de Bloqueios
    </span>
  ),
  title: 'Políticas, exceções e enforcement em uma leitura institucional única',
  description: 'Este módulo passa a organizar decisão administrativa, escopo de rede, conformidade e execução técnica na mesma linguagem visual. A leitura privilegia clareza para governança sem perder profundidade operacional.',
};

export default function BlockingReleases({ initialTab = 'overview', allowedTabs = null }) {
  const { data, setData, loadAll, loading, loadingState, banner, flash } = useModuleData();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get('tab');
  const resolveTab = (candidate) => (TABS.some((tab) => tab.key === candidate) ? candidate : 'overview');
  const [activeTab, setActiveTab] = useState(() => resolveTab(tabFromQuery || initialTab));
  const [scopeEditor, setScopeEditor] = useState({ open: false, scopeType: 'global', scopeValue: 'global' });
  const [policyEditor, setPolicyEditor] = useState({ open: false, item: null });
  const [auditPolicyAttach, setAuditPolicyAttach] = useState({ open: false, event: null });
  const [vipEditor, setVipEditor] = useState({ open: false, item: null });
  const [sporadicEditor, setSporadicEditor] = useState({ open: false });
  const [vlanEditor, setVlanEditor] = useState({ open: false, item: null });
  const [contingencyEditor, setContingencyEditor] = useState({ open: false, mode: 'activate' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', subtitle: '', bullets: [], tone: 'warning', confirmLabel: 'Confirmar', action: null });
  const [working, setWorking] = useState({ policy: false, vip: false, sporadic: false, contingency: false, engine: false, audit: false });
  const [policySearch, setPolicySearch] = useState('');
  const [policyFilters, setPolicyFilters] = useState({ type: 'all', status: 'all', scope: 'all' });
  const [vlanSearch, setVlanSearch] = useState('');
  const [vlanFilters, setVlanFilters] = useState({
    standard: 'all',
    vip: 'all',
    monitoring: 'all',
    blocking: 'all',
    status: 'all',
  });
  const [vipSearch, setVipSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilters, setAuditFilters] = useState({ period: '24h', action: 'all', vlan: 'all', source: 'all' });
  const [radarSearch, setRadarSearch] = useState('');
  const [radarFilters, setRadarFilters] = useState({ window: '10', action: 'all', source: 'all', vlan: 'all' });
  const deferredPolicySearch = useDeferredValue(policySearch);
  const deferredVlanSearch = useDeferredValue(vlanSearch);
  const deferredVipSearch = useDeferredValue(vipSearch);
  const deferredAuditSearch = useDeferredValue(auditSearch);
  const deferredRadarSearch = useDeferredValue(radarSearch);
  const currentContext = MODULE_CONTEXT;
  const visibleTabs = Array.isArray(allowedTabs) && allowedTabs.length
    ? TABS.filter((tab) => allowedTabs.includes(tab.key))
    : TABS;
  const firstVisibleTab = visibleTabs[0]?.key || 'overview';
  const initialVisibleTab = visibleTabs.some((tab) => tab.key === initialTab) ? initialTab : firstVisibleTab;

  useEffect(() => {
    const desiredTab = visibleTabs.some((tab) => tab.key === tabFromQuery)
      ? tabFromQuery
      : initialVisibleTab;
    if (desiredTab !== activeTab) {
      setActiveTab(desiredTab);
    }
    if (searchParams.get('tab') !== desiredTab) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('tab', desiredTab);
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeTab, initialVisibleTab, searchParams, setSearchParams, tabFromQuery, visibleTabs]);

  const handleTabChange = (tabKey) => {
    if (!visibleTabs.some((tab) => tab.key === tabKey)) return;
    setActiveTab(tabKey);
    if (searchParams.get('tab') === tabKey) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabKey);
    setSearchParams(nextParams, { replace: true });
  };

  const requestAction = async (endpoint, method = 'POST', body) => {
    const response = await authFetch(`${API}/api/bloqueios-liberacoes/${endpoint}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Falha operacional');
    }
    return payload;
  };

  const runAction = async (endpoint, method = 'POST', body, options = { reload: true }) => {
    const payload = await requestAction(endpoint, method, body);
    if (options.reload !== false) {
      await loadAll();
    }
    return payload;
  };

  const engineMode = data.status?.engine?.enforcement_mode || 'acl-plus-dns';
  const availableModes = data.status?.engine?.available_modes || [
    { key: 'acl-only', label: 'ACL', hint: 'Aplica somente regras de ACL, sem enforcement DNS.' },
    { key: 'acl-plus-dns', label: 'ACL + DNS', hint: 'Combina ACL com enforcement DNS no Unbound.' },
    { key: 'intercept-selective', label: 'Interceptação Seletiva', hint: 'Ativa a interceptação complementar apenas quando exigida.' },
  ];
  const contingency = data.contingency || data.status?.contingency || data.health?.contingency || null;
  const contingencyActive = contingency?.status === 'active';
  const emergencyBypassActive = Boolean(data.status?.engine?.emergency_bypass || data.health?.engine?.emergency_bypass);
  const managedVlanIds = useMemo(() => {
    const raw = data.status?.engine?.managed_vlan_ids || data.vlans?.map((row) => row.vlan_id);
    if (!Array.isArray(raw) || !raw.length) return MANAGED_VLAN_IDS;
    const normalized = raw.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    return normalized.length ? normalized.sort((left, right) => left - right) : MANAGED_VLAN_IDS;
  }, [data.status?.engine?.managed_vlan_ids]);
  const internalDnsByVlan = data.status?.engine?.internal_dns_by_vlan || Object.fromEntries((data.vlans || []).map((row) => [row.vlan_id, toSubnetGateway(row.subnet_cidr)])) || FALLBACK_INTERNAL_DNS_BY_VLAN;
  const internalDnsEntries = useMemo(
    () => managedVlanIds.map((vlanId) => ({
      vlanId,
      dns: internalDnsByVlan?.[vlanId] || FALLBACK_INTERNAL_DNS_BY_VLAN[vlanId] || '—',
    })),
    [internalDnsByVlan, managedVlanIds],
  );

  const sortedVlans = useMemo(
    () => [...(data.vlans || [])].sort((a, b) => Number(a.vlan_id) - Number(b.vlan_id)),
    [data.vlans],
  );

  const namedPolicies = useMemo(
    () => [...(data.domainPolicies || [])].sort((a, b) => Number(Boolean(b.enabled)) - Number(Boolean(a.enabled)) || String(a.name || '').localeCompare(String(b.name || ''))),
    [data.domainPolicies],
  );
  const globalScopePolicies = useMemo(
    () => namedPolicies.filter((policy) => policy.scope_type === 'global'),
    [namedPolicies],
  );
  const vlanScopePolicies = useMemo(
    () => namedPolicies.filter((policy) => policy.scope_type === 'vlan'),
    [namedPolicies],
  );
  const scopeEditorPolicies = scopeEditor.scopeType === 'global' ? globalScopePolicies : vlanScopePolicies;
  const scopeEditorInheritedPolicies = scopeEditor.scopeType === 'vlan'
    ? globalScopePolicies.filter((policy) => policy.enabled)
    : [];

  const vlanPolicies = useMemo(
    () => sortedVlans.map((vlan) => {
      const inStandard = vlanIsInStandard(vlan);
      const appliedPolicies = inStandard ? namedPolicies.filter((policy) => policyAppliesToScope(policy, 'vlan', vlan.vlan_id)) : [];
      const allowedCategories = appliedPolicies.filter((item) => item.policy_type === 'allow');
      const blockedCategories = appliedPolicies.filter((item) => item.policy_type === 'block');
      const vipCount = (data.exceptions || []).filter((item) => item.active && String(item.vlan_id || '') === String(vlan.vlan_id)).length;
      return {
        ...vlan,
        inStandard,
        categories: appliedPolicies,
        allowedCategories,
        blockedCategories,
        conflictCategories: [],
        vipCount,
        rulesCount: allowedCategories.length + blockedCategories.length,
        dns: internalDnsByVlan?.[vlan.vlan_id] || FALLBACK_INTERNAL_DNS_BY_VLAN[vlan.vlan_id] || '—',
        statusSummary: summarizeVlanStatus({ ...vlan, inStandard }),
        controlsSummary: summarizeVlanControls({ ...vlan, inStandard }),
        shortDescription: shortVlanDescription(vlan),
      };
    }),
    [data.exceptions, internalDnsByVlan, namedPolicies, sortedVlans],
  );

  const filteredDomainPolicies = useMemo(() => {
    const search = normalizeText(deferredPolicySearch);
    return [...(data.domainPolicies || [])]
      .filter((policy) => {
        if (policyFilters.type !== 'all' && policy.policy_type !== policyFilters.type) return false;
        if (policyFilters.status === 'active' && !policy.enabled) return false;
        if (policyFilters.status === 'inactive' && policy.enabled) return false;
        if (policyFilters.scope !== 'all' && policy.scope_type !== policyFilters.scope) return false;
        if (!search) return true;
        return [
          policy.name,
          policy.description,
          policy.governance_summary,
          policy.legal_basis,
          policy.requested_by,
          policy.approval_scope,
          policy.lifecycle_status,
          policy.policy_type,
          policy.scope_value,
          ...(policy.domains || []),
          ...((policy.entries || []).map((entry) => entry.domain || entry.normalized_domain)),
        ].some((value) => normalizeText(value).includes(search));
      })
      .sort((a, b) => Number(Boolean(b.enabled)) - Number(Boolean(a.enabled)) || new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());
  }, [data.domainPolicies, deferredPolicySearch, policyFilters]);

  const activeVips = useMemo(
    () => (data.exceptions || []).filter((row) => row.active),
    [data.exceptions],
  );
  const vlanMatrixCards = useMemo(
    () => vlanPolicies.map((vlan) => ({
      ...vlan,
      currentMode: vlan.policy_mode === 'selective-intercept' ? 'Interceptação seletiva' : 'Política categórica',
    })),
    [vlanPolicies],
  );
  const filteredVlanPolicies = useMemo(() => {
    const search = normalizeText(deferredVlanSearch);
    return vlanPolicies.filter((vlan) => {
      if (vlanFilters.standard === 'in' && !vlan.inStandard) return false;
      if (vlanFilters.standard === 'out' && vlan.inStandard) return false;
      if (vlanFilters.vip === 'with' && !vlan.vipCount) return false;
      if (vlanFilters.vip === 'without' && vlan.vipCount) return false;
      if (vlanFilters.monitoring === 'on' && !vlan.monitoring_enabled) return false;
      if (vlanFilters.monitoring === 'off' && vlan.monitoring_enabled) return false;
      if (vlanFilters.blocking === 'on' && !vlan.blocking_enabled) return false;
      if (vlanFilters.blocking === 'off' && vlan.blocking_enabled) return false;
      if (vlanFilters.status === 'active' && !vlan.inStandard) return false;
      if (vlanFilters.status === 'reduced' && vlan.inStandard && vlan.monitoring_enabled && vlan.blocking_enabled && !vlan.exempt) return false;
      if (vlanFilters.status === 'reduced' && !vlan.inStandard) return false;
      if (vlanFilters.status === 'inactive' && vlan.inStandard) return false;
      if (!search) return true;
      return [
        vlan.vlan_id,
        vlan.label,
        vlan.interface_name,
        vlan.subnet_cidr,
        vlan.shortDescription,
        vlan.statusSummary,
        vlan.controlsSummary,
      ].some((value) => normalizeText(value).includes(search));
    });
  }, [deferredVlanSearch, vlanFilters, vlanPolicies]);

  const filteredVips = useMemo(() => {
    const search = normalizeText(deferredVipSearch);
    return [...(data.exceptions || [])]
      .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
      .filter((row) => {
        if (!search) return true;
        return [row.ip, row.description, row.hostname, row.notes, row.reason, row.governance_summary, row.legal_basis, row.requested_by, row.approval_scope, row.lifecycle_status]
          .some((value) => normalizeText(value).includes(search));
      });
  }, [data.exceptions, deferredVipSearch]);

  const filteredAudit = useMemo(() => {
    const search = normalizeText(deferredAuditSearch);
    return [...(data.audit || [])]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .filter((row) => {
        if (!search) return true;
        return [row.action, row.requested_by, row.domain, row.ip, row.message]
          .some((value) => normalizeText(value).includes(search));
      });
  }, [data.audit, deferredAuditSearch]);

  const filteredOperationalAudit = useMemo(() => {
    const search = normalizeText(deferredAuditSearch);
    return [...(data.auditEvents?.events || [])]
      .filter((row) => {
        if (auditFilters.action !== 'all' && row.action !== auditFilters.action) return false;
        if (auditFilters.vlan !== 'all' && String(row.vlan_id || '') !== String(auditFilters.vlan)) return false;
        if (auditFilters.source !== 'all' && row.source !== auditFilters.source) return false;
        if (!search) return true;
        return [row.client_ip, row.hostname, row.identity_user, row.identity_display_user, row.identity_computer, row.domain, row.action, row.policy_label, row.matched_policy_name, row.category]
          .some((value) => normalizeText(value).includes(search));
      })
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [auditFilters, data.auditEvents, deferredAuditSearch]);

  const operationalAuditSummary = data.auditEvents?.summary || {};
  const filteredRealtimeRadar = useMemo(() => {
    const search = normalizeText(deferredRadarSearch);
    return [...(data.realtimeRadar?.events || [])]
      .filter((row) => {
        if (radarFilters.action !== 'all' && row.action !== radarFilters.action) return false;
        if (radarFilters.source !== 'all' && row.source !== radarFilters.source) return false;
        if (radarFilters.vlan !== 'all' && String(row.vlan_id || '') !== String(radarFilters.vlan)) return false;
        if (!search) return true;
        return [row.client_ip, row.hostname, row.identity_user, row.identity_display_user, row.identity_computer, row.domain, row.policy_label, row.matched_policy_name, row.category]
          .some((value) => normalizeText(value).includes(search));
      })
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [data.realtimeRadar, deferredRadarSearch, radarFilters]);
  const realtimeRadarSummary = useMemo(() => {
    const evts = data.realtimeRadar?.events || [];
    return {
      total: evts.length,
      dns: evts.filter((e) => e.source === 'dns').length,
      proxy: evts.filter((e) => e.source === 'proxy').length,
      blocked: evts.filter((e) => e.action === 'blocked').length,
      allowed: evts.filter((e) => e.action === 'allowed').length,
      bypassed: evts.filter((e) => e.action === 'bypassed').length,
      unique_ips: new Set(evts.map((e) => e.client_ip).filter(Boolean)).size,
      unique_domains: new Set(evts.map((e) => e.domain).filter(Boolean)).size,
      last_seen_at: evts[0]?.timestamp || evts[0]?.occurred_at || null,
    };
  }, [data.realtimeRadar?.events]);
  const globalAllowedCount = namedPolicies.filter((item) => item.enabled && item.scope_type === 'global' && item.policy_type === 'allow').length;
  const globalBlockedCount = namedPolicies.filter((item) => item.enabled && item.scope_type === 'global' && item.policy_type === 'block').length;
  const vlansWithOwnPolicy = vlanPolicies.filter((item) => item.allowedCategories.length || item.blockedCategories.length || item.conflictCategories.length).length;
  const healthTone = toneFromStatus(data.status?.engine?.health_status || data.health?.integrity_score || data.health?.services?.policy_compiler);

  const headerBadges = (
    <>
      <StateBadge label="Padrão SGCG" tone="primary" title="O módulo segue a linguagem institucional consolidada do sistema." />
      <StateBadge label="Governança + Controle" tone="success" title="Decisão, exceção, auditoria e enforcement técnico no mesmo fluxo." />
      <StateBadge label={`${managedVlanIds.length} VLANs no módulo`} tone="neutral" title="A lista operacional é dinâmica e vem do cadastro do produto." />
      <StateBadge label="VIP = exceção total" tone="danger" title="VIP sai livre pelo firewall e não segue bloqueios comuns." />
      <StateBadge label="DNS interno preservado" tone="success" title="Cada VLAN operacional preserva o gateway interno tratado como válido." />
      <StateBadge label="DNS interno por VLAN" tone="success" title="Cada VLAN operacional preserva o gateway interno tratado como válido." />
      <StateBadge label={emergencyBypassActive ? 'Emergência ativa' : 'Emergência pronta'} tone={emergencyBypassActive ? 'danger' : 'warning'} />
      <StateBadge label={contingencyActive ? 'Contingência ativa' : 'Contingência pronta'} tone={contingencyActive ? 'danger' : 'success'} />
    </>
  );

  const quickActionItems = [
    {
      label: 'Editar global',
      tone: 'primary',
      icon: Layers3,
      onClick: () => setScopeEditor({ open: true, scopeType: 'global', scopeValue: 'global' }),
    },
    {
      label: 'Nova política',
      tone: 'success',
      icon: Plus,
      onClick: () => setPolicyEditor({ open: true, item: null }),
    },
    {
      label: 'Adicionar VIP',
      tone: 'warning',
      icon: Plus,
      onClick: () => setVipEditor({ open: true, item: null }),
    },
    {
      label: emergencyBypassActive ? 'Emergência OFF' : 'Emergência ON',
      tone: 'danger',
      icon: ShieldAlert,
      onClick: () => openEmergencyBypassDialog(!emergencyBypassActive),
    },
    {
      label: 'Contingência',
      tone: contingencyActive ? 'danger' : 'neutral',
      icon: Flame,
      onClick: () => startTransition(() => handleTabChange('contingency')),
    },
    {
      label: 'Apply',
      tone: 'success',
      icon: Power,
      onClick: () => runEngineAction('apply', 'Políticas aplicadas.'),
    },
    {
      label: 'Atualizar',
      tone: 'ghost',
      icon: RefreshCcw,
      onClick: () => loadAll().then(() => flash('Status atualizado.', 'success')).catch((error) => flash(error.message || 'Falha ao atualizar.', 'danger')),
    },
  ];

  const overviewCards = [
    {
      icon: ShieldCheck,
      eyebrow: 'Modo atual',
      title: 'Modo operacional do motor',
      value: emergencyBypassActive ? 'Emergência' : (MODE_LABELS[engineMode] || engineMode),
      subtitle: emergencyBypassActive ? 'ACL, DNS e interceptação suspensos globalmente.' : 'Leitura direta do enforcement ativo, sem debug extra na tela principal.',
      tone: emergencyBypassActive ? 'danger' : 'primary',
    },
    {
      icon: Layers3,
      eyebrow: 'Políticas globais',
      title: 'Categorias ativas globalmente',
      value: `${globalBlockedCount} bloqueios / ${globalAllowedCount} liberações`,
      subtitle: 'Resumo compacto do que vale para toda a operação.',
      tone: globalBlockedCount ? 'danger' : 'neutral',
    },
    {
      icon: Network,
      eyebrow: 'VLANs com regra própria',
      title: 'Escopos por VLAN ativos',
      value: vlansWithOwnPolicy,
      subtitle: 'Mostra quantas VLANs têm regra própria no contexto atual do produto.',
      tone: vlansWithOwnPolicy ? 'success' : 'neutral',
    },
    {
      icon: Shield,
      eyebrow: 'VIPs ativos',
      title: 'Bypass total real',
      value: activeVips.length,
      subtitle: 'VIP sai livre pelo firewall e usa Unbound recursivo com passthrough de bloqueios.',
      tone: activeVips.length ? 'warning' : 'neutral',
    },
    {
      icon: Flame,
      eyebrow: 'Contingência DNS',
      title: 'Estado da contingência',
      value: contingencyActive ? 'Ativa' : 'Normal',
      subtitle: contingencyActive ? 'Fallback público temporário em uso.' : 'DNS interno como padrão operacional.',
      tone: contingencyActive ? 'danger' : 'success',
    },
    {
      icon: Cpu,
      eyebrow: 'Saúde do motor',
      title: 'Leitura operacional',
      value: data.status?.engine?.health_status || data.health?.integrity_score || 'monitorando',
      subtitle: 'Compiler, Unbound, Squid e drift em leitura agregada.',
      tone: healthTone,
    },
  ];

  const engineCards = [
    {
      icon: Sparkles,
      label: 'Policy Compiler',
      status: data.health?.services?.policy_compiler || data.status?.engine?.compiler_status || 'unknown',
      subtitle: `Manifesto ${data.health?.divergence?.compiler_version || data.status?.engine?.compiler_version || '—'}`,
      detail: data.status?.engine?.last_error || 'Sem erro recente.',
    },
    {
      icon: ShieldCheck,
      label: 'Unbound',
      status: data.health?.services?.unbound || 'unknown',
      subtitle: 'Enforcement principal por DNS.',
      detail: data.health?.validation?.unbound_validation?.stderr || 'Sem erro recente.',
    },
    {
      icon: Waypoints,
      label: 'Squid',
      status: data.health?.services?.squid || 'unknown',
      subtitle: 'Camada complementar explícita.',
      detail: (data.health?.warnings?.squid || []).join(' | ') || 'Sem warning relevante.',
    },
    {
      icon: ScanSearch,
      label: 'Drift',
      status: data.health?.services?.drift_monitor || (data.health?.divergence?.mode_mismatch ? 'degraded' : 'healthy'),
      subtitle: 'Banco, manifesto e artefatos.',
      detail: data.health?.divergence?.mode_mismatch ? 'Manifesto diferente do estado persistido.' : 'Sem divergência relevante.',
    },
    {
      icon: Database,
      label: 'PostgreSQL',
      status: data.health?.services?.postgresql || 'unknown',
      subtitle: 'Source of truth das políticas.',
      detail: 'Listas, exceções, auditoria e estado do motor.',
    },
    {
      icon: Flame,
      label: 'Contingência DNS',
      status: contingency?.status || 'normal',
      subtitle: contingencyActive ? 'Fallback público ativo.' : 'Sem contingência em curso.',
      detail: contingency?.reason || 'Operação dentro do padrão.',
    },
  ];

  const activeAlerts = useMemo(() => {
    const alerts = [];
    if (contingencyActive) {
      alerts.push({
        tone: 'danger',
        text: `Contingência DNS ativa em ${contingency?.scope_type === 'vlan' ? `VLAN ${(contingency?.vlan_ids || []).join(', ')}` : 'escopo global'}.`,
      });
    }
    if (emergencyBypassActive) {
      alerts.push({
        tone: 'danger',
        text: 'Bypass de emergência ativo: ACL, DNS e interceptação estão suspensos para todas as VLANs do módulo.',
      });
    }
    if (data.health?.divergence?.mode_mismatch) {
      alerts.push({ tone: 'danger', text: 'Existe drift entre manifesto compilado e modo persistido.' });
    }
    if (data.health && !data.health?.integrity?.compiler_manifest) {
      alerts.push({ tone: 'danger', text: 'Manifesto do compilador ausente.' });
    }
    if (data.health && !data.health?.integrity?.allowed_rpz) {
      alerts.push({ tone: 'danger', text: 'RPZ de allowlist ausente ou inválido.' });
    }
    if (!(data.health?.warnings?.squid || []).length && !alerts.length) {
      alerts.push({ tone: 'success', text: 'Nenhum alerta crítico visível na leitura atual.' });
    }
    return alerts;
  }, [contingency, contingencyActive, data.health, emergencyBypassActive]);

  const changeEngineMode = async (mode) => {
    setWorking((current) => ({ ...current, engine: true }));
    try {
      await requestAction('mode', 'POST', { mode, apply_now: true });
      await loadAll();
      flash(`Modo ${MODE_LABELS[mode] || mode} aplicado.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao alterar modo do motor.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, engine: false }));
    }
  };

  const scopeEditorLabel = scopeEditor.scopeType === 'vlan'
    ? `VLAN ${scopeEditor.scopeValue}`
    : 'Escopo Global';
  const scopeEditorMeta = useMemo(() => (
    scopeEditor.scopeType === 'vlan'
      ? vlanPolicies.find((item) => Number(item.vlan_id) === Number(scopeEditor.scopeValue)) || null
      : null
  ), [scopeEditor, vlanPolicies]);

  const scopeEditorInitialState = useMemo(() => {
    if (!scopeEditor.open) return {};
    return Object.fromEntries(scopeEditorPolicies.map((policy) => ([
      policy.id,
      policyAppliesToScope(policy, scopeEditor.scopeType, scopeEditor.scopeValue) ? 'on' : 'off',
    ])));
  }, [scopeEditor, scopeEditorPolicies]);

  const handleScopeEditorSave = async (draft) => {
    setWorking((current) => ({ ...current, policy: true }));
    try {
      for (const policy of scopeEditorPolicies) {
        const desired = draft[policy.id] === 'on';
        if (scopeEditor.scopeType === 'global') {
          await requestAction(`domain-policies/${policy.id}`, 'PATCH', {
            name: policy.name,
            policy_type: policy.policy_type,
            scope_type: 'global',
            domains: policy.domains,
            description: policy.description || '',
            enabled: desired,
          });
          continue;
        }

        const currentVlanIds = policy.scope_type === 'vlan' ? (policy.vlan_ids || []).map(Number).filter(Number.isFinite) : [];
        const nextVlanIds = desired
          ? Array.from(new Set([...currentVlanIds, Number(scopeEditor.scopeValue)])).sort((left, right) => left - right)
          : currentVlanIds.filter((vlanId) => vlanId !== Number(scopeEditor.scopeValue));

        if (!nextVlanIds.length) {
          await requestAction(`domain-policies/${policy.id}`, 'PATCH', {
            name: policy.name,
            policy_type: policy.policy_type,
            scope_type: policy.scope_type,
            vlan_ids: currentVlanIds.length ? currentVlanIds : [Number(scopeEditor.scopeValue)],
            domains: policy.domains,
            description: policy.description || '',
            enabled: false,
          });
          continue;
        }

        await requestAction(`domain-policies/${policy.id}`, 'PATCH', {
          name: policy.name,
          policy_type: policy.policy_type,
          scope_type: 'vlan',
          vlan_ids: nextVlanIds,
          domains: policy.domains,
          description: policy.description || '',
          enabled: true,
        });
      }
      await runAction('apply', 'POST', undefined, { reload: false });
      await loadAll();
      setScopeEditor({ open: false, scopeType: 'global', scopeValue: 'global' });
      flash(`${scopeEditorLabel} atualizado com sucesso.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao salvar políticas do escopo.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, policy: false }));
    }
  };

  const saveDomainPolicy = async (form) => {
    setWorking((current) => ({ ...current, policy: true }));
    try {
      if (policyEditor.item?.id) {
        await requestAction(`domain-policies/${policyEditor.item.id}`, 'PATCH', form);
      } else {
        await requestAction('domain-policies', 'POST', form);
      }
      const shouldDisconnectActiveSessions = form.policy_type === 'block' && form.enabled;
      await runAction('apply', 'POST', shouldDisconnectActiveSessions ? {
        disconnect_active_sessions: true,
        domains: form.domains,
        vlan_ids: form.scope_type === 'vlan' ? form.vlan_ids : [],
        lookback_minutes: 20,
      } : undefined, { reload: false });
      await loadAll();
      setPolicyEditor({ open: false, item: null });
      flash(
        shouldDisconnectActiveSessions
          ? (policyEditor.item ? 'Política atualizada, aplicada e sessões ativas derrubadas.' : 'Política criada, aplicada e sessões ativas derrubadas.')
          : (policyEditor.item ? 'Política atualizada e aplicada.' : 'Política criada e aplicada.'),
        'success',
      );
    } catch (error) {
      flash(error.message || 'Falha ao salvar política.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, policy: false }));
    }
  };

  const toggleDomainPolicy = async (policy) => {
    setWorking((current) => ({ ...current, policy: true }));
    try {
      await requestAction(`domain-policies/${policy.id}/toggle`, 'POST');
      const willEnableBlocking = !policy.enabled && policy.policy_type === 'block';
      await runAction('apply', 'POST', willEnableBlocking ? {
        disconnect_active_sessions: true,
        domains: policy.domains,
        vlan_ids: policy.scope_type === 'vlan' ? (policy.vlan_ids || []) : [],
        lookback_minutes: 20,
      } : undefined, { reload: false });
      await loadAll();
      flash(
        willEnableBlocking
          ? 'Política ativada e sessões ativas derrubadas.'
          : (policy.enabled ? 'Política desativada.' : 'Política ativada.'),
        'success',
      );
    } catch (error) {
      flash(error.message || 'Falha ao alterar política.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, policy: false }));
    }
  };

  const duplicateDomainPolicy = async (policy) => {
    setWorking((current) => ({ ...current, policy: true }));
    try {
      await requestAction(`domain-policies/${policy.id}/duplicate`, 'POST');
      await loadAll();
      flash('Política duplicada como inativa.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao duplicar política.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, policy: false }));
    }
  };

  const deleteDomainPolicy = async (policy) => {
    setWorking((current) => ({ ...current, policy: true }));
    try {
      await requestAction(`domain-policies/${policy.id}`, 'DELETE');
      await runAction('apply', 'POST', undefined, { reload: false });
      await loadAll();
      flash('Política excluída e runtime reaplicado.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao excluir política.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, policy: false }));
    }
  };

  const loadOperationalAudit = async () => {
    setWorking((current) => ({ ...current, audit: true }));
    try {
      const params = new URLSearchParams();
      params.set('period', auditFilters.period);
      params.set('limit', '500');
      if (auditFilters.action !== 'all') params.set('action', auditFilters.action);
      if (auditFilters.vlan !== 'all') params.set('vlan', auditFilters.vlan);
      if (auditFilters.source !== 'all') params.set('source', auditFilters.source);
      if (auditSearch.trim()) {
        const raw = auditSearch.trim();
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) params.set('ip', raw);
        else if (raw.includes('.')) params.set('domain', raw);
        else params.set('hostname', raw);
      }
      const payload = await requestAction(`audit/events?${params.toString()}`, 'GET');
      setData((current) => ({ ...current, auditEvents: payload?.events ? payload : { events: [], summary: {} } }));
      flash('Relatório de dados atualizado.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao carregar auditoria.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, audit: false }));
    }
  };

  const loadRealtimeRadar = async (silent = false) => {
    try {
      const params = new URLSearchParams();
      params.set('window_minutes', radarFilters.window);
      params.set('limit', '220');
      if (radarFilters.action !== 'all') params.set('action', radarFilters.action);
      if (radarFilters.source !== 'all') params.set('source', radarFilters.source);
      if (radarFilters.vlan !== 'all') params.set('vlan', radarFilters.vlan);
      if (radarSearch.trim()) params.set('q', radarSearch.trim());
      const payload = await requestAction(`radar/realtime?${params.toString()}`, 'GET');
      setData((current) => ({ ...current, realtimeRadar: payload?.events ? payload : { events: [], summary: {} } }));
      if (!silent) flash('Radar em tempo real atualizado.', 'success');
    } catch (error) {
      if (!silent) flash(error.message || 'Falha ao carregar radar.', 'danger');
    }
  };

  const exportAuditPdf = async () => {
    try {
      const params = new URLSearchParams();
      params.set('period', auditFilters.period);
      params.set('limit', '700');
      if (auditFilters.action !== 'all') params.set('action', auditFilters.action);
      if (auditFilters.vlan !== 'all') params.set('vlan', auditFilters.vlan);
      if (auditFilters.source !== 'all') params.set('source', auditFilters.source);
      if (auditSearch.trim()) {
        const raw = auditSearch.trim();
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) params.set('ip', raw);
        else if (raw.includes('.')) params.set('domain', raw);
        else params.set('hostname', raw);
      }
      const response = await authFetch(`${API}/api/bloqueios-liberacoes/audit/export.pdf?${params.toString()}`);
      if (!response.ok) throw new Error('Falha ao exportar PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-governamental-acessos-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      flash('PDF do relatório de dados gerado.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao exportar PDF.', 'danger');
    }
  };

  const createAllowPolicyFromAudit = (event) => {
    setAuditPolicyAttach({ open: true, event });
  };

  const attachAuditDomainToPolicy = async (form) => {
    setWorking((current) => ({ ...current, policy: true }));
    try {
      if (form.mode === 'existing') {
        const policy = namedPolicies.find((item) => String(item.id) === String(form.policy_id));
        if (!policy) throw new Error('Política não encontrada');
        await requestAction(`domain-policies/${policy.id}`, 'PATCH', {
          name: policy.name,
          policy_type: policy.policy_type,
          scope_type: policy.scope_type,
          vlan_ids: policy.vlan_ids || [],
          domains: Array.from(new Set([...(policy.domains || []), form.domain])),
          description: policy.description || form.description || '',
          enabled: policy.enabled,
        });
        if (policy.policy_type === 'block' && policy.enabled) {
          await runAction('apply', 'POST', {
            disconnect_active_sessions: true,
            domains: Array.from(new Set([...(policy.domains || []), form.domain])),
            vlan_ids: policy.scope_type === 'vlan' ? (policy.vlan_ids || []) : [],
            lookback_minutes: 20,
          }, { reload: false });
        }
      } else {
        await requestAction('domain-policies', 'POST', {
          name: form.name.trim(),
          policy_type: form.policy_type,
          scope_type: form.scope_type,
          vlan_ids: form.scope_type === 'vlan' ? form.vlan_ids : [],
          domains: [form.domain],
          description: form.description.trim(),
          enabled: true,
        });
        if (form.policy_type === 'block') {
          await runAction('apply', 'POST', {
            disconnect_active_sessions: true,
            domains: [form.domain],
            vlan_ids: form.scope_type === 'vlan' ? form.vlan_ids : [],
            lookback_minutes: 20,
          }, { reload: false });
        }
      }
      await loadAll();
      setAuditPolicyAttach({ open: false, event: null });
      flash(`${form.domain} incluído na política.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao incluir domínio na política.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, policy: false }));
    }
  };

  const saveVip = async (form) => {
    setWorking((current) => ({ ...current, vip: true }));
    try {
      const payload = {
        ip: form.ip.trim(),
        description: form.description.trim(),
        notes: form.reason.trim(),
        governance_summary: form.governance_summary || form.reason.trim(),
        legal_basis: form.legal_basis || null,
        requested_by: form.requested_by || null,
        approval_scope: form.approval_scope || null,
        lifecycle_status: form.lifecycle_status || null,
        review_date: form.review_date || null,
        approved_by: form.approved_by || null,
        approved_at: form.approved_at || null,
        effective_from: form.effective_from || null,
        expires_at: form.expires_at || null,
        revoked_by: form.revoked_by || null,
        revoked_at: form.revoked_at || null,
        exception_type: 'bypass total',
        bypass_total: true,
        active: vipEditor.item ? Boolean(vipEditor.item.active) : true,
      };

      if (vipEditor.item?.id) {
        await requestAction(`exceptions/${vipEditor.item.id}`, 'PATCH', payload);
      } else {
        await requestAction('exceptions', 'POST', payload);
      }

      await loadAll();
      setVipEditor({ open: false, item: null });
      flash(vipEditor.item ? 'VIP atualizado com bypass total real.' : 'VIP criado com firewall livre e Unbound recursivo liberado.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao salvar VIP.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, vip: false }));
    }
  };

  const toggleVip = async (item) => {
    try {
      await runAction(`exceptions/${item.id}`, 'PATCH', {
        ...item,
        active: !item.active,
        exception_type: item.exception_type || 'bypass total',
        bypass_total: true,
      });
      flash(`VIP ${item.active ? 'desativado' : 'ativado'}.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao alterar status do VIP.', 'danger');
    }
  };

  const removeVip = async (item) => {
    try {
      await runAction(`exceptions/${item.id}`, 'DELETE');
      flash('VIP removido.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao remover VIP.', 'danger');
    }
  };

  const saveSporadicException = async (form) => {
    setWorking((current) => ({ ...current, sporadic: true }));
    try {
      await requestAction('sporadic-exceptions', 'POST', form);
      await loadAll();
      setSporadicEditor({ open: false });
      flash('Exceção esporádica criada e motor atualizado imediatamente.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao criar exceção esporádica.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, sporadic: false }));
    }
  };

  const revokeSporadicException = async (item) => {
    setWorking((current) => ({ ...current, sporadic: true }));
    try {
      await requestAction(`sporadic-exceptions/${item.id}/revoke`, 'POST');
      await loadAll();
      flash('Exceção esporádica revogada e motor atualizado.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao revogar exceção.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, sporadic: false }));
    }
  };

  const saveVlan = async (form) => {
    setWorking((current) => ({ ...current, engine: true }));
    try {
      if (vlanEditor.item?.id && !String(vlanEditor.item.id).startsWith('virtual-')) {
        await requestAction(`vlans/${vlanEditor.item.id}`, 'PATCH', form);
      } else {
        await requestAction('vlans', 'POST', form);
      }
      await loadAll();
      setVlanEditor({ open: false, item: null });
      flash(vlanEditor.item ? `VLAN ${form.vlan_id} atualizada.` : `VLAN ${form.vlan_id} criada.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao salvar VLAN.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, engine: false }));
    }
  };

  const deleteVlan = async (item) => {
    setWorking((current) => ({ ...current, engine: true }));
    try {
      await requestAction(`vlans/${item.id}`, 'DELETE');
      await loadAll();
      flash(`VLAN ${item.vlan_id} excluída.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao excluir VLAN.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, engine: false }));
    }
  };

  const openVlanConfirmation = ({ item, mode }) => {
    const rulesCount = item.rulesCount || 0;
    const bullets = mode === 'delete'
      ? [
          `VLAN ${item.vlan_id} será removida da listagem do módulo.`,
          `${rulesCount} regra(s) hoje visíveis neste escopo deixarão de aparecer na operação.`,
          `${item.vipCount || 0} VIP(s) continuam existindo, mas a leitura vinculada desta VLAN muda.`,
        ]
      : [
          `VLAN ${item.vlan_id} sairá do padrão operacional do módulo.`,
          `${rulesCount} regra(s) deixam de valer neste escopo enquanto a VLAN ficar fora do padrão.`,
          `Monitoramento: ${item.monitoring_enabled ? 'ativo' : 'inativo'} • Bloqueio: ${item.blocking_enabled ? 'ativo' : 'inativo'}.`,
        ];

    setConfirmDialog({
      open: true,
      title: mode === 'delete' ? `Excluir VLAN ${item.vlan_id}` : `Alterar participação da VLAN ${item.vlan_id}`,
      subtitle: mode === 'delete'
        ? 'Revise o impacto antes de confirmar a exclusão.'
        : 'Revise o impacto antes de tirar esta VLAN do padrão operacional.',
      bullets,
      tone: mode === 'delete' ? 'danger' : 'warning',
      confirmLabel: mode === 'delete' ? 'Excluir VLAN' : 'Desligar do padrão',
      action: async () => {
        if (mode === 'delete') {
          await deleteVlan(item);
        } else {
          await setVlanStandard(item, false);
        }
      },
    });
  };

  const setVlanStandard = async (item, enabled) => {
    if (!item?.id || String(item.id).startsWith('virtual-')) {
      setVlanEditor({
        open: true,
        item: {
          ...item,
          exempt: !enabled,
          blocking_enabled: enabled,
          monitoring_enabled: enabled,
        },
      });
      return;
    }

    setWorking((current) => ({ ...current, engine: true }));
    try {
      await requestAction(`vlans/${item.id}`, 'PATCH', {
        vlan_id: item.vlan_id,
        label: item.label,
        interface_name: item.interface_name,
        subnet_cidr: item.subnet_cidr,
        notes: item.notes || '',
        exempt: !enabled,
        blocking_enabled: enabled,
        monitoring_enabled: enabled,
      });
      await loadAll();
      flash(enabled ? `VLAN ${item.vlan_id} entrou no padrão.` : `VLAN ${item.vlan_id} foi desligada do padrão.`, 'success');
    } catch (error) {
      flash(error.message || 'Falha ao atualizar participação da VLAN.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, engine: false }));
    }
  };

  function openEmergencyBypassDialog(enabled) {
    setConfirmDialog({
      open: true,
      title: enabled ? 'Ativar bypass de emergência' : 'Desativar bypass de emergência',
      subtitle: enabled
        ? 'Isso libera imediatamente todas as VLANs do módulo, ignorando ACL, DNS e interceptação.'
        : 'Isso restaura o enforcement institucional conforme o modo atualmente persistido.',
      bullets: enabled
        ? [
            'Todas as VLANs operacionais do módulo entram em bypass total.',
            'O Unbound deixa de aplicar RPZ e o Squid deixa de impor ACL categórica.',
            contingencyActive ? 'A contingência DNS ativa será suspensa para prevalecer o bypass global.' : 'Não há contingência DNS ativa para suspender.',
          ]
        : [
            'O motor recompila o enforcement institucional atual.',
            `O modo persistido volta a valer: ${MODE_LABELS[engineMode] || engineMode}.`,
            'ACL, DNS e interceptação voltam ao fluxo normal do módulo.',
          ],
      tone: 'danger',
      confirmLabel: enabled ? 'Ativar emergência' : 'Desativar emergência',
      action: async () => {
        setWorking((current) => ({ ...current, engine: true }));
        try {
          await requestAction('emergency-bypass', 'POST', { enabled });
          await loadAll();
          flash(
            enabled
              ? 'Bypass de emergência ativado para todas as VLANs.'
              : 'Bypass de emergência desativado e enforcement restaurado.',
            'success',
          );
        } catch (error) {
          flash(error.message || 'Falha ao alterar bypass de emergência.', 'danger');
          throw error;
        } finally {
          setWorking((current) => ({ ...current, engine: false }));
        }
      },
    });
  }

  const handleContingencySubmit = async (form) => {
    setWorking((current) => ({ ...current, contingency: true }));
    try {
      if (contingencyEditor.mode === 'renew') {
        await requestAction('contingency/renew', 'POST', {
          duration_minutes: form.duration_minutes === 'manual' ? 'manual' : Number(form.duration_minutes),
          reason: form.reason,
        });
      } else {
        await requestAction('contingency/activate', 'POST', {
          scope_type: form.scope_type,
          vlan_ids: form.scope_type === 'vlan' ? form.vlan_ids : [],
          providers: form.providers,
          duration_minutes: form.duration_minutes === 'manual' ? 'manual' : Number(form.duration_minutes),
          reason: form.reason,
        });
      }
      await loadAll();
      setContingencyEditor({ open: false, mode: 'activate' });
      flash(contingencyEditor.mode === 'renew' ? 'Contingência renovada.' : 'Contingência DNS ativada.', 'success');
    } catch (error) {
      flash(error.message || 'Falha ao processar contingência.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, contingency: false }));
    }
  };

  async function runEngineAction(endpoint, successText) {
    setWorking((current) => ({ ...current, engine: true }));
    try {
      await runAction(endpoint);
      flash(successText, 'success');
    } catch (error) {
      flash(error.message || 'Falha operacional.', 'danger');
    } finally {
      setWorking((current) => ({ ...current, engine: false }));
    }
  }

  useEffect(() => {
    if (activeTab !== 'observability' || loading) return undefined;
    loadRealtimeRadar(true);
  }, [activeTab, loading, radarFilters.window]);

  useEffect(() => {
    if (activeTab !== 'observability' || loading) return undefined;
    const token = localStorage.getItem('becker_token') || '';
    const es = new EventSource(`/api/dns/radar/live?token=${encodeURIComponent(token)}`);

    es.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        const normalized = {
          source: raw.source || 'dns',
          event_uid: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: raw.occurred_at,
          client_ip: raw.client_ip,
          vlan_id: raw.vlan_id,
          domain: raw.domain,
          url_or_host: raw.domain,
          action: raw.action,
          policy_source: raw.policy_source,
          category: raw.category,
          matched_rule: raw.matched_rule,
          identity_user: raw.identity_user,
          identity_computer: raw.identity_computer,
          hostname: raw.identity_computer,
          source_detail: raw.source || 'dns',
        };
        setData((current) => {
          const prev = current.realtimeRadar?.events || [];
          const next = [normalized, ...prev].slice(0, 500);
          return { ...current, realtimeRadar: { ...current.realtimeRadar, events: next } };
        });
      } catch {
        // payload inválido
      }
    };

    return () => es.close();
  }, [activeTab, loading]);

  return (
    <div className="blocking-module space-y-5 pb-6 xl:space-y-6 xl:pb-8" style={googleFontStyle}>
      <PolicyScopeEditorDialog
        open={scopeEditor.open}
        scopeType={scopeEditor.scopeType}
        scopeLabel={scopeEditorLabel}
        scopeMeta={scopeEditorMeta}
        policies={scopeEditorPolicies}
        inheritedPolicies={scopeEditorInheritedPolicies}
        initialState={scopeEditorInitialState}
        onClose={() => setScopeEditor({ open: false, scopeType: 'global', scopeValue: 'global' })}
        onSubmit={handleScopeEditorSave}
        saving={working.policy}
      />

      <DomainPolicyEditorDialog
        open={policyEditor.open}
        item={policyEditor.item}
        vlans={sortedVlans}
        onClose={() => setPolicyEditor({ open: false, item: null })}
        onSubmit={saveDomainPolicy}
        saving={working.policy}
      />

      <AuditPolicyAttachDialog
        open={auditPolicyAttach.open}
        event={auditPolicyAttach.event}
        policies={namedPolicies}
        vlans={sortedVlans}
        onClose={() => setAuditPolicyAttach({ open: false, event: null })}
        onSubmit={attachAuditDomainToPolicy}
        saving={working.policy}
      />

      <VipEditorDialog
        open={vipEditor.open}
        item={vipEditor.item}
        onClose={() => setVipEditor({ open: false, item: null })}
        onSubmit={saveVip}
        saving={working.vip}
      />

      <SporadicExceptionEditorDialog
        open={sporadicEditor.open}
        onClose={() => setSporadicEditor({ open: false })}
        onSubmit={saveSporadicException}
        saving={working.sporadic}
      />

      <VlanEditorDialog
        open={vlanEditor.open}
        item={vlanEditor.item}
        onClose={() => setVlanEditor({ open: false, item: null })}
        onSubmit={saveVlan}
        saving={working.engine}
      />

      <ContingencyDialog
        open={contingencyEditor.open}
        mode={contingencyEditor.mode}
        vlans={sortedVlans}
        onClose={() => setContingencyEditor({ open: false, mode: 'activate' })}
        onSubmit={handleContingencySubmit}
        saving={working.contingency}
      />

      <ConfirmationDialog
        open={confirmDialog.open}
        tone={confirmDialog.tone}
        title={confirmDialog.title}
        subtitle={confirmDialog.subtitle}
        bullets={confirmDialog.bullets}
        confirmLabel={confirmDialog.confirmLabel}
        loading={working.engine}
        onClose={() => setConfirmDialog({ open: false, title: '', subtitle: '', bullets: [], tone: 'warning', confirmLabel: 'Confirmar', action: null })}
        onConfirm={async () => {
          try {
            await confirmDialog.action?.();
          } finally {
            setConfirmDialog({ open: false, title: '', subtitle: '', bullets: [], tone: 'warning', confirmLabel: 'Confirmar', action: null });
          }
        }}
      />

      <ModuleHero
        eyebrow={currentContext.eyebrow}
        title={currentContext.title}
        description={currentContext.description}
        badges={headerBadges}
        aside={(
          <ThemeAwareSurface className="p-[var(--spacing-card)]">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Ações rápidas</div>
            <div className="mt-3.5">
              <QuickActionBar items={quickActionItems} />
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3 2xl:grid-cols-1">
              <InlineStat label="Motor" value={MODE_LABELS[engineMode] || engineMode} tone="primary" />
              <InlineStat label="VIPs ativos" value={activeVips.length} tone="warning" />
              <InlineStat label="Escopo" value={`${managedVlanIds.length} VLANs válidas`} tone="success" />
            </div>
          </ThemeAwareSurface>
        )}
      />

      {banner ? (
        <ListRow className={banner.tone === 'danger'
          ? 'border-danger/18 bg-danger/10 text-danger'
          : banner.tone === 'success'
            ? 'border-info/18 bg-info/10 text-info'
            : 'border-primary/16 bg-primary/10 text-primary'}
        >
          <div className="text-sm font-semibold">{banner.text}</div>
        </ListRow>
      ) : null}

      {emergencyBypassActive ? (
        <ListRow className="border-danger/18 bg-danger/10 text-danger">
          <div className="text-[11px] font-black uppercase tracking-[0.18em]">Bypass de emergência ativo</div>
          <div className="mt-2 text-sm font-semibold">
            Todas as VLANs do módulo estão livres de ACL, RPZ/DNS e interceptação até a desativação manual.
          </div>
        </ListRow>
      ) : null}

      {contingencyActive ? (
        <ListRow className="border-danger/18 bg-danger/10 text-danger">
          <div className="text-[11px] font-black uppercase tracking-[0.18em]">Contingência DNS ativa</div>
          <div className="mt-2 text-sm font-semibold">
            Escopo {contingency?.scope_type === 'vlan' ? `VLAN ${(contingency?.vlan_ids || []).join(', ')}` : 'global'} com resolvedores {(contingency?.resolvers || []).join(', ') || '—'}.
          </div>
        </ListRow>
      ) : null}

      <SegmentedTabs
        tabs={visibleTabs}
        value={activeTab}
        onChange={(tabKey) => startTransition(() => handleTabChange(tabKey))}
      />

      {loading ? (
        <SectionCard title="Carregando módulo" subtitle="Buscando políticas, VLANs, VIPs, saúde do motor e contingência." />
      ) : null}

      {!loading && loadingState.secondary ? (
        <SectionCard title="Sincronização complementar" subtitle="Métricas, auditoria e saúde detalhada ainda estão sendo carregadas." />
      ) : null}

      {!loading && activeTab === 'overview' ? (
        <div className="space-y-5 xl:space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {overviewCards.map((card) => (
              <MetricCard
                key={card.title}
                icon={card.icon}
                eyebrow={card.eyebrow}
                title={card.title}
                value={card.value}
                subtitle={card.subtitle}
                tone={card.tone}
              />
            ))}
          </div>

          <div className="grid gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title="Síntese executiva do módulo" subtitle="Resposta direta para o gestor entender estado, exceções e risco sem navegar por detalhes técnicos.">
              <div className="grid gap-3 md:grid-cols-2">
                <ListRow>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Global agora</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {namedPolicies.filter((item) => item.enabled && item.scope_type === 'global' && item.policy_type === 'block').map((item) => (
                      <StateBadge key={`block-${item.id}`} label={`Bloqueia ${item.name}`} tone="danger" />
                    ))}
                    {namedPolicies.filter((item) => item.enabled && item.scope_type === 'global' && item.policy_type === 'allow').map((item) => (
                      <StateBadge key={`allow-${item.id}`} label={`Libera ${item.name}`} tone="success" />
                    ))}
                    {!globalAllowedCount && !globalBlockedCount ? <StateBadge label="Nenhuma política global ativa" tone="neutral" /> : null}
                  </div>
                </ListRow>
                <ListRow>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">VIPs e exceções</div>
                  <div className="mt-3 text-sm leading-6 text-on-surface/68">
                    {activeVips.length
                      ? `${activeVips.length} VIP(s) ativo(s) com firewall livre, Unbound recursivo liberado e fora de proxy/interceptação.`
                      : 'Nenhum VIP ativo neste momento.'}
                  </div>
                </ListRow>
                <ListRow>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">DNS interno por VLAN</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {internalDnsEntries.map((item) => (
                      <StateBadge key={item.vlanId} label={`VLAN ${item.vlanId} → ${item.dns}`} tone="success" />
                    ))}
                  </div>
                </ListRow>
                <ListRow>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Motor disponível</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {availableModes.map((mode) => (
                      <StateBadge
                        key={mode.key}
                        label={mode.label}
                        tone={mode.key === engineMode ? 'primary' : 'neutral'}
                        title={mode.hint}
                      />
                    ))}
                  </div>
                </ListRow>
                <ListRow>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">VLANs com regra própria</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {vlanPolicies.filter((item) => item.allowedCategories.length || item.blockedCategories.length).length ? vlanPolicies
                      .filter((item) => item.allowedCategories.length || item.blockedCategories.length)
                      .map((item) => <StateBadge key={item.id} label={`VLAN ${item.vlan_id}`} tone="primary" />) : <StateBadge label="Somente padrão global" tone="neutral" />}
                  </div>
                </ListRow>
                <ListRow>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Contingência</div>
                  <div className="mt-3 text-sm leading-6 text-on-surface/68">
                    {contingencyActive
                      ? `Fallback público ativo por ${formatRemaining(contingency?.remaining_seconds)}.`
                      : 'Sem fallback público liberado.'}
                  </div>
                </ListRow>
              </div>
            </SectionCard>

            <SectionCard title="Pontos de atenção" subtitle="Somente o que exige leitura imediata pela governança ou pela operação.">
              <div className="space-y-2.5">
                {activeAlerts.map((alert, index) => (
                  <ListRow
                    key={`${alert.text}-${index}`}
                    className={
                      alert.tone === 'danger'
                        ? 'border-danger/18 bg-danger/10 text-danger'
                        : alert.tone === 'success'
                          ? 'border-info/18 bg-info/10 text-info'
                          : 'border-amber-500/18 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    }
                  >
                    <div className="flex items-start gap-3">
                      {alert.tone === 'danger' ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
                      <div className="text-sm font-semibold">{alert.text}</div>
                    </div>
                  </ListRow>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Matriz por escopo de rede" subtitle="Leitura rápida da política efetiva por VLAN, mantendo apenas o que é relevante para decisão e controle.">
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {vlanMatrixCards.map((vlan) => (
                <ThemeAwareSurface key={`matrix-${vlan.vlan_id}`} className="p-[var(--spacing-card)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black text-on-surface xl:text-lg">VLAN {vlan.vlan_id}</span>
                    <StateBadge label={vlan.label} tone="neutral" />
                  </div>
                  <div className="mt-2.5 text-sm text-on-surface/60">{vlan.currentMode} • {vlan.statusSummary}</div>
                  <div className="mt-3 grid gap-2 text-sm text-on-surface/64">
                    <div>{vlan.rulesCount ? `${vlan.rulesCount} regra(s) neste escopo` : 'Sem regras nomeadas neste escopo'}</div>
                    <div>{vlan.vipCount ? `${vlan.vipCount} VIP(s) vinculado(s)` : 'Sem VIP vinculado'}</div>
                    <div>DNS interno {vlan.dns}</div>
                  </div>
                </ThemeAwareSurface>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!loading && activeTab === 'policies' ? (
        <div className="space-y-5 xl:space-y-6">
          <SectionCard
            title="Políticas nomeadas"
            subtitle="Catálogo institucional de bloqueios e liberações por domínio, com leitura clara de escopo, status e justificativa."
            actions={<ActionButton tone="primary" icon={Plus} onClick={() => setPolicyEditor({ open: true, item: null })}>Nova Política</ActionButton>}
          >
            <div className="space-y-4 xl:space-y-5">
              <ThemeAwareSurface tone="primary" className="p-[var(--spacing-card)]">
                <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Fluxo de governança</div>
                    <div className="mt-2 text-lg font-black text-on-surface">Nomear a política, definir o escopo e justificar a decisão</div>
                    <div className="mt-2 text-sm leading-6 text-on-surface/68">
                      Use esta tela para formalizar decisões como liberar um sistema institucional, bloquear uma plataforma social ou limitar uma regra a uma VLAN específica sem expor detalhes técnicos desnecessários.
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-3 xl:grid-cols-1">
                    <InlineStat label="Políticas" value={(data.domainPolicies || []).length} tone="primary" />
                    <InlineStat label="Ativas" value={(data.domainPolicies || []).filter((item) => item.enabled).length} tone="success" />
                    <InlineStat label="Inativas" value={(data.domainPolicies || []).filter((item) => !item.enabled).length} tone="neutral" />
                  </div>
                </div>
              </ThemeAwareSurface>

              <DataToolbar>
                <div className="relative min-w-0 flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40" />
                  <TextInput value={policySearch} onChange={(event) => setPolicySearch(event.target.value)} placeholder="Buscar política, domínio ou motivo" className="pl-11" />
                </div>
                <div className="blocking-compact-filters grid gap-3 sm:grid-cols-3 2xl:w-auto">
                  <SelectInput value={policyFilters.type} onChange={(event) => setPolicyFilters((current) => ({ ...current, type: event.target.value }))}>
                    <option value="all">Todos os tipos</option>
                    <option value="allow">Liberar</option>
                    <option value="block">Bloquear</option>
                  </SelectInput>
                  <SelectInput value={policyFilters.scope} onChange={(event) => setPolicyFilters((current) => ({ ...current, scope: event.target.value }))}>
                    <option value="all">Todos os escopos</option>
                    <option value="global">Global</option>
                    <option value="vlan">VLAN(s)</option>
                  </SelectInput>
                  <SelectInput value={policyFilters.status} onChange={(event) => setPolicyFilters((current) => ({ ...current, status: event.target.value }))}>
                    <option value="all">Todos os status</option>
                    <option value="active">Ativas</option>
                    <option value="inactive">Inativas</option>
                  </SelectInput>
                </div>
              </DataToolbar>

              <div className="space-y-2.5">
                {filteredDomainPolicies.length ? filteredDomainPolicies.map((policy) => {
                  const domains = policy.domains || (policy.entries || []).map((entry) => entry.domain || entry.normalized_domain);
                  const governance = governanceFromRecord(policy, policy.description || '');
                  return (
                    <ListRow key={policy.id}>
                      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-black text-on-surface">{policy.name}</span>
                            <StateBadge label={policyTypeLabel(policy.policy_type)} tone={policyTypeTone(policy.policy_type)} />
                            <StateBadge label={policy.enabled ? 'Ativa' : 'Inativa'} tone={policy.enabled ? 'success' : 'neutral'} />
                            <StateBadge label={policy.scope_type === 'vlan' ? `VLAN ${(policy.vlan_ids || []).join(', ')}` : 'Global'} tone="primary" />
                          </div>
                          <div className="mt-2 text-sm leading-6 text-on-surface/62">
                            {governance.summary || 'Sem motivo informado.'}
                          </div>
                          {(governance.legal_basis || governance.requested_by || governance.approval_scope || governance.review_date || governance.approved_by || governance.effective_from || governance.expires_at || governance.revoked_by) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {governance.legal_basis ? <StateBadge label={`Base legal: ${governance.legal_basis}`} tone="neutral" /> : null}
                              {governance.requested_by ? <StateBadge label={`Solicitante: ${governance.requested_by}`} tone="primary" /> : null}
                              {governance.approval_scope ? <StateBadge label={`Aprovação: ${governance.approval_scope}`} tone="warning" /> : null}
                              {governance.lifecycle_status ? <StateBadge label={`Status: ${governance.lifecycle_status}`} tone={governanceStatusTone(governance.lifecycle_status)} /> : null}
                              {governance.review_date ? <StateBadge label={`Revisão: ${governance.review_date}`} tone="success" /> : null}
                              {governance.approved_by ? <StateBadge label={`Aprovado por: ${governance.approved_by}`} tone="success" /> : null}
                              {governance.effective_from ? <StateBadge label={`Vigência: ${formatDate(governance.effective_from)}`} tone="primary" /> : null}
                              {governance.expires_at ? <StateBadge label={`Expira: ${formatDate(governance.expires_at)}`} tone="warning" /> : null}
                              {governance.revoked_by ? <StateBadge label={`Revogado por: ${governance.revoked_by}`} tone="danger" /> : null}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2.5">
                            {domains.slice(0, 8).map((domain) => <StateBadge key={`${policy.id}-${domain}`} label={domain} tone={policyTypeTone(policy.policy_type)} className="px-3.5 py-1.5" />)}
                            {domains.length > 8 ? <StateBadge label={`+${domains.length - 8} domínio(s)`} tone="neutral" className="px-3.5 py-1.5" /> : null}
                          </div>
                          <div className="mt-2.5 text-xs uppercase tracking-[0.16em] text-on-surface/44">
                            {domains.length} domínio(s) • atualizado por {policy.updated_by || policy.created_by || 'system'} • {formatDate(policy.updated_at || policy.created_at)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton tone="primary" icon={Pencil} onClick={() => setPolicyEditor({ open: true, item: policy })}>Editar</ActionButton>
                          <ActionButton tone="ghost" icon={Copy} onClick={() => duplicateDomainPolicy(policy)}>Duplicar</ActionButton>
                          <ActionButton tone={policy.enabled ? 'neutral' : 'success'} icon={Power} onClick={() => toggleDomainPolicy(policy)}>
                            {policy.enabled ? 'Inativar' : 'Ativar'}
                          </ActionButton>
                          <ActionButton tone="danger" icon={Trash2} onClick={() => deleteDomainPolicy(policy)}>Excluir</ActionButton>
                        </div>
                      </div>
                    </ListRow>
                  );
                }) : (
                  <EmptyStateBlock
                    icon={Layers3}
                    title="Nenhuma política encontrada"
                    description="Crie uma política como Liberar Ponto RH ou Bloquear TikTok para aplicar domínios arbitrários."
                    action={<ActionButton tone="primary" icon={Plus} onClick={() => setPolicyEditor({ open: true, item: null })}>Nova Política</ActionButton>}
                  />
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Escopos de aplicação"
            subtitle="As políticas são distribuídas por escopo global ou por VLAN, preservando governança clara sobre onde cada decisão vale."
            actions={<ActionButton tone="ghost" icon={Layers3} onClick={() => setScopeEditor({ open: true, scopeType: 'global', scopeValue: 'global' })}>Editar global</ActionButton>}
          >
            <div className="grid gap-5 2xl:grid-cols-2">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-black text-on-surface">Global</div>
                  <StateBadge label={`${globalBlockedCount + globalAllowedCount} políticas globais ativas`} tone="primary" />
                </div>
                {globalScopePolicies.length ? globalScopePolicies.map((policy) => (
                  <ListRow key={`global-policy-${policy.id}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-black text-on-surface">{policy.name}</span>
                          <StateBadge label={policyTypeLabel(policy.policy_type)} tone={policyTypeTone(policy.policy_type)} />
                          <StateBadge label={policy.enabled ? 'Ativa' : 'Inativa'} tone={policy.enabled ? 'success' : 'neutral'} />
                          <StateBadge label={policyScopeBadge(policy)} tone="neutral" />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-on-surface/62">{policy.description || `${policy.domain_count || policy.domains?.length || 0} domínio(s).`}</p>
                      </div>
                      <ActionButton tone="primary" icon={Pencil} onClick={() => setPolicyEditor({ open: true, item: policy })}>Editar política</ActionButton>
                    </div>
                  </ListRow>
                )) : (
                  <EmptyStateBlock
                    icon={ShieldCheck}
                    title="Nenhuma política criada"
                    description="Crie políticas na aba Políticas para que elas apareçam nos escopos global e por VLAN."
                    action={<ActionButton tone="primary" icon={Plus} onClick={() => setPolicyEditor({ open: true, item: null })}>Criar política</ActionButton>}
                  />
                )}
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-lg font-black text-on-surface">VLANs</div>
                  <StateBadge label={`${vlansWithOwnPolicy} com regra própria`} tone="success" />
                </div>
                {vlanPolicies.map((vlan) => (
                  <ListRow key={`quick-${vlan.id}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-black text-on-surface">VLAN {vlan.vlan_id}</span>
                          <StateBadge label={vlan.label} tone="neutral" />
                          <StateBadge label={vlan.inStandard ? 'No padrão' : 'Desligada do padrão'} tone={vlan.inStandard ? 'success' : 'warning'} />
                        </div>
                        <p className="mt-2 text-sm text-on-surface/62">{vlan.statusSummary}</p>
                        <div className="mt-2 text-xs uppercase tracking-[0.16em] text-on-surface/44">
                          {vlan.rulesCount ? `${vlan.rulesCount} regra(s)` : 'Sem regra nomeada'} • {vlan.vipCount ? `${vlan.vipCount} VIP(s)` : 'Sem VIP'} • DNS {vlan.dns}
                        </div>
                      </div>
                      {vlan.inStandard ? (
                        <ActionButton tone="primary" icon={Pencil} onClick={() => setScopeEditor({ open: true, scopeType: 'vlan', scopeValue: vlan.vlan_id })}>
                          Editar
                        </ActionButton>
                      ) : (
                        <ActionButton tone="success" onClick={() => setVlanStandard(vlan, true)}>
                          Entrar no padrão
                        </ActionButton>
                      )}
                    </div>
                  </ListRow>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Hierarquia de precedência" subtitle="A ordem de decisão e execução continua explícita para auditoria e troubleshooting.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <ListRow><div className="text-sm font-semibold text-on-surface">1. VIPs</div><div className="mt-2 text-sm text-on-surface/62">Bypass total real: firewall livre e Unbound recursivo com passthrough de RPZ.</div></ListRow>
              <ListRow><div className="text-sm font-semibold text-on-surface">2. Liberação</div><div className="mt-2 text-sm text-on-surface/62">Allowlist global ou por VLAN tem precedência.</div></ListRow>
              <ListRow><div className="text-sm font-semibold text-on-surface">3. Bloqueio</div><div className="mt-2 text-sm text-on-surface/62">Blacklist global ou por VLAN.</div></ListRow>
              <ListRow><div className="text-sm font-semibold text-on-surface">4. Contingência</div><div className="mt-2 text-sm text-on-surface/62">Emergência temporária auditada.</div></ListRow>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!loading && activeTab === 'vlans' ? (
        <SectionCard
          title="Escopos de rede"
          subtitle="Cadastro e operação das VLANs sob política, com leitura compacta de status, VIPs, monitoramento e bloqueio."
          actions={<ActionButton tone="primary" icon={Plus} onClick={() => setVlanEditor({ open: true, item: null })}>Nova VLAN</ActionButton>}
        >
          <div className="space-y-3.5 xl:space-y-4">
            <DataToolbar>
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40" />
                <TextInput value={vlanSearch} onChange={(event) => setVlanSearch(event.target.value)} placeholder="Buscar VLAN, setor, interface, subnet ou status" className="pl-11" />
              </div>
              <div className="blocking-compact-filters grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <SelectInput value={vlanFilters.standard} onChange={(event) => setVlanFilters((current) => ({ ...current, standard: event.target.value }))}>
                  <option value="all">Padrão: todos</option>
                  <option value="in">No padrão</option>
                  <option value="out">Fora do padrão</option>
                </SelectInput>
                <SelectInput value={vlanFilters.vip} onChange={(event) => setVlanFilters((current) => ({ ...current, vip: event.target.value }))}>
                  <option value="all">VIPs: todos</option>
                  <option value="with">Com VIP</option>
                  <option value="without">Sem VIP</option>
                </SelectInput>
                <SelectInput value={vlanFilters.monitoring} onChange={(event) => setVlanFilters((current) => ({ ...current, monitoring: event.target.value }))}>
                  <option value="all">Monitoramento: todos</option>
                  <option value="on">Monitoramento on</option>
                  <option value="off">Monitoramento off</option>
                </SelectInput>
                <SelectInput value={vlanFilters.blocking} onChange={(event) => setVlanFilters((current) => ({ ...current, blocking: event.target.value }))}>
                  <option value="all">Bloqueio: todos</option>
                  <option value="on">Bloqueio on</option>
                  <option value="off">Bloqueio off</option>
                </SelectInput>
                <SelectInput value={vlanFilters.status} onChange={(event) => setVlanFilters((current) => ({ ...current, status: event.target.value }))}>
                  <option value="all">Estado: todos</option>
                  <option value="active">Operacionais</option>
                  <option value="reduced">Reduzidas</option>
                  <option value="inactive">Fora do padrão</option>
                </SelectInput>
              </div>
            </DataToolbar>

            <DataToolbar>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/42">Contexto do módulo</div>
                <div className="mt-1 text-sm text-on-surface/62">Cada VLAN pode aderir ao padrão institucional ou operar em exceção, mantendo leitura compacta de DNS interno, políticas e status.</div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-4">
                <InlineStat label="Total" value={vlanPolicies.length} tone="primary" />
                <InlineStat label="Visíveis" value={filteredVlanPolicies.length} tone="neutral" />
                <InlineStat label="No padrão" value={filteredVlanPolicies.filter((vlan) => vlan.inStandard).length} tone="success" />
                <InlineStat label="Com VIP" value={filteredVlanPolicies.filter((vlan) => vlan.vipCount > 0).length} tone="warning" />
              </div>
            </DataToolbar>

            {loadingState.secondary && !filteredVlanPolicies.length ? <LoadingListSkeleton rows={4} compact /> : null}

            {filteredVlanPolicies.length ? filteredVlanPolicies.map((vlan) => (
              <ListRow key={vlan.id}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-black text-on-surface xl:text-lg">VLAN {vlan.vlan_id}</span>
                          <StateBadge label={vlan.inStandard ? 'Operacional' : 'Fora do padrão'} tone={vlan.inStandard ? 'success' : 'warning'} />
                          {vlan.policy_mode === 'selective-intercept' && vlan.inStandard ? <StateBadge label="Interceptação seletiva" tone="danger" /> : null}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-on-surface">{vlan.label}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-on-surface/62">{vlan.shortDescription}</div>
                      </div>
                      <div className="hidden shrink-0 xl:flex">
                        <VlanOverflowMenu
                          vlan={vlan}
                          onEditVlan={() => setVlanEditor({ open: true, item: vlan })}
                          onViewVips={() => startTransition(() => handleTabChange('vips'))}
                          onToggleStandard={() => (vlan.inStandard ? openVlanConfirmation({ item: vlan, mode: 'standard-off' }) : setVlanStandard(vlan, true))}
                          onDelete={() => openVlanConfirmation({ item: vlan, mode: 'delete' })}
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-on-surface/68 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                      <div className="min-w-0">
                        <div className="font-semibold text-on-surface">{vlan.statusSummary}</div>
                        <div className="mt-1 text-on-surface/58">{vlan.controlsSummary}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StateBadge label={`${vlan.rulesCount} regra(s)`} tone="primary" />
                        <StateBadge label={`${vlan.vipCount} VIP(s)`} tone={vlan.vipCount ? 'warning' : 'neutral'} />
                        <StateBadge label={vlan.blocking_enabled ? 'Bloqueio on' : 'Bloqueio off'} tone={vlan.blocking_enabled ? 'success' : 'neutral'} />
                        <StateBadge label={vlan.monitoring_enabled ? 'Monitoramento on' : 'Monitoramento off'} tone={vlan.monitoring_enabled ? 'success' : 'neutral'} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface/50">
                      {vlan.interface_name ? <span className="font-semibold text-on-surface/64">{vlan.interface_name}</span> : null}
                      <span>{vlan.subnet_cidr || 'sem subnet informada'}</span>
                      <span>DNS {vlan.dns}</span>
                      <span>Atividade {formatDate(vlan.last_activity)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
                    <ActionButton tone="primary" icon={Pencil} onClick={() => setScopeEditor({ open: true, scopeType: 'vlan', scopeValue: vlan.vlan_id })}>
                      Editar escopo
                    </ActionButton>
                    <ActionButton tone="ghost" icon={Pencil} onClick={() => setVlanEditor({ open: true, item: vlan })}>
                      Editar VLAN
                    </ActionButton>
                    <div className="xl:hidden">
                      <VlanOverflowMenu
                        vlan={vlan}
                        onEditVlan={() => setVlanEditor({ open: true, item: vlan })}
                        onViewVips={() => startTransition(() => handleTabChange('vips'))}
                        onToggleStandard={() => (vlan.inStandard ? openVlanConfirmation({ item: vlan, mode: 'standard-off' }) : setVlanStandard(vlan, true))}
                        onDelete={() => openVlanConfirmation({ item: vlan, mode: 'delete' })}
                      />
                    </div>
                  </div>
                </div>
              </ListRow>
            )) : (
              <EmptyStateBlock
                icon={Network}
                title={vlanPolicies.length ? 'Nenhuma VLAN encontrada com estes filtros' : 'Nenhuma VLAN cadastrada'}
                description={vlanPolicies.length
                  ? 'Limpe os filtros ou ajuste a busca para localizar VLANs por estado, VIP, monitoramento, bloqueio ou texto livre.'
                  : 'Cadastre a primeira VLAN do módulo para começar a aplicar políticas por rede.'}
                action={vlanPolicies.length
                  ? <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => { setVlanSearch(''); setVlanFilters({ standard: 'all', vip: 'all', monitoring: 'all', blocking: 'all', status: 'all' }); }}>Limpar filtros</ActionButton>
                  : <ActionButton tone="primary" icon={Plus} onClick={() => setVlanEditor({ open: true, item: null })}>Criar VLAN</ActionButton>}
              />
            )}
          </div>
        </SectionCard>
      ) : null}

      {!loading && activeTab === 'vips' ? (
        <div className="space-y-5 xl:space-y-6">
          <SectionCard
            title="Exceções VIP"
            subtitle="VIP representa exceção total controlada: firewall livre, Unbound recursivo local sem bloqueio de RPZ e fora de proxy/interceptação."
            actions={<ActionButton tone="warning" icon={Plus} onClick={() => setVipEditor({ open: true, item: null })}>Adicionar VIP</ActionButton>}
          >
            <div className="grid gap-5 2xl:grid-cols-[0.82fr_1.18fr]">
              <ThemeAwareSurface tone="warning" className="p-[var(--spacing-card)]">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Impacto técnico da exceção</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {VIP_RUNTIME_BADGES.map((badge) => (
                    <VipImpactBadge key={badge.label} label={badge.label} tone={badge.tone} />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-7 text-on-surface/68">
                  Cadastrar nesta área significa que o IP não segue bloqueio comum por domínio, pode continuar usando o Unbound recursivo local
                  com passthrough de RPZ e também pode sair direto pela WAN se houver DNS manual configurado no aparelho.
                </p>
                <div className="mt-4 grid gap-2.5 md:grid-cols-2 2xl:grid-cols-1">
                  <InlineStat label="VIPs ativos" value={activeVips.length} tone="warning" />
                  <InlineStat label="VIPs inativos" value={(data.exceptions || []).filter((row) => !row.active).length} tone="neutral" />
                </div>
                <div className="mt-4 rounded-[22px] border border-outline/14 bg-surface/58 px-4 py-3 text-sm leading-6 text-on-surface/62">
                  Salvar um VIP sincroniza o runtime imediatamente: ACCEPT total no firewall, bypass explícito no Squid, passthrough RPZ e retorno antes da interceptação seletiva.
                </div>
              </ThemeAwareSurface>

              <div className="space-y-3.5 xl:space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40" />
                    <TextInput value={vipSearch} onChange={(event) => setVipSearch(event.target.value)} placeholder="Buscar VIP por IP, descrição ou motivo" className="pl-11" />
                  </div>
                  <StateBadge label={`${filteredVips.length} resultado(s)`} tone="neutral" />
                </div>

                <div className="space-y-2.5">
                  {filteredVips.length ? filteredVips.map((item) => (
                    (() => {
                      const governance = governanceFromRecord(item, item.notes || item.reason || '');
                      return (
                    <ListRow key={item.id}>
                      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-lg font-black text-on-surface">{item.ip}</span>
                            <StateBadge label={item.active ? 'Ativo' : 'Inativo'} tone={item.active ? 'warning' : 'neutral'} />
                            {VIP_RUNTIME_BADGES.slice(0, 4).map((badge) => (
                              <VipImpactBadge key={badge.label} label={badge.label} tone={badge.tone} />
                            ))}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-on-surface">{item.description || item.hostname || 'Sem descrição'}</div>
                          <div className="mt-2 text-sm leading-6 text-on-surface/62">{governance.summary || 'Sem motivo informado.'}</div>
                          {(governance.legal_basis || governance.requested_by || governance.approval_scope || governance.review_date || governance.approved_by || governance.effective_from || governance.expires_at || governance.revoked_by) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {governance.legal_basis ? <StateBadge label={`Base legal: ${governance.legal_basis}`} tone="neutral" /> : null}
                              {governance.requested_by ? <StateBadge label={`Solicitante: ${governance.requested_by}`} tone="primary" /> : null}
                              {governance.approval_scope ? <StateBadge label={`Aprovação: ${governance.approval_scope}`} tone="warning" /> : null}
                              {governance.lifecycle_status ? <StateBadge label={`Status: ${governance.lifecycle_status}`} tone={governanceStatusTone(governance.lifecycle_status)} /> : null}
                              {governance.review_date ? <StateBadge label={`Revisão: ${governance.review_date}`} tone="success" /> : null}
                              {governance.approved_by ? <StateBadge label={`Aprovado por: ${governance.approved_by}`} tone="success" /> : null}
                              {governance.effective_from ? <StateBadge label={`Vigência: ${formatDate(governance.effective_from)}`} tone="primary" /> : null}
                              {governance.expires_at ? <StateBadge label={`Expira: ${formatDate(governance.expires_at)}`} tone="warning" /> : null}
                              {governance.revoked_by ? <StateBadge label={`Revogado por: ${governance.revoked_by}`} tone="danger" /> : null}
                            </div>
                          ) : null}
                          <div className="mt-3 text-xs uppercase tracking-[0.16em] text-on-surface/45">
                            Última alteração {formatDate(item.updated_at || item.created_at)}{item.vlan_id ? ` • VLAN ${item.vlan_id}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ActionButton tone="primary" icon={Pencil} onClick={() => setVipEditor({ open: true, item })}>Editar</ActionButton>
                          <ActionButton tone={item.active ? 'neutral' : 'success'} icon={Power} onClick={() => toggleVip(item)}>
                            {item.active ? 'Desativar' : 'Ativar'}
                          </ActionButton>
                          <ActionButton tone="danger" icon={Ban} onClick={() => removeVip(item)}>Remover</ActionButton>
                        </div>
                      </div>
                    </ListRow>
                      );
                    })()
                  )) : (
                    <EmptyStateBlock
                      icon={ShieldAlert}
                      title="Nenhum VIP encontrado"
                      description="Crie um VIP para garantir firewall livre, Unbound recursivo liberado e saída fora de proxy/interceptação."
                      action={<ActionButton tone="warning" icon={Plus} onClick={() => setVipEditor({ open: true, item: null })}>Adicionar VIP</ActionButton>}
                    />
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!loading && activeTab === 'sporadic' ? (
        <SporadicTab
          sporadicExceptions={data.sporadicExceptions || []}
          onNew={() => setSporadicEditor({ open: true })}
          onRevoke={revokeSporadicException}
          working={working.sporadic}
          managedVlanIds={managedVlanIds}
        />
      ) : null}

      {!loading && activeTab === 'engine' ? (
        <div className="space-y-5 xl:space-y-6">
          <SectionCard
            title="Modos de enforcement"
            subtitle="ACL, ACL + DNS e Interceptação Seletiva ficam explícitos em uma leitura simples para mudança controlada."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {availableModes.map((mode) => (
                <ThemeAwareSurface key={mode.key} className="p-[var(--spacing-card)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <HintTooltip
                        label={<span className="text-lg font-black text-on-surface">{mode.label}</span>}
                        hint={mode.hint}
                      />
                      <div className="mt-2 text-sm leading-6 text-on-surface/62">{mode.hint}</div>
                    </div>
                    <StateBadge
                      label={mode.key === engineMode ? 'Ativo' : 'Disponível'}
                      tone={mode.key === engineMode ? 'primary' : 'neutral'}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      tone={mode.key === engineMode ? 'ghost' : 'primary'}
                      onClick={() => changeEngineMode(mode.key)}
                      disabled={working.engine || mode.key === engineMode}
                    >
                      {mode.key === engineMode ? 'Modo atual' : 'Ativar modo'}
                    </ActionButton>
                    {mode.key === 'acl-only' ? <StateBadge label="Sem enforcement DNS" tone="neutral" /> : null}
                    {mode.key === 'acl-plus-dns' ? <StateBadge label="Unbound ativo" tone="success" /> : null}
                    {mode.key === 'intercept-selective' ? <StateBadge label="3128/3130 só neste modo" tone="warning" /> : null}
                  </div>
                </ThemeAwareSurface>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Motor de controle"
            subtitle="Execução técnica organizada em blocos claros: serviços, drift, apply, rollback e integridade."
            actions={(
              <QuickActionBar
                items={[
                  { label: emergencyBypassActive ? 'Emergência OFF' : 'Emergência ON', tone: 'danger', icon: ShieldAlert, onClick: () => openEmergencyBypassDialog(!emergencyBypassActive) },
                  { label: 'Apply', tone: 'success', icon: Power, onClick: () => runEngineAction('apply', 'Políticas aplicadas.') },
                  { label: 'Rollback', tone: 'neutral', icon: RotateCcw, onClick: () => runEngineAction('rollback', 'Rollback executado.') },
                  { label: 'Validar', tone: 'primary', icon: ScanSearch, onClick: () => runEngineAction('ops/validate', 'Validação concluída.') },
                  { label: 'Recarregar motor', tone: 'ghost', icon: RefreshCcw, onClick: () => runEngineAction('ops/reload-engine', 'Motor recarregado.') },
                ]}
              />
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {engineCards.map((card) => (
                <ThemeAwareSurface key={card.label} className="p-[var(--spacing-card)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${
                      toneFromStatus(card.status) === 'success'
                        ? 'border-info/20 bg-info/12 text-info'
                        : toneFromStatus(card.status) === 'danger'
                          ? 'border-danger/18 bg-danger/10 text-danger'
                          : 'border-outline/16 bg-surface/80 text-on-surface/60'
                    }`}>
                      <card.icon size={18} />
                    </div>
                    <StateBadge label={String(card.status)} tone={toneFromStatus(card.status)} />
                  </div>
                  <div className="mt-4 text-lg font-black text-on-surface">{card.label}</div>
                  <div className="mt-2 text-sm font-semibold text-on-surface/70">{card.subtitle}</div>
                  <div className="mt-3 text-sm leading-6 text-on-surface/58">{card.detail}</div>
                </ThemeAwareSurface>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Integridade e checkpoints" subtitle="Status consolidado para apply, rollback e artefatos esperados pelo enforcement.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(data.health?.integrity || {}).map(([key, ok]) => (
                <ListRow key={key}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">{key.replace(/_/g, ' ')}</div>
                  <div className={`mt-3 text-lg font-black ${ok ? 'text-info' : 'text-danger'}`}>{ok ? 'Disponível' : 'Indisponível'}</div>
                </ListRow>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="DNS interno institucional" subtitle="Cada VLAN do módulo mantém seu próprio gateway/DNS interno válido no modo ACL + DNS.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {internalDnsEntries.map((item) => (
                <ListRow key={item.vlanId}>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">VLAN {item.vlanId}</div>
                  <div className="mt-3 text-lg font-black text-on-surface">{item.dns}</div>
                  <div className="mt-2 text-sm text-on-surface/62">DNS interno tratado como válido via Unbound neste escopo.</div>
                </ListRow>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!loading && activeTab === 'contingency' ? (
        <div className="space-y-5 xl:space-y-6">
          <SectionCard
            title="Contingência DNS"
            subtitle="Fallback público temporário, auditável e fácil de entender."
            actions={(
              <QuickActionBar
                items={[
                  contingencyActive
                    ? {
                        label: 'Desativar',
                        tone: 'danger',
                        icon: Flame,
                        onClick: async () => {
                          try {
                            await runAction('contingency/deactivate', 'POST', { reason: 'Desativação manual pela UI' });
                            flash('Contingência DNS desativada.', 'success');
                          } catch (error) {
                            flash(error.message || 'Falha ao desativar contingência.', 'danger');
                          }
                        },
                      }
                    : {
                        label: 'Ativar',
                        tone: 'danger',
                        icon: Flame,
                        onClick: () => setContingencyEditor({ open: true, mode: 'activate' }),
                      },
                  {
                    label: 'Renovar',
                    tone: 'warning',
                    icon: Clock3,
                    onClick: () => setContingencyEditor({ open: true, mode: 'renew' }),
                  },
                  {
                    label: 'Observabilidade',
                    tone: 'ghost',
                    icon: ScrollText,
                    onClick: () => startTransition(() => handleTabChange('observability')),
                  },
                ]}
              />
            )}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Flame} eyebrow="Status" title="Estado atual" value={contingencyActive ? 'Ativa' : 'Normal'} subtitle={contingencyActive ? 'Fallback público em uso.' : 'DNS interno exclusivo.'} tone={contingencyActive ? 'danger' : 'success'} />
              <MetricCard icon={Network} eyebrow="Escopo" title="Escopo aplicado" value={contingency?.scope_type === 'vlan' ? `VLAN ${(contingency?.vlan_ids || []).join(', ')}` : 'Global'} subtitle="Onde a contingência vale agora." tone="primary" />
              <MetricCard icon={Clock3} eyebrow="Prazo" title="Tempo restante" value={formatRemaining(contingency?.remaining_seconds)} subtitle={`Expira em ${formatDate(contingency?.expires_at)}`} tone={contingencyActive ? 'warning' : 'neutral'} />
              <MetricCard icon={ShieldCheck} eyebrow="Sugestão do runtime" title="Leitura de saúde" value={contingency?.runtime?.healthy ? 'Unbound saudável' : 'Contingência sugerida'} subtitle={contingency?.runtime?.recommendation || 'Sem recomendação detalhada.'} tone={contingency?.runtime?.healthy ? 'success' : 'warning'} />
            </div>

            <div className="grid gap-5 2xl:grid-cols-[0.9fr_1.1fr]">
              <SectionCard title="Resumo operacional" subtitle="Quem ativou, por quê e quais resolvedores públicos foram liberados.">
                <div className="grid gap-3 md:grid-cols-2">
                  <ListRow>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Resolvedores autorizados</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(contingency?.resolvers || []).length
                        ? (contingency.resolvers || []).map((resolver) => <StateBadge key={resolver} label={resolver} tone={contingencyActive ? 'danger' : 'neutral'} />)
                        : <StateBadge label="Somente DNS interno" tone="success" />}
                    </div>
                  </ListRow>
                  <ListRow>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Impacto</div>
                    <div className="mt-3 text-sm leading-6 text-on-surface/62">{contingency?.impact_summary || 'Sem contingência ativa no momento.'}</div>
                  </ListRow>
                  <ListRow>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Operador</div>
                    <div className="mt-3 text-sm font-semibold text-on-surface">{contingency?.requested_by || '—'}</div>
                    <div className="mt-2 text-sm text-on-surface/58">Ativado em {formatDate(contingency?.activated_at)}</div>
                  </ListRow>
                  <ListRow>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/46">Motivo</div>
                    <div className="mt-3 text-sm leading-6 text-on-surface/62">{contingency?.reason || 'Sem motivo registrado.'}</div>
                  </ListRow>
                </div>
              </SectionCard>

              <SectionCard title="Auditoria da contingência" subtitle="Ativações, renovações e retorno ao normal.">
                <div className="space-y-2.5">
                  {(data.contingencyAudit || []).length ? (data.contingencyAudit || []).map((item, index) => (
                    (() => {
                      const governance = parseGovernanceText(item.reason || '');
                      return (
                    <ListRow key={`${item.created_at}-${index}`}>
                      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-on-surface">{item.action}</span>
                            <StateBadge label={item.success ? 'OK' : 'Erro'} tone={item.success ? 'success' : 'danger'} />
                            <StateBadge label={item.scope_type === 'vlan' ? `VLAN ${(item.vlan_ids || []).join(', ')}` : 'Global'} tone="neutral" />
                          </div>
                          <div className="mt-2 text-sm text-on-surface/60">{governance.summary || 'Sem motivo informado.'}</div>
                          {(governance.metadata.baselegal || governance.metadata.solicitante || governance.metadata.alcadadeaprovacao || governance.metadata.revisaoprevista) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {governance.metadata.baselegal ? <StateBadge label={`Base legal: ${governance.metadata.baselegal}`} tone="neutral" /> : null}
                              {governance.metadata.solicitante ? <StateBadge label={`Solicitante: ${governance.metadata.solicitante}`} tone="primary" /> : null}
                              {governance.metadata.alcadadeaprovacao ? <StateBadge label={`Aprovação: ${governance.metadata.alcadadeaprovacao}`} tone="warning" /> : null}
                              {governance.metadata.statusinstitucional ? <StateBadge label={`Status: ${governance.metadata.statusinstitucional}`} tone={governanceStatusTone(governance.metadata.statusinstitucional)} /> : null}
                              {governance.metadata.revisaoprevista ? <StateBadge label={`Revisão: ${governance.metadata.revisaoprevista}`} tone="success" /> : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-sm text-on-surface/52">
                          {formatDate(item.created_at)} • {item.requested_by || '—'}
                        </div>
                      </div>
                    </ListRow>
                      );
                    })()
                  )) : (
                    <EmptyStateBlock icon={Clock3} title="Sem auditoria de contingência" description="Nenhuma ativação ou renovação foi registrada ainda." />
                  )}
                </div>
              </SectionCard>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!loading && activeTab === 'metrics' ? (
        <div className="space-y-5 xl:space-y-6">
            <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard title="Domínios mais vistos" subtitle="Leitura estatística limpa, sem visual de debug.">
              <MiniTrendList items={data.metrics?.topSites || []} labelKey="domain" valueKey="total" />
            </SectionCard>
            <SectionCard title="Domínios mais bloqueados" subtitle="Bloqueios observados no recorte carregado.">
              <MiniTrendList items={data.metrics?.topBlocked || []} labelKey="domain" valueKey="total" />
            </SectionCard>
            <SectionCard title="IPs com mais eventos" subtitle="Quem mais gerou tentativas, consultas ou bypass.">
              <MiniTrendList items={data.metrics?.topIps || []} labelKey="client_ip" valueKey="total" />
            </SectionCard>
            <SectionCard title="VLANs com mais atividade" subtitle="Ajuda a localizar rapidamente onde o enforcement está mais acionado.">
              <MiniTrendList items={data.metrics?.topVlans || []} labelKey="vlan_id" valueKey="total" />
            </SectionCard>
          </div>

          <SectionCard title="Linha temporal" subtitle="Resumo horário do recorte carregado para leitura de volume e variação.">
            <MiniTrendList items={data.metrics?.hourly || []} labelKey="hour" valueKey="total" />
          </SectionCard>
        </div>
      ) : null}

      {!loading && activeTab === 'ignored' ? (
        <DnsIgnoredTab />
      ) : null}

      {!loading && activeTab === 'observability' ? (
        <div className="space-y-5 xl:space-y-6">
          <SectionCard
            title="Radar operacional"
            subtitle="Eventos DNS e Proxy consolidados em uma única leitura operacional, com atualização automática a cada 5 segundos."
            actions={(
              <QuickActionBar
                items={[
                  { label: 'Atualizar', tone: 'primary', icon: RefreshCcw, onClick: () => loadRealtimeRadar(false) },
                ]}
              />
            )}
          >
            <div className="space-y-4 xl:space-y-5">
              <ThemeAwareSurface tone="primary" className="p-[var(--spacing-card)]">
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Observabilidade unificada</div>
                    <div className="mt-2 text-xl font-black text-on-surface">Eventos de DNS e Proxy em uma visão única</div>
                    <div className="mt-2 text-sm leading-6 text-on-surface/68">
                      O radar preserva o fluxo em tempo real sem separar o operador entre múltiplas telas. Proxy & Logs continua alimentando eventos técnicos, enquanto o SGCG centraliza a leitura operacional.
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <InlineStat label="Eventos" value={realtimeRadarSummary.total || filteredRealtimeRadar.length} tone="primary" />
                    <InlineStat label="DNS" value={realtimeRadarSummary.dns || 0} tone="success" />
                    <InlineStat label="Proxy" value={realtimeRadarSummary.proxy || 0} tone="warning" />
                  </div>
                </div>
              </ThemeAwareSurface>

              <div className="blocking-compact-filters grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto]">
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40" />
                  <TextInput value={radarSearch} onChange={(event) => setRadarSearch(event.target.value)} placeholder="Buscar IP, hostname, domínio ou política" className="pl-11" />
                </div>
                <SelectInput value={radarFilters.window} onChange={(event) => setRadarFilters((current) => ({ ...current, window: event.target.value }))}>
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                </SelectInput>
                <SelectInput value={radarFilters.action} onChange={(event) => setRadarFilters((current) => ({ ...current, action: event.target.value }))}>
                  <option value="all">Todas ações</option>
                  <option value="blocked">Block</option>
                  <option value="allowed">Pass</option>
                  <option value="bypassed">Bypass</option>
                </SelectInput>
                <SelectInput value={radarFilters.source} onChange={(event) => setRadarFilters((current) => ({ ...current, source: event.target.value }))}>
                  <option value="all">DNS + Proxy</option>
                  <option value="dns">DNS</option>
                  <option value="proxy">Proxy</option>
                </SelectInput>
                <SelectInput value={radarFilters.vlan} onChange={(event) => setRadarFilters((current) => ({ ...current, vlan: event.target.value }))}>
                  <option value="all">Todas VLANs</option>
                  {managedVlanIds.map((vlanId) => <option key={vlanId} value={vlanId}>VLAN {vlanId}</option>)}
                </SelectInput>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <InlineStat label="Block" value={realtimeRadarSummary.blocked || 0} tone="danger" />
                <InlineStat label="Pass" value={realtimeRadarSummary.allowed || 0} tone="success" />
                <InlineStat label="Bypass" value={realtimeRadarSummary.bypassed || 0} tone="warning" />
                <InlineStat label="IPs" value={realtimeRadarSummary.unique_ips || 0} tone="neutral" />
                <InlineStat label="Domínios" value={realtimeRadarSummary.unique_domains || 0} tone="neutral" />
                <InlineStat label="Último evento" value={formatDate(realtimeRadarSummary.last_seen_at)} tone="primary" />
              </div>

              <div className="space-y-2.5">
                {filteredRealtimeRadar.length ? filteredRealtimeRadar.map((item) => (
                  <ListRow key={item.event_uid || `${item.source}-${item.id}`}>
                    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-black text-on-surface">{item.client_ip || 'IP não identificado'}</span>
                          <StateBadge label={item.identity_display_user || item.identity_user || 'usuário não identificado'} tone={item.identity_user ? 'success' : 'neutral'} />
                          <StateBadge label={item.identity_computer || item.hostname || 'estação não identificada'} tone="neutral" />
                          {item.vlan_id ? <StateBadge label={`VLAN ${item.vlan_id}`} tone="primary" /> : null}
                          <StateBadge label={actionLabel(item.action)} tone={actionTone(item.action)} />
                          <StateBadge label={item.source === 'dns' ? 'DNS' : 'Proxy'} tone={item.source === 'dns' ? 'success' : 'warning'} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Globe2 size={16} className="text-on-surface/42" />
                          <span className="break-all text-lg font-black text-on-surface">{item.domain || item.url_or_host || 'domínio não identificado'}</span>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-on-surface/62">
                          Política: <span className="font-semibold text-on-surface">{item.policy_label || item.matched_policy_name || 'Padrão permitido'}</span>
                          {item.category ? ` • categoria ${item.category}` : ''}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-on-surface/44">
                          <span>{formatDate(item.timestamp)}</span>
                          <span>Origem {item.source_detail || item.source}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <ActionButton tone="ghost" icon={Search} onClick={() => { setAuditSearch(item.domain || item.client_ip || ''); }}>
                          Investigar
                        </ActionButton>
                        {item.action === 'blocked' && item.domain ? (
                          <ActionButton tone="success" icon={Plus} onClick={() => createAllowPolicyFromAudit(item)}>
                            Adicionar à política
                          </ActionButton>
                        ) : null}
                      </div>
                    </div>
                  </ListRow>
                )) : (
                  <EmptyStateBlock
                    icon={Wifi}
                    title="Sem eventos no intervalo"
                    description="Aumente a janela, ajuste filtros ou aguarde novos eventos dos ingesters DNS/Proxy."
                    action={<ActionButton tone="primary" icon={RefreshCcw} onClick={() => loadRealtimeRadar(false)}>Atualizar radar</ActionButton>}
                  />
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Relatório de Dados"
            subtitle="Leitura central de governança de dados para identificar quem acessou o quê, em qual rede, com qual decisão aplicada e sob qual política institucional."
            actions={(
              <QuickActionBar
                items={[
                  { label: 'Filtrar', tone: 'primary', icon: Filter, onClick: loadOperationalAudit },
                  { label: 'Exportar evidências em PDF', tone: 'success', icon: Download, onClick: exportAuditPdf },
                ]}
              />
            )}
          >
            <div className="space-y-4 xl:space-y-5">
              <ThemeAwareSurface tone="primary" className="p-[var(--spacing-card)]">
                <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-center">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Leitura central de acesso</div>
                    <div className="mt-2 text-xl font-black text-on-surface">Investigue dispositivos, domínios e decisões aplicadas em uma trilha única de governança</div>
                    <div className="mt-2 text-sm leading-6 text-on-surface/68">
                      Use IP, hostname, VLAN ou domínio. A lista mostra origem, destino, decisão aplicada, política correspondente e a evidência operacional disponível para auditoria e responsabilização.
                    </div>
                  </div>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <InlineStat label="Eventos auditados" value={operationalAuditSummary.total || filteredOperationalAudit.length} tone="primary" />
                    <InlineStat label="Bloqueados" value={operationalAuditSummary.blocked || 0} tone="danger" />
                    <InlineStat label="Liberados ou excepcionados" value={(operationalAuditSummary.allowed || 0) + (operationalAuditSummary.bypassed || 0)} tone="success" />
                  </div>
                </div>
              </ThemeAwareSurface>

              <div className="blocking-compact-filters grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto]">
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface/40" />
                  <TextInput value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Buscar quem acessou ou o que foi acessado: IP, hostname, domínio ou política" className="pl-11" />
                </div>
                <SelectInput value={auditFilters.period} onChange={(event) => setAuditFilters((current) => ({ ...current, period: event.target.value }))}>
                  <option value="24h">24h</option>
                  <option value="7d">7 dias</option>
                  <option value="30d">30 dias</option>
                  <option value="90d">90 dias</option>
                </SelectInput>
                <SelectInput value={auditFilters.action} onChange={(event) => setAuditFilters((current) => ({ ...current, action: event.target.value }))}>
                  <option value="all">Todas ações</option>
                  <option value="blocked">Block</option>
                  <option value="allowed">Pass</option>
                  <option value="bypassed">Bypass</option>
                </SelectInput>
                <SelectInput value={auditFilters.vlan} onChange={(event) => setAuditFilters((current) => ({ ...current, vlan: event.target.value }))}>
                  <option value="all">Todas VLANs</option>
                  {managedVlanIds.map((vlanId) => <option key={vlanId} value={vlanId}>VLAN {vlanId}</option>)}
                </SelectInput>
                <SelectInput value={auditFilters.source} onChange={(event) => setAuditFilters((current) => ({ ...current, source: event.target.value }))}>
                  <option value="all">DNS + Squid</option>
                  <option value="dns">DNS</option>
                  <option value="proxy">Squid</option>
                </SelectInput>
              </div>

              <div className="space-y-2.5">
                {filteredOperationalAudit.length ? filteredOperationalAudit.map((item) => (
                  <ListRow key={`${item.source}-${item.id}`}>
                    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/42">Quem acessou</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-black text-on-surface">{item.client_ip || 'IP não identificado'}</span>
                          <StateBadge label={item.identity_display_user || item.identity_user || 'usuário não identificado'} tone={item.identity_user ? 'success' : 'neutral'} />
                          <StateBadge label={item.identity_computer || item.hostname || 'estação não identificada'} tone="neutral" />
                          {item.vlan_id ? <StateBadge label={`VLAN ${item.vlan_id}`} tone="primary" /> : null}
                          <StateBadge label={actionLabel(item.action)} tone={actionTone(item.action)} />
                          <StateBadge label={item.source === 'dns' ? 'DNS' : 'Squid'} tone="neutral" />
                        </div>
                        <div className="mt-4 text-[11px] font-black uppercase tracking-[0.18em] text-on-surface/42">O que acessou</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Globe2 size={16} className="text-on-surface/42" />
                          <span className="break-all text-lg font-black text-on-surface">{item.domain || item.url_or_host || 'domínio não identificado'}</span>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-on-surface/62">
                          Política: <span className="font-semibold text-on-surface">{item.policy_label || item.matched_policy_name || 'Padrão permitido'}</span>
                          {item.category ? ` • categoria ${item.category}` : ''}
                          {item.source_detail ? ` • origem ${item.source_detail}` : ''}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-on-surface/44">
                          <span>{formatDate(item.timestamp)}</span>
                          <span>Tempo: {item.duration_on_domain || 'indisponível'}</span>
                          <span>{item.duration_confidence === 'estimated' ? 'duração estimada' : 'tempo indisponível'}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.action === 'blocked' && item.domain ? (
                          <ActionButton tone="success" icon={Plus} onClick={() => createAllowPolicyFromAudit(item)}>
                            Adicionar à política
                          </ActionButton>
                        ) : null}
                        {item.domain ? (
                          <ActionButton tone="ghost" icon={Search} onClick={() => { setAuditSearch(item.domain); setAuditFilters((current) => ({ ...current, action: 'all' })); }}>
                            Ver domínio na trilha
                          </ActionButton>
                        ) : null}
                      </div>
                    </div>
                  </ListRow>
                )) : (
                  <EmptyStateBlock
                    icon={ScrollText}
                    title="Nenhum evento localizado"
                    description="Busque por IP, hostname ou domínio, ajuste o período e aplique o filtro para reconstruir a trilha institucional de acesso."
                    action={<ActionButton tone="primary" icon={Filter} onClick={loadOperationalAudit}>Aplicar filtros</ActionButton>}
                  />
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Trilha administrativa" subtitle="Mudanças feitas por operadores: políticas, apply, rollback e ações administrativas.">
            <div className="space-y-2.5">
              {filteredAudit.length ? filteredAudit.slice(0, 80).map((item, index) => (
                <ListRow key={`${item.created_at}-${index}`}>
                  <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-on-surface">{item.action || 'Evento'}</span>
                        <StateBadge label={item.success ? 'Sucesso' : 'Falha'} tone={item.success ? 'success' : 'danger'} />
                        {item.vlan_id ? <StateBadge label={`VLAN ${item.vlan_id}`} tone="neutral" /> : null}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-on-surface/62">{item.message || 'Sem mensagem complementar.'}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-on-surface/44">
                        {item.domain ? <span>Domínio {item.domain}</span> : null}
                        {item.ip ? <span>IP {item.ip}</span> : null}
                        {item.requested_by ? <span>Operador {item.requested_by}</span> : null}
                      </div>
                    </div>
                    <div className="text-sm text-on-surface/50">{formatDate(item.created_at)}</div>
                  </div>
                </ListRow>
              )) : (
                <EmptyStateBlock icon={ScrollText} title="Nenhum evento administrativo" description="Ajuste o filtro ou aguarde novas ações operacionais." />
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
