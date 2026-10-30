import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Database, Download, FileSearch, Globe2, RefreshCw, ScrollText, Search, ShieldCheck, Wifi } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Field, Kpi, KpiRow, Notice, PageHeader, Panel, Tabs, errorMessage, inputCls, toast, useUrlTab } from '../components/ui/kit';

/*
 * Governança de Dados: evidência de acesso para circulação formal. Painel executivo, relatório de acessos
 * (quem acessou o quê, com a decisão e a política) e telemetria do período.
 */

const TABS = [
  { key: 'overview', label: 'Painel executivo', icon: ShieldCheck },
  { key: 'audit', label: 'Relatório de acessos', icon: FileSearch },
  { key: 'metrics', label: 'Telemetria', icon: Activity },
];
const PERIOD_OPTIONS = [{ value: '24h', label: '24 horas' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '90d', label: '90 dias' }];
const ACTION_LABEL = { blocked: 'Bloqueado', allowed: 'Liberado', bypassed: 'Exceção (VIP)' };
const ACTION_TONE = { blocked: 'danger', allowed: 'success', bypassed: 'warning' };

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const when = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR')}`;
};
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR');

function TopList({ title, description, items, barClass = 'bg-primary', empty = 'Sem dados no período.' }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Panel title={title} description={description}>
      {items.length ? (
        <ul className="space-y-2">
          {items.slice(0, 10).map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="truncate font-medium text-on-surface" title={item.label}>{item.label}</span>
                <span className="tabular shrink-0 text-on-surface/60">{fmt(item.value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-on-surface/10"><div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }} /></div>
            </li>
          ))}
        </ul>
      ) : <p className="py-6 text-center text-sm text-on-surface/50">{empty}</p>}
    </Panel>
  );
}

export default function DataGovernance() {
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'overview');
  const [period, setPeriod] = useState('24h');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [action, setAction] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState({ events: [], summary: {} });
  const [metrics, setMetrics] = useState(null);
  const [radar, setRadar] = useState({ events: [], summary: {} });

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [o, a, m, r] = await Promise.allSettled([
      api.get(`/api/data-governance/overview?period=${period}`),
      api.get(`/api/data-governance/audit/events?period=${period}&limit=240`),
      api.get(`/api/data-governance/metrics?range=${period}`),
      api.get('/api/data-governance/radar/realtime?window_minutes=10&limit=120'),
    ]);
    if (o.status === 'fulfilled') setOverview(o.value.data);
    if (a.status === 'fulfilled') setAudit(a.value.data || { events: [], summary: {} });
    if (m.status === 'fulfilled') setMetrics(m.value.data);
    if (r.status === 'fulfilled') setRadar(r.value.data || { events: [], summary: {} });
    const failed = [o.status === 'rejected' ? 'painel executivo' : null, a.status === 'rejected' ? 'relatório de acessos' : null, m.status === 'rejected' ? 'telemetria' : null, r.status === 'rejected' ? 'radar' : null].filter(Boolean);
    setError(failed.length ? `Não foi possível ler: ${failed.join(', ')}.` : '');
    setLoading(false);
  }, [period]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredAudit = useMemo(() => {
    const needle = norm(search);
    return (audit.events || []).filter((i) => {
      if (source !== 'all' && i.source !== source) return false;
      if (action !== 'all' && i.action !== action) return false;
      if (!needle) return true;
      return [i.client_ip, i.hostname, i.identity_user, i.identity_display_user, i.identity_computer, i.domain, i.policy_label, i.matched_policy_name, i.category, i.vlan_id].some((v) => norm(v).includes(needle));
    });
  }, [audit.events, action, source, search]);

  const exportPdf = async () => {
    try {
      const params = new URLSearchParams({ period });
      if (source !== 'all') params.set('source', source);
      if (action !== 'all') params.set('action', action);
      if (search.trim()) params.set('domain', search.trim());
      const res = await api.get(`/api/data-governance/audit/export.pdf?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `governanca-dados-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('PDF gerado.');
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível exportar o PDF.'), 'danger');
    }
  };

  const sum = overview?.summary || {};
  const posture = overview?.service_posture || {};
  const asList = (rows, labelOf) => (rows || []).map((r) => ({ label: labelOf(r), value: Number(r.total || 0) }));
  const ready = Boolean(overview);

  const auditColumns = [
    { key: 'timestamp', label: 'Quando', width: '150px', render: (i) => <span className="tabular text-on-surface/70">{when(i.timestamp)}</span> },
    { key: 'who', label: 'Quem', render: (i) => <div className="min-w-[170px]"><div className="tabular font-semibold text-on-surface">{i.client_ip || 'IP não identificado'}</div><div className="text-[12px] text-on-surface/55">{i.identity_display_user || i.identity_user || i.identity_computer || i.hostname || 'sem identificação'}{i.vlan_id ? ` · VLAN ${i.vlan_id}` : ''}</div></div> },
    { key: 'what', label: 'O que acessou', render: (i) => <div className="min-w-[200px]"><div className="break-all font-semibold text-on-surface">{i.domain || i.url_or_host || 'domínio não identificado'}</div><div className="text-[12px] text-on-surface/55">{i.policy_label || i.matched_policy_name || 'Sem política nomeada'}{i.category && i.category !== (i.policy_label || i.matched_policy_name) ? ` · ${i.category}` : ''}</div></div> },
    { key: 'action', label: 'Decisão', render: (i) => <Badge tone={ACTION_TONE[i.action] || 'neutral'} dot>{ACTION_LABEL[i.action] || i.action || '—'}</Badge> },
    { key: 'source', label: 'Origem', render: (i) => (i.source === 'dns' ? 'DNS' : i.source === 'proxy' ? 'Proxy' : i.source || '—') },
  ];

  const radarColumns = [
    { key: 'timestamp', label: 'Hora', width: '90px', render: (i) => <span className="tabular text-on-surface/70">{i.timestamp ? new Date(i.timestamp).toLocaleTimeString('pt-BR') : '—'}</span> },
    { key: 'client_ip', label: 'Quem', render: (i) => <div><div className="tabular font-semibold">{i.client_ip || 'IP não identificado'}</div><div className="text-[12px] text-on-surface/55">{i.identity_display_user || i.identity_user || i.identity_computer || i.hostname || 'sem identificação'}</div></div> },
    { key: 'domain', label: 'O que acessou', render: (i) => <span className="break-all font-semibold">{i.domain || i.url_or_host || 'domínio não identificado'}</span> },
    { key: 'source', label: 'Origem', render: (i) => (i.source === 'dns' ? 'DNS' : 'Proxy') },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Governança de Dados"
        description="Evidência de acesso para circulação formal: o que foi acessado, por quem, com qual decisão e sob qual política, mais a telemetria do período."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={loadAll} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
            <Button variant="primary" icon={Download} onClick={exportPdf}>Exportar PDF</Button>
          </>
        )}
      />

      <Panel padded>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <Field id="dg-search" label="Busca">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input id="dg-search" className={`${inputCls} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="IP, aparelho, domínio, VLAN ou política" />
            </div>
          </Field>
          <Field id="dg-period" label="Período"><select id="dg-period" className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
          <Field id="dg-source" label="Fonte"><select id="dg-source" className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}><option value="all">DNS e proxy</option><option value="dns">Somente DNS</option><option value="proxy">Somente proxy</option></select></Field>
          <Field id="dg-action" label="Decisão"><select id="dg-action" className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}><option value="all">Todas</option><option value="blocked">Bloqueadas</option><option value="allowed">Liberadas</option><option value="bypassed">Exceções (VIP)</option></select></Field>
        </div>
      </Panel>

      {error ? <Notice tone="warning" title="Leitura incompleta" action={<Button onClick={loadAll}>Tentar de novo</Button>}>{error}</Notice> : null}

      <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' ? (
        <div className="space-y-4">
          <KpiRow>
            <Kpi icon={ScrollText} label="Eventos no período" value={ready ? fmt(sum.total_events) : '—'} sub={ready ? `${fmt(sum.unique_ips)} IPs · ${fmt(sum.unique_domains)} domínios` : null} />
            <Kpi icon={Globe2} label="Bloqueados" value={ready ? fmt(sum.blocked_events) : '—'} tone="danger" sub="A política impediu o acesso" />
            <Kpi icon={Database} label="Integridade" value={ready ? fmt(posture.integrity_score) : '—'} tone={posture.degraded ? 'warning' : 'success'} sub={posture.degraded ? 'Postura degradada' : 'Postura estável'} />
            <Kpi icon={Wifi} label="Últimos 10 minutos" value={fmt(radar.summary?.total)} sub={`${fmt(radar.summary?.unique_ips)} IPs distintos`} />
          </KpiRow>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Leitura executiva" description="Síntese do que o ambiente registrou no período.">
              <div className="grid gap-3 sm:grid-cols-2">
                {[['Liberados', fmt(sum.allowed_events)], ['Exceções (VIP)', fmt(sum.bypassed_events)], ['Motor atual', posture.policy_engine || '—'], ['Contingência DNS', posture.dns_contingency || '—']].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-outline px-3 py-2"><div className="text-[11.5px] text-on-surface/50">{label}</div><div className="mt-0.5 text-[15px] font-semibold text-on-surface">{value}</div></div>
                ))}
                <div className="rounded-lg border border-outline px-3 py-2 sm:col-span-1"><div className="text-[11.5px] text-on-surface/50">Domínio mais bloqueado</div><div className="mt-0.5 break-all text-[15px] font-semibold text-on-surface">{overview?.highlights?.top_blocked_domain?.domain || 'Sem recorrência relevante'}</div><div className="text-[12px] text-on-surface/55">{fmt(overview?.highlights?.top_blocked_domain?.total)} ocorrências</div></div>
                <div className="rounded-lg border border-outline px-3 py-2 sm:col-span-1"><div className="text-[11.5px] text-on-surface/50">Domínio mais acessado</div><div className="mt-0.5 break-all text-[15px] font-semibold text-on-surface">{overview?.highlights?.top_allowed_domain?.domain || 'Sem recorrência relevante'}</div><div className="text-[12px] text-on-surface/55">{fmt(overview?.highlights?.top_allowed_domain?.total)} ocorrências</div></div>
              </div>
            </Panel>
            <Panel title="Acessos mais recentes" description="Janela curta para ver se o ambiente acelerou." padded={false}>
              <DataTable columns={radarColumns} rows={(radar.events || []).slice(0, 8)} rowKey={(i) => `${i.source}-${i.id}-${i.timestamp}`} empty={loading ? 'Carregando…' : 'Nenhum evento novo nos últimos 10 minutos.'} />
            </Panel>
          </div>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <div className="space-y-4">
          <KpiRow>
            <Kpi label="Eventos no filtro" value={fmt(filteredAudit.length)} sub={`de ${fmt((audit.events || []).length)} carregados`} />
            <Kpi label="Bloqueados" value={fmt(audit.summary?.blocked)} tone="danger" />
            <Kpi label="Liberados" value={fmt(audit.summary?.allowed)} tone="success" />
            <Kpi label="Domínios distintos" value={fmt(audit.summary?.unique_domains)} />
          </KpiRow>
          <Panel title="Relatório de acessos" description="Origem, destino, decisão e política de cada acesso. Para mudar uma regra, use Políticas de Acesso." padded={false}>
            <DataTable columns={auditColumns} rows={filteredAudit.slice(0, 300)} rowKey={(i) => `${i.source}-${i.id}-${i.timestamp}`} empty={loading ? 'Carregando…' : 'Nenhum evento neste filtro. Ajuste o período, a busca, a fonte ou a decisão.'} />
          </Panel>
        </div>
      ) : null}

      {activeTab === 'metrics' ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <TopList title="Domínios mais acessados" description="Volume observado no período." items={asList(metrics?.topSites, (r) => r.domain || 'domínio não identificado')} />
          <TopList title="Domínios mais bloqueados" description="Destinos com mais bloqueios." items={asList(metrics?.topBlocked, (r) => r.domain || 'domínio não identificado')} barClass="bg-danger" />
          <TopList title="VLANs com mais eventos" description="Concentração por rede." items={asList(metrics?.topVlans, (r) => `VLAN ${r.vlan_id}`)} />
          <div className="xl:col-span-2">
            <TopList title="Mudanças administrativas por dia" description="Alterações registradas na trilha de ação." items={(metrics?.serviceTrend || []).map((r) => ({ label: String(r.day), value: Number(r.changes || 0) }))} barClass="bg-warning" empty="Nenhuma alteração administrativa no período." />
          </div>
          <Panel title="Postura operacional" description="Saúde mínima para o circuito de governança.">
            <ul className="space-y-2 text-[13px]">
              {[['Radar DNS', posture.dns_radar || '—'], ['Contingência DNS', posture.dns_contingency || '—'], ['Integridade', fmt(posture.integrity_score)], ['Janela do radar', `${fmt(radar.summary?.window_minutes)} min`]].map(([label, value]) => (
                <li key={label} className="flex items-center justify-between gap-3 rounded-lg border border-outline px-3 py-2"><span className="text-on-surface/75">{label}</span><span className="font-semibold text-on-surface">{value}</span></li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
