import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, CalendarClock, LayoutGrid, ListChecks, Loader2, Plus, RefreshCw, SlidersHorizontal, Timer, UserCheck } from 'lucide-react';
import { api } from '../services/api';
import { Button, Kpi, KpiRow, Notice, PageHeader, Tabs, errorMessage, toast, useUrlTab } from '../components/ui/kit';
import { brGet, timeBR } from '../components/policies/shared';
import PolicyOverview from '../components/policies/PolicyOverview';
import SiteRules from '../components/policies/SiteRules';
import VipList, { reviewState, vipBinding } from '../components/policies/VipList';
import TempReleases, { isActiveRelease } from '../components/policies/TempReleases';
import CategoryExceptions from '../components/policies/CategoryExceptions';
import SchedulesPanel from '../components/network/SchedulesPanel';
import BlockingReleases from './BlockingReleases';

/*
 * Políticas de Acesso: quem pode acessar o quê.
 * Visão geral (ordem de decisão + quadro regra × VLAN), regras de sites, VIPs,
 * liberações temporárias, horários e ajustes avançados das VLANs.
 */

const LEGACY_TABS = { policies: 'regras', sporadic: 'temporarias', overview: 'visao' };

export default function AccessPolicies() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState({ rules: [], vlans: [], exceptions: [], sporadic: [], categoryExceptions: [], cards: null });
  const [devices, setDevices] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Endereços antigos (?tab=policies etc.) continuam funcionando.
  useEffect(() => {
    const legacy = LEGACY_TABS[params.get('tab')];
    if (legacy) {
      const next = new URLSearchParams(params);
      next.set('tab', legacy);
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const load = useCallback(async () => {
    try {
      const [rules, vlans, exceptions, sporadic, categoryExceptions] = await Promise.all([
        brGet('domain-policies'),
        brGet('vlans'),
        brGet('exceptions'),
        brGet('sporadic-exceptions'),
        brGet('category-exceptions').catch(() => []),
      ]);
      // Os números do topo (overview) são lentos: chegam depois, sem segurar a tela.
      brGet('overview')
        .then((overview) => setData((current) => ({ ...current, cards: overview?.cards || null })))
        .catch(() => undefined);
      setData((current) => ({
        ...current,
        rules: Array.isArray(rules) ? rules : [],
        vlans: Array.isArray(vlans) ? vlans : [],
        exceptions: Array.isArray(exceptions) ? exceptions : [],
        sporadic: Array.isArray(sporadic) ? sporadic : [],
        categoryExceptions: Array.isArray(categoryExceptions) ? categoryExceptions : [],
      }));
      setLoadError('');
    } catch (e) {
      setLoadError(errorMessage(e, 'Não foi possível carregar as políticas.'));
    } finally {
      setLoading(false);
    }
    // Aparelhos na rede agora (nome e MAC), para vincular VIPs e identificar IPs.
    api.get('/api/monitor/traffic')
      .then((r) => setDevices(new Map((r.data?.devices || []).map((d) => [String(d.ip), { mac: d.mac || null, hostname: d.hostname || null }]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Toda alteração passa por aqui: trava a tela, aplica, avisa e recarrega.
  const runChange = useCallback(async (fn, successMessage, { rethrow = false } = {}) => {
    setBusy(true);
    try {
      await fn();
      if (successMessage) toast(successMessage, 'success');
    } catch (e) {
      if (rethrow) throw e;
      toast(errorMessage(e, 'Não foi possível aplicar a alteração.'), 'danger');
    } finally {
      setBusy(false);
      load();
    }
  }, [load]);

  const activeVips = useMemo(() => data.exceptions.filter((v) => v.active), [data.exceptions]);
  const vipAttention = useMemo(() => activeVips.filter((v) => vipBinding(v, devices).key === 'mismatch' || reviewState(v).key === 'overdue').length, [activeVips, devices]);
  const activeReleases = useMemo(() => data.sporadic.filter((s) => isActiveRelease(s)).sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at)), [data.sporadic]);
  const enabledRules = data.rules.filter((r) => r.enabled);

  const TABS = [
    { key: 'visao', label: 'Visão geral', icon: LayoutGrid },
    { key: 'regras', label: 'Regras de sites', icon: ListChecks, count: data.rules.length },
    { key: 'vips', label: 'VIPs', icon: BadgeCheck, count: activeVips.length },
    { key: 'excecoes', label: 'Exceções por IP', icon: UserCheck, count: data.categoryExceptions.filter((e) => e.active).length || null },
    { key: 'temporarias', label: 'Liberações temporárias', icon: Timer, count: activeReleases.length || null },
    { key: 'horarios', label: 'Horários', icon: CalendarClock },
    { key: 'vlans', label: 'Ajustes das VLANs', icon: SlidersHorizontal },
  ];
  const [tab, setTab] = useUrlTab(TABS, 'visao');

  const editRule = (rule) => {
    setEditingRule({ rule });
    setTab('regras');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Políticas de Acesso"
        description="O que cada rede pode acessar, quem tem passe livre (VIP) e as liberações com prazo."
        meta={data.cards?.ultima_sincronizacao ? `Regras aplicadas na rede às ${timeBR(data.cards.ultima_sincronizacao)}` : null}
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={busy}>Atualizar</Button>
            <Button variant="primary" icon={Plus} onClick={() => { setEditingRule({ rule: null }); setTab('regras'); }} disabled={busy}>Nova regra</Button>
          </>
        )}
      />

      <KpiRow>
        <Kpi label="Regras ligadas" value={loading ? '—' : enabledRules.length} sub={`${enabledRules.filter((r) => r.policy_type === 'block').length} bloqueios · ${enabledRules.filter((r) => r.policy_type === 'allow').length} liberações`} />
        <Kpi label="Bloqueios hoje" value={data.cards?.bloqueios_hoje != null ? Number(data.cards.bloqueios_hoje).toLocaleString('pt-BR') : '—'} tone="danger" sub={data.cards?.tentativas_bloqueadas_5m != null ? `${data.cards.tentativas_bloqueadas_5m} nos últimos 5 minutos` : 'acessos barrados'} />
        <Kpi label="VIPs ativos" value={loading ? '—' : activeVips.length} tone={vipAttention ? 'warning' : 'neutral'} sub={vipAttention ? `${vipAttention} precisando de atenção` : `${activeVips.filter((v) => v.mac_address).length} vinculados ao aparelho`} />
        <Kpi label="Liberações temporárias" value={loading ? '—' : activeReleases.length} sub={activeReleases.length ? `a próxima termina às ${timeBR(activeReleases[0].expires_at)}` : 'nenhuma em vigor'} />
      </KpiRow>

      {loadError ? <Notice tone="danger" action={<Button onClick={load}>Tentar de novo</Button>}>{loadError}</Notice> : null}
      {busy ? (
        <div className="sgcg-card flex items-center gap-2 border-primary/30 px-4 py-2.5 text-[13px] font-medium text-primary" role="status">
          <Loader2 size={16} className="animate-spin" /> Aplicando na rede (DNS e firewall). Pode levar até 1 minuto; não feche a página.
        </div>
      ) : null}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {!loading && tab === 'excecoes' ? <CategoryExceptions items={data.categoryExceptions} devices={devices} runChange={runChange} busy={busy} /> : null}
      {loading && ['visao', 'regras', 'vips', 'excecoes', 'temporarias'].includes(tab) ? (
        <div className="sgcg-card flex items-center justify-center gap-2 px-4 py-12 text-sm text-on-surface/55" role="status">
          <Loader2 size={16} className="animate-spin" /> Carregando regras, VIPs e liberações...
        </div>
      ) : null}
      {!loading && tab === 'visao' ? <PolicyOverview rules={data.rules} vlans={data.vlans} runChange={runChange} busy={busy} onEdit={editRule} /> : null}
      {!loading && tab === 'regras' ? <SiteRules rules={data.rules} vlans={data.vlans} runChange={runChange} busy={busy} editing={editingRule} setEditing={setEditingRule} /> : null}
      {!loading && tab === 'vips' ? <VipList exceptions={data.exceptions} devices={devices} runChange={runChange} busy={busy} /> : null}
      {!loading && tab === 'temporarias' ? <TempReleases sporadic={data.sporadic} devices={devices} runChange={runChange} busy={busy} /> : null}
      {tab === 'horarios' ? (
        <div className="space-y-3">
          <Notice tone="primary">Horários liberam categorias em dias e horas definidos (ex.: redes sociais na hora do almoço na VLAN 30). Fora do horário, valem as regras normais.</Notice>
          <SchedulesPanel />
        </div>
      ) : null}
      {tab === 'vlans' ? (
        <div className="space-y-3">
          <Notice tone="warning" title="Ajustes avançados">Ligar ou desligar o filtro de uma VLAN, isentá-la ou mudar o modo de filtragem afeta todos os aparelhos dela. As regras de sites são feitas nas outras abas.</Notice>
          <BlockingReleases key="vlans" allowedTabs={['vlans']} initialTab="vlans" hideHeader showQuickPanels={false} />
        </div>
      ) : null}
    </div>
  );
}
