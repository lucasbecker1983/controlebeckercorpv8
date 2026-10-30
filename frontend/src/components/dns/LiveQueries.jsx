import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Filter, Plus, Radio, RefreshCw, ScrollText, Search } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Drawer, Field, Kpi, KpiRow, Notice, Panel, Switch, Tabs, errorMessage, inputCls, toast } from '../ui/kit';
import { BASE, formatDate, normalizeText } from './governance';

/*
 * Consultas ao vivo: o que a rede está acessando agora (DNS e proxy), a trilha de acessos para investigar quem
 * acessou o quê, e a trilha administrativa (mudanças feitas pelos operadores).
 */

const SUBTABS = [
  { key: 'live', label: 'Ao vivo', icon: Radio },
  { key: 'trail', label: 'Trilha de acessos', icon: Search },
  { key: 'admin', label: 'Trilha administrativa', icon: ScrollText },
];

const ACTION_LABEL = { blocked: 'Bloqueado', allowed: 'Liberado', bypassed: 'Exceção (VIP)' };
const ACTION_TONE = { blocked: 'danger', allowed: 'success', bypassed: 'warning' };
const actionLabel = (a) => ACTION_LABEL[a] || a || '—';
const actionTone = (a) => ACTION_TONE[a] || 'neutral';
const sourceLabel = (s) => (s === 'dns' ? 'DNS' : s === 'proxy' ? 'Proxy' : s || '—');

const policyScope = (p) => {
  if (p.scope_type === 'global') return 'todas as VLANs';
  const ids = (p.vlan_ids || []).filter((v) => Number.isFinite(Number(v)));
  return ids.length ? `VLAN ${ids.join(', ')}` : 'sem VLAN';
};
const mentionsAdultContent = (...values) => /pornograf|adulto|conteudo-adulto/.test(values.map(normalizeText).filter(Boolean).join(' '));

const searchParams = (search) => {
  const raw = String(search || '').trim();
  if (!raw) return {};
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return { ip: raw };
  return raw.includes('.') ? { domain: raw } : { hostname: raw };
};

function WhoCell({ item }) {
  return (
    <div className="min-w-[170px]">
      <div className="tabular font-semibold text-on-surface">{item.client_ip || 'IP não identificado'}</div>
      <div className="text-[12px] text-on-surface/55">{item.identity_display_user || item.identity_user || item.identity_computer || item.hostname || 'sem identificação'}</div>
    </div>
  );
}

function WhatCell({ item }) {
  return (
    <div className="min-w-[200px]">
      <div className="break-all font-semibold text-on-surface">{item.domain || item.url_or_host || 'domínio não identificado'}</div>
      <div className="text-[12px] text-on-surface/55">
        {item.policy_label || item.matched_policy_name || 'Sem regra: padrão permitido'}{item.category && item.category !== (item.policy_label || item.matched_policy_name) ? ` · ${item.category}` : ''}
      </div>
    </div>
  );
}

function AddToPolicyDrawer({ event, policies, vlans, saving, onClose, onSubmit }) {
  const open = Boolean(event);
  const selectable = useMemo(() => vlans.filter((v) => v.blocking_enabled !== false && v.monitoring_enabled !== false && v.exempt !== true), [vlans]);
  const [f, setF] = useState({ mode: 'existing', policy_id: '', policy_type: 'allow', name: '', vlan_ids: [], description: '' });
  const domain = event?.domain || event?.url_or_host || '';

  useEffect(() => {
    if (!event) return;
    const vlanId = Number(event.vlan_id);
    const compatible = policies.filter((p) => p.policy_type === 'allow' && p.enabled);
    setF({
      mode: compatible.length ? 'existing' : 'new',
      policy_id: compatible[0]?.id ? String(compatible[0].id) : '',
      policy_type: 'allow',
      name: domain ? `Liberar ${domain}` : 'Nova política',
      vlan_ids: Number.isFinite(vlanId) && vlanId > 0 ? [vlanId] : [],
      description: `Domínio incluído a partir da trilha de acessos${event.client_ip ? ` (IP ${event.client_ip})` : ''}.`,
    });
  }, [event, policies, domain]);

  const toggleVlan = (id) => setF((cur) => ({ ...cur, vlan_ids: cur.vlan_ids.includes(id) ? cur.vlan_ids.filter((x) => x !== id) : [...cur.vlan_ids, id].sort((a, b) => a - b) }));
  const compatiblePolicies = policies.filter((p) => p.policy_type === f.policy_type);
  const invalid = !domain || (f.mode === 'existing' && !f.policy_id) || (f.mode === 'new' && (!f.name.trim() || !f.vlan_ids.length));

  return (
    <Drawer
      open={open}
      busy={saving}
      onClose={onClose}
      width="max-w-2xl"
      title="Adicionar domínio a uma política"
      description="Trate o acesso por uma regra formal, não por exceção avulsa."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSubmit({ ...f, domain })} disabled={saving || invalid}>{saving ? 'Salvando…' : 'Salvar domínio'}</Button>
        </>
      )}
    >
      <div className="rounded-lg border border-outline px-3 py-2.5">
        <div className="text-[11.5px] text-on-surface/50">Domínio</div>
        <div className="break-all text-[15px] font-semibold text-on-surface">{domain || 'não identificado'}</div>
        <div className="mt-0.5 text-[12px] text-on-surface/55">Origem: {event?.client_ip || 'IP não identificado'}{event?.vlan_id ? ` · VLAN ${event.vlan_id}` : ''}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[['existing', 'Incluir em política existente', 'O domínio entra numa lista de liberação ou bloqueio que já existe.'], ['new', 'Criar política nova', 'Use só quando não há uma política adequada.']].map(([key, title, text]) => (
          <button key={key} type="button" aria-pressed={f.mode === key} onClick={() => setF((cur) => ({ ...cur, mode: key }))} className={`rounded-lg border p-3 text-left transition-colors ${f.mode === key ? 'border-primary bg-primary/8' : 'border-outline hover:border-primary/40'}`}>
            <div className="text-[13.5px] font-semibold text-on-surface">{title}</div>
            <div className="mt-0.5 text-[12px] leading-5 text-on-surface/60">{text}</div>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="atp-type" label="Tipo">
          <select id="atp-type" className={inputCls} value={f.policy_type} onChange={(e) => setF((cur) => ({ ...cur, policy_type: e.target.value, policy_id: '' }))}>
            <option value="allow">Liberação</option>
            <option value="block">Bloqueio</option>
          </select>
        </Field>
        {f.mode === 'existing' ? (
          <Field id="atp-policy" label="Política existente">
            <select id="atp-policy" className={inputCls} value={f.policy_id} onChange={(e) => setF((cur) => ({ ...cur, policy_id: e.target.value }))}>
              <option value="">Selecione</option>
              {compatiblePolicies.map((p) => <option key={p.id} value={p.id}>{p.name} ({policyScope(p)})</option>)}
            </select>
          </Field>
        ) : (
          <Field id="atp-name" label="Nome da política"><input id="atp-name" className={inputCls} value={f.name} onChange={(e) => setF((cur) => ({ ...cur, name: e.target.value }))} placeholder="Liberar sistema do RH" /></Field>
        )}
      </div>
      {f.mode === 'new' ? (
        <Field label="VLANs onde vale">
          <div className="flex flex-wrap gap-2">
            {selectable.map((v) => (
              <button key={v.vlan_id} type="button" aria-pressed={f.vlan_ids.includes(Number(v.vlan_id))} onClick={() => toggleVlan(Number(v.vlan_id))} className={`rounded-md border px-3 py-1.5 text-[12.5px] font-semibold ${f.vlan_ids.includes(Number(v.vlan_id)) ? 'border-primary bg-primary text-on-primary' : 'border-outline text-on-surface/70 hover:border-primary/40'}`}>VLAN {v.vlan_id}</button>
            ))}
          </div>
        </Field>
      ) : null}
      <Field id="atp-why" label="Motivo"><textarea id="atp-why" rows={3} className={inputCls} value={f.description} onChange={(e) => setF((cur) => ({ ...cur, description: e.target.value }))} /></Field>
      {f.policy_type === 'allow' ? <Notice tone="warning">Conteúdo adulto nunca pode ser liberado. O sistema recusa esse tipo de liberação.</Notice> : null}
    </Drawer>
  );
}

function FilterRow({ children }) {
  return <div className="flex flex-wrap items-end gap-2 border-b border-outline px-4 py-3">{children}</div>;
}
const selCls = `${inputCls} sm:!w-auto sm:min-w-[140px]`;

export default function LiveQueries() {
  const [sub, setSub] = useState('live');
  const [vlans, setVlans] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [attach, setAttach] = useState(null);
  const [attaching, setAttaching] = useState(false);

  // Ao vivo
  const [radar, setRadar] = useState([]);
  const [radarSearch, setRadarSearch] = useState('');
  const [radarFilters, setRadarFilters] = useState({ window: '10', action: 'all', source: 'all', vlan: 'all' });
  const [paused, setPaused] = useState(false);
  const [radarLoading, setRadarLoading] = useState(true);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Trilha de acessos
  const [trail, setTrail] = useState({ events: [], summary: {} });
  const [trailSearch, setTrailSearch] = useState('');
  const [trailFilters, setTrailFilters] = useState({ period: '24h', action: 'all', vlan: 'all', source: 'all' });
  const [trailLoading, setTrailLoading] = useState(false);

  // Administrativa
  const [admin, setAdmin] = useState([]);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);

  const deferredRadarSearch = useDeferredValue(radarSearch);
  const deferredAdminSearch = useDeferredValue(adminSearch);

  useEffect(() => {
    api.get(`${BASE}/vlans`).then((r) => setVlans(Array.isArray(r.data) ? r.data : [])).catch(() => null);
    api.get(`${BASE}/domain-policies`).then((r) => setPolicies(Array.isArray(r.data) ? r.data : [])).catch(() => null);
  }, []);

  const managedVlanIds = useMemo(() => vlans.filter((v) => v.exempt !== true).map((v) => Number(v.vlan_id)).sort((a, b) => a - b), [vlans]);

  const loadRadar = useCallback(async (silent = false) => {
    setRadarLoading(true);
    try {
      const params = new URLSearchParams({ window_minutes: radarFilters.window, limit: '220' });
      ['action', 'source', 'vlan'].forEach((k) => { if (radarFilters[k] !== 'all') params.set(k, radarFilters[k]); });
      const res = await api.get(`${BASE}/radar/realtime?${params}`);
      setRadar(res.data?.events || []);
    } catch (e) {
      if (!silent) toast(errorMessage(e, 'Não foi possível carregar as consultas.'), 'danger');
    } finally {
      setRadarLoading(false);
    }
  }, [radarFilters]);

  useEffect(() => { if (sub === 'live') loadRadar(true); }, [sub, loadRadar]);

  // Feed em tempo real: novos eventos entram no topo enquanto a aba está aberta e sem pausa.
  useEffect(() => {
    if (sub !== 'live') return undefined;
    const token = localStorage.getItem('becker_token') || '';
    const es = new EventSource(`/api/dns/radar/live?token=${encodeURIComponent(token)}`);
    es.onmessage = (event) => {
      if (pausedRef.current) return;
      try {
        const raw = JSON.parse(event.data);
        const item = {
          source: raw.source || 'dns', event_uid: `live-${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: raw.occurred_at, client_ip: raw.client_ip,
          vlan_id: raw.vlan_id, domain: raw.domain, url_or_host: raw.domain, action: raw.action, category: raw.category, matched_rule: raw.matched_rule,
          identity_user: raw.identity_user, identity_computer: raw.identity_computer, hostname: raw.identity_computer, source_detail: raw.source || 'dns',
        };
        setRadar((prev) => [item, ...prev].slice(0, 500));
      } catch { /* mensagem inválida */ }
    };
    return () => es.close();
  }, [sub]);

  const loadTrail = useCallback(async (overrides = {}) => {
    setTrailLoading(true);
    try {
      const filters = { ...trailFilters, ...(overrides.filters || {}) };
      const search = overrides.search !== undefined ? overrides.search : trailSearch;
      const params = new URLSearchParams({ period: filters.period, limit: '500' });
      ['action', 'vlan', 'source'].forEach((k) => { if (filters[k] !== 'all') params.set(k, filters[k]); });
      Object.entries(searchParams(search)).forEach(([k, v]) => params.set(k, v));
      const res = await api.get(`${BASE}/audit/events?${params}`);
      setTrail(res.data?.events ? res.data : { events: [], summary: {} });
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível carregar a trilha de acessos.'), 'danger');
    } finally {
      setTrailLoading(false);
    }
  }, [trailFilters, trailSearch]);

  useEffect(() => { if (sub === 'trail' && !trail.events.length) loadTrail(); }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAdmin = useCallback(async () => {
    setAdminLoading(true);
    try {
      const res = await api.get(`${BASE}/audit`);
      setAdmin(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível carregar a trilha administrativa.'), 'danger');
    } finally {
      setAdminLoading(false);
    }
  }, []);

  useEffect(() => { if (sub === 'admin') loadAdmin(); }, [sub, loadAdmin]);

  const exportPdf = async () => {
    try {
      const params = new URLSearchParams({ period: trailFilters.period, limit: '700' });
      ['action', 'vlan', 'source'].forEach((k) => { if (trailFilters[k] !== 'all') params.set(k, trailFilters[k]); });
      Object.entries(searchParams(trailSearch)).forEach(([k, v]) => params.set(k, v));
      const res = await api.get(`${BASE}/audit/export.pdf?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-de-acessos-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      toast('PDF gerado.');
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível gerar o PDF.'), 'danger');
    }
  };

  const investigate = (item) => {
    const search = item.client_ip || item.domain || item.url_or_host || '';
    const filters = { ...trailFilters, action: 'all', source: 'all', vlan: item.vlan_id ? String(item.vlan_id) : 'all' };
    setTrailSearch(search);
    setTrailFilters(filters);
    setSub('trail');
    loadTrail({ search, filters });
  };

  const submitAttach = async (form) => {
    setAttaching(true);
    try {
      if (form.policy_type === 'allow' && mentionsAdultContent(form.name, form.description, form.domain)) throw new Error('Conteúdo adulto nunca pode ser liberado. Use apenas política de bloqueio.');
      let applyBody = null;
      if (form.mode === 'existing') {
        const policy = policies.find((p) => String(p.id) === String(form.policy_id));
        if (!policy) throw new Error('Política não encontrada.');
        const domains = Array.from(new Set([...(policy.domains || []), form.domain]));
        await api.patch(`${BASE}/domain-policies/${policy.id}`, { name: policy.name, policy_type: policy.policy_type, scope_type: policy.scope_type, vlan_ids: policy.vlan_ids || [], domains, description: policy.description || form.description || '', enabled: policy.enabled });
        if (policy.policy_type === 'block' && policy.enabled) applyBody = { disconnect_active_sessions: true, domains, vlan_ids: policy.scope_type === 'vlan' ? (policy.vlan_ids || []) : [], lookback_minutes: 20 };
      } else {
        await api.post(`${BASE}/domain-policies`, { name: form.name.trim(), policy_type: form.policy_type, scope_type: 'vlan', vlan_ids: form.vlan_ids, domains: [form.domain], description: form.description.trim(), enabled: true });
        if (form.policy_type === 'block') applyBody = { disconnect_active_sessions: true, domains: [form.domain], vlan_ids: form.vlan_ids, lookback_minutes: 20 };
      }
      if (applyBody) await api.post(`${BASE}/apply`, applyBody);
      toast(`${form.domain} incluído na política.`);
      setAttach(null);
      api.get(`${BASE}/domain-policies`).then((r) => setPolicies(Array.isArray(r.data) ? r.data : [])).catch(() => null);
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível incluir o domínio na política.'), 'danger');
    } finally {
      setAttaching(false);
    }
  };

  const filteredRadar = useMemo(() => {
    const q = normalizeText(deferredRadarSearch);
    return radar
      .filter((r) => (radarFilters.action === 'all' || r.action === radarFilters.action)
        && (radarFilters.source === 'all' || r.source === radarFilters.source)
        && (radarFilters.vlan === 'all' || String(r.vlan_id || '') === String(radarFilters.vlan))
        && (!q || [r.client_ip, r.hostname, r.identity_user, r.identity_display_user, r.identity_computer, r.domain, r.policy_label, r.matched_policy_name, r.category].some((v) => normalizeText(v).includes(q))))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [radar, radarFilters, deferredRadarSearch]);

  const radarSummary = useMemo(() => ({
    total: filteredRadar.length,
    blocked: filteredRadar.filter((e) => e.action === 'blocked').length,
    allowed: filteredRadar.filter((e) => e.action === 'allowed').length,
    bypassed: filteredRadar.filter((e) => e.action === 'bypassed').length,
    ips: new Set(filteredRadar.map((e) => e.client_ip).filter(Boolean)).size,
  }), [filteredRadar]);

  const filteredAdmin = useMemo(() => {
    const q = normalizeText(deferredAdminSearch);
    return [...admin]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .filter((r) => !q || [r.action, r.requested_by, r.domain, r.ip, r.message].some((v) => normalizeText(v).includes(q)))
      .slice(0, 150);
  }, [admin, deferredAdminSearch]);

  const addAction = (item) => (item.action === 'blocked' && (item.domain || item.url_or_host)
    ? <Button variant="ghost" icon={Plus} onClick={() => setAttach(item)}>Liberar ou incluir…</Button> : null);

  const liveColumns = [
    { key: 'timestamp', label: 'Hora', width: '90px', render: (i) => <span className="tabular text-on-surface/70">{i.timestamp ? new Date(i.timestamp).toLocaleTimeString('pt-BR') : '—'}</span> },
    { key: 'who', label: 'Quem', render: (i) => <WhoCell item={i} /> },
    { key: 'what', label: 'O que acessou', render: (i) => <WhatCell item={i} /> },
    { key: 'vlan_id', label: 'VLAN', render: (i) => (i.vlan_id ? `VLAN ${i.vlan_id}` : '—') },
    { key: 'action', label: 'Decisão', render: (i) => <Badge tone={actionTone(i.action)} dot>{actionLabel(i.action)}</Badge> },
    { key: 'source', label: 'Origem', render: (i) => sourceLabel(i.source) },
    { key: 'actions', label: '', align: 'right', render: (i) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" icon={Search} onClick={() => investigate(i)}>Investigar</Button>
        {addAction(i)}
      </div>
    ) },
  ];

  const trailColumns = [
    { key: 'timestamp', label: 'Quando', width: '150px', render: (i) => <span className="tabular text-on-surface/70">{formatDate(i.timestamp)}</span> },
    { key: 'who', label: 'Quem', render: (i) => <WhoCell item={i} /> },
    { key: 'what', label: 'O que acessou', render: (i) => <WhatCell item={i} /> },
    { key: 'vlan_id', label: 'VLAN', render: (i) => (i.vlan_id ? `VLAN ${i.vlan_id}` : '—') },
    { key: 'action', label: 'Decisão', render: (i) => <Badge tone={actionTone(i.action)} dot>{actionLabel(i.action)}</Badge> },
    { key: 'duration', label: 'Tempo no domínio', render: (i) => <span className="text-on-surface/60">{i.duration_on_domain || 'indisponível'}{i.duration_confidence === 'estimated' ? ' (estimado)' : ''}</span> },
    { key: 'actions', label: '', align: 'right', render: (i) => (
      <div className="flex justify-end gap-1">
        {i.domain ? <Button variant="ghost" icon={Search} onClick={() => { setTrailSearch(i.domain); loadTrail({ search: i.domain, filters: { action: 'all' } }); }}>Ver domínio</Button> : null}
        {addAction(i)}
      </div>
    ) },
  ];

  const adminColumns = [
    { key: 'created_at', label: 'Quando', width: '150px', render: (i) => <span className="tabular text-on-surface/70">{formatDate(i.created_at)}</span> },
    { key: 'action', label: 'Ação', render: (i) => <span className="font-semibold">{i.action || 'Evento'}</span> },
    { key: 'message', label: 'Detalhe', render: (i) => (
      <div className="min-w-[220px]">
        <div className="text-on-surface/80">{i.message || 'Sem mensagem complementar.'}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-on-surface/50">
          {i.domain ? <span>Domínio {i.domain}</span> : null}{i.ip ? <span>IP {i.ip}</span> : null}{i.vlan_id ? <span>VLAN {i.vlan_id}</span> : null}
        </div>
      </div>
    ) },
    { key: 'requested_by', label: 'Operador', render: (i) => i.requested_by || '—' },
    { key: 'success', label: 'Resultado', render: (i) => <Badge tone={i.success ? 'success' : 'danger'} dot>{i.success ? 'Sucesso' : 'Falha'}</Badge> },
  ];

  const vlanOptions = managedVlanIds.map((id) => <option key={id} value={id}>VLAN {id}</option>);
  const sum = trail.summary || {};

  return (
    <div className="space-y-4">
      <AddToPolicyDrawer event={attach} policies={policies} vlans={vlans} saving={attaching} onClose={() => setAttach(null)} onSubmit={submitAttach} />
      <Tabs tabs={SUBTABS} value={sub} onChange={setSub} />

      {sub === 'live' ? (
        <>
          <KpiRow>
            <Kpi label="Consultas na tela" value={radarSummary.total} sub={`Últimos ${radarFilters.window} min · ${radarSummary.ips} IPs`} />
            <Kpi label="Bloqueadas" value={radarSummary.blocked} tone={radarSummary.blocked ? 'danger' : 'neutral'} />
            <Kpi label="Liberadas" value={radarSummary.allowed} tone="success" />
            <Kpi label="Exceções (VIP)" value={radarSummary.bypassed} tone={radarSummary.bypassed ? 'warning' : 'neutral'} />
          </KpiRow>
          <Panel
            title="O que a rede está acessando"
            description="Eventos de DNS e proxy. Novos acessos entram no topo sozinhos; use Pausar para ler sem a lista mexer."
            actions={(
              <>
                <span className="inline-flex items-center gap-2 text-[12.5px] text-on-surface/70">Pausar<Switch checked={paused} onChange={setPaused} label="Pausar a atualização ao vivo" /></span>
                <Button icon={RefreshCw} onClick={() => loadRadar(false)} disabled={radarLoading}>{radarLoading ? 'Atualizando…' : 'Atualizar'}</Button>
              </>
            )}
            padded={false}
          >
            <FilterRow>
              <div className="relative min-w-[220px] flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
                <input aria-label="Buscar nas consultas" className={`${inputCls} pl-9`} value={radarSearch} onChange={(e) => setRadarSearch(e.target.value)} placeholder="IP, nome do aparelho, domínio ou política" />
              </div>
              <select aria-label="Janela de tempo" className={selCls} value={radarFilters.window} onChange={(e) => setRadarFilters((f) => ({ ...f, window: e.target.value }))}>
                {['5', '10', '30', '60'].map((m) => <option key={m} value={m}>Últimos {m} min</option>)}
              </select>
              <select aria-label="Filtrar por decisão" className={selCls} value={radarFilters.action} onChange={(e) => setRadarFilters((f) => ({ ...f, action: e.target.value }))}>
                <option value="all">Todas as decisões</option><option value="blocked">Bloqueadas</option><option value="allowed">Liberadas</option><option value="bypassed">Exceções (VIP)</option>
              </select>
              <select aria-label="Filtrar por origem" className={selCls} value={radarFilters.source} onChange={(e) => setRadarFilters((f) => ({ ...f, source: e.target.value }))}>
                <option value="all">DNS e proxy</option><option value="dns">DNS</option><option value="proxy">Proxy</option>
              </select>
              <select aria-label="Filtrar por VLAN" className={selCls} value={radarFilters.vlan} onChange={(e) => setRadarFilters((f) => ({ ...f, vlan: e.target.value }))}>
                <option value="all">Todas as VLANs</option>{vlanOptions}
              </select>
            </FilterRow>
            <DataTable columns={liveColumns} rows={filteredRadar.slice(0, 200)} rowKey={(i) => i.event_uid || `${i.source}-${i.id}-${i.timestamp}`} empty={radarLoading ? 'Carregando…' : 'Sem eventos neste intervalo. Aumente a janela, ajuste os filtros ou aguarde novos acessos.'} />
          </Panel>
        </>
      ) : null}

      {sub === 'trail' ? (
        <>
          <KpiRow>
            <Kpi label="Eventos auditados" value={Number(sum.total || trail.events.length).toLocaleString('pt-BR')} sub={`Período: ${trailFilters.period}`} />
            <Kpi label="Bloqueados" value={Number(sum.blocked || 0).toLocaleString('pt-BR')} tone={sum.blocked ? 'danger' : 'neutral'} />
            <Kpi label="Liberados" value={Number(sum.allowed || 0).toLocaleString('pt-BR')} tone="success" />
            <Kpi label="Exceções (VIP)" value={Number(sum.bypassed || 0).toLocaleString('pt-BR')} tone={sum.bypassed ? 'warning' : 'neutral'} />
          </KpiRow>
          <Panel
            title="Quem acessou o quê"
            description="Busque por IP, nome do aparelho ou domínio e veja a decisão e a política aplicada. Serve de evidência para auditoria."
            actions={(
              <>
                <Button icon={Download} onClick={exportPdf}>Exportar PDF</Button>
                <Button variant="primary" icon={Filter} onClick={() => loadTrail()} disabled={trailLoading}>{trailLoading ? 'Buscando…' : 'Aplicar filtros'}</Button>
              </>
            )}
            padded={false}
          >
            <FilterRow>
              <div className="relative min-w-[240px] flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
                <input aria-label="Buscar na trilha" className={`${inputCls} pl-9`} value={trailSearch} onChange={(e) => setTrailSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') loadTrail(); }} placeholder="IP, nome do aparelho ou domínio" />
              </div>
              <select aria-label="Período" className={selCls} value={trailFilters.period} onChange={(e) => setTrailFilters((f) => ({ ...f, period: e.target.value }))}>
                <option value="24h">24 horas</option><option value="7d">7 dias</option><option value="30d">30 dias</option><option value="90d">90 dias</option>
              </select>
              <select aria-label="Decisão" className={selCls} value={trailFilters.action} onChange={(e) => setTrailFilters((f) => ({ ...f, action: e.target.value }))}>
                <option value="all">Todas as decisões</option><option value="blocked">Bloqueadas</option><option value="allowed">Liberadas</option><option value="bypassed">Exceções (VIP)</option>
              </select>
              <select aria-label="VLAN" className={selCls} value={trailFilters.vlan} onChange={(e) => setTrailFilters((f) => ({ ...f, vlan: e.target.value }))}>
                <option value="all">Todas as VLANs</option>{vlanOptions}
              </select>
              <select aria-label="Origem" className={selCls} value={trailFilters.source} onChange={(e) => setTrailFilters((f) => ({ ...f, source: e.target.value }))}>
                <option value="all">DNS e proxy</option><option value="dns">DNS</option><option value="proxy">Proxy</option>
              </select>
            </FilterRow>
            <DataTable columns={trailColumns} rows={trail.events.slice(0, 300)} rowKey={(i) => `${i.source}-${i.id}-${i.timestamp}`} empty={trailLoading ? 'Buscando…' : 'Nenhum evento localizado. Busque por IP, aparelho ou domínio, ajuste o período e aplique os filtros.'} />
          </Panel>
        </>
      ) : null}

      {sub === 'admin' ? (
        <Panel
          title="Trilha administrativa"
          description="Mudanças feitas por operadores: políticas, aplicar, desfazer e outras ações administrativas."
          actions={<Button icon={RefreshCw} onClick={loadAdmin} disabled={adminLoading}>{adminLoading ? 'Atualizando…' : 'Atualizar'}</Button>}
          padded={false}
        >
          <FilterRow>
            <div className="relative min-w-[240px] max-w-md flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input aria-label="Buscar na trilha administrativa" className={`${inputCls} pl-9`} value={adminSearch} onChange={(e) => setAdminSearch(e.target.value)} placeholder="Ação, operador, domínio ou IP" />
            </div>
          </FilterRow>
          <DataTable columns={adminColumns} rows={filteredAdmin} rowKey={(i) => `${i.created_at}-${i.action}-${i.requested_by}`} empty={adminLoading ? 'Carregando…' : 'Nenhum evento administrativo neste filtro.'} />
        </Panel>
      ) : null}
    </div>
  );
}
