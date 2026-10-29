import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, FileSearch, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, EmptyState, ModuleHeader, StatusChip, Surface, cx } from '../components/ui/primitives';

const PERIOD_OPTIONS = [
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 hora' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const SEVERITY_LABELS = {
  info: 'Info',
  success: 'Sucesso',
  warning: 'Atenção',
  critical: 'Crítico',
};

const CATEGORY_TONES = {
  seguranca: 'danger',
  rede: 'primary',
  sistema: 'neutral',
  usuarios: 'info',
  chamados: 'warning',
  lgpd: 'success',
  automacao: 'primary',
  infraestrutura: 'neutral',
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function statusTone(item) {
  if (item.severity === 'critical') return 'danger';
  if (item.severity === 'warning') return 'warning';
  if (item.success) return 'success';
  return 'danger';
}

function buildParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  return params.toString();
}

export default function CentralAudit() {
  const [filters, setFilters] = useState({
    period: '24h',
    category: 'all',
    source: 'all',
    severity: 'all',
    success: 'all',
    search: '',
    actor: '',
    ip: '',
    limit: '240',
  });
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = useMemo(() => buildParams(filters), [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [categoriesRes, sourcesRes, summaryRes, eventsRes] = await Promise.all([
        api.get('/api/central-audit/categories'),
        api.get(`/api/central-audit/sources?${query}`),
        api.get(`/api/central-audit/summary?${query}`),
        api.get(`/api/central-audit/events?${query}`),
      ]);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
      setSources(Array.isArray(sourcesRes.data) ? sourcesRes.data : []);
      setSummary(summaryRes.data || {});
      setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Falha ao carregar centro de auditoria.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const activeCategories = useMemo(() => {
    const counts = summary?.by_category || {};
    return categories.map((item) => ({ ...item, total: counts[item.key] || 0 }));
  }, [categories, summary]);

  return (
    <div className="space-y-7 pb-10 animate-in fade-in duration-500">
      <ModuleHeader
        eyebrow="Governança"
        title="Centro de Auditoria"
        description="Auditorias de autenticação, rede, LGPD, chamados, navegação, hotspot, colaboradores e ações administrativas em uma visão única."
        badges={(
          <>
            <StatusChip label="Categorias unificadas" tone="primary" />
            <StatusChip label="Fontes preservadas" tone="success" />
            <StatusChip label="Filtro operacional" tone="warning" />
          </>
        )}
        actions={(
          <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => load().catch(() => null)} disabled={loading}>
            Atualizar
          </ActionButton>
        )}
      />

      {error ? (
        <Surface className="p-5">
          <div className="text-sm font-semibold text-danger">{error}</div>
        </Surface>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Surface className="p-5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/16 bg-primary/10 text-primary">
            <DatabaseZap size={18} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Eventos no recorte</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-on-surface">{summary?.total || 0}</div>
        </Surface>
        <Surface className="p-5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-info/18 bg-info/10 text-info">
            <CheckCircle2 size={18} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Sucessos</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-on-surface">{summary?.success || 0}</div>
        </Surface>
        <Surface className="p-5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-warning/20 bg-warning/10 text-warning">
            <AlertTriangle size={18} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Pontos de atenção</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-on-surface">{summary?.attention || 0}</div>
        </Surface>
        <Surface className="p-5">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-danger/18 bg-danger/10 text-danger">
            <ShieldCheck size={18} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Falhas</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-on-surface">{summary?.failures || 0}</div>
        </Surface>
      </div>

      <Surface className="p-5">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.75fr_0.75fr_0.75fr_0.75fr]">
          <label className="min-w-0">
            <span className="text-[11px] font-bold text-on-surface/58">Busca</span>
            <div className="mt-1.5 flex min-h-[42px] items-center gap-2 rounded-2xl border border-outline/14 bg-surface-high/72 px-3">
              <Search size={15} className="text-on-surface/45" />
              <input
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="ação, alvo, mensagem ou detalhe"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-on-surface outline-none placeholder:text-on-surface/42"
              />
            </div>
          </label>

          <label>
            <span className="text-[11px] font-bold text-on-surface/58">Período</span>
            <select value={filters.period} onChange={(event) => updateFilter('period', event.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-semibold text-on-surface outline-none">
              {PERIOD_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label>
            <span className="text-[11px] font-bold text-on-surface/58">Categoria</span>
            <select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-semibold text-on-surface outline-none">
              <option value="all">Todas</option>
              {categories.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>

          <label>
            <span className="text-[11px] font-bold text-on-surface/58">Fonte</span>
            <select value={filters.source} onChange={(event) => updateFilter('source', event.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-semibold text-on-surface outline-none">
              <option value="all">Todas</option>
              {sources.map((item) => <option key={`${item.category}-${item.source}`} value={item.source}>{item.source}</option>)}
            </select>
          </label>

          <label>
            <span className="text-[11px] font-bold text-on-surface/58">Resultado</span>
            <select value={filters.success} onChange={(event) => updateFilter('success', event.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-semibold text-on-surface outline-none">
              <option value="all">Todos</option>
              <option value="true">Sucesso</option>
              <option value="false">Falha</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input value={filters.actor} onChange={(event) => updateFilter('actor', event.target.value)} placeholder="Operador, usuário ou identidade" className="min-h-[40px] rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-medium text-on-surface outline-none placeholder:text-on-surface/42" />
          <input value={filters.ip} onChange={(event) => updateFilter('ip', event.target.value)} placeholder="IP" className="min-h-[40px] rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-medium text-on-surface outline-none placeholder:text-on-surface/42" />
          <select value={filters.severity} onChange={(event) => updateFilter('severity', event.target.value)} className="min-h-[40px] rounded-2xl border border-outline/14 bg-surface-high/72 px-3 text-sm font-semibold text-on-surface outline-none">
            <option value="all">Todas as severidades</option>
            <option value="info">Info</option>
            <option value="success">Sucesso</option>
            <option value="warning">Atenção</option>
            <option value="critical">Crítico</option>
          </select>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Surface className="p-5">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Categorias</div>
          <div className="mt-4 grid gap-2">
            {activeCategories.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateFilter('category', filters.category === item.key ? 'all' : item.key)}
                className={cx(
                  'flex items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition-all',
                  filters.category === item.key
                    ? 'border-primary/24 bg-primary/12 text-primary'
                    : 'border-outline/12 bg-surface-high/55 text-on-surface/72 hover:border-primary/18 hover:text-primary',
                )}
              >
                <span>{item.label}</span>
                <StatusChip label={String(item.total)} tone={CATEGORY_TONES[item.key] || 'neutral'} />
              </button>
            ))}
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold tracking-tight text-primary">Eventos</div>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-on-surface">Linha única de auditoria</h2>
            </div>
            <StatusChip label={`${events.length} carregados`} tone="neutral" />
          </div>

          <div className="mt-5 grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-7 text-sm text-on-surface/62">
                Carregando auditorias centralizadas...
              </div>
            ) : events.length ? events.map((item) => (
              <div key={`${item.source}-${item.id}`} className="rounded-[var(--surface-radius)] border border-outline/12 bg-surface-high/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={summary?.category_labels?.[item.category] || item.category} tone={CATEGORY_TONES[item.category] || 'neutral'} />
                  <StatusChip label={item.source || 'fonte'} tone="primary" />
                  <StatusChip label={SEVERITY_LABELS[item.severity] || item.severity || 'Info'} tone={statusTone(item)} />
                  <span className="text-xs font-semibold text-on-surface/50">{formatDate(item.event_at)}</span>
                </div>
                <div className="mt-3 text-sm font-bold text-on-surface">{item.title || item.action || 'Evento de auditoria'}</div>
                <div className="mt-1 text-sm leading-6 text-on-surface/65">{item.message || item.target || 'Sem mensagem complementar.'}</div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-on-surface/52">
                  <span>Ator: {item.actor || 'sistema'}</span>
                  <span>IP: {item.ip || '-'}</span>
                  <span>Alvo: {item.target || '-'}</span>
                  <span>Ação: {item.action || '-'}</span>
                </div>
              </div>
            )) : (
              <EmptyState
                icon={FileSearch}
                title="Nenhuma auditoria no filtro atual"
                description="Ajuste período, categoria, fonte, IP ou busca textual para ampliar o recorte."
              />
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
