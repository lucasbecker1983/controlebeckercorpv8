import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, FileCheck2, Flame, Layers3, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Kpi, KpiRow, Notice, PageHeader, Panel, Tabs, errorMessage, useUrlTab } from '../components/ui/kit';

/*
 * Aprovações & Exceções: leitura de decisão. Quais políticas estão em vigor e com que justificativa, quais
 * exceções (VIPs) estão ativas e a contingência DNS como ato formal. Para alterar, use Políticas de Acesso e DNS & Proxy.
 */

const BASE = '/api/bloqueios-liberacoes';
const TABS = [
  { key: 'decisions', label: 'Decisões', icon: FileCheck2 },
  { key: 'exceptions', label: 'Exceções', icon: ShieldAlert },
  { key: 'contingency', label: 'Contingência', icon: Flame },
];

const when = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
};
const norm = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const scopeText = (item) => (item.scope_type === 'global' ? 'Todas as VLANs' : `VLAN ${(item.vlan_ids || []).join(', ') || 'sem seleção'}`);

export default function ApprovalsExceptions() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'decisions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [contingency, setContingency] = useState(null);
  const [contingencyAudit, setContingencyAudit] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, e, c, a] = await Promise.allSettled([
      api.get(`${BASE}/status`), api.get(`${BASE}/domain-policies`), api.get(`${BASE}/exceptions`), api.get(`${BASE}/contingency/status`), api.get(`${BASE}/contingency/audit`),
    ]);
    if (s.status === 'fulfilled') setStatus(s.value.data);
    if (p.status === 'fulfilled') setPolicies(Array.isArray(p.value.data) ? p.value.data : []);
    if (e.status === 'fulfilled') setExceptions(Array.isArray(e.value.data) ? e.value.data : []);
    if (c.status === 'fulfilled') setContingency(c.value.data);
    if (a.status === 'fulfilled') setContingencyAudit(Array.isArray(a.value.data) ? a.value.data : []);
    const failed = [
      s.status === 'rejected' ? 'estado do motor' : null, p.status === 'rejected' ? 'políticas' : null, e.status === 'rejected' ? 'exceções' : null,
      c.status === 'rejected' ? 'contingência' : null, a.status === 'rejected' ? 'auditoria da contingência' : null,
    ].filter(Boolean);
    setError(failed.length ? `Não foi possível ler: ${failed.join(', ')}.` : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePolicies = useMemo(() => policies.filter((i) => i.enabled), [policies]);
  const inReview = useMemo(() => activePolicies.filter((i) => ['em analise', 'em revisao'].some((t) => norm(i.lifecycle_status).includes(t))), [activePolicies]);
  const activeExceptions = useMemo(() => exceptions.filter((i) => i.active), [exceptions]);
  const expiring = useMemo(() => activeExceptions.filter((i) => i.expires_at && new Date(i.expires_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000), [activeExceptions]);
  const contingencyActive = contingency?.status === 'active';

  const policyColumns = [
    { key: 'name', label: 'Política', render: (i) => (
      <div className="min-w-[220px]">
        <div className="font-semibold text-on-surface">{i.name || 'Política sem nome'}</div>
        <div className="mt-0.5 max-w-[420px] text-[12.5px] leading-5 text-on-surface/60">{i.governance_summary || i.description || 'Sem resumo de governança registrado.'}</div>
      </div>
    ) },
    { key: 'policy_type', label: 'Tipo', render: (i) => <Badge tone={i.policy_type === 'allow' ? 'success' : 'danger'}>{i.policy_type === 'allow' ? 'Liberação' : 'Bloqueio'}</Badge> },
    { key: 'scope', label: 'Escopo', render: scopeText },
    { key: 'lifecycle_status', label: 'Situação', render: (i) => (i.lifecycle_status ? <Badge tone="warning">{i.lifecycle_status}</Badge> : <span className="text-on-surface/45">—</span>) },
    { key: 'who', label: 'Solicitante e alçada', render: (i) => <div className="text-[12.5px]"><div>{i.requested_by || 'não informado'}</div><div className="text-on-surface/55">{i.approval_scope || 'alçada não informada'} · revisão {i.review_date || 'não definida'}</div></div> },
    { key: 'updated_at', label: 'Atualizada', render: (i) => <span className="tabular text-on-surface/60">{when(i.updated_at || i.created_at)}</span> },
  ];

  const exceptionColumns = [
    { key: 'ip', label: 'IP', render: (i) => <span className="tabular font-semibold">{i.ip || 'não identificado'}</span> },
    { key: 'exception_type', label: 'Tipo', render: (i) => <Badge tone="warning">{i.exception_type || 'exceção'}</Badge> },
    { key: 'vlan_id', label: 'Escopo', render: (i) => (i.vlan_id ? `VLAN ${i.vlan_id}` : 'Todas as VLANs') },
    { key: 'reason', label: 'Justificativa', render: (i) => <span className="block max-w-[360px] text-[12.5px] leading-5 text-on-surface/70">{i.governance_summary || i.reason || i.description || 'Sem justificativa detalhada.'}</span> },
    { key: 'who', label: 'Solicitante e base legal', render: (i) => <div className="text-[12.5px]"><div>{i.requested_by || 'não informado'}</div><div className="text-on-surface/55">{i.legal_basis || 'base legal não informada'}</div></div> },
    { key: 'expires_at', label: 'Expira em', render: (i) => <span className="tabular text-on-surface/70">{i.expires_at ? when(i.expires_at) : 'sem prazo'}</span> },
  ];

  const auditColumns = [
    { key: 'created_at', label: 'Quando', width: '160px', render: (i) => <span className="tabular text-on-surface/70">{when(i.created_at)}</span> },
    { key: 'action', label: 'Ato', render: (i) => <span className="font-semibold">{i.action || 'Evento de contingência'}</span> },
    { key: 'reason', label: 'Motivo', render: (i) => <span className="block max-w-[420px] text-[12.5px] leading-5 text-on-surface/70">{i.reason || i.message || 'Sem detalhe complementar.'}</span> },
    { key: 'requested_by', label: 'Solicitante', render: (i) => i.requested_by || 'não informado' },
    { key: 'scope', label: 'Escopo', render: (i) => (i.scope_type === 'vlan' ? `VLAN ${(i.vlan_ids || []).join(', ')}` : 'Todas as VLANs') },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Aprovações & Exceções"
        description="Decisões em vigor, exceções ativas e a contingência DNS como ato formal. Esta tela só mostra; para alterar, use Políticas de Acesso e DNS & Proxy."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
            <Button icon={Layers3} onClick={() => navigate('/politicas')}>Abrir políticas</Button>
          </>
        )}
      />

      {error ? <Notice tone="warning" title="Leitura incompleta" action={<Button onClick={load}>Tentar de novo</Button>}>{error}</Notice> : null}

      <KpiRow>
        <Kpi icon={FileCheck2} label="Políticas ativas" value={loading && !policies.length ? '—' : activePolicies.length} sub={`${status?.engine?.managed_vlan_ids?.length || 0} VLANs sob controle`} />
        <Kpi icon={Clock3} label="Em análise ou revisão" value={loading && !policies.length ? '—' : inReview.length} tone={inReview.length ? 'warning' : 'neutral'} sub="Pendências formais" />
        <Kpi icon={ShieldAlert} label="Exceções ativas" value={loading && !exceptions.length ? '—' : activeExceptions.length} tone={activeExceptions.length ? 'warning' : 'neutral'} sub={`${expiring.length} expiram em 24 h`} />
        <Kpi icon={Flame} label="Contingência DNS" value={contingencyActive ? 'Ativa' : 'Normal'} tone={contingencyActive ? 'danger' : 'success'} sub={status?.engine?.mode_label ? `Modo ${status.engine.mode_label}` : null} />
      </KpiRow>

      <Tabs tabs={TABS.map((t) => ({ ...t, count: t.key === 'decisions' ? activePolicies.length : t.key === 'exceptions' ? activeExceptions.length : contingencyAudit.length }))} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'decisions' ? (
        <Panel title="Políticas em vigor" description="Vigência, justificativa, escopo e autoria. Mostra as 18 mais recentes; a lista completa fica em Políticas de Acesso." padded={false}>
          <DataTable columns={policyColumns} rows={activePolicies.slice(0, 18)} empty={loading ? 'Carregando…' : 'Nenhuma política ativa neste momento.'} />
        </Panel>
      ) : null}

      {activeTab === 'exceptions' ? (
        <Panel title="Exceções ativas" description="VIPs e dispensas em vigor, com justificativa, base legal e prazo." padded={false}>
          <DataTable columns={exceptionColumns} rows={activeExceptions} empty={loading ? 'Carregando…' : 'Nenhuma exceção ativa. O comportamento padrão vale para todos.'} />
        </Panel>
      ) : null}

      {activeTab === 'contingency' ? (
        <div className="space-y-4">
          <Panel title="Situação atual" description={contingencyActive ? 'Resolvedores públicos liberados temporariamente.' : 'Somente o DNS interno, que aplica os bloqueios.'}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Estado', contingencyActive ? 'Ativa' : 'Normal'],
                ['Abrangência', contingency?.scope_type === 'vlan' ? `VLAN ${(contingency?.vlan_ids || []).join(', ')}` : 'Todas as VLANs'],
                ['Expira em', contingencyActive ? when(contingency?.expires_at) : '—'],
                ['Recomendação', contingency?.runtime?.healthy ? 'Operação normal possível' : (contingency?.runtime?.recommendation || 'Fallback sugerido')],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-outline px-3 py-2">
                  <dt className="text-[11.5px] text-on-surface/50">{label}</dt>
                  <dd className="mt-0.5 break-words text-[13.5px] font-semibold text-on-surface">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Auditoria da contingência" description="Ativações, renovações e retorno ao normal, como atos formais." padded={false}>
            <DataTable columns={auditColumns} rows={contingencyAudit} rowKey={(i) => i.id ?? `${i.created_at}-${i.action}`} empty={loading ? 'Carregando…' : 'Nenhuma ativação ou renovação registrada.'} />
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
