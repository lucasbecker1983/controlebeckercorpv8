import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Cpu, HardDrive, Info, Network, Users } from 'lucide-react';
import { api } from '../services/api';
import EChart, { baseAxis, baseTooltip, useChartTheme } from '../components/charts/EChart';

const fmt = (value = 0, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: value >= 100 ? 0 : Math.min(1, digits) });
const pct = (value) => `${Math.round((value || 0) * 100)}%`;
const SERVICE_LABELS = { unbound: 'DNS (Unbound)', squid: 'Proxy (Squid)', 'isc-dhcp-server': 'DHCP', 'wg-quick@wg0': 'VPN WireGuard', fail2ban: 'Fail2ban', postgresql: 'Banco de dados' };

function usePoll(url, ms, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get(url);
        if (alive) { setData(res.data); setError(null); }
      } catch (err) {
        if (alive) setError(err);
      }
    };
    load();
    const timer = window.setInterval(load, ms);
    return () => { alive = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ms, ...deps]);
  return { data, error };
}

function Card({ title, action, children, className = '' }) {
  return (
    <section className={`sgcg-card min-w-0 p-4 ${className}`}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold text-on-surface">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Meter({ value, tone }) {
  const color = tone || (value > 0.9 ? 'var(--md-danger)' : value > 0.7 ? 'var(--md-warning)' : 'var(--chart-1)');
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-on-surface/8">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, children }) {
  return (
    <div className="sgcg-card flex min-w-0 flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium text-on-surface/55">
        <Icon size={15} />
        {label}
      </div>
      <div className="tabular text-2xl font-bold tracking-tight text-on-surface">{value}</div>
      {sub ? <div className="text-[12.5px] text-on-surface/60">{sub}</div> : null}
      {children}
    </div>
  );
}

function Alerts({ alerts }) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts) return null;
  if (!alerts.length) {
    return (
      <div className="sgcg-card flex items-center gap-2 px-4 py-3 text-sm text-success">
        <span className="h-2 w-2 rounded-full bg-success" /> Nenhum alerta no momento.
      </div>
    );
  }
  const shown = expanded ? alerts : alerts.slice(0, 4);
  const iconFor = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
  const toneFor = { critical: 'text-danger', warning: 'text-warning', info: 'text-info' };
  return (
    <section className="sgcg-card overflow-hidden" aria-label="Alertas">
      <ul className="divide-y divide-outline">
        {shown.map((alert, index) => {
          const Icon = iconFor[alert.severity] || Info;
          const body = (
            <div className="flex items-start gap-3 px-4 py-3">
              <Icon size={17} className={`mt-0.5 shrink-0 ${toneFor[alert.severity]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-on-surface">{alert.title}</div>
                <div className="text-[12.5px] leading-5 text-on-surface/60">{alert.detail}</div>
              </div>
              {alert.link ? <ChevronRight size={16} className="mt-1 shrink-0 text-on-surface/35" /> : null}
            </div>
          );
          return (
            <li key={`${alert.title}-${index}`} className={alert.severity === 'critical' ? 'bg-danger/[0.04]' : ''}>
              {alert.link ? <Link to={alert.link} className="block hover:bg-on-surface/[0.03]">{body}</Link> : body}
            </li>
          );
        })}
      </ul>
      {alerts.length > 4 ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full border-t border-outline px-4 py-2 text-left text-[12.5px] font-semibold text-primary hover:bg-on-surface/[0.03]">
          {expanded ? 'Mostrar menos' : `Ver todos os ${alerts.length} alertas`}
        </button>
      ) : null}
    </section>
  );
}

const RANGES = [
  { key: '1h', label: '1 hora' },
  { key: '24h', label: '24 horas' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
];

function RangeTabs({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-outline p-0.5" role="group" aria-label="Período">
      {RANGES.map((range) => (
        <button
          key={range.key}
          type="button"
          onClick={() => onChange(range.key)}
          aria-pressed={value === range.key}
          className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${value === range.key ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface'}`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

function LinkChart({ capacity }) {
  const theme = useChartTheme();
  const [range, setRange] = useState('24h');
  const { data } = usePoll(`/api/monitor/history?range=${range}&scope=wan`, range === '1h' ? 10000 : 60000);
  const option = useMemo(() => {
    const points = data?.points || [];
    const timeFmt = range === '30d' || range === '7d'
      ? { day: '2-digit', month: '2-digit', ...(range === '7d' ? { hour: '2-digit' } : {}) }
      : { hour: '2-digit', minute: '2-digit' };
    return {
      color: [theme.series[0], theme.series[1]],
      grid: { left: 44, right: 16, top: 28, bottom: 28 },
      legend: { top: 0, right: 0, textStyle: { color: theme.text, opacity: 0.7, fontSize: 12 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      tooltip: {
        ...baseTooltip(theme),
        valueFormatter: (v) => `${fmt(v)} Mbps`,
      },
      xAxis: {
        type: 'time',
        ...baseAxis(theme),
        splitLine: { show: false },
        axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => new Date(v).toLocaleString('pt-BR', timeFmt) },
      },
      yAxis: {
        type: 'value',
        ...baseAxis(theme),
        max: (v) => Math.max(capacity * 0.25, Math.ceil(v.max * 1.15)),
        axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => `${v}` },
        name: 'Mbps',
        nameTextStyle: { color: theme.text, opacity: 0.5, fontSize: 11, align: 'right' },
      },
      series: [
        {
          name: 'Download',
          type: 'line',
          showSymbol: false,
          smooth: 0.25,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.12 },
          data: points.map((p) => [p[0], p[1]]),
          markLine: {
            silent: true,
            symbol: 'none',
            label: { formatter: `Link ${capacity} Mbps`, color: theme.text, opacity: 0.55, fontSize: 11, position: 'insideEndTop' },
            lineStyle: { color: theme.danger, type: 'dashed', opacity: 0.5 },
            data: [{ yAxis: capacity }],
          },
        },
        { name: 'Upload', type: 'line', showSymbol: false, smooth: 0.25, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 }, data: points.map((p) => [p[0], p[2]]) },
      ],
    };
  }, [data, theme, range, capacity]);

  return (
    <Card
      title="Uso do link de internet"
      action={<RangeTabs value={range} onChange={setRange} />}
    >
      <EChart option={option} height={280} />
      <p className="mt-1 text-[11.5px] text-on-surface/45">{range === '1h' ? 'Amostras a cada 5 segundos.' : `Média por ${range === '30d' ? 'dia' : 'hora'}.`} Link contratado de {capacity} Mbps em cada sentido.</p>
    </Card>
  );
}

function VlanBoard({ vlans }) {
  const theme = useChartTheme();
  const option = useMemo(() => {
    const list = (vlans || []).filter((v) => v.limit_down);
    return {
      grid: { left: 110, right: 50, top: 8, bottom: 20 },
      tooltip: {
        ...baseTooltip(theme),
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const v = list[params[0].dataIndex];
          return `<b>VLAN ${v.id} · ${v.name}</b><br/>Download ${fmt(v.down)} de ${v.limit_down} Mbps (${pct(v.use_down)})<br/>Tráfego interno ${fmt(v.internal_down)} Mbps<br/>Upload ${fmt(v.up)} Mbps<br/>${v.neighbors} dispositivos`;
        },
      },
      xAxis: { type: 'value', max: 100, ...baseAxis(theme), axisLabel: { ...baseAxis(theme).axisLabel, formatter: '{value}%' } },
      yAxis: { type: 'category', inverse: true, data: list.map((v) => `${v.id} · ${v.name}`), ...baseAxis(theme), splitLine: { show: false } },
      series: [{
        type: 'bar',
        barWidth: 12,
        data: list.map((v) => ({
          value: Math.min(100, Math.round((v.use_down || 0) * 100)),
          itemStyle: { color: v.use_down > 0.9 ? theme.danger : v.use_down > 0.7 ? theme.warning : theme.series[0], borderRadius: 3 },
        })),
        label: { show: true, position: 'right', color: theme.text, opacity: 0.7, fontSize: 11, formatter: (p) => `${fmt(list[p.dataIndex].down)} / ${list[p.dataIndex].limit_down}` },
        showBackground: true,
        backgroundStyle: { color: theme.grid, borderRadius: 3 },
      }],
    };
  }, [vlans, theme]);

  return (
    <Card title="VLANs agora" action={<Link to="/rede" className="text-[12.5px] font-semibold text-primary">Rede & VLANs</Link>}>
      <p className="-mt-2 mb-2 text-[12px] text-on-surface/55">Uso do limite de download de cada VLAN (QoS).</p>
      <EChart option={option} height={Math.max(160, (vlans || []).filter((v) => v.limit_down).length * 34 + 30)} />
      <div className="mt-3 overflow-x-auto">
        <table className="tabular w-full min-w-[460px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-on-surface/45">
              <th className="py-1.5 font-semibold">VLAN</th>
              <th className="py-1.5 font-semibold">Dispositivos</th>
              <th className="py-1.5 font-semibold">↓ Mbps</th>
              <th className="py-1.5 font-semibold">↑ Mbps</th>
              <th className="py-1.5 font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline">
            {(vlans || []).map((v) => {
              const status = v.drops_5m > 200
                ? { label: 'No limite', cls: 'text-danger' }
                : v.neighbors === 0
                  ? { label: 'Sem dispositivos', cls: 'text-warning' }
                  : v.exempt
                    ? { label: 'Fora dos filtros', cls: 'text-on-surface/50' }
                    : { label: 'Normal', cls: 'text-success' };
              return (
                <tr key={v.id}>
                  <td className="py-1.5 font-medium text-on-surface">{v.id} · {v.name}</td>
                  <td className="py-1.5">{v.neighbors}</td>
                  <td className="py-1.5">{fmt(v.down)}</td>
                  <td className="py-1.5">{fmt(v.up)}</td>
                  <td className={`py-1.5 font-semibold ${status.cls}`}>{status.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RankList({ title, rows, link, linkLabel, capacity, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card title={title} action={link ? <Link to={link} className="text-[12.5px] font-semibold text-primary">{linkLabel}</Link> : null}>
      {rows.length ? (
        <ol className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.key} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-on-surface" title={row.title || row.label}>
                  {row.label}
                  {row.sub ? <span className="ml-1.5 text-[11.5px] text-on-surface/50">{row.sub}</span> : null}
                </span>
                <span className="tabular shrink-0 text-[12.5px] text-on-surface/70">{fmt(row.value)} Mbps{capacity ? <span className="ml-1 text-on-surface/40">· {Math.round((row.value / capacity) * 100)}%</span> : null}</span>
              </div>
              <Meter value={row.value / max} tone={row.tone} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-on-surface/55">{empty}</p>
      )}
    </Card>
  );
}

function DnsCard({ summary }) {
  const theme = useChartTheme();
  const option = useMemo(() => {
    const rows = summary?.hourly || [];
    return {
      color: [theme.series[5], theme.danger],
      grid: { left: 44, right: 8, top: 28, bottom: 24 },
      legend: { top: 0, right: 0, textStyle: { color: theme.text, opacity: 0.7, fontSize: 12 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      tooltip: { ...baseTooltip(theme), axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: rows.map((r) => new Date(r.hour).toLocaleTimeString('pt-BR', { hour: '2-digit' }) + 'h'), ...baseAxis(theme), splitLine: { show: false } },
      yAxis: { type: 'value', ...baseAxis(theme) },
      series: [
        { name: 'Permitidas', type: 'bar', stack: 'q', barWidth: '60%', data: rows.map((r) => r.total - r.blocked), itemStyle: { opacity: 0.35 } },
        { name: 'Bloqueadas', type: 'bar', stack: 'q', data: rows.map((r) => r.blocked), itemStyle: { borderRadius: [2, 2, 0, 0] } },
      ],
    };
  }, [summary, theme]);
  return (
    <Card title="Consultas DNS nas últimas 24 horas" action={<Link to="/radar-dns" className="text-[12.5px] font-semibold text-primary">Radar DNS</Link>}>
      <div className="tabular -mt-1 mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-on-surface/60">
        <span><b className="text-on-surface">{(summary?.total || 0).toLocaleString('pt-BR')}</b> consultas</span>
        <span><b className="text-danger">{(summary?.blocked || 0).toLocaleString('pt-BR')}</b> bloqueadas</span>
      </div>
      <EChart option={option} height={200} />
      {summary?.top_blocked?.length ? (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">Mais bloqueados</div>
          <div className="flex flex-wrap gap-1.5">
            {summary.top_blocked.slice(0, 6).map((row) => (
              <span key={row.domain} className="tabular rounded-md border border-outline px-2 py-0.5 text-[12px] text-on-surface/75">{row.domain} <span className="text-on-surface/45">{row.total}</span></span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function Overview() {
  const { data: live } = usePoll('/api/monitor/live', 5000);
  const { data: alertData } = usePoll('/api/monitor/alerts', 30000);
  const { data: traffic } = usePoll('/api/monitor/traffic', 10000);
  const { data: dns } = usePoll('/api/monitor/dns-summary', 60000);

  const capacity = live?.link_mbps || 300;
  const devicesTotal = (live?.vlans || []).reduce((sum, v) => sum + (v.neighbors || 0), 0);
  const activeVlans = (live?.vlans || []).filter((v) => v.neighbors > 0).length;
  const services = Object.entries(live?.services || {});
  const servicesDown = services.filter(([, ok]) => !ok).length;

  const topDevices = (traffic?.devices || [])
    .map((d) => ({ key: d.ip, label: d.hostname ? d.hostname.split(' · ')[0] : d.ip, sub: d.hostname ? d.ip : `VLAN ${d.vlan}`, value: d.down + d.up, title: `${d.ip} · VLAN ${d.vlan}` }))
    .slice(0, 7);
  const topSites = (traffic?.sites || [])
    .map((s) => ({ key: s.label, label: s.label, sub: s.devices.length > 1 ? `${s.devices.length} dispositivos` : s.devices[0], value: s.down + s.up, tone: 'var(--chart-2)' }))
    .slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Visão Geral</h1>
          <p className="text-sm text-on-surface/55">Situação da rede, do link e do servidor agora.</p>
        </div>
        {live ? <span className="text-[12px] text-on-surface/45">Atualizado {new Date(live.updated_at).toLocaleTimeString('pt-BR')}</span> : null}
      </div>

      <Alerts alerts={alertData?.alerts} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ArrowDown} label="Internet agora" value={live ? `${fmt(live.wan.down)} Mbps` : '—'} sub={live ? <span className="inline-flex items-center gap-1"><ArrowUp size={12} /> {fmt(live.wan.up)} Mbps de upload</span> : null}>
          <Meter value={live ? live.wan.down / capacity : 0} />
          <div className="text-[11.5px] text-on-surface/45">{live ? pct(live.wan.down / capacity) : '—'} de {capacity} Mbps</div>
        </Kpi>
        <Kpi icon={Users} label="Dispositivos conectados" value={live ? devicesTotal : '—'} sub={live ? `${activeVlans} de ${live.vlans.length} VLANs com atividade` : null} />
        <Kpi icon={Cpu} label="Servidor" value={live ? `${live.cpu}% CPU` : '—'} sub={live ? `Memória ${live.ram.percent}% · ${fmt(live.ram.used_mb / 1024)} de ${fmt(live.ram.total_mb / 1024)} GB` : null}>
          <Meter value={live ? live.ram.percent / 100 : 0} />
        </Kpi>
        <Kpi icon={HardDrive} label="Disco do sistema" value={live ? `${live.disk.percent}%` : '—'} sub={live ? `${fmt(live.disk.used / 1e12, 2)} de ${fmt(live.disk.total / 1e12, 2)} TB usados` : null}>
          <Meter value={live ? live.disk.percent / 100 : 0} />
        </Kpi>
      </div>

      <LinkChart capacity={capacity} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RankList title="Quem mais consome agora" rows={topDevices} link="/mapa-trafego" linkLabel="Mapa de Tráfego" capacity={capacity} empty="Coletando tráfego por dispositivo..." />
        <RankList title="Sites mais pesados agora" rows={topSites} link="/mapa-trafego" linkLabel="Mapa de Tráfego" capacity={capacity} empty="Coletando destinos..." />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VlanBoard vlans={live?.vlans} />
        <DnsCard summary={dns} />
      </div>

      <Card title="Serviços do servidor" action={<span className={`text-[12.5px] font-semibold ${servicesDown ? 'text-danger' : 'text-success'}`}>{servicesDown ? `${servicesDown} parado${servicesDown > 1 ? 's' : ''}` : 'Todos ativos'}</span>}>
        <div className="flex flex-wrap gap-2">
          {services.map(([name, ok]) => (
            <span key={name} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium ${ok ? 'border-outline text-on-surface/80' : 'border-danger/30 bg-danger/8 text-danger'}`}>
              <span className={`h-2 w-2 rounded-full ${ok ? 'bg-success' : 'bg-danger'}`} />
              {SERVICE_LABELS[name] || name}
            </span>
          ))}
          <Link to="/servidor" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-primary">
            <Network size={14} /> Detalhes do servidor
          </Link>
        </div>
      </Card>
    </div>
  );
}
