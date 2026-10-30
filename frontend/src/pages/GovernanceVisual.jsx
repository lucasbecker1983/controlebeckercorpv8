import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CheckCircle2, Database, Flame, Globe2, Network, RefreshCw, ShieldAlert, UserRoundSearch, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, Field, Kpi, KpiRow, Notice, PageHeader, Panel, errorMessage, inputCls } from '../components/ui/kit';
import EChart, { baseAxis, baseTooltip, useChartTheme } from '../components/charts/EChart';

/*
 * Governança Visual: visão executiva da navegação (DNS/RPZ, proxy e UFW). Todo número e todo gráfico leva
 * ao relatório de navegação já filtrado, para investigar a evidência por trás.
 */

const PERIODS = [
  { value: '24h', label: 'Últimas 24 horas' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
];

const SOURCES = [
  { value: 'all', label: 'Todas as fontes' },
  { value: 'dns', label: 'DNS/RPZ' },
  { value: 'proxy', label: 'Proxy/ACL' },
  { value: 'ufw', label: 'UFW' },
];

const SOURCE_LABEL = { dns: 'DNS/RPZ', proxy: 'Proxy/ACL', ufw: 'UFW' };

const num = (value) => Number(value || 0);
const fmt = (value) => num(value).toLocaleString('pt-BR');
const pct = (value, total) => `${Math.round((num(value) / Math.max(num(total), 1)) * 100)}%`;

const buildReportsUrl = (filters = {}) => {
  const params = new URLSearchParams({ tab: 'navigation', view: 'events' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
  });
  return `/relatorios?${params.toString()}`;
};

// Indicador que leva ao relatório filtrado.
function LinkKpi({ onClick, hint, ...props }) {
  return (
    <button type="button" onClick={onClick} title={hint} className="block w-full rounded-xl text-left transition-colors hover:[&>div]:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <Kpi {...props} />
    </button>
  );
}

// Lista de barras: cada linha é um botão que abre o relatório daquele item.
function BarList({ title, description, rows, valueKey = 'total', labelKey, barClass = 'bg-primary', onRow, empty = 'Sem dados no período.' }) {
  const list = rows || [];
  const max = Math.max(...list.map((item) => num(item[valueKey])), 1);
  return (
    <Panel title={title} description={description}>
      {list.length ? (
        <ul className="space-y-1">
          {list.map((item, index) => {
            const label = item[labelKey] || item.domain || item.category || item.client_ip || 'Sem identificação';
            const value = num(item[valueKey]);
            return (
              <li key={`${label}-${index}`}>
                <button type="button" onClick={() => onRow?.(item)} className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-on-surface/[0.04]">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="truncate font-medium text-on-surface" title={label}>{label}</span>
                    <span className="tabular shrink-0 text-on-surface/60">{fmt(value)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-on-surface/10">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: pct(value, max) }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="py-6 text-center text-sm text-on-surface/50">{empty}</p>}
    </Panel>
  );
}

export default function GovernanceVisual() {
  const navigate = useNavigate();
  const theme = useChartTheme();
  const [period, setPeriod] = useState('24h');
  const [source, setSource] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/reports/governance-visual?${new URLSearchParams({ period, source })}`);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível carregar a Governança Visual.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = data?.summary || {};
  const charts = data?.charts || {};
  const openReports = (filters) => navigate(buildReportsUrl({ period, ...filters }));
  const blockedRatio = useMemo(() => pct(summary.blocked, summary.total), [summary.blocked, summary.total]);
  const ready = Boolean(data);

  const hourly = useMemo(() => {
    const rows = charts.by_hour || [];
    const label = (b) => new Date(b).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return {
      color: [theme.series[0], theme.danger],
      grid: { left: 44, right: 16, top: 28, bottom: 28 },
      legend: { top: 0, right: 0, textStyle: { color: theme.text, opacity: 0.7, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
      tooltip: baseTooltip(theme),
      xAxis: { type: 'category', boundaryGap: false, data: rows.map((r) => label(r.bucket)), ...baseAxis(theme) },
      yAxis: { type: 'value', ...baseAxis(theme) },
      series: [
        { name: 'Total', type: 'line', smooth: true, showSymbol: false, data: rows.map((r) => num(r.total)), areaStyle: { opacity: 0.12 }, lineStyle: { width: 2 } },
        { name: 'Bloqueios', type: 'line', smooth: true, showSymbol: false, data: rows.map((r) => num(r.blocked)), lineStyle: { width: 2 } },
      ],
    };
  }, [charts.by_hour, theme]);

  const sources = useMemo(() => {
    const rows = charts.source_distribution || [];
    return {
      color: theme.series,
      tooltip: { trigger: 'item', backgroundColor: theme.surface, borderColor: theme.outline, textStyle: { color: theme.text, fontSize: 12 } },
      series: [{
        type: 'pie',
        radius: ['58%', '82%'],
        label: { show: false },
        itemStyle: { borderColor: theme.surface, borderWidth: 2 },
        data: rows.map((r) => ({ name: SOURCE_LABEL[r.source_type] || r.source_type, value: num(r.total), source_type: r.source_type })),
      }],
    };
  }, [charts.source_distribution, theme]);

  const sourceRows = charts.source_distribution || [];
  const vlans = charts.by_vlan || [];
  const vlanMax = Math.max(...vlans.map((v) => num(v.total)), 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Governança Visual"
        description="Leitura rápida de riscos, políticas, VLANs e clientes. Clique em qualquer número ou barra para abrir o relatório de navegação já filtrado."
        actions={<Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Field id="gv-period" label="Período">
          <select id="gv-period" className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field id="gv-source" label="Fonte dos eventos">
          <select id="gv-source" className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}

      <KpiRow>
        <LinkKpi icon={Activity} label="Eventos" value={ready ? fmt(summary.total) : '—'} sub={ready ? `${fmt(summary.unique_domains)} domínios únicos` : null} onClick={() => openReports({})} hint="Abrir todos os eventos" />
        <LinkKpi icon={XCircle} label="Bloqueios" tone="danger" value={ready ? fmt(summary.blocked) : '—'} sub={ready ? `${blockedRatio} do período` : null} onClick={() => openReports({ action: 'block' })} hint="Abrir só os bloqueios" />
        <LinkKpi icon={CheckCircle2} label="Liberações" tone="success" value={ready ? fmt(summary.allowed) : '—'} sub="Navegação permitida por política" onClick={() => openReports({ action: 'allow' })} hint="Abrir só as liberações" />
        <LinkKpi icon={UserRoundSearch} label="Sessões ligadas" value={ready ? fmt(summary.session_linked) : '—'} sub="Hotspot ou colaborador identificado" onClick={() => openReports({})} hint="Abrir eventos" />
      </KpiRow>

      {!ready && loading ? (
        <p className="py-10 text-center text-sm text-on-surface/55">Consolidando métricas de governança…</p>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Panel title="Eventos por hora" description="Total de eventos e bloqueios ao longo do período." >
              <EChart option={hourly} height={260} onEvents={{ click: () => openReports({}) }} />
            </Panel>
            <Panel
              title="Fontes do motor"
              description={`${fmt(summary.active_vlans)} VLANs ativas · ${fmt(summary.dns_events)} DNS · ${fmt(summary.ufw_events)} UFW`}
              actions={<Database size={16} className="text-on-surface/40" />}
            >
              <div className="grid items-center gap-3 sm:grid-cols-[180px_1fr]">
                <EChart option={sources} height={180} onEvents={{ click: (p) => openReports({ source: p?.data?.source_type }) }} />
                <ul className="space-y-1">
                  {sourceRows.map((item, index) => (
                    <li key={item.source_type || index}>
                      <button type="button" onClick={() => openReports({ source: item.source_type })} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-on-surface/[0.04]">
                        <span className="inline-flex items-center gap-2 font-medium text-on-surface">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theme.series[index % theme.series.length] }} />
                          {SOURCE_LABEL[item.source_type] || item.source_type}
                        </span>
                        <span className="tabular text-on-surface/60">{fmt(item.total)}</span>
                      </button>
                    </li>
                  ))}
                  {!sourceRows.length ? <li className="py-4 text-center text-sm text-on-surface/50">Sem eventos no período.</li> : null}
                </ul>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              title="Eventos por VLAN"
              description="O comprimento da barra é proporcional ao total de eventos da VLAN."
              actions={(
                <span className="flex items-center gap-3 text-[12px] text-on-surface/65">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-danger" />Bloqueados</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-success" />Liberados</span>
                </span>
              )}
            >
              {vlans.length ? (
                <ul className="space-y-1">
                  {vlans.map((item) => {
                    const total = num(item.total);
                    return (
                      <li key={item.vlan_id}>
                        <button type="button" onClick={() => openReports({ vlan: item.vlan_id })} className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-on-surface/[0.04]">
                          <div className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="font-medium text-on-surface">VLAN {item.vlan_id}</span>
                            <span className="tabular text-on-surface/60">{fmt(total)} eventos · {fmt(item.unique_ips)} IPs</span>
                          </div>
                          <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-on-surface/10" style={{ width: `${Math.max((total / vlanMax) * 100, 6)}%` }}>
                            <div className="bg-danger" style={{ width: pct(item.blocked, total) }} />
                            <div className="bg-success" style={{ width: pct(item.allowed, total) }} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="py-6 text-center text-sm text-on-surface/50">Sem eventos no período.</p>}
            </Panel>
            <BarList
              title="Categorias mais bloqueadas"
              rows={charts.by_category}
              valueKey="blocked"
              labelKey="category"
              barClass="bg-danger"
              onRow={(item) => openReports({ domain: item.category === 'Sem classificacao' ? '' : item.category, action: 'block' })}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <BarList title="Domínios mais bloqueados" rows={charts.top_blocked_domains} labelKey="domain" barClass="bg-danger" onRow={(item) => openReports({ domain: item.domain, action: 'block' })} />
            <BarList title="Domínios mais liberados" rows={charts.top_allowed_domains} labelKey="domain" barClass="bg-success" onRow={(item) => openReports({ domain: item.domain, action: 'allow' })} />
            <BarList title="Clientes que mais pedem atenção" description="Quem mais teve acessos bloqueados." rows={charts.top_clients} valueKey="blocked" labelKey="identity_label" barClass="bg-warning" onRow={(item) => openReports({ ip: item.client_ip })} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <BarList title="Regras mais acionadas" rows={charts.policy_hits} valueKey="blocked" labelKey="matched_rule" barClass="bg-primary" onRow={(item) => openReports({ action: item.blocked ? 'block' : 'all' })} />
            <BarList title="Origem institucional das sessões" rows={charts.session_types} labelKey="session_type" barClass="bg-primary" onRow={() => openReports({})} />
            <Panel title="Picos para questionar" description="Horas com volume muito acima do normal." actions={<Flame size={16} className="text-warning" />}>
              {(charts.anomalies || []).length ? (
                <ul className="space-y-1.5">
                  {charts.anomalies.map((item) => (
                    <li key={item.bucket}>
                      <button type="button" onClick={() => openReports({})} className="flex w-full items-center justify-between gap-3 rounded-lg border border-outline px-3 py-2 text-left text-[13px] transition-colors hover:border-warning/50">
                        <span className="font-medium text-on-surface">{new Date(item.bucket).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <Badge tone="warning">{fmt(item.total)} eventos</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-6 text-center text-sm text-on-surface/50">Sem pico relevante no período.</p>}
            </Panel>
          </div>

          <Panel title="Investigar por fonte" description="Abre o relatório de navegação filtrado pela origem da evidência.">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { source: 'dns', icon: Globe2, title: 'DNS/RPZ', text: 'Domínio, categoria, regra e política aplicada.', cls: 'text-primary' },
                { source: 'proxy', icon: Network, title: 'Proxy/ACL', text: 'URL/SNI, método, status, bytes e decisão do proxy.', cls: 'text-primary' },
                { source: 'ufw', icon: ShieldAlert, title: 'UFW', text: 'Tentativas internas barradas pelo firewall oficial.', cls: 'text-warning' },
              ].map(({ source: s, icon: Icon, title, text, cls }) => (
                <button key={s} type="button" onClick={() => openReports({ source: s })} className="rounded-lg border border-outline px-4 py-3 text-left transition-colors hover:border-primary/40">
                  <Icon size={18} className={cls} />
                  <div className="mt-2 text-[14px] font-semibold text-on-surface">{title}</div>
                  <p className="mt-1 text-[12.5px] leading-5 text-on-surface/60">{text}</p>
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
