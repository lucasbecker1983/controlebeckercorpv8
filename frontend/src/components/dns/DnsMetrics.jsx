import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { Button, Notice, Panel, errorMessage } from '../ui/kit';
import EChart, { baseAxis, baseTooltip, useChartTheme } from '../charts/EChart';

/* Estatísticas do DNS nas últimas 24 horas: sites e IPs mais ativos, VLANs e volume por hora. */

const fmt = (value) => Number(value || 0).toLocaleString('pt-BR');

function TopList({ title, description, rows, labelKey, valueKey = 'total', barClass = 'bg-primary', labelOf }) {
  const list = rows || [];
  const max = Math.max(...list.map((r) => Number(r[valueKey] || 0)), 1);
  return (
    <Panel title={title} description={description}>
      {list.length ? (
        <ul className="space-y-2">
          {list.slice(0, 10).map((row, index) => {
            const label = labelOf ? labelOf(row) : (row[labelKey] || '—');
            const value = Number(row[valueKey] || 0);
            return (
              <li key={`${label}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="truncate font-medium text-on-surface" title={label}>{label}</span>
                  <span className="tabular shrink-0 text-on-surface/60">{fmt(value)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-on-surface/10">
                  <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max((value / max) * 100, 2)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="py-6 text-center text-sm text-on-surface/50">Sem dados no período.</p>}
    </Panel>
  );
}

export default function DnsMetrics() {
  const theme = useChartTheme();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/bloqueios-liberacoes/metrics?range=24h');
      setMetrics(res.data || {});
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar as estatísticas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hourly = metrics?.hourly || [];
  const option = {
    color: [theme.series[0]],
    grid: { left: 44, right: 16, top: 16, bottom: 28 },
    tooltip: baseTooltip(theme),
    xAxis: { type: 'category', boundaryGap: false, data: hourly.map((h) => String(h.hour ?? '')), ...baseAxis(theme) },
    yAxis: { type: 'value', ...baseAxis(theme) },
    series: [{ name: 'Consultas', type: 'line', smooth: true, showSymbol: false, data: hourly.map((h) => Number(h.total || 0)), areaStyle: { opacity: 0.12 }, lineStyle: { width: 2 } }],
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-on-surface/60">Últimas 24 horas, a partir das consultas DNS que o servidor recebeu.</p>
        <Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
      </div>
      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}

      <Panel title="Volume por hora" description="Quantidade de consultas DNS em cada hora.">
        {hourly.length ? <EChart option={option} height={240} /> : <p className="py-8 text-center text-sm text-on-surface/50">{loading ? 'Carregando…' : 'Sem dados no período.'}</p>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <TopList title="Sites mais acessados" description="Domínios com mais consultas." rows={metrics?.topSites} labelKey="domain" />
        <TopList title="Sites mais bloqueados" description="Domínios com mais bloqueios." rows={metrics?.topBlocked} labelKey="domain" barClass="bg-danger" />
        <TopList title="IPs com mais consultas" description="Quem mais gerou tentativas ou consultas." rows={metrics?.topIps} labelKey="client_ip" barClass="bg-warning" />
        <TopList title="VLANs mais ativas" description="Onde o filtro é mais acionado." rows={metrics?.topVlans} labelOf={(r) => `VLAN ${r.vlan_id}`} />
      </div>
    </div>
  );
}
