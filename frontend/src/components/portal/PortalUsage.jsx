import { Loader2, RefreshCw } from 'lucide-react';
import { Button, Kpi, KpiRow, Panel } from '../ui/kit';
import { authMethodLabel } from '../hotspot/format';

/*
 * Uso de um portal de acesso (Hotspot de visitantes ou Colaboradores): sessões e pessoas no mês, por dia,
 * por hora, quem mais usa, como entram e sites mais visitados. O que muda entre os portais vem em `config`.
 */

const DEFAULT_CONFIG = {
  uniqueField: 'unique_visitors',
  people: 'Visitantes',
  personSub: (u) => `${u.cpf} · último acesso ${u.last_seen ? new Date(u.last_seen).toLocaleDateString('pt-BR') : '—'}`,
  personKey: (u) => `${u.cpf}-${u.full_name}`,
  methodLabel: (m) => authMethodLabel(m),
  sitesDescription: 'Visitantes (VLAN 70), últimos 30 dias.',
  emptySites: 'Nenhuma consulta registrada para a VLAN 70 no período.',
};

function Bars({ items, height = 110, color = 'var(--chart-1)', label }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-1" style={{ height }} role="img" aria-label={label}>
      {items.map((i) => (
        <div key={i.key} className="group flex flex-1 flex-col items-center justify-end gap-1" style={{ height }}>
          <div className="w-full rounded-t-sm opacity-75 transition-opacity group-hover:opacity-100" style={{ height: `${Math.max(i.value > 0 ? 4 : 0, Math.round((i.value / max) * (height - 18)))}px`, background: color }} title={i.title} />
          <span className="text-[10px] text-on-surface/45">{i.short}</span>
        </div>
      ))}
    </div>
  );
}

function RankRow({ label, sub, value, pct, color = 'var(--chart-1)' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="truncate font-semibold text-on-surface">{label}</span>
        <span className="tabular shrink-0 text-on-surface/60">{value}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-on-surface/[0.08]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div>
      {sub ? <div className="mt-0.5 text-[11.5px] text-on-surface/45">{sub}</div> : null}
    </div>
  );
}

export default function PortalUsage({ metrics, loading, onRefresh, config: custom = {} }) {
  const config = { ...DEFAULT_CONFIG, ...custom };
  if (loading && !metrics) {
    return <div className="sgcg-card flex items-center justify-center gap-2 py-16 text-sm text-on-surface/55"><Loader2 size={16} className="animate-spin" /> Carregando o uso...</div>;
  }
  if (!metrics) {
    return (
      <div className="sgcg-card flex flex-col items-center gap-3 py-14 text-center">
        <p className="text-sm text-on-surface/60">Os números de uso ainda não foram carregados.</p>
        <Button variant="primary" icon={RefreshCw} onClick={onRefresh}>Carregar uso</Button>
      </div>
    );
  }
  const { daily_users: daily = [], monthly_summary: month = {}, top_users: top = [], auth_methods: methods = [], vlan_distribution: vlans = [], hourly_distribution: hourly = [], top_domains: domains = [] } = metrics;
  const last7 = daily.slice(0, 7).reverse().map((d) => ({ key: d.date, value: Number(d[config.uniqueField]) || 0, short: String(d.date || '').slice(8, 10) + '/' + String(d.date || '').slice(5, 7), title: `${d.date}: ${d[config.uniqueField]} pessoa(s), ${d.sessions} sessão(ões)` }));
  const hours = hourly.map((h) => ({ key: h.hour, value: Number(h.count) || 0, short: Number(h.hour) % 3 === 0 ? String(h.hour).padStart(2, '0') : '', title: `${String(h.hour).padStart(2, '0')}h: ${h.count} sessão(ões)` }));
  const maxUser = Number(top[0]?.sessions) || 1;
  const maxDomain = Number(domains[0]?.total) || 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button icon={RefreshCw} onClick={onRefresh} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button></div>
      <KpiRow>
        <Kpi label="Sessões no mês" value={Number(month.total_sessions || 0).toLocaleString('pt-BR')} />
        <Kpi label={`${config.people} diferentes no mês`} value={Number(month.monthly_unique || 0).toLocaleString('pt-BR')} />
        <Kpi label="Dias com acesso" value={month.active_days ?? 0} />
        <Kpi label="Quem mais usou" value={top[0]?.full_name?.split(' ')[0] || '—'} sub={top[0] ? `${top[0].sessions} ${Number(top[0].sessions) === 1 ? 'sessão' : 'sessões'} em 30 dias` : 'sem dados'} />
      </KpiRow>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`${config.people} por dia`} description="Últimos 7 dias.">
          {last7.length ? <Bars items={last7} label={`${config.people} por dia`} /> : <p className="py-6 text-center text-sm text-on-surface/50">Sem acessos nos últimos 7 dias.</p>}
        </Panel>
        <Panel title="Acessos por hora do dia" description="Soma dos últimos 30 dias.">
          {hours.length ? <Bars items={hours} color="var(--chart-2)" label="Acessos por hora" /> : <p className="py-6 text-center text-sm text-on-surface/50">Sem dados.</p>}
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Quem mais usa" description="Sessões em 30 dias.">
          <div className="space-y-3">
            {top.slice(0, 8).map((u) => <RankRow key={config.personKey(u)} label={u.full_name} sub={config.personSub(u)} value={`${u.sessions} ${Number(u.sessions) === 1 ? 'sessão' : 'sessões'}`} pct={Math.round((Number(u.sessions) / maxUser) * 100)} />)}
            {!top.length ? <p className="text-sm text-on-surface/50">Ninguém no período.</p> : null}
          </div>
        </Panel>
        <Panel title="Como entram" description="Forma de entrada no portal.">
          <div className="space-y-3">
            {methods.map((m, i) => <RankRow key={m.auth_method} label={config.methodLabel(m.auth_method)} value={`${m.count} (${m.pct}%)`} pct={Number(m.pct) || 0} color={`var(--chart-${(i % 6) + 1})`} />)}
            {!methods.length ? <p className="text-sm text-on-surface/50">Sem dados.</p> : null}
          </div>
          {vlans.length ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-outline pt-3">
              {vlans.map((v) => <span key={v.vlan_id} className="rounded-md border border-outline px-2 py-1 text-[12px]"><b>VLAN {v.vlan_id}</b> <span className="text-on-surface/60">{v.count} sessões</span></span>)}
            </div>
          ) : null}
        </Panel>
        <Panel title="Sites mais visitados" description={config.sitesDescription}>
          <div className="space-y-3">
            {domains.map((d) => <RankRow key={d.domain} label={d.domain} value={`${d.total} · ${d.unique_ips} IP(s)`} pct={Math.round((Number(d.total) / maxDomain) * 100)} color="var(--chart-2)" />)}
            {!domains.length ? <p className="text-sm text-on-surface/50">{config.emptySites}</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
