import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Clock3,
  Database,
  Download,
  FileSearch,
  Globe2,
  RefreshCcw,
  ScrollText,
  ShieldCheck,
  Waypoints,
  Wifi,
} from 'lucide-react';
import { authFetch } from '../services/authFetch';
import {
  ActionButton,
  DataToolbar,
  EmptyStateBlock,
  InlineStat,
  ListRow,
  MetricCard,
  MiniTrendList,
  ModuleHero,
  QuickActionBar,
  SectionCard,
  SegmentedTabs,
  StateBadge,
} from '../components/blocking/BlockingUi';

const API = '';

const TABS = [
  { key: 'overview', label: 'Painel Executivo', icon: ShieldCheck },
  { key: 'audit', label: 'Relatório de Acessos', icon: FileSearch },
  { key: 'metrics', label: 'Telemetria', icon: Activity },
];

const PERIOD_OPTIONS = [
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
}

function formatMetric(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

async function fetchJson(path) {
  const response = await authFetch(`${API}${path}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Falha em ${path}`);
  }
  return payload;
}

export default function DataGovernance() {
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('24h');
  const [search, setSearch] = useState('');
  const [auditSource, setAuditSource] = useState('all');
  const [auditAction, setAuditAction] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState({ events: [], summary: {} });
  const [metrics, setMetrics] = useState(null);
  const [radar, setRadar] = useState({ events: [], summary: {} });

  const loadAll = async (nextPeriod = period) => {
    setLoading(true);
    setError('');
    const [overviewResult, auditResult, metricsResult, radarResult] = await Promise.allSettled([
      fetchJson(`/api/data-governance/overview?period=${nextPeriod}`),
      fetchJson(`/api/data-governance/audit/events?period=${nextPeriod}&limit=240`),
      fetchJson(`/api/data-governance/metrics?range=${nextPeriod === '90d' ? '30d' : nextPeriod}`),
      fetchJson('/api/data-governance/radar/realtime?window_minutes=10&limit=120'),
    ]);

    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    if (auditResult.status === 'fulfilled') setAudit(auditResult.value);
    if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value);
    if (radarResult.status === 'fulfilled') setRadar(radarResult.value);

    const failures = [
      overviewResult.status === 'rejected' ? 'visão executiva' : null,
      auditResult.status === 'rejected' ? 'auditoria' : null,
      metricsResult.status === 'rejected' ? 'telemetria' : null,
      radarResult.status === 'rejected' ? 'radar' : null,
    ].filter(Boolean);

    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll(period);
  }, [period]);

  const filteredAudit = useMemo(() => {
    const needle = normalizeText(search);
    return [...(audit.events || [])].filter((item) => {
      if (auditSource !== 'all' && item.source !== auditSource) return false;
      if (auditAction !== 'all' && item.action !== auditAction) return false;
      if (!needle) return true;
      return [
        item.client_ip,
        item.hostname,
        item.domain,
        item.policy_label,
        item.matched_policy_name,
        item.category,
        item.vlan_id,
      ].some((value) => normalizeText(value).includes(needle));
    });
  }, [audit.events, auditAction, auditSource, search]);

  const heroBadges = (
    <>
      <StateBadge label="Módulo dedicado" tone="primary" />
      <StateBadge label="Evidência auditável" tone="success" />
      <StateBadge label="Circulação institucional" tone="neutral" />
      <StateBadge label={overview?.service_posture?.degraded ? 'Postura degradada' : 'Postura estável'} tone={overview?.service_posture?.degraded ? 'warning' : 'success'} />
    </>
  );

  const heroAside = (
    <div className="grid gap-3 sm:grid-cols-2">
      <InlineStat label="Eventos no período" value={formatMetric(overview?.summary?.total_events)} tone="primary" />
      <InlineStat label="IPs únicos" value={formatMetric(overview?.summary?.unique_ips)} tone="success" />
      <InlineStat label="Domínios únicos" value={formatMetric(overview?.summary?.unique_domains)} tone="neutral" />
      <InlineStat label="Integridade" value={formatMetric(overview?.service_posture?.integrity_score)} tone={overview?.service_posture?.degraded ? 'warning' : 'success'} />
    </div>
  );

  const executiveCards = [
    {
      icon: ScrollText,
      eyebrow: 'Base de evidências',
      title: 'Eventos auditáveis',
      value: formatMetric(overview?.summary?.total_events),
      subtitle: 'Quantidade total de eventos observados no recorte institucional ativo.',
      tone: 'primary',
    },
    {
      icon: Globe2,
      eyebrow: 'Pressão de bloqueio',
      title: 'Eventos bloqueados',
      value: formatMetric(overview?.summary?.blocked_events),
      subtitle: 'Ocorrências em que a política aplicada efetivamente impediu o acesso.',
      tone: 'danger',
    },
    {
      icon: Waypoints,
      eyebrow: 'Principal origem de tráfego',
      title: overview?.highlights?.top_vlan?.vlan_id ? `VLAN ${overview.highlights.top_vlan.vlan_id}` : 'Sem destaque',
      value: formatMetric(overview?.highlights?.top_vlan?.total),
      subtitle: 'Volume dominante de eventos observados na janela executiva.',
      tone: 'success',
    },
    {
      icon: Wifi,
      eyebrow: 'Janela quente',
      title: `${formatMetric(radar?.summary?.total)} eventos em 10 min`,
      value: `${formatMetric(radar?.summary?.unique_ips)} IPs`,
      subtitle: 'Leitura curta para identificar aceleração recente do ambiente monitorado.',
      tone: 'warning',
    },
  ];

  const topBlocked = (metrics?.topBlocked || []).map((item) => ({ label: item.domain || 'domínio não identificado', value: Number(item.total || 0) }));
  const topSites = (metrics?.topSites || []).map((item) => ({ label: item.domain || 'domínio não identificado', value: Number(item.total || 0) }));
  const topVlans = (metrics?.topVlans || []).map((item) => ({ label: `VLAN ${item.vlan_id}`, value: Number(item.total || 0) }));
  const recentRadar = radar?.events || [];

  const exportPdf = async () => {
    const params = new URLSearchParams();
    params.set('period', period);
    if (auditSource !== 'all') params.set('source', auditSource);
    if (auditAction !== 'all') params.set('action', auditAction);
    if (search.trim()) params.set('domain', search.trim());

    const response = await authFetch(`${API}/api/data-governance/audit/export.pdf?${params.toString()}`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Falha ao exportar PDF.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `governanca-dados-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 xl:space-y-6">
      <ModuleHero
        eyebrow="Governança de Dados"
        title="Evidência de acesso, tratamento institucional e telemetria sob um módulo próprio"
        description="Esta superfície deixou de ser um recorte de políticas institucionais. Aqui a leitura é centrada em eventos observados, responsabilização, volume, origem, pressão de bloqueio e material probatório para circulação formal."
        badges={heroBadges}
        actions={(
          <QuickActionBar
            items={[
              { label: 'Atualizar', tone: 'primary', icon: RefreshCcw, onClick: () => loadAll(period) },
              { label: 'Exportar PDF', tone: 'success', icon: Download, onClick: () => exportPdf().catch((pdfError) => setError(pdfError.message || 'Falha ao exportar.')) },
            ]}
          />
        )}
        aside={heroAside}
      />

      <SegmentedTabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      <DataToolbar>
        <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_180px_180px_180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Busque por IP, hostname, domínio, VLAN ou política"
            className="min-h-[var(--control-height)] rounded-2xl border border-outline/14 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/28"
          />
          <select value={period} onChange={(event) => setPeriod(event.target.value)} className="min-h-[var(--control-height)] rounded-2xl border border-outline/14 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/28">
            {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={auditSource} onChange={(event) => setAuditSource(event.target.value)} className="min-h-[var(--control-height)] rounded-2xl border border-outline/14 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/28">
            <option value="all">Todas as fontes</option>
            <option value="dns">Somente DNS</option>
            <option value="proxy">Somente Proxy</option>
          </select>
          <select value={auditAction} onChange={(event) => setAuditAction(event.target.value)} className="min-h-[var(--control-height)] rounded-2xl border border-outline/14 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary/28">
            <option value="all">Todas as ações</option>
            <option value="blocked">Bloqueado</option>
            <option value="allowed">Liberado</option>
            <option value="bypassed">Bypass</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => loadAll(period)}>Recarregar</ActionButton>
        </div>
      </DataToolbar>

      {error ? (
        <SectionCard title="Falha de carregamento" subtitle={error}>
          <ActionButton tone="primary" icon={RefreshCcw} onClick={() => loadAll(period)}>Tentar novamente</ActionButton>
        </SectionCard>
      ) : null}

      {!error && activeTab === 'overview' ? (
        <div className="space-y-5 xl:space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {executiveCards.map((card) => (
              <MetricCard key={card.title} {...card} />
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard title="Leitura executiva" subtitle="Síntese institucional da prova produzida pelo ambiente observável.">
              <div className="grid gap-3 md:grid-cols-2">
                <InlineStat label="Bloqueados" value={formatMetric(overview?.summary?.blocked_events)} tone="danger" />
                <InlineStat label="Liberados" value={formatMetric(overview?.summary?.allowed_events)} tone="success" />
                <InlineStat label="Bypass" value={formatMetric(overview?.summary?.bypassed_events)} tone="warning" />
                <InlineStat label="Motor atual" value={overview?.service_posture?.policy_engine || 'unknown'} tone="primary" />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[var(--surface-radius)] border border-outline/12 bg-surface-high/60 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Domínio mais bloqueado</div>
                  <div className="mt-2 break-all text-lg font-black text-on-surface">{overview?.highlights?.top_blocked_domain?.domain || 'Sem recorrência relevante'}</div>
                  <div className="mt-1 text-sm text-on-surface/60">{formatMetric(overview?.highlights?.top_blocked_domain?.total)} ocorrências</div>
                </div>
                <div className="rounded-[var(--surface-radius)] border border-outline/12 bg-surface-high/60 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-on-surface/50">Domínio mais acessado</div>
                  <div className="mt-2 break-all text-lg font-black text-on-surface">{overview?.highlights?.top_allowed_domain?.domain || 'Sem recorrência relevante'}</div>
                  <div className="mt-1 text-sm text-on-surface/60">{formatMetric(overview?.highlights?.top_allowed_domain?.total)} ocorrências</div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Radar recente" subtitle="Últimos eventos para inspeção rápida da janela corrente.">
              <div className="space-y-2.5">
                {recentRadar.length ? recentRadar.slice(0, 8).map((item) => (
                  <ListRow key={`${item.source}-${item.id}`}>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-black text-on-surface">{item.client_ip || 'IP não identificado'}</span>
                        <StateBadge label={item.hostname || 'hostname não identificado'} tone="neutral" />
                        {item.vlan_id ? <StateBadge label={`VLAN ${item.vlan_id}`} tone="primary" /> : null}
                        <StateBadge label={item.source === 'dns' ? 'DNS' : 'Proxy'} tone={item.source === 'dns' ? 'success' : 'warning'} />
                      </div>
                      <div className="break-all text-base font-black text-on-surface">{item.domain || item.url_or_host || 'domínio não identificado'}</div>
                      <div className="text-sm text-on-surface/60">{formatDate(item.timestamp)}</div>
                    </div>
                  </ListRow>
                )) : (
                  <EmptyStateBlock icon={Wifi} title="Sem eventos recentes" description="Nenhum evento novo foi correlacionado na janela curta do radar." />
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}

      {!error && activeTab === 'audit' ? (
        <SectionCard
          title="Relatório de Acessos"
          subtitle="Trilha central para identificar origem, destino, decisão aplicada e política correlata sem misturar isso com edição de políticas."
          actions={(
            <QuickActionBar
              items={[
                { label: 'Atualizar', tone: 'primary', icon: RefreshCcw, onClick: () => loadAll(period) },
                { label: 'Exportar PDF', tone: 'success', icon: Download, onClick: () => exportPdf().catch((pdfError) => setError(pdfError.message || 'Falha ao exportar.')) },
              ]}
            />
          )}
        >
          <div className="grid gap-3 md:grid-cols-4">
            <InlineStat label="Eventos filtrados" value={formatMetric(filteredAudit.length)} tone="primary" />
            <InlineStat label="Bloqueados" value={formatMetric(audit.summary?.blocked)} tone="danger" />
            <InlineStat label="Liberados" value={formatMetric(audit.summary?.allowed)} tone="success" />
            <InlineStat label="Domínios únicos" value={formatMetric(audit.summary?.unique_domains)} tone="neutral" />
          </div>
          <div className="mt-4 space-y-2.5">
            {filteredAudit.length ? filteredAudit.map((item) => (
              <ListRow key={`${item.source}-${item.id}`}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-black text-on-surface">{item.client_ip || 'IP não identificado'}</span>
                      <StateBadge label={item.hostname || 'hostname não identificado'} tone="neutral" />
                      {item.vlan_id ? <StateBadge label={`VLAN ${item.vlan_id}`} tone="primary" /> : null}
                      <StateBadge label={item.action || '—'} tone={item.action === 'blocked' ? 'danger' : item.action === 'allowed' ? 'success' : 'warning'} />
                      <StateBadge label={item.source === 'dns' ? 'DNS' : 'Proxy'} tone={item.source === 'dns' ? 'success' : 'warning'} />
                    </div>
                    <div className="mt-3 break-all text-lg font-black text-on-surface">{item.domain || item.url_or_host || 'domínio não identificado'}</div>
                    <div className="mt-2 text-sm leading-6 text-on-surface/62">
                      Política: <span className="font-semibold text-on-surface">{item.policy_label || item.matched_policy_name || 'Sem política nomeada'}</span>
                      {item.category ? ` • categoria ${item.category}` : ''}
                    </div>
                  </div>
                  <div className="text-sm text-on-surface/50">{formatDate(item.timestamp)}</div>
                </div>
              </ListRow>
            )) : (
              <EmptyStateBlock icon={ScrollText} title="Sem eventos no filtro atual" description="Ajuste período, texto de busca, fonte ou ação para ampliar a leitura." />
            )}
          </div>
        </SectionCard>
      ) : null}

      {!error && activeTab === 'metrics' ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <SectionCard title="Domínios mais acessados" subtitle="Volume bruto observado na janela selecionada.">
            <MiniTrendList items={topSites} />
          </SectionCard>
          <SectionCard title="Domínios mais bloqueados" subtitle="Pressão recorrente de bloqueio por destino observado.">
            <MiniTrendList items={topBlocked} />
          </SectionCard>
          <SectionCard title="VLANs com maior volume" subtitle="Concentração de eventos por rede institucional.">
            <MiniTrendList items={topVlans} />
          </SectionCard>
          <SectionCard title="Mudança administrativa" subtitle="Alterações registradas na trilha de ação do período." className="xl:col-span-2">
            <MiniTrendList
              items={(metrics?.serviceTrend || []).map((item) => ({ label: item.day, value: Number(item.changes || 0) }))}
              empty="Sem alterações administrativas registradas no recorte."
            />
          </SectionCard>
          <SectionCard title="Postura operacional" subtitle="Leitura de saúde suficiente para o circuito de governança de dados.">
            <div className="grid gap-3">
              <InlineStat label="Radar DNS" value={overview?.service_posture?.dns_radar || 'unknown'} tone="success" />
              <InlineStat label="Contingência DNS" value={overview?.service_posture?.dns_contingency || 'unknown'} tone={overview?.service_posture?.dns_contingency === 'active' ? 'warning' : 'neutral'} />
              <InlineStat label="Integridade" value={formatMetric(overview?.service_posture?.integrity_score)} tone={overview?.service_posture?.degraded ? 'warning' : 'success'} />
              <InlineStat label="Janela radar" value={`${formatMetric(radar?.summary?.window_minutes)} min`} tone="primary" />
            </div>
          </SectionCard>
        </div>
      ) : null}

      {loading ? (
        <SectionCard title="Carregando governança de dados" subtitle="Consolidando auditoria, telemetria e evidências institucionais.">
          <div className="text-sm text-on-surface/62">Aguarde enquanto o módulo recompõe os indicadores.</div>
        </SectionCard>
      ) : null}
    </div>
  );
}
