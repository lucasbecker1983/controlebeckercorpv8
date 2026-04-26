import { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  FileCheck2,
  Flame,
  Layers3,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import { authFetch } from '../services/authFetch';
import {
  ActionButton,
  EmptyStateBlock,
  InlineStat,
  ListRow,
  MetricCard,
  ModuleHero,
  QuickActionBar,
  SectionCard,
  SegmentedTabs,
  StateBadge,
} from '../components/blocking/BlockingUi';

const API = '';

const TABS = [
  { key: 'decisions', label: 'Decisões', icon: FileCheck2 },
  { key: 'exceptions', label: 'Exceções', icon: ShieldAlert },
  { key: 'contingency', label: 'Contingência', icon: Flame },
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

async function fetchJson(path) {
  const response = await authFetch(`${API}${path}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Falha em ${path}`);
  return payload;
}

export default function ApprovalsExceptions() {
  const [activeTab, setActiveTab] = useState('decisions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [contingency, setContingency] = useState(null);
  const [contingencyAudit, setContingencyAudit] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    const [statusResult, policyResult, exceptionResult, contingencyResult, contingencyAuditResult] = await Promise.allSettled([
      fetchJson('/api/bloqueios-liberacoes/status'),
      fetchJson('/api/bloqueios-liberacoes/domain-policies'),
      fetchJson('/api/bloqueios-liberacoes/exceptions'),
      fetchJson('/api/bloqueios-liberacoes/contingency/status'),
      fetchJson('/api/bloqueios-liberacoes/contingency/audit'),
    ]);

    if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
    if (policyResult.status === 'fulfilled') setPolicies(Array.isArray(policyResult.value) ? policyResult.value : []);
    if (exceptionResult.status === 'fulfilled') setExceptions(Array.isArray(exceptionResult.value) ? exceptionResult.value : []);
    if (contingencyResult.status === 'fulfilled') setContingency(contingencyResult.value);
    if (contingencyAuditResult.status === 'fulfilled') setContingencyAudit(Array.isArray(contingencyAuditResult.value) ? contingencyAuditResult.value : []);

    const failures = [
      statusResult.status === 'rejected' ? 'status do motor' : null,
      policyResult.status === 'rejected' ? 'políticas' : null,
      exceptionResult.status === 'rejected' ? 'exceções' : null,
      contingencyResult.status === 'rejected' ? 'contingência' : null,
      contingencyAuditResult.status === 'rejected' ? 'auditoria da contingência' : null,
    ].filter(Boolean);

    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }

    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const activePolicies = useMemo(() => policies.filter((item) => item.enabled), [policies]);
  const reviewPolicies = useMemo(
    () => activePolicies.filter((item) => ['em análise', 'em revisao', 'em revisão'].some((token) => normalizeText(item.lifecycle_status).includes(token))),
    [activePolicies],
  );
  const activeExceptions = useMemo(() => exceptions.filter((item) => item.active), [exceptions]);
  const expiringExceptions = useMemo(
    () => activeExceptions.filter((item) => item.expires_at && new Date(item.expires_at).getTime() <= Date.now() + (24 * 60 * 60 * 1000)),
    [activeExceptions],
  );

  return (
    <div className="space-y-5 xl:space-y-6">
      <ModuleHero
        eyebrow="Aprovações & Exceções"
        title="Fluxo institucional de decisão, exceção controlada e contingência formal"
        description="Este módulo deixa de repetir a superfície completa de políticas. Aqui ficam a leitura decisória, as exceções ativas, a vigência institucional e a contingência DNS como ato formal rastreável."
        badges={(
          <>
            <StateBadge label="Decisão formal" tone="primary" />
            <StateBadge label="Exceção rastreável" tone="warning" />
            <StateBadge label="Contingência auditável" tone={contingency?.status === 'active' ? 'danger' : 'success'} />
          </>
        )}
        actions={(
          <QuickActionBar
            items={[
              { label: 'Atualizar', tone: 'primary', icon: RefreshCcw, onClick: () => load() },
              { label: 'Abrir políticas', tone: 'ghost', icon: Layers3, onClick: () => { window.location.href = '/bloqueios-liberacoes?tab=policies'; } },
            ]}
          />
        )}
        aside={(
          <div className="grid gap-3 sm:grid-cols-2">
            <InlineStat label="Políticas ativas" value={activePolicies.length} tone="primary" />
            <InlineStat label="Exceções ativas" value={activeExceptions.length} tone="warning" />
            <InlineStat label="Em revisão" value={reviewPolicies.length} tone="neutral" />
            <InlineStat label="Contingência" value={contingency?.status === 'active' ? 'Ativa' : 'Normal'} tone={contingency?.status === 'active' ? 'danger' : 'success'} />
          </div>
        )}
      />

      <SegmentedTabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      {error ? (
        <SectionCard title="Falha de carregamento" subtitle={error}>
          <ActionButton tone="primary" icon={RefreshCcw} onClick={() => load()}>Tentar novamente</ActionButton>
        </SectionCard>
      ) : null}

      {!error && activeTab === 'decisions' ? (
        <div className="space-y-5 xl:space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={FileCheck2} eyebrow="Decisão" title="Políticas ativas" value={activePolicies.length} subtitle="Atos atualmente vigentes no módulo institucional de políticas." tone="primary" />
            <MetricCard icon={ShieldCheck} eyebrow="Escopo" title="VLANs geridas" value={status?.engine?.managed_vlan_ids?.length || 0} subtitle="Redes sob controle ativo do motor institucional." tone="success" />
            <MetricCard icon={Clock3} eyebrow="Revisão" title="Pendências formais" value={reviewPolicies.length} subtitle="Itens com linguagem de análise ou revisão ainda não encerrada." tone="warning" />
            <MetricCard icon={Waypoints} eyebrow="Motor" title="Modo atual" value={status?.engine?.mode_label || '—'} subtitle="Leitura decisória do regime técnico atualmente em vigor." tone="neutral" />
          </div>

          <SectionCard title="Políticas sob leitura decisória" subtitle="Lista voltada a vigência, justificativa, escopo e autoria, sem replicar toda a mecânica operacional do módulo de políticas.">
            <div className="space-y-2.5">
              {activePolicies.length ? activePolicies.slice(0, 18).map((item) => (
                <ListRow key={item.id}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-on-surface">{item.name || 'Política sem nome'}</span>
                        <StateBadge label={item.policy_type === 'allow' ? 'Liberação' : 'Bloqueio'} tone={item.policy_type === 'allow' ? 'success' : 'danger'} />
                        <StateBadge label={item.scope_type === 'global' ? 'Global' : `VLAN ${(item.vlan_ids || []).join(', ') || 'sem seleção'}`} tone="primary" />
                        {item.lifecycle_status ? <StateBadge label={item.lifecycle_status} tone="warning" /> : null}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-on-surface/62">{item.governance_summary || item.description || 'Sem resumo de governança registrado.'}</div>
                      <div className="mt-2 text-xs text-on-surface/50">
                        Solicitante: {item.requested_by || 'não informado'} • Alçada: {item.approval_scope || 'não informada'} • Revisão: {item.review_date || 'não definida'}
                      </div>
                    </div>
                    <div className="text-sm text-on-surface/50">{formatDate(item.updated_at || item.created_at)}</div>
                  </div>
                </ListRow>
              )) : (
                <EmptyStateBlock icon={FileCheck2} title="Sem políticas ativas" description="Nenhuma política institucional ativa foi localizada neste momento." />
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {!error && activeTab === 'exceptions' ? (
        <SectionCard title="Exceções ativas" subtitle="Exceções VIP e dispensas temporárias observadas sob critério de vigência, motivação e rastreabilidade.">
          <div className="grid gap-3 md:grid-cols-3">
            <InlineStat label="Exceções ativas" value={activeExceptions.length} tone="warning" />
            <InlineStat label="Expiram em 24h" value={expiringExceptions.length} tone={expiringExceptions.length ? 'danger' : 'success'} />
            <InlineStat label="Escopo do motor" value={status?.engine?.mode_label || '—'} tone="neutral" />
          </div>
          <div className="mt-4 space-y-2.5">
            {activeExceptions.length ? activeExceptions.map((item) => (
              <ListRow key={item.id}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-black text-on-surface">{item.ip || 'IP não identificado'}</span>
                      <StateBadge label={item.exception_type || 'exception'} tone="warning" />
                      {item.vlan_id ? <StateBadge label={`VLAN ${item.vlan_id}`} tone="primary" /> : <StateBadge label="Global" tone="primary" />}
                      {item.lifecycle_status ? <StateBadge label={item.lifecycle_status} tone="neutral" /> : null}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-on-surface/62">{item.governance_summary || item.reason || item.description || 'Sem justificativa institucional detalhada.'}</div>
                    <div className="mt-2 text-xs text-on-surface/50">
                      Solicitante: {item.requested_by || 'não informado'} • Base legal: {item.legal_basis || 'não informada'} • Expira em: {formatDate(item.expires_at)}
                    </div>
                  </div>
                  <div className="text-sm text-on-surface/50">{formatDate(item.updated_at || item.created_at)}</div>
                </div>
              </ListRow>
            )) : (
              <EmptyStateBlock icon={ShieldAlert} title="Sem exceções ativas" description="Não há exceções vigentes que afastem o comportamento padrão do motor." />
            )}
          </div>
        </SectionCard>
      ) : null}

      {!error && activeTab === 'contingency' ? (
        <div className="space-y-5 xl:space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Flame} eyebrow="Estado" title="Contingência DNS" value={contingency?.status === 'active' ? 'Ativa' : 'Normal'} subtitle="Situação institucional do fallback público." tone={contingency?.status === 'active' ? 'danger' : 'success'} />
            <MetricCard icon={Waypoints} eyebrow="Escopo" title="Abrangência" value={contingency?.scope_type === 'vlan' ? `VLAN ${(contingency?.vlan_ids || []).join(', ')}` : 'Global'} subtitle="Onde a contingência está autorizada a valer." tone="primary" />
            <MetricCard icon={Clock3} eyebrow="Prazo" title="Expiração" value={formatDate(contingency?.expires_at)} subtitle="Data de vencimento da autorização atual." tone="warning" />
            <MetricCard icon={ShieldCheck} eyebrow="Saúde" title="Recomendação" value={contingency?.runtime?.healthy ? 'Operação normal possível' : 'Fallback sugerido'} subtitle={contingency?.runtime?.recommendation || 'Sem recomendação detalhada.'} tone={contingency?.runtime?.healthy ? 'success' : 'warning'} />
          </div>

          <SectionCard title="Auditoria da contingência" subtitle="Ativações, renovações e retorno ao normal apresentados como atos formais, não como mera telemetria operacional.">
            <div className="space-y-2.5">
              {contingencyAudit.length ? contingencyAudit.map((item) => (
                <ListRow key={item.id}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-on-surface">{item.action || 'Evento de contingência'}</span>
                        <StateBadge label={item.status || 'registrado'} tone={item.status === 'active' ? 'danger' : 'neutral'} />
                      </div>
                      <div className="mt-2 text-sm leading-6 text-on-surface/62">{item.reason || item.message || 'Sem detalhe complementar.'}</div>
                      <div className="mt-2 text-xs text-on-surface/50">
                        Solicitante: {item.requested_by || 'não informado'} • Escopo: {item.scope_type || 'global'}
                      </div>
                    </div>
                    <div className="text-sm text-on-surface/50">{formatDate(item.created_at)}</div>
                  </div>
                </ListRow>
              )) : (
                <EmptyStateBlock icon={Flame} title="Sem histórico de contingência" description="Nenhuma ativação ou renovação formal foi registrada." />
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {loading ? (
        <SectionCard title="Carregando aprovações e exceções" subtitle="Consolidando vigência, exceções ativas e contingência formal.">
          <div className="text-sm text-on-surface/62">Aguarde enquanto o módulo recompõe o quadro decisório.</div>
        </SectionCard>
      ) : null}
    </div>
  );
}
