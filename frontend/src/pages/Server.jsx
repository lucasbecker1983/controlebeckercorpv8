import { useEffect, useMemo, useState } from 'react';
import { Clock, Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { api } from '../services/api';
import { Badge, DataTable, Kpi, KpiRow, PageHeader, Panel } from '../components/ui/kit';
import EChart, { baseAxis, baseTooltip, useChartTheme } from '../components/charts/EChart';

const uptimeText = (s) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d} d ${h} h` : `${h} h ${m} min`;
};
const SERVICE_LABELS = { unbound: 'DNS (Unbound)', squid: 'Proxy (Squid)', 'isc-dhcp-server': 'DHCP', 'wg-quick@wg0': 'VPN WireGuard', fail2ban: 'Fail2ban', postgresql: 'Banco de dados' };

// Bytes em GB (decimal, como o fabricante do disco), sem casas e com ponto de milhar: 1.832
const gb = (bytes) => Math.round(Number(bytes || 0) / 1e9).toLocaleString('pt-BR');

// Swap (área de troca em disco) dentro do card Memória: cheia não é falha de agora, mas tira a reserva da memória.
function SwapLine({ swap }) {
  if (!swap || !swap.total_mb) return null;
  const level = swap.percent >= 95 ? 'danger' : swap.percent >= 80 ? 'warning' : 'ok';
  const color = { danger: 'text-danger', warning: 'text-warning', ok: 'text-on-surface/55' }[level];
  const bar = { danger: 'bg-danger', warning: 'bg-warning', ok: 'bg-primary/70' }[level];
  const g = (mb) => (mb / 1024).toFixed(1).replace('.', ',');
  return (
    <div className={`mt-1.5 border-t border-outline pt-2 ${color}`} title="Swap é a área do disco que o sistema usa quando a memória acaba. Cheia, não sobra reserva.">
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="font-medium">Swap {swap.percent}%</span>
        <span className="tabular">{g(swap.used_mb)} de {g(swap.total_mb)} GB</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-on-surface/10" role="progressbar" aria-valuenow={swap.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do swap">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, swap.percent)}%` }} />
      </div>
      {level !== 'ok' ? <div className="mt-1 text-[11.5px] font-semibold">{level === 'danger' ? 'Swap esgotado: sem reserva se a memória apertar' : 'Swap quase cheio'}</div> : null}
    </div>
  );
}

export default function Server() {
  const theme = useChartTheme();
  const [hw, setHw] = useState(null);
  const [live, setLive] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let alive = true;
    api.get('/api/server/hardware').then((r) => { if (alive) setHw(r.data); }).catch(() => null);
    const load = () => Promise.all([
      api.get('/api/monitor/live').then((r) => { if (alive) setLive(r.data); }),
      api.get('/api/monitor/recent?minutes=60').then((r) => { if (alive) setRecent(r.data?.samples || []); }),
    ]).catch(() => null);
    load();
    const t = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const option = useMemo(() => ({
    color: [theme.series[0], theme.series[3]],
    grid: { left: 40, right: 12, top: 28, bottom: 24 },
    legend: { top: 0, right: 0, textStyle: { color: theme.text, opacity: 0.7, fontSize: 12 }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
    tooltip: { ...baseTooltip(theme), valueFormatter: (v) => `${v}%` },
    xAxis: { type: 'time', ...baseAxis(theme), splitLine: { show: false }, axisLabel: { ...baseAxis(theme).axisLabel, formatter: (v) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } },
    yAxis: { type: 'value', min: 0, max: 100, ...baseAxis(theme), axisLabel: { ...baseAxis(theme).axisLabel, formatter: '{value}%' } },
    series: [
      { name: 'CPU', type: 'line', showSymbol: false, smooth: 0.3, lineStyle: { width: 2 }, areaStyle: { opacity: 0.1 }, data: recent.map((s) => [s.t, s.cpu]) },
      { name: 'Memória', type: 'line', showSymbol: false, smooth: 0.3, lineStyle: { width: 2 }, data: recent.map((s) => [s.t, s.ram]) },
    ],
  }), [recent, theme]);

  const root = hw?.storage?.root || hw?.disks?.system;
  const ssds = hw?.storage?.physical_ssds || [];

  return (
    <div className="space-y-4">
      <PageHeader title="Servidor" description="Uso de processador, memória e disco, hardware e serviços do servidor do SGCG." />
      <KpiRow>
        <Kpi icon={Cpu} label="Processador" value={live ? `${live.cpu}%` : '—'} sub={hw?.cpu ? `${hw.cpu.cores} núcleos` : null} tone={live?.cpu > 85 ? 'danger' : 'neutral'} />
        <Kpi icon={MemoryStick} label="Memória" value={live ? `${live.ram.percent}%` : '—'} sub={live ? `${(live.ram.used_mb / 1024).toFixed(1)} de ${(live.ram.total_mb / 1024).toFixed(1)} GB` : null} tone={live?.ram.percent > 90 ? 'danger' : 'neutral'}>
          <SwapLine swap={live?.swap} />
        </Kpi>
        <Kpi icon={HardDrive} label="Disco do sistema" value={live ? `${live.disk.percent}%` : '—'} sub={live ? `${gb(live.disk.used)} de ${gb(live.disk.total)} GB` : null} tone={live?.disk.percent > 85 ? 'danger' : 'neutral'} />
        <Kpi icon={Clock} label="Ligado há" value={live ? uptimeText(live.uptime) : '—'} />
      </KpiRow>

      <Panel title="Processador e memória na última hora">
        <EChart option={option} height={240} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Hardware">
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            {[
              ['Sistema', hw?.os?.distro],
              ['Kernel', hw?.os?.kernel],
              ['Processador', hw?.cpu?.model],
              ['Frequência', hw?.cpu?.speed ? `${hw.cpu.speed} GHz · ${hw.cpu.cores} núcleos` : null],
              ['Placa-mãe', hw?.motherboard?.model],
              ['Fabricante', hw?.motherboard?.vendor],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-outline p-3">
                <dt className="text-[11.5px] text-on-surface/50">{k}</dt>
                <dd className="mt-0.5 break-words font-medium text-on-surface">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Serviços" padded={false}>
          <DataTable
            rowKey={(r) => r[0]}
            rows={Object.entries(live?.services || {})}
            empty="Carregando..."
            columns={[
              { key: 'n', label: 'Serviço', render: (r) => SERVICE_LABELS[r[0]] || r[0] },
              { key: 's', label: 'Situação', render: (r) => (r[1] ? <Badge tone="success" dot>Ativo</Badge> : <Badge tone="danger" dot>Parado</Badge>) },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Armazenamento" description={root ? `${root.layout || `${ssds.length} SSDs em volume único`} · montado em ${root.mount || '/'}` : null} padded={false}>
        <DataTable
          rowKey="id"
          rows={ssds}
          empty="Nenhum disco físico identificado."
          columns={[
            { key: 'l', label: 'Disco', render: (d) => <div><div className="font-medium text-on-surface">{d.label}</div><div className="tabular text-[11.5px] text-on-surface/50">{d.device}</div></div> },
            { key: 'm', label: 'Modelo', render: (d) => d.model || '—' },
            { key: 's', label: 'Tamanho', mono: true, render: (d) => d.size },
            { key: 't', label: 'Conexão', render: (d) => d.transport || '—' },
            { key: 'n', label: 'Número de série', mono: true, render: (d) => d.serial || '—' },
          ]}
        />
      </Panel>
    </div>
  );
}
