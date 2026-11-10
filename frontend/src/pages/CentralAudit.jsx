import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, ListTree, RefreshCw, Search, ShieldAlert, Smartphone } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Field, Kpi, KpiRow, Notice, PageHeader, Panel, Tabs, errorMessage, fmtDateTime, inputCls, useUrlTab } from '../components/ui/kit';
import SocialDeviceReport from '../components/audit/SocialDeviceReport';

/*
 * Centro de Auditoria: uma linha do tempo única com os eventos de autenticação, rede, LGPD, chamados,
 * hotspot, colaboradores e ações administrativas. Cada fonte continua guardando o seu registro original.
 */

const PERIOD_OPTIONS = [
  { value: '30m', label: '30 minutos' },
  { value: '1h', label: '1 hora' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'Todas as severidades' },
  { value: 'info', label: 'Informativo' },
  { value: 'success', label: 'Sucesso' },
  { value: 'warning', label: 'Atenção' },
  { value: 'critical', label: 'Crítico' },
];

const SEVERITY_LABELS = { info: 'Informativo', success: 'Sucesso', warning: 'Atenção', critical: 'Crítico' };

const CATEGORY_TONES = {
  seguranca: 'danger',
  rede: 'primary',
  sistema: 'neutral',
  usuarios: 'primary',
  chamados: 'warning',
  lgpd: 'success',
  automacao: 'primary',
  infraestrutura: 'neutral',
};

const INITIAL_FILTERS = { period: '24h', category: 'all', source: 'all', severity: 'all', success: 'all', search: '', actor: '', ip: '', limit: '240' };

const statusTone = (item) => {
  if (item.severity === 'critical') return 'danger';
  if (item.severity === 'warning') return 'warning';
  return item.success ? 'success' : 'danger';
};

const buildParams = (filters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  return params.toString();
};

function AuditTimeline() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
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
      setError(errorMessage(e, 'Não foi possível carregar o Centro de Auditoria.'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(INITIAL_FILTERS);

  const categoryCounts = summary?.by_category || {};
  const categoryLabel = (key) => summary?.category_labels?.[key] || categories.find((c) => c.key === key)?.label || key;
  const count = (value) => (summary ? Number(value || 0).toLocaleString('pt-BR') : '—');

  const columns = [
    { key: 'event_at', label: 'Quando', width: '150px', render: (item) => <span className="tabular text-on-surface/70">{fmtDateTime(item.event_at)}</span> },
    { key: 'category', label: 'Categoria', render: (item) => <Badge tone={CATEGORY_TONES[item.category] || 'neutral'}>{categoryLabel(item.category)}</Badge> },
    {
      key: 'title',
      label: 'Evento',
      render: (item) => (
        <div className="min-w-[240px]">
          <div className="font-semibold text-on-surface">{item.title || item.action || 'Evento de auditoria'}</div>
          <div className="mt-0.5 text-[12.5px] leading-5 text-on-surface/60">{item.message || item.target || 'Sem mensagem complementar.'}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-on-surface/50">
            <span>Fonte: {item.source || '—'}</span>
            {item.action ? <span>Ação: {item.action}</span> : null}
            {item.target ? <span>Alvo: {item.target}</span> : null}
          </div>
        </div>
      ),
    },
    { key: 'actor', label: 'Quem', render: (item) => <div><div>{item.actor || 'Sistema'}</div><div className="tabular text-[11.5px] text-on-surface/50">{item.ip || '—'}</div></div> },
    { key: 'severity', label: 'Resultado', render: (item) => <Badge tone={statusTone(item)} dot>{SEVERITY_LABELS[item.severity] || (item.success ? 'Sucesso' : 'Falha')}</Badge> },
  ];

  return (
    <div className="space-y-4">
      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}

      <KpiRow>
        <Kpi icon={DatabaseZap} label="Eventos no recorte" value={count(summary?.total)} sub={`Período: ${PERIOD_OPTIONS.find((p) => p.value === filters.period)?.label}`} />
        <Kpi icon={CheckCircle2} label="Sucessos" value={count(summary?.success)} tone="success" />
        <Kpi icon={AlertTriangle} label="Pontos de atenção" value={count(summary?.attention)} tone={summary?.attention ? 'warning' : 'neutral'} />
        <Kpi icon={ShieldAlert} label="Falhas" value={count(summary?.failures)} tone={summary?.failures ? 'danger' : 'neutral'} />
      </KpiRow>

      <Panel title="Filtros" actions={<>{hasFilters ? <Button variant="ghost" onClick={() => setFilters(INITIAL_FILTERS)}>Limpar filtros</Button> : null}<Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="audit-search" label="Busca">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input id="audit-search" className={`${inputCls} pl-9`} value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="ação, alvo, mensagem" />
            </div>
          </Field>
          <Field id="audit-period" label="Período">
            <select id="audit-period" className={inputCls} value={filters.period} onChange={(e) => setFilter('period', e.target.value)}>
              {PERIOD_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field id="audit-category" label="Categoria">
            <select id="audit-category" className={inputCls} value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="all">Todas</option>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label} ({categoryCounts[c.key] || 0})</option>)}
            </select>
          </Field>
          <Field id="audit-source" label="Fonte">
            <select id="audit-source" className={inputCls} value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
              <option value="all">Todas</option>
              {sources.map((s) => <option key={`${s.category}-${s.source}`} value={s.source}>{s.source}</option>)}
            </select>
          </Field>
          <Field id="audit-result" label="Resultado">
            <select id="audit-result" className={inputCls} value={filters.success} onChange={(e) => setFilter('success', e.target.value)}>
              <option value="all">Todos</option>
              <option value="true">Sucesso</option>
              <option value="false">Falha</option>
            </select>
          </Field>
          <Field id="audit-severity" label="Severidade">
            <select id="audit-severity" className={inputCls} value={filters.severity} onChange={(e) => setFilter('severity', e.target.value)}>
              {SEVERITY_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field id="audit-actor" label="Operador ou usuário">
            <input id="audit-actor" className={inputCls} value={filters.actor} onChange={(e) => setFilter('actor', e.target.value)} placeholder="nome ou identidade" />
          </Field>
          <Field id="audit-ip" label="Endereço IP">
            <input id="audit-ip" className={inputCls} value={filters.ip} onChange={(e) => setFilter('ip', e.target.value)} placeholder="ex.: 192.168.10.45" />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Eventos"
        description={loading ? 'Carregando…' : `${events.length.toLocaleString('pt-BR')} carregados${summary?.total > events.length ? ` de ${Number(summary.total).toLocaleString('pt-BR')} no recorte` : ''}. Para ver outros, estreite o período ou use os filtros.`}
        padded={false}
      >
        {loading && !events.length
          ? <p className="px-4 py-6 text-center text-sm text-on-surface/55">Carregando auditorias…</p>
          : <DataTable columns={columns} rows={events} rowKey={(item) => `${item.source}-${item.id}`} empty="Nenhum evento neste filtro. Amplie o período ou limpe os filtros." />}
      </Panel>
    </div>
  );
}

const TABS = [
  { key: 'aparelhos', label: 'Redes sociais por aparelho', icon: Smartphone },
  { key: 'linha-do-tempo', label: 'Linha do tempo', icon: ListTree },
];

export default function CentralAudit() {
  const [tab, setTab] = useUrlTab(TABS, 'aparelhos');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Centro de Auditoria"
        description="Quem tentou acessar o que está proibido, com o aparelho identificado, e a linha do tempo completa de autenticação, rede, LGPD, chamados, portais e ações administrativas."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'aparelhos' ? <SocialDeviceReport /> : <AuditTimeline />}
    </div>
  );
}
