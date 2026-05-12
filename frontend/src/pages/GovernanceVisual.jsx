import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Filter,
  Flame,
  Globe2,
  Network,
  PieChart,
  RefreshCcw,
  ShieldAlert,
  UserRoundSearch,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, ModuleHeader, StatusChip, Surface, cx } from '../components/ui/primitives';

const PERIODS = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

const SOURCES = [
  { value: 'all', label: 'Todas' },
  { value: 'dns', label: 'DNS/RPZ' },
  { value: 'proxy', label: 'Proxy/ACL' },
  { value: 'ufw', label: 'UFW' },
];

const sourceLabel = { dns: 'DNS/RPZ', proxy: 'Proxy/ACL', ufw: 'UFW' };
const palette = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#475569'];

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

function Metric({ label, value, sub, icon: Icon, tone = 'primary', onClick }) {
  const toneClass = {
    primary: 'border-primary/14 bg-primary/8 text-primary',
    success: 'border-emerald-500/18 bg-emerald-500/10 text-emerald-600',
    danger: 'border-danger/20 bg-danger/10 text-danger',
    warning: 'border-orange-500/22 bg-orange-500/12 text-orange-600',
    info: 'border-sky-500/18 bg-sky-500/10 text-sky-600',
  }[tone] || 'border-outline/12 bg-surface-high text-on-surface';
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'min-h-[132px] rounded-[24px] border bg-surface-high p-4 text-left shadow-sm transition hover:border-primary/24 hover:shadow-md',
        onClick ? 'cursor-pointer' : '',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-wide text-on-surface/48">{label}</p>
          <div className="mt-2 text-3xl font-black tracking-tight text-on-surface">{value}</div>
        </div>
        <div className={cx('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', toneClass)}>
          <Icon size={20} />
        </div>
      </div>
      {sub ? <p className="mt-3 text-sm leading-5 text-on-surface/58">{sub}</p> : null}
    </Wrapper>
  );
}

function AreaChart({ rows, onClick }) {
  const data = rows || [];
  const max = Math.max(...data.map((item) => num(item.total)), 1);
  const points = data.length > 1
    ? data.map((item, index) => `${(index / (data.length - 1)) * 100},${100 - (num(item.total) / max) * 100}`).join(' ')
    : '0,100 100,100';
  const blockedPoints = data.length > 1
    ? data.map((item, index) => `${(index / (data.length - 1)) * 100},${100 - (num(item.blocked) / max) * 100}`).join(' ')
    : '0,100 100,100';
  return (
    <button type="button" onClick={onClick} className="block h-72 w-full rounded-[22px] border border-outline/10 bg-surface p-4 text-left transition hover:border-primary/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide text-primary">Linha do tempo</p>
          <h3 className="mt-1 text-lg font-black text-on-surface">Eventos por hora</h3>
        </div>
        <StatusChip label="Clicável" tone="primary" />
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-4 h-44 w-full overflow-visible">
        <path d={`M0,100 ${points} L100,100 Z`} fill="#2563eb" opacity="0.14" />
        <path d={`M0,100 ${points}`} fill="none" stroke="#2563eb" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        <path d={`M0,100 ${blockedPoints}`} fill="none" stroke="#dc2626" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs font-bold text-on-surface/58">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-blue-600" /> Total</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-full bg-red-600" /> Bloqueios</span>
      </div>
    </button>
  );
}

function Donut({ rows, total, onSlice }) {
  const values = rows?.length ? rows : [];
  const sum = Math.max(total || values.reduce((acc, item) => acc + num(item.total), 0), 1);
  let offset = 25;
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="relative mx-auto h-52 w-52">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(var(--color-outline),0.12)" strokeWidth="7" />
          {values.map((item, index) => {
            const value = (num(item.total) / sum) * 100;
            const dash = `${value} ${100 - value}`;
            const currentOffset = offset;
            offset -= value;
            return (
              <circle
                key={item.source_type || index}
                cx="21"
                cy="21"
                r="15.915"
                fill="transparent"
                stroke={palette[index % palette.length]}
                strokeWidth="7"
                strokeDasharray={dash}
                strokeDashoffset={currentOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-2xl font-black text-on-surface">{fmt(sum)}</div>
          <div className="text-[10px] font-black uppercase text-on-surface/45">eventos</div>
        </div>
      </div>
      <div className="grid content-center gap-2">
        {values.map((item, index) => (
          <button
            key={item.source_type || index}
            type="button"
            onClick={() => onSlice?.(item)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-outline/10 bg-surface px-3 py-2 text-left transition hover:border-primary/20"
          >
            <span className="inline-flex items-center gap-2 text-sm font-bold text-on-surface">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
              {sourceLabel[item.source_type] || item.source_type}
            </span>
            <span className="text-sm font-black text-on-surface">{fmt(item.total)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BarList({ title, eyebrow, rows, valueKey = 'total', labelKey, color = '#2563eb', onRow }) {
  const max = Math.max(...(rows || []).map((item) => num(item[valueKey])), 1);
  return (
    <div className="rounded-[24px] border border-outline/10 bg-surface p-4">
      <div className="mb-4">
        <p className="text-[11px] font-black uppercase tracking-wide text-primary">{eyebrow}</p>
        <h3 className="mt-1 text-lg font-black text-on-surface">{title}</h3>
      </div>
      <div className="space-y-2">
        {(rows || []).length ? rows.map((item, index) => {
          const label = item[labelKey] || item.domain || item.category || item.client_ip || item.policy_source || 'Sem identificação';
          const value = num(item[valueKey]);
          return (
            <button
              key={`${label}-${index}`}
              type="button"
              onClick={() => onRow?.(item)}
              className="w-full rounded-2xl border border-transparent px-2 py-2 text-left transition hover:border-primary/18 hover:bg-surface-high"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-bold text-on-surface" title={label}>{label}</span>
                <span className="shrink-0 text-xs font-black text-on-surface/62">{fmt(value)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-on-surface/8">
                <div className="h-full rounded-full" style={{ width: pct(value, max), backgroundColor: color }} />
              </div>
            </button>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-outline/14 px-4 py-8 text-center text-sm text-on-surface/45">Sem dados para o período.</div>
        )}
      </div>
    </div>
  );
}

function VlanBars({ rows, onRow }) {
  const max = Math.max(...(rows || []).map((item) => num(item.total)), 1);
  return (
    <div className="rounded-[24px] border border-outline/10 bg-surface p-4">
      <p className="text-[11px] font-black uppercase tracking-wide text-primary">Controle por rede</p>
      <h3 className="mt-1 text-lg font-black text-on-surface">Eventos por VLAN</h3>
      <div className="mt-4 grid gap-3">
        {(rows || []).map((item) => {
          const total = num(item.total);
          const blocked = num(item.blocked);
          const allowed = num(item.allowed);
          return (
            <button key={item.vlan_id} type="button" onClick={() => onRow?.(item)} className="rounded-2xl border border-outline/10 bg-surface-high px-3 py-3 text-left transition hover:border-primary/20">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-on-surface">VLAN {item.vlan_id}</div>
                <div className="text-xs font-bold text-on-surface/55">{fmt(total)} eventos · {fmt(item.unique_ips)} IPs</div>
              </div>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-on-surface/8" style={{ maxWidth: `${Math.max((total / max) * 100, 8)}%` }}>
                <div className="bg-red-600" style={{ width: pct(blocked, total) }} />
                <div className="bg-emerald-600" style={{ width: pct(allowed, total) }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function GovernanceVisual() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('24h');
  const [source, setSource] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ period, source });
      const res = await api.get(`/api/reports/governance-visual?${params}`);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Falha ao carregar governança visual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [period, source]);

  const summary = data?.summary || {};
  const charts = data?.charts || {};
  const blockedRatio = useMemo(() => pct(summary.blocked, summary.total), [summary.blocked, summary.total]);
  const sourceCount = charts.source_distribution?.length || 0;
  const openReports = (filters) => navigate(buildReportsUrl({ period, ...filters }));

  return (
    <div className="space-y-6 pb-12">
      <ModuleHeader
        eyebrow="Governança"
        title="Governança Visual"
        description="Cockpit executivo com gráficos acionáveis para leitura rápida de riscos, políticas, usuários, VLANs e evidências técnicas do SGCG."
        badges={(
          <>
            <StatusChip label="Gestão visual" tone="primary" />
            <StatusChip label="Gráficos investigáveis" tone="success" />
            <StatusChip label="Controle conectado" tone="info" />
          </>
        )}
        actions={(
          <div className="flex flex-wrap gap-2">
            <select value={period} onChange={(event) => setPeriod(event.target.value)} className="h-[var(--control-height)] rounded-full border border-outline/14 bg-surface-high px-4 text-sm font-bold text-on-surface">
              {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="h-[var(--control-height)] rounded-full border border-outline/14 bg-surface-high px-4 text-sm font-bold text-on-surface">
              {SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <ActionButton icon={loading ? RefreshCcw : Filter} onClick={load} disabled={loading}>{loading ? 'Atualizando' : 'Atualizar'}</ActionButton>
          </div>
        )}
      />

      {error ? (
        <Surface tone="danger" className="p-4">
          <div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle size={16} />{error}</div>
        </Surface>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Eventos" value={fmt(summary.total)} sub={`${fmt(summary.unique_domains)} domínios únicos`} icon={Activity} onClick={() => openReports({})} />
        <Metric label="Bloqueios" value={fmt(summary.blocked)} sub={`${blockedRatio} do período`} icon={XCircle} tone="danger" onClick={() => openReports({ action: 'block' })} />
        <Metric label="Liberações" value={fmt(summary.allowed)} sub="Navegação permitida por política" icon={CheckCircle2} tone="success" onClick={() => openReports({ action: 'allow' })} />
        <Metric label="Sessões ligadas" value={fmt(summary.session_linked)} sub="Hotspot ou colaborador correlacionado" icon={UserRoundSearch} tone="info" onClick={() => openReports({})} />
        <Metric label="Fontes" value={fmt(sourceCount)} sub={`${fmt(summary.active_vlans)} VLANs · ${fmt(summary.dns_events)} DNS · ${fmt(summary.ufw_events)} UFW`} icon={Database} tone="warning" onClick={() => openReports({ source })} />
      </div>

      {loading && !data ? (
        <Surface className="p-10 text-center text-sm font-bold text-on-surface/50">
          <RefreshCcw className="mx-auto mb-3 animate-spin text-primary" />
          Consolidando métricas de governança...
        </Surface>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
            <AreaChart rows={charts.by_hour} onClick={() => openReports({})} />
            <Surface className="p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-primary">Evidências</p>
                  <h3 className="mt-1 text-lg font-black text-on-surface">Fontes do motor</h3>
                </div>
                <PieChart className="text-primary" size={22} />
              </div>
              <Donut rows={charts.source_distribution} total={num(summary.total)} onSlice={(item) => openReports({ source: item.source_type })} />
            </Surface>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <VlanBars rows={charts.by_vlan} onRow={(item) => openReports({ vlan: item.vlan_id })} />
            <BarList
              eyebrow="Risco por categoria"
              title="Categorias mais bloqueadas"
              rows={charts.by_category}
              valueKey="blocked"
              labelKey="category"
              color="#dc2626"
              onRow={(item) => openReports({ domain: item.category === 'Sem classificacao' ? '' : item.category, action: 'block' })}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <BarList
              eyebrow="Domínios"
              title="Mais bloqueados"
              rows={charts.top_blocked_domains}
              valueKey="total"
              labelKey="domain"
              color="#dc2626"
              onRow={(item) => openReports({ domain: item.domain, action: 'block' })}
            />
            <BarList
              eyebrow="Domínios"
              title="Mais liberados"
              rows={charts.top_allowed_domains}
              valueKey="total"
              labelKey="domain"
              color="#16a34a"
              onRow={(item) => openReports({ domain: item.domain, action: 'allow' })}
            />
            <BarList
              eyebrow="Usuários e IPs"
              title="Clientes que mais exigem atenção"
              rows={charts.top_clients}
              valueKey="blocked"
              labelKey="identity_label"
              color="#f59e0b"
              onRow={(item) => openReports({ ip: item.client_ip })}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <BarList
              eyebrow="Políticas"
              title="Regras mais acionadas"
              rows={charts.policy_hits}
              valueKey="blocked"
              labelKey="matched_rule"
              color="#7c3aed"
              onRow={(item) => openReports({ action: item.blocked ? 'block' : 'all' })}
            />
            <BarList
              eyebrow="Sessões"
              title="Origem institucional"
              rows={charts.session_types}
              valueKey="total"
              labelKey="session_type"
              color="#0891b2"
              onRow={() => openReports({})}
            />
            <Surface className="p-4">
              <div className="mb-4 flex items-center gap-2">
                <Flame className="text-orange-500" size={20} />
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-primary">Anomalias</p>
                  <h3 className="text-lg font-black text-on-surface">Picos para questionar</h3>
                </div>
              </div>
              <div className="space-y-2">
                {(charts.anomalies || []).length ? charts.anomalies.map((item) => (
                  <button key={item.bucket} type="button" onClick={() => openReports({})} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-outline/10 bg-surface px-3 py-3 text-left transition hover:border-orange-500/30">
                    <span className="text-sm font-bold text-on-surface">{new Date(item.bucket).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                    <span className="rounded-full bg-orange-500 px-2 py-1 text-[10px] font-black text-white">{fmt(item.total)} eventos</span>
                  </button>
                )) : (
                  <div className="rounded-2xl border border-dashed border-outline/14 px-4 py-8 text-center text-sm text-on-surface/45">Sem pico relevante no período.</div>
                )}
              </div>
            </Surface>
          </div>

          <Surface className="p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <button type="button" onClick={() => openReports({ source: 'dns' })} className="rounded-[22px] border border-outline/10 bg-surface px-4 py-4 text-left transition hover:border-primary/22">
                <Globe2 className="text-blue-600" />
                <h3 className="mt-3 text-base font-black text-on-surface">DNS/RPZ</h3>
                <p className="mt-2 text-sm leading-5 text-on-surface/58">Domínio, categoria, regra e política aplicada.</p>
              </button>
              <button type="button" onClick={() => openReports({ source: 'proxy' })} className="rounded-[22px] border border-outline/10 bg-surface px-4 py-4 text-left transition hover:border-primary/22">
                <Network className="text-violet-600" />
                <h3 className="mt-3 text-base font-black text-on-surface">Proxy/ACL</h3>
                <p className="mt-2 text-sm leading-5 text-on-surface/58">URL/SNI, método, status, bytes e decisão do proxy.</p>
              </button>
              <button type="button" onClick={() => openReports({ source: 'ufw' })} className="rounded-[22px] border border-outline/10 bg-surface px-4 py-4 text-left transition hover:border-primary/22">
                <ShieldAlert className="text-orange-500" />
                <h3 className="mt-3 text-base font-black text-on-surface">UFW</h3>
                <p className="mt-2 text-sm leading-5 text-on-surface/58">Tentativas internas barradas pelo firewall oficial.</p>
              </button>
            </div>
          </Surface>
        </>
      )}
    </div>
  );
}
