import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRightLeft, FileBarChart2, Radar, RefreshCcw, Search, ShieldCheck, Wifi } from 'lucide-react';
import { authFetch } from '../services/authFetch';
import { ActionButton, ModuleHeader, SegmentedTabs, StatusChip, Surface } from '../components/ui/primitives';

const API = '';

const VLANS = [
  { key: 'todas', label: 'Todas' },
  { key: 'VLAN10', label: 'VLAN 10' },
  { key: 'VLAN30', label: 'VLAN 30' },
  { key: 'VLAN40', label: 'VLAN 40' },
  { key: 'VLAN50', label: 'VLAN 50' },
  { key: 'VLAN70', label: 'VLAN 70' },
  { key: 'VLAN80', label: 'VLAN 80' },
  { key: 'VLAN99', label: 'VLAN 99' },
];

function fmt(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

async function fetchJson(path, init) {
  const response = await authFetch(`${API}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Falha ao consultar observabilidade.');
  return payload;
}

function MetricSurface({ label, value, subtitle, tone = 'neutral' }) {
  const toneClass = tone === 'success'
    ? 'text-info'
    : tone === 'danger'
      ? 'text-danger'
      : tone === 'warning'
        ? 'text-orange-600 dark:text-orange-300'
        : 'text-primary';

  return (
    <Surface className="p-5">
      <div className="text-[11px] font-semibold tracking-tight text-on-surface/62">{label}</div>
      <div className={`mt-2 text-3xl font-black tracking-tight ${toneClass}`}>{value}</div>
      <p className="mt-2 text-sm leading-6 text-on-surface/62">{subtitle}</p>
    </Surface>
  );
}

function RadarTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState(null);
  const [vlanSummary, setVlanSummary] = useState([]);
  const [vlan, setVlan] = useState('todas');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '160' });
    if (vlan !== 'todas') params.set('vlan', vlan);
    if (blockedOnly) params.set('blocked', 'true');
    const [radarResult, dnsStatsResult, vlanStatsResult] = await Promise.allSettled([
      fetchJson(`/api/dns/radar?${params.toString()}`),
      fetchJson('/api/dns/stats'),
      fetchJson('/api/dns/vlan-summary'),
    ]);

    if (radarResult.status === 'fulfilled') {
      setEntries(Array.isArray(radarResult.value.entries) ? radarResult.value.entries : []);
      setSummary(radarResult.value.summary || null);
    }
    if (dnsStatsResult.status === 'fulfilled') setStats(dnsStatsResult.value || null);
    if (vlanStatsResult.status === 'fulfilled') setVlanSummary(Array.isArray(vlanStatsResult.value) ? vlanStatsResult.value : []);

    const failures = [
      radarResult.status === 'rejected' ? 'radar DNS' : null,
      dnsStatsResult.status === 'rejected' ? 'estatísticas DNS' : null,
      vlanStatsResult.status === 'rejected' ? 'quadro por VLAN' : null,
    ].filter(Boolean);

    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }

    setLoading(false);
  }, [blockedOnly, vlan]);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  const filteredEntries = useMemo(() => {
    const normalized = String(search || '').toLowerCase();
    return entries.filter((item) => {
      if (!normalized) return true;
      return [item.client_ip, item.domain, item.hostname, item.identity_user, item.identity_display_user, item.identity_computer, item.query_type]
        .some((value) => String(value || '').toLowerCase().includes(normalized));
    });
  }, [entries, search]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricSurface label="Queries do dia" value={stats?.total_hoje ?? '—'} subtitle="Volume observado na telemetria DNS do período." />
        <MetricSurface label="Bloqueios do dia" value={stats?.bloqueados_hoje ?? '—'} subtitle="Domínios ou consultas negadas pelo enforcement ativo." tone="danger" />
        <MetricSurface label="IPs ativos" value={stats?.ips_ativos ?? '—'} subtitle="Clientes distintos com presença recente na leitura operacional." tone="success" />
        <MetricSurface label="Últimos 5 minutos" value={stats?.queries_5min ?? '—'} subtitle="Ritmo de atividade mais recente no radar técnico." tone="warning" />
      </div>

      <Surface className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-tight text-primary">Leitura operacional do radar</div>
            <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Telemetria DNS observável</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/64">
              Este painel evidencia consultas DNS, clientes reais, ruído local e intensidade de bloqueio. Ele não substitui decisão institucional; sustenta análise operacional e prova de enforcement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip label={summary?.has_real_clients ? 'Clientes reais observados' : 'Sem clientes reais no recorte'} tone={summary?.has_real_clients ? 'success' : 'warning'} />
            <StatusChip label={`Ruído local ${summary?.local_noise_count ?? 0}`} tone="neutral" />
          </div>
        </div>

      </Surface>

      {error ? (
        <Surface className="p-5">
          <div className="text-sm font-semibold text-danger">{error}</div>
        </Surface>
      ) : null}

      <Surface className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          {VLANS.map((item) => (
            <ActionButton key={item.key} tone={vlan === item.key ? 'primary' : 'ghost'} onClick={() => setVlan(item.key)}>
              {item.label}
            </ActionButton>
          ))}
          <ActionButton tone={blockedOnly ? 'danger' : 'ghost'} onClick={() => setBlockedOnly((current) => !current)}>
            {blockedOnly ? 'Mostrando bloqueios' : 'Mostrar só bloqueios'}
          </ActionButton>
          <div className="ml-auto min-w-[16rem] max-w-full flex-1">
            <label className="flex min-h-[var(--control-height)] items-center gap-2 rounded-full border border-outline/12 bg-surface-high/72 px-4">
              <Search size={15} className="text-on-surface/52" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filtrar por IP, usuário, estação, domínio ou tipo"
                className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface/45"
              />
            </label>
          </div>
          <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => load().catch(() => null)}>
            Atualizar
          </ActionButton>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-tight text-on-surface/52">
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">IP cliente</th>
                <th className="px-3 py-2">Usuário / Estação</th>
                <th className="px-3 py-2">Domínio</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Evidência</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-on-surface/56">Carregando telemetria DNS...</td>
                </tr>
              ) : filteredEntries.length ? filteredEntries.map((item, index) => (
                <tr key={`${item.timestamp || index}-${item.client_ip || index}`} className="rounded-2xl border border-outline/10 bg-surface-high/56">
                  <td className="rounded-l-2xl px-3 py-3 text-on-surface/68">{fmt(item.timestamp)}</td>
                  <td className="px-3 py-3 font-mono text-primary">{item.client_ip || '—'}</td>
                  <td className="px-3 py-3 text-xs">
                    <div className="font-bold text-on-surface">{item.identity_display_user || item.identity_user || 'sem identidade'}</div>
                    <div className="font-mono text-[10px] text-on-surface/50">{item.identity_computer || item.hostname || 'estação não identificada'}</div>
                  </td>
                  <td className="px-3 py-3 text-on-surface">{item.domain || '—'}</td>
                  <td className="px-3 py-3 text-on-surface/68">{item.query_type || '—'}</td>
                  <td className="px-3 py-3">
                    <StatusChip label={item.local_noise ? 'Ruído local' : item.real_client ? 'Cliente real' : 'Sem prova'} tone={item.local_noise ? 'warning' : item.real_client ? 'success' : 'neutral'} />
                  </td>
                  <td className="rounded-r-2xl px-3 py-3">
                    <StatusChip label={item.blocked ? 'Bloqueado' : 'Auditado'} tone={item.blocked ? 'danger' : 'primary'} />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-on-surface/56">Nenhum evento encontrado no recorte atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {vlanSummary.map((item) => (
          <Surface key={item.vlan} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black tracking-tight text-on-surface">{item.vlan}</div>
              <StatusChip label={`${item.unique_ips} IPs`} tone="neutral" />
            </div>
            <div className="mt-4 text-2xl font-black tracking-tight text-on-surface">{item.total_queries}</div>
            <div className="mt-1 text-sm text-on-surface/62">consultas observadas</div>
            <div className="mt-4 text-sm text-danger">{item.blocked_queries} bloqueios</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, Number(item.block_pct || 0))}%` }}
              />
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}

function EngineTab({ engineStatus, refreshAll }) {
  const [actionLoading, setActionLoading] = useState('');
  const [certificate, setCertificate] = useState(null);
  const [actionLogs, setActionLogs] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [certificateResult, logsResult] = await Promise.allSettled([
      fetchJson('/api/proxy/certificate'),
      fetchJson('/api/proxy/action-logs?limit=24'),
    ]);
    if (certificateResult.status === 'fulfilled') setCertificate(certificateResult.value);
    if (logsResult.status === 'fulfilled') setActionLogs(Array.isArray(logsResult.value) ? logsResult.value : []);
    const failures = [
      certificateResult.status === 'rejected' ? 'certificado' : null,
      logsResult.status === 'rejected' ? 'trilha técnica' : null,
    ].filter(Boolean);
    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }
  }, []);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  const act = async (path, label) => {
    setActionLoading(label);
    try {
      await fetchJson(path, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      await Promise.all([refreshAll(), load()]);
    } finally {
      setActionLoading('');
    }
  };

  const engineServices = [
    { label: 'Squid', value: engineStatus?.squid_active, subtitle: 'Processo do proxy complementar' },
    { label: 'Interceptação', value: engineStatus?.redirects_active, subtitle: 'Redirect seletivo em produção controlada' },
    { label: 'Logger', value: engineStatus?.logger_active, subtitle: 'Coleta técnica para trilha DNS/Proxy' },
    { label: 'Bypass global', value: engineStatus?.bypass_global, subtitle: 'Passagem direta sem observação complementar' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        {error ? (
          <Surface className="p-5 xl:col-span-2">
            <div className="text-sm font-semibold text-danger">{error}</div>
          </Surface>
        ) : null}
        <Surface className="p-5">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Estado oficial do motor</div>
          <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Saúde e modo de execução</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {engineServices.map((item) => (
              <Surface key={item.label} stripe={false} className="p-4">
                <div className="text-sm font-bold text-on-surface">{item.label}</div>
                <div className="mt-2">
                  <StatusChip label={item.value ? 'Ativo' : 'Inativo'} tone={item.value ? 'success' : 'danger'} />
                </div>
                <p className="mt-3 text-sm leading-6 text-on-surface/62">{item.subtitle}</p>
              </Surface>
            ))}
          </div>
          <div className="mt-4 grid gap-3 text-sm text-on-surface/68 sm:grid-cols-2">
            <div>Modo: <strong className="text-on-surface">{engineStatus?.enforcement_mode || engineStatus?.mode || 'off'}</strong></div>
            <div>Fonte de verdade: <strong className="text-on-surface">{engineStatus?.source_of_truth || '—'}</strong></div>
            <div>Portas ativas: <strong className="text-on-surface">{(engineStatus?.active_ports || []).join(', ') || 'nenhuma'}</strong></div>
            <div>Última ação: <strong className="text-on-surface">{engineStatus?.last_action || '—'}</strong></div>
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Ações operacionais</div>
          <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Intervenção técnica controlada</h3>
          <p className="mt-2 text-sm leading-6 text-on-surface/64">
            Esta camada atua na saúde do motor observável. Decisões de política permanecem em `Bloqueios & Liberações`.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton tone="primary" onClick={() => act('/api/proxy/mode/test-http-only', 'http-only')}>
              {actionLoading === 'http-only' ? 'Processando...' : 'Ativar HTTP-only'}
            </ActionButton>
            <ActionButton tone="warning" onClick={() => act('/api/proxy/mode/test-http-https', 'http-https')}>
              {actionLoading === 'http-https' ? 'Processando...' : 'Ativar HTTP+HTTPS'}
            </ActionButton>
            <ActionButton tone="danger" onClick={() => act('/api/proxy/mode/off', 'off')}>
              {actionLoading === 'off' ? 'Processando...' : 'Desligar interceptação'}
            </ActionButton>
            <ActionButton tone="ghost" onClick={() => act('/api/proxy/logger/restart', 'logger')}>
              {actionLoading === 'logger' ? 'Processando...' : 'Reiniciar logger'}
            </ActionButton>
            <ActionButton tone="ghost" onClick={() => act('/api/proxy/reports/generate', 'report')}>
              {actionLoading === 'report' ? 'Processando...' : 'Gerar relatório SARG'}
            </ActionButton>
          </div>
        </Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Surface className="p-5">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Certificado institucional</div>
          <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Autoridade do proxy HTTPS</h3>
          <div className="mt-4 grid gap-3 text-sm text-on-surface/68">
            <div>Criado em: <strong className="text-on-surface">{fmt(certificate?.created_at)}</strong></div>
            <div>Válido até: <strong className="text-on-surface">{fmt(certificate?.valid_until)}</strong></div>
            <div>Fingerprint: <strong className="break-all text-on-surface">{certificate?.fingerprint || '—'}</strong></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton tone="ghost" onClick={() => window.open('/api/cert/download', '_blank')}>
              Baixar certificado
            </ActionButton>
            <ActionButton tone="primary" onClick={() => act('/api/proxy/certificate/regenerate', 'certificate')}>
              {actionLoading === 'certificate' ? 'Processando...' : 'Gerar nova CA'}
            </ActionButton>
          </div>
        </Surface>

        <Surface className="p-5">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Trilha de ações técnicas</div>
          <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Últimas intervenções no motor</h3>
          <div className="mt-4 space-y-3">
            {actionLogs.length ? actionLogs.map((item, index) => (
              <Surface key={`${item.created_at || index}-${index}`} stripe={false} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-on-surface">{item.action || 'Ação técnica'}</div>
                    <div className="mt-1 text-xs text-on-surface/56">{fmt(item.created_at)}</div>
                  </div>
                  <StatusChip label={item.success ? 'Sucesso' : 'Falha'} tone={item.success ? 'success' : 'danger'} />
                </div>
                <p className="mt-3 text-sm leading-6 text-on-surface/64">{item.message || 'Sem mensagem registrada.'}</p>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Nenhuma ação técnica recente registrada no motor.
              </div>
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [institutional, setInstitutional] = useState(null);
  const [proxyStats, setProxyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [reportsResult, statsResult, institutionalResult] = await Promise.allSettled([
      fetchJson('/api/proxy/reports'),
      fetchJson('/api/proxy/stats'),
      fetchJson('/api/proxy/reports/institutional'),
    ]);
    if (reportsResult.status === 'fulfilled') setReports(Array.isArray(reportsResult.value) ? reportsResult.value : []);
    if (statsResult.status === 'fulfilled') setProxyStats(statsResult.value || null);
    if (institutionalResult.status === 'fulfilled') setInstitutional(institutionalResult.value || null);
    const failures = [
      reportsResult.status === 'rejected' ? 'relatórios' : null,
      statsResult.status === 'rejected' ? 'estatísticas do proxy' : null,
      institutionalResult.status === 'rejected' ? 'relatório institucional' : null,
    ].filter(Boolean);
    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  return (
    <div className="space-y-6">
      {error ? (
        <Surface className="p-5">
          <div className="text-sm font-semibold text-danger">{error}</div>
        </Surface>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricSurface label="Eventos proxy" value={proxyStats?.total ?? '—'} subtitle="Registros acumulados da trilha técnica do proxy." />
        <MetricSurface label="Bloqueios proxy" value={proxyStats?.blocked ?? '—'} subtitle="Eventos explicitamente negados na camada observável." tone="danger" />
        <MetricSurface label="Relatórios indexados" value={reports.length} subtitle="Artefatos SARG disponíveis para consulta institucional." tone="success" />
      </div>

      {institutional ? (
        <Surface className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-tight text-primary">Relatório institucional baseado em SARG</div>
              <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Uso explícito do proxy no modo ACL + DNS</h3>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-on-surface/64">
                {institutional.scope?.statement}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusChip label={institutional.mode === 'acl-plus-dns' ? 'Modo ACL + DNS' : (institutional.mode || 'Modo não identificado')} tone="primary" />
              <StatusChip label={`${institutional.executive_summary?.explicit_coverage_pct_24h ?? 0}% de cobertura proxy`} tone={(institutional.executive_summary?.explicit_coverage_pct_24h ?? 0) >= 50 ? 'success' : 'warning'} />
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricSurface
              label="Acessos SARG"
              value={institutional.executive_summary?.total_accesses ?? '—'}
              subtitle="Registros lidos do artefato SARG selecionado."
            />
            <MetricSurface
              label="Eventos proxy 24h"
              value={institutional.executive_summary?.explicit_proxy_events_24h ?? '—'}
              subtitle="Tráfego que realmente passou pelo proxy explícito."
              tone="success"
            />
            <MetricSurface
              label="Eventos DNS 24h"
              value={institutional.executive_summary?.dns_events_24h ?? '—'}
              subtitle="Base principal de observabilidade do modo atual."
            />
            <MetricSurface
              label="Veredito"
              value={institutional.executive_summary?.coverage_verdict || '—'}
              subtitle="Leitura de cobertura institucional do relatório."
              tone={(institutional.executive_summary?.explicit_coverage_pct_24h ?? 0) >= 50 ? 'success' : 'warning'}
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Limitações assumidas no relatório</div>
              <div className="mt-3 space-y-2">
                {(institutional.scope?.limitations || []).map((item, index) => (
                  <div key={`${item}-${index}`} className="rounded-2xl border border-outline/12 bg-surface-high/56 px-3 py-2 text-sm text-on-surface/68">
                    {item}
                  </div>
                ))}
              </div>
            </Surface>

            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Último artefato e último evento proxy</div>
              <div className="mt-3 space-y-2 text-sm text-on-surface/68">
                <div>Relatório SARG: <strong className="text-on-surface">{institutional.report?.name || '—'}</strong></div>
                <div>Atualizado em: <strong className="text-on-surface">{fmt(institutional.report?.updated_at)}</strong></div>
                <div>Último evento proxy: <strong className="text-on-surface">{fmt(institutional.executive_summary?.latest_proxy_event_at)}</strong></div>
                <div>IPs únicos via proxy 24h: <strong className="text-on-surface">{institutional.executive_summary?.explicit_proxy_unique_ips_24h ?? '—'}</strong></div>
              </div>
            </Surface>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Top sites vistos pelo proxy explícito</div>
              <div className="mt-3 space-y-2">
                {(institutional.highlights?.top_sites || []).length ? institutional.highlights.top_sites.map((item, index) => (
                  <div key={`${item.domain || index}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-outline/12 bg-surface-high/56 px-3 py-2 text-sm">
                    <span className="text-on-surface">{item.domain || 'domínio não identificado'}</span>
                    <span className="font-mono text-on-surface/64">{item.connects ?? 0}</span>
                  </div>
                )) : (
                  <div className="text-sm text-on-surface/62">Sem leitura suficiente no artefato SARG.</div>
                )}
              </div>
            </Surface>

            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Tentativas negadas registradas no SARG</div>
              <div className="mt-3 space-y-2">
                {(institutional.highlights?.denied_attempts || []).length ? institutional.highlights.denied_attempts.map((item, index) => (
                  <div key={`${item.client_ip || index}-${index}`} className="rounded-2xl border border-outline/12 bg-surface-high/56 px-3 py-2 text-sm text-on-surface/68">
                    {item.client_ip || 'IP não identificado'} • {item.domain || 'domínio não identificado'} • {item.occurred_at || 'sem data'}
                  </div>
                )) : (
                  <div className="text-sm text-on-surface/62">Nenhuma negativa estruturada encontrada no artefato selecionado.</div>
                )}
              </div>
            </Surface>
          </div>
        </Surface>
      ) : null}

      <Surface className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-tight text-primary">Relatórios e artefatos</div>
            <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Saída documental do proxy observável</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/64">
              Aqui permanecem os artefatos gerados por SARG e outras evidências de navegação observável. O módulo serve suporte técnico e prestação de contas operacional.
            </p>
          </div>
          <ActionButton tone="primary" icon={RefreshCcw} onClick={() => load().catch(() => null)}>
            Atualizar relatórios
          </ActionButton>
        </div>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
              Carregando relatórios indexados...
            </div>
          ) : reports.length ? reports.map((report) => (
            <Surface key={report.id} stripe={false} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-on-surface">{report.name}</div>
                  <div className="mt-1 text-xs text-on-surface/56">{fmt(report.updated_at)}</div>
                </div>
                <ActionButton tone="ghost" onClick={() => window.open(report.index_url, '_blank')}>
                  Abrir artefato
                </ActionButton>
              </div>
            </Surface>
          )) : (
            <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
              Nenhum relatório indexado no momento.
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}

export default function Proxy() {
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [engineStatus, setEngineStatus] = useState(null);
  const [dnsStats, setDnsStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [proxyStats, setProxyStats] = useState(null);
  const [actionLogs, setActionLogs] = useState([]);

  const refreshAll = useCallback(async () => {
    setError('');
    const [engineResult, dnsResult, reportsResult, metricsResult, logsResult] = await Promise.allSettled([
      fetchJson('/api/proxy/engine/status'),
      fetchJson('/api/dns/stats'),
      fetchJson('/api/proxy/reports'),
      fetchJson('/api/proxy/stats'),
      fetchJson('/api/proxy/action-logs?limit=12'),
    ]);
    if (engineResult.status === 'fulfilled') setEngineStatus(engineResult.value);
    if (dnsResult.status === 'fulfilled') setDnsStats(dnsResult.value);
    if (reportsResult.status === 'fulfilled') setReports(Array.isArray(reportsResult.value) ? reportsResult.value : []);
    if (metricsResult.status === 'fulfilled') setProxyStats(metricsResult.value || null);
    if (logsResult.status === 'fulfilled') setActionLogs(Array.isArray(logsResult.value) ? logsResult.value : []);
    const failures = [
      engineResult.status === 'rejected' ? 'estado do motor' : null,
      dnsResult.status === 'rejected' ? 'estatísticas DNS' : null,
      reportsResult.status === 'rejected' ? 'relatórios' : null,
      metricsResult.status === 'rejected' ? 'estatísticas do proxy' : null,
      logsResult.status === 'rejected' ? 'trilha técnica' : null,
    ].filter(Boolean);
    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }
  }, []);

  useEffect(() => {
    refreshAll().catch(() => null);
    const timer = window.setInterval(() => refreshAll().catch(() => null), 10000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const overviewCards = [
    {
      label: 'Motor observável',
      value: engineStatus?.enforcement_mode || engineStatus?.mode || 'off',
      subtitle: 'Modo atualmente exposto pela camada técnica.',
      tone: engineStatus?.squid_active ? 'success' : 'warning',
    },
    {
      label: 'Logger DNS',
      value: dnsStats?.queries_5min ?? '—',
      subtitle: 'Consultas recentes na trilha operacional.',
      tone: 'primary',
    },
    {
      label: 'Bloqueios proxy',
      value: proxyStats?.blocked ?? '—',
      subtitle: 'Eventos de bloqueio na camada observável do proxy.',
      tone: 'danger',
    },
    {
      label: 'Relatórios SARG',
      value: reports.length,
      subtitle: 'Artefatos indexados para consulta operacional.',
      tone: 'success',
    },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      <ModuleHeader
        eyebrow="Controle"
        title="Observabilidade DNS/Proxy"
        description="Centro institucional de telemetria observável, saúde do motor complementar e evidência técnica do tráfego que passa pelas camadas DNS e proxy."
        badges={(
          <>
            <StatusChip label={`Squid ${engineStatus?.squid_active ? 'ativo' : 'inativo'}`} tone={engineStatus?.squid_active ? 'success' : 'danger'} />
            <StatusChip label={`Logger ${engineStatus?.logger_active ? 'ativo' : 'inativo'}`} tone={engineStatus?.logger_active ? 'success' : 'warning'} />
            <StatusChip label={`Interceptação ${engineStatus?.redirects_active ? 'seletiva' : 'desligada'}`} tone={engineStatus?.redirects_active ? 'primary' : 'neutral'} />
          </>
        )}
        actions={(
          <ActionButton tone="ghost" icon={ArrowRightLeft} onClick={() => { window.location.href = '/bloqueios-liberacoes'; }}>
            Abrir Políticas Institucionais
          </ActionButton>
        )}
      />

      <Surface className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-tight text-primary">Papel institucional do módulo</div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-on-surface">Telemetria, saúde e evidência operacional</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/64">
              Este módulo não decide política administrativa. Ele sustenta diagnóstico, prova de enforcement, leitura do motor complementar e documentação operacional do que foi efetivamente observado.
            </p>
          </div>
          <ActionButton tone="primary" icon={RefreshCcw} onClick={() => refreshAll().catch(() => null)}>
            Atualizar leitura
          </ActionButton>
        </div>
      </Surface>

      {error ? (
        <Surface className="p-5">
          <div className="text-sm font-semibold text-danger">{error}</div>
        </Surface>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <MetricSurface key={card.label} {...card} />
        ))}
      </div>

      <SegmentedTabs
        tabs={[
          { key: 'overview', label: 'Visão Consolidada', icon: ShieldCheck },
          { key: 'radar', label: 'Radar DNS', icon: Radar },
          { key: 'engine', label: 'Motor Complementar', icon: Wifi },
          { key: 'reports', label: 'Relatórios', icon: FileBarChart2 },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Surface className="p-5">
            <div className="text-[11px] font-semibold tracking-tight text-primary">Resumo executivo da camada observável</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Surface stripe={false} className="p-4">
                <div className="text-sm font-bold text-on-surface">Saúde do motor</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusChip label={engineStatus?.squid_active ? 'Squid ativo' : 'Squid inativo'} tone={engineStatus?.squid_active ? 'success' : 'danger'} />
                  <StatusChip label={engineStatus?.logger_active ? 'Logger ativo' : 'Logger inativo'} tone={engineStatus?.logger_active ? 'success' : 'warning'} />
                </div>
                <p className="mt-3 text-sm leading-6 text-on-surface/62">
                  O motor complementar serve evidência e suporte técnico ao enforcement principal.
                </p>
              </Surface>
              <Surface stripe={false} className="p-4">
                <div className="text-sm font-bold text-on-surface">Telemetria DNS</div>
                <div className="mt-2 text-2xl font-black tracking-tight text-on-surface">{dnsStats?.total_hoje ?? '—'}</div>
                <p className="mt-3 text-sm leading-6 text-on-surface/62">
                  Consultas do dia registradas na camada de observabilidade.
                </p>
              </Surface>
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-tight text-primary">
              <Activity size={14} />
              Últimas ações técnicas
            </div>
            <div className="mt-4 space-y-3">
              {actionLogs.length ? actionLogs.map((item, index) => (
                <Surface key={`${item.created_at || index}-${index}`} stripe={false} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-on-surface">{item.action || 'Ação técnica'}</div>
                      <div className="mt-1 text-xs text-on-surface/56">{fmt(item.created_at)}</div>
                    </div>
                    <StatusChip label={item.success ? 'Sucesso' : 'Falha'} tone={item.success ? 'success' : 'danger'} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-on-surface/64">{item.message || 'Sem mensagem registrada.'}</p>
                </Surface>
              )) : (
                <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                  Sem ações técnicas recentes.
                </div>
              )}
            </div>
          </Surface>
        </div>
      ) : null}

      {tab === 'radar' ? <RadarTab /> : null}
      {tab === 'engine' ? <EngineTab engineStatus={engineStatus} refreshAll={refreshAll} /> : null}
      {tab === 'reports' ? <ReportsTab /> : null}
    </div>
  );
}
