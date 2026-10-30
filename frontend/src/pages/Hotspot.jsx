import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart2, Eye, EyeOff, FileText, Pencil, Plus, RefreshCw, Search, Trash2, Users, Wifi } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Drawer, Field, Kpi, KpiRow, Notice, PageHeader, Panel, Tabs, askConfirm, errorMessage, inputCls, toast, useUrlTab } from '../components/ui/kit';
import { authMethodLabel, dateTimeBR, formatCpf, formatMac, formatPersonName, formatPhone, matchesText, sessionState } from '../components/hotspot/format';
import PortalUsage from '../components/portal/PortalUsage';
import PortalReport, { HOTSPOT_REPORT } from '../components/portal/PortalReport';

/*
 * Hotspot de visitantes (VLAN 70): cadastro de visitantes, sessões conectadas, uso e relatório oficial.
 * Quem não se cadastrou fica na página do portal; depois de entrar, segue as regras normais da VLAN 70.
 */

const LEGACY_TABS = { overview: 'visitantes', metrics: 'uso', report: 'relatorio' };
const EMPTY_VISITOR = { full_name: '', cpf: '', phone: '', mac_address: '', password: '', active: true };

function VisitorDrawer({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_VISITOR);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setShowPassword(false);
    setForm(item ? {
      full_name: item.full_name || '',
      cpf: formatCpf(item.cpf_raw || item.cpf || ''),
      phone: formatPhone(item.phone_raw || item.phone || ''),
      mac_address: item.mac_address || '',
      password: '',
      active: item.active !== false,
    } : EMPTY_VISITOR);
  }, [open, item]);
  if (!open) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const submit = () => {
    if (form.full_name.trim().length < 3) return setError('Informe o nome completo.');
    if (form.cpf.replace(/\D/g, '').length !== 11) return setError('CPF incompleto.');
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Celular incompleto (DDD + número).');
    if (!item && form.password.length < 4) return setError('Defina uma senha para o visitante.');
    setError('');
    onSubmit({ ...form, cpf: form.cpf.replace(/\D/g, ''), phone: form.phone.replace(/\D/g, '') });
  };
  return (
    <Drawer
      open={open}
      busy={saving}
      onClose={onClose}
      title={item ? 'Editar visitante' : 'Novo visitante'}
      description="Cadastro usado pelo portal do Wi-Fi de visitantes. Na edição, a senha só muda se for preenchida."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Salvando...' : item ? 'Salvar' : 'Cadastrar visitante'}</Button>
        </>
      )}
    >
      <Field id="hv-name" label="Nome completo">
        <input id="hv-name" className={inputCls} value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="hv-cpf" label="CPF">
          <input id="hv-cpf" className={`${inputCls} tabular`} inputMode="numeric" value={form.cpf} onChange={(e) => set({ cpf: formatCpf(e.target.value) })} />
        </Field>
        <Field id="hv-phone" label="Celular" hint="DDD + número com 9 dígitos.">
          <input id="hv-phone" className={`${inputCls} tabular`} inputMode="numeric" value={form.phone} onChange={(e) => set({ phone: formatPhone(e.target.value) })} />
        </Field>
        <Field id="hv-mac" label="MAC do aparelho (opcional)">
          <input id="hv-mac" className={`${inputCls} tabular`} value={form.mac_address} onChange={(e) => set({ mac_address: formatMac(e.target.value) })} placeholder="aa:bb:cc:dd:ee:ff" />
        </Field>
        <Field id="hv-pass" label={item ? 'Nova senha (opcional)' : 'Senha'}>
          <div className="relative">
            <input id="hv-pass" type={showPassword ? 'text' : 'password'} className={`${inputCls} pr-10`} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder={item ? 'Deixe em branco para manter' : ''} autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-on-surface/50 hover:bg-on-surface/5" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-on-surface/80">
        <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Cadastro ativo (pode entrar no Wi-Fi)
      </label>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Drawer>
  );
}

export default function Hotspot() {
  const [params, setParams] = useSearchParams();
  const TABS = [
    { key: 'visitantes', label: 'Visitantes', icon: Users },
    { key: 'sessoes', label: 'Sessões', icon: Wifi },
    { key: 'uso', label: 'Uso', icon: BarChart2 },
    { key: 'relatorio', label: 'Relatório', icon: FileText },
  ];
  const [tab, setTab] = useUrlTab(TABS, 'visitantes');
  const [overview, setOverview] = useState({ totals: { visitors: 0, devices: 0, active_sessions: 0 }, enforcement: null });
  const [visitors, setVisitors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [drawer, setDrawer] = useState({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ query: '', active: 'all', device: 'all' });

  // Endereços antigos (?tab=overview etc.) continuam funcionando.
  useEffect(() => {
    const legacy = LEGACY_TABS[params.get('tab')];
    if (legacy) {
      const next = new URLSearchParams(params);
      next.set('tab', legacy);
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const load = async () => {
    setLoading(true);
    try {
      const [o, v, s] = await Promise.all([api.get('/api/hotspot/overview'), api.get('/api/hotspot/visitors'), api.get('/api/hotspot/sessions')]);
      setOverview(o.data || {});
      setVisitors(v.data?.visitors || []);
      setSessions(s.data?.sessions || []);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar o Hotspot.'));
    } finally {
      setLoading(false);
    }
  };
  const loadMetrics = async () => {
    setMetricsLoading(true);
    try { setMetrics((await api.get('/api/hotspot/metrics')).data); } catch (e) { toast(errorMessage(e, 'Não foi possível carregar o uso.'), 'danger'); } finally { setMetricsLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'uso' && !metrics) loadMetrics(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, success) => {
    setBusy(true);
    try { await fn(); if (success) toast(success, 'success'); await load(); } catch (e) { toast(errorMessage(e), 'danger'); } finally { setBusy(false); }
  };

  const filtered = useMemo(() => visitors.filter((v) => {
    const devices = Number(v.devices) || 0;
    const okActive = filters.active === 'all' || (filters.active === 'active' ? v.active !== false : v.active === false);
    const okDevice = filters.device === 'all' || (filters.device === 'linked' ? Boolean(v.mac_address || devices > 0) : !v.mac_address && devices === 0);
    return okActive && okDevice && matchesText(v, filters.query, ['full_name', 'cpf', 'cpf_raw', 'phone', 'phone_raw', 'mac_address']);
  }), [visitors, filters]);

  const suggestions = useMemo(() => [...new Set(visitors.flatMap((v) => [formatPersonName(v.full_name), v.cpf, v.phone, v.mac_address]).filter(Boolean))].slice(0, 80), [visitors]);
  const activeSessions = sessions.filter((s) => s.status === 'active' && (!s.expires_at || new Date(s.expires_at).getTime() > Date.now()));

  const openEditor = async (visitor = null) => {
    if (!visitor) { setDrawer({ open: true, item: null }); return; }
    try {
      const res = await api.get(`/api/hotspot/visitors/${visitor.id}`);
      setDrawer({ open: true, item: res.data?.visitor || visitor });
    } catch (e) { toast(errorMessage(e), 'danger'); }
  };
  const saveVisitor = async (payload) => {
    setSaving(true);
    try {
      if (drawer.item?.id) await api.put(`/api/hotspot/visitors/${drawer.item.id}`, payload);
      else await api.post('/api/hotspot/visitors', payload);
      toast(drawer.item ? 'Visitante atualizado.' : 'Visitante cadastrado.', 'success');
      setDrawer({ open: false, item: null });
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível salvar o visitante.'), 'danger');
    } finally {
      setSaving(false);
    }
  };
  const deleteVisitor = async (v) => {
    if (!(await askConfirm({ title: `Excluir ${formatPersonName(v.full_name)}?`, description: 'O cadastro sai do portal e as sessões abertas dele são encerradas. O histórico continua no relatório.', confirmLabel: 'Excluir visitante', tone: 'danger' }))) return;
    await act(() => api.delete(`/api/hotspot/visitors/${v.id}`), 'Visitante excluído.');
  };
  const revoke = async (s) => {
    if (!(await askConfirm({ title: 'Desconectar esta sessão?', description: `${formatPersonName(s.full_name || 'Visitante')} (${s.client_ip || 'sem IP'}) volta para a página do portal.`, confirmLabel: 'Desconectar', tone: 'danger' }))) return;
    await act(() => api.post(`/api/hotspot/sessions/${s.id}/revoke`), 'Sessão desconectada.');
  };
  const cleanup = async () => {
    if (!(await askConfirm({ title: 'Ocultar sessões encerradas?', description: 'Tira da lista as sessões expiradas e desconectadas. Elas continuam no relatório e na auditoria.', confirmLabel: 'Ocultar' }))) return;
    await act(async () => {
      const res = await api.post('/api/hotspot/sessions/cleanup-stale');
      toast(`${res.data?.hidden_total || 0} sessão(ões) ocultada(s) da lista.`, 'success');
    });
  };
  const reconcile = () => act(() => api.post('/api/hotspot/enforcement/reconcile'), 'Portal reaplicado no firewall.');

  const enforcement = overview.enforcement || {};

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hotspot de Visitantes"
        description="Wi-Fi dos visitantes (VLAN 70): cadastro, quem está conectado, uso e o relatório oficial de acessos."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading || busy}>{loading ? 'Carregando...' : 'Atualizar'}</Button>
            <Button variant="primary" icon={Plus} onClick={() => openEditor()}>Novo visitante</Button>
          </>
        )}
      />
      <KpiRow>
        <Kpi label="Visitantes cadastrados" value={Number(overview.totals?.visitors || 0).toLocaleString('pt-BR')} />
        <Kpi label="Aparelhos associados" value={Number(overview.totals?.devices || 0).toLocaleString('pt-BR')} />
        <Kpi label="Conectados agora" value={overview.totals?.active_sessions ?? 0} tone={overview.totals?.active_sessions ? 'success' : 'neutral'} />
        <Kpi label="Liberados no portal" value={enforcement.authorized_count ?? 0} sub={`interface ${enforcement.interface || 'enp6s0.70'}`} />
      </KpiRow>
      {error ? <Notice tone="danger" action={<Button onClick={load}>Tentar de novo</Button>}>{error}</Notice> : null}
      <Tabs tabs={TABS.map((t) => (t.key === 'sessoes' ? { ...t, count: activeSessions.length || null } : t.key === 'visitantes' ? { ...t, count: visitors.length } : t))} value={tab} onChange={setTab} />

      {tab === 'visitantes' ? (
        <Panel
          title={`Visitantes (${filtered.length} de ${visitors.length})`}
          description={Number(overview.totals?.visitors || 0) > visitors.length
            ? `Mostrando os ${visitors.length} cadastros mais recentes de ${overview.totals.visitors}. Busque por nome, CPF, celular ou MAC.`
            : 'Busque por nome, CPF, celular ou MAC.'}
          padded={false}
          actions={(
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
                <input list="hotspot-suggestions" className={`${inputCls} pl-9`} value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Nome, CPF, celular ou MAC" aria-label="Buscar visitante" />
                <datalist id="hotspot-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="w-44">
                <select className={inputCls} value={filters.active} onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))} aria-label="Filtrar por situação">
                  <option value="all">Todas as situações</option>
                  <option value="active">Ativos</option>
                  <option value="inactive">Inativos</option>
                </select>
              </div>
              <div className="w-48">
                <select className={inputCls} value={filters.device} onChange={(e) => setFilters((f) => ({ ...f, device: e.target.value }))} aria-label="Filtrar por aparelho">
                  <option value="all">Com ou sem aparelho</option>
                  <option value="linked">Com aparelho</option>
                  <option value="unlinked">Sem aparelho</option>
                </select>
              </div>
            </div>
          )}
        >
          <DataTable
            rows={filtered}
            empty={loading ? 'Carregando...' : 'Nenhum visitante para esses filtros.'}
            columns={[
              { key: 'n', label: 'Visitante', render: (v) => <div><div className="font-semibold text-on-surface">{formatPersonName(v.full_name)}</div><div className="tabular text-[11.5px] text-on-surface/50">{v.cpf}</div></div> },
              { key: 'p', label: 'Celular', mono: true, render: (v) => v.phone || '—' },
              { key: 'm', label: 'MAC', mono: true, render: (v) => <span className="text-[12px]">{v.mac_address || '—'}</span> },
              { key: 'd', label: 'Aparelhos', mono: true, align: 'right', render: (v) => Number(v.devices) || 0 },
              { key: 's', label: 'Situação', render: (v) => <Badge tone={v.active ? 'success' : 'neutral'}>{v.active ? 'Ativo' : 'Inativo'}</Badge> },
              { key: 'c', label: 'Cadastro', render: (v) => <span className="tabular text-[12px] text-on-surface/60">{dateTimeBR(v.created_at)}</span> },
              {
                key: 'a', label: '', align: 'right', render: (v) => (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" icon={Pencil} onClick={() => openEditor(v)} aria-label={`Editar ${formatPersonName(v.full_name)}`} title="Editar" />
                    <Button variant="ghost" icon={Trash2} onClick={() => deleteVisitor(v)} disabled={busy} aria-label={`Excluir ${formatPersonName(v.full_name)}`} title="Excluir" className="hover:!text-danger" />
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'sessoes' ? (
        <div className="space-y-4">
          <Panel
            title="Portal de visitantes"
            description="Quem não se cadastrou fica na página do portal. Depois de entrar, o aparelho segue as mesmas regras da VLAN 70 (os filtros continuam valendo)."
            actions={<Button icon={RefreshCw} onClick={reconcile} disabled={busy} title="Reaplica no firewall a lista de aparelhos liberados">Reaplicar no firewall</Button>}
          >
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <div><dt className="text-on-surface/55">Interface</dt><dd className="tabular font-semibold">{enforcement.interface || 'enp6s0.70'}</dd></div>
              <div><dt className="text-on-surface/55">Portal (gateway)</dt><dd className="tabular font-semibold">{enforcement.gateway_ip || '192.168.70.1'}</dd></div>
              <div><dt className="text-on-surface/55">Aparelhos liberados agora</dt><dd className="tabular font-semibold">{enforcement.authorized_count ?? 0}</dd></div>
            </dl>
          </Panel>
          <Panel
            title={`Sessões recentes (${sessions.length})`}
            description={`${activeSessions.length} conectada(s) agora.`}
            actions={<Button variant="ghost" icon={Trash2} onClick={cleanup} disabled={busy}>Ocultar encerradas</Button>}
            padded={false}
          >
            <DataTable
              rows={sessions}
              empty="Nenhuma sessão registrada."
              columns={[
                { key: 'v', label: 'Visitante', render: (s) => <div><div className="font-semibold">{formatPersonName(s.full_name || 'não identificado')}</div><div className="tabular text-[11.5px] text-on-surface/50">{s.cpf || '—'}</div></div> },
                { key: 'ip', label: 'Aparelho', render: (s) => <div className="tabular text-[12px]"><div>{s.client_ip || '—'}</div><div className="text-on-surface/50">{s.mac_address || 'MAC não capturado'}</div></div> },
                { key: 'm', label: 'Entrada', render: (s) => authMethodLabel(s.auth_method) },
                { key: 'st', label: 'Situação', render: (s) => { const st = sessionState(s.status, s.expires_at); return <Badge tone={st.tone} dot={st.tone === 'success'}>{st.label}</Badge>; } },
                { key: 'e', label: 'Expira', render: (s) => <span className="tabular text-[12px]">{dateTimeBR(s.expires_at)}</span> },
                {
                  key: 'a', label: '', align: 'right', render: (s) => (s.status === 'active' && (!s.expires_at || new Date(s.expires_at).getTime() > Date.now())
                    ? <Button variant="danger-soft" onClick={() => revoke(s)} disabled={busy} aria-label={`Desconectar ${formatPersonName(s.full_name || 'visitante')}`}>Desconectar</Button>
                    : null),
                },
              ]}
            />
          </Panel>
        </div>
      ) : null}

      {tab === 'uso' ? <PortalUsage metrics={metrics} loading={metricsLoading} onRefresh={loadMetrics} /> : null}
      {tab === 'relatorio' ? <PortalReport people={visitors} config={HOTSPOT_REPORT} /> : null}

      <VisitorDrawer open={drawer.open} item={drawer.item} saving={saving} onClose={() => !saving && setDrawer({ open: false, item: null })} onSubmit={saveVisitor} />
    </div>
  );
}
