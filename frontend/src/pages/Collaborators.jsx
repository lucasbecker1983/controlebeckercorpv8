import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart2, Eye, EyeOff, FileText, Pencil, Plus, RefreshCw, Search, UserX, Users, Wifi } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Drawer, Field, Kpi, KpiRow, Notice, PageHeader, Panel, Switch, Tabs, askConfirm, errorMessage, inputCls, toast, useUrlTab } from '../components/ui/kit';
import { authMethodLabel, dateTimeBR, formatPersonName, matchesText } from '../components/hotspot/format';
import PortalUsage from '../components/portal/PortalUsage';
import PortalReport, { COLLAB_REPORT } from '../components/portal/PortalReport';

/*
 * Colaboradores (VLAN 30, celulares da equipe): contas de acesso, quem está conectado, uso e relatório oficial.
 * Com "Exigir login" ligado, o celular só navega depois de entrar no portal; desligado, segue só as regras de DNS e ACL.
 */

const LEGACY_TABS = { overview: 'contas', metrics: 'uso', report: 'relatorio' };
const EMPTY_USER = { username: '', password: '', full_name: '', department: '', position: '', active: true };

const USAGE_CONFIG = {
  uniqueField: 'unique_users',
  people: 'Colaboradores',
  personSub: (u) => [u.username, u.department].filter(Boolean).join(' · ') || '—',
  personKey: (u) => `${u.username}-${u.full_name}`,
  methodLabel: (m) => (m === 'usuario_senha' ? 'Usuário e senha' : authMethodLabel(m)),
  sitesDescription: 'Celulares dos colaboradores (VLAN 30), últimos 30 dias.',
  emptySites: 'Nenhuma consulta registrada para a VLAN 30 no período.',
};

function UserDrawer({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(EMPTY_USER);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setShowPassword(false);
    setForm(item ? {
      username: item.username || '',
      password: '',
      full_name: item.full_name || '',
      department: item.department || '',
      position: item.position || '',
      active: item.active !== false,
    } : EMPTY_USER);
  }, [open, item]);
  if (!open) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const submit = () => {
    const username = form.username.trim().toLowerCase();
    if (!item && !/^[a-z0-9._-]{3,}$/.test(username)) return setError('Usuário: pelo menos 3 letras ou números, sem espaços.');
    if (form.full_name.trim().length < 3) return setError('Informe o nome completo.');
    if ((!item || form.password) && form.password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    setError('');
    const payload = { full_name: form.full_name.trim(), department: form.department.trim(), position: form.position.trim() };
    if (!item) Object.assign(payload, { username, password: form.password });
    else {
      payload.active = form.active;
      if (form.password) payload.password = form.password;
    }
    onSubmit(payload);
  };
  return (
    <Drawer
      open={open}
      busy={saving}
      onClose={onClose}
      title={item ? 'Editar colaborador' : 'Novo colaborador'}
      description="Conta usada no portal do Wi-Fi dos celulares (VLAN 30). Na edição, a senha só muda se for preenchida."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Salvando...' : item ? 'Salvar' : 'Criar conta'}</Button>
        </>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cu-user" label="Usuário" hint={item ? 'O usuário não pode ser trocado.' : 'Minúsculas, sem espaços. Ex.: maria.silva'}>
          <input id="cu-user" className={`${inputCls} tabular`} value={form.username} onChange={(e) => set({ username: e.target.value.toLowerCase().replace(/\s/g, '') })} disabled={Boolean(item)} autoComplete="off" />
        </Field>
        <Field id="cu-pass" label={item ? 'Nova senha (opcional)' : 'Senha'} hint="Pelo menos 6 caracteres.">
          <div className="relative">
            <input id="cu-pass" type={showPassword ? 'text' : 'password'} className={`${inputCls} pr-10`} value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder={item ? 'Deixe em branco para manter' : ''} autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-on-surface/50 hover:bg-on-surface/5" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>
      </div>
      <Field id="cu-name" label="Nome completo">
        <input id="cu-name" className={inputCls} value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cu-dep" label="Departamento (opcional)">
          <input id="cu-dep" className={inputCls} value={form.department} onChange={(e) => set({ department: e.target.value })} />
        </Field>
        <Field id="cu-pos" label="Cargo ou função (opcional)">
          <input id="cu-pos" className={inputCls} value={form.position} onChange={(e) => set({ position: e.target.value })} />
        </Field>
      </div>
      {item ? (
        <label className="flex items-center gap-2 text-[13px] text-on-surface/80">
          <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Conta ativa (desmarcar desconecta os celulares dela)
        </label>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Drawer>
  );
}

export default function Collaborators() {
  const [params, setParams] = useSearchParams();
  const TABS = [
    { key: 'contas', label: 'Contas', icon: Users },
    { key: 'sessoes', label: 'Conectados', icon: Wifi },
    { key: 'uso', label: 'Uso', icon: BarChart2 },
    { key: 'relatorio', label: 'Relatório', icon: FileText },
  ];
  const [tab, setTab] = useUrlTab(TABS, 'contas');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [drawer, setDrawer] = useState({ open: false, item: null });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ query: '', active: 'all', department: 'all' });

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
      const [o, u, s] = await Promise.all([api.get('/api/collaborators/overview'), api.get('/api/collaborators/users'), api.get('/api/collaborators/sessions')]);
      setOverview(o.data || {});
      setUsers(Array.isArray(u.data) ? u.data : []);
      setSessions(Array.isArray(s.data) ? s.data : []);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar os colaboradores.'));
    } finally {
      setLoading(false);
    }
  };
  const loadMetrics = async () => {
    setMetricsLoading(true);
    try { setMetrics((await api.get('/api/collaborators/metrics')).data); } catch (e) { toast(errorMessage(e, 'Não foi possível carregar o uso.'), 'danger'); } finally { setMetricsLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'uso' && !metrics) loadMetrics(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, success) => {
    setBusy(true);
    try { await fn(); if (success) toast(success, 'success'); await load(); } catch (e) { toast(errorMessage(e), 'danger'); } finally { setBusy(false); }
  };

  const departments = useMemo(() => [...new Set(users.map((u) => String(u.department || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [users]);
  const suggestions = useMemo(() => [...new Set(users.flatMap((u) => [u.full_name, u.username, u.department, u.position]).filter(Boolean))].slice(0, 80), [users]);
  const filtered = useMemo(() => users.filter((u) => {
    const okActive = filters.active === 'all' || (filters.active === 'active' ? u.active !== false : u.active === false);
    const okDep = filters.department === 'all' || String(u.department || '').trim() === filters.department;
    return okActive && okDep && matchesText(u, filters.query, ['full_name', 'username', 'department', 'position']);
  }), [users, filters]);

  const saveUser = async (payload) => {
    setSaving(true);
    try {
      if (drawer.item?.id) await api.put(`/api/collaborators/users/${drawer.item.id}`, payload);
      else await api.post('/api/collaborators/users', payload);
      toast(drawer.item ? 'Colaborador atualizado.' : 'Conta criada.', 'success');
      setDrawer({ open: false, item: null });
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível salvar o colaborador.'), 'danger');
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async (u) => {
    if (!(await askConfirm({ title: `Inativar ${formatPersonName(u.full_name)}?`, description: 'A conta deixa de entrar no portal e os celulares conectados com ela são desconectados. O histórico continua no relatório.', confirmLabel: 'Inativar conta', tone: 'danger' }))) return;
    await act(() => api.delete(`/api/collaborators/users/${u.id}`), 'Conta inativada.');
  };
  const revoke = async (s) => {
    if (!(await askConfirm({ title: 'Desconectar este celular?', description: `${formatPersonName(s.full_name || s.username || 'Colaborador')} (${s.client_ip || 'sem IP'}) volta para a página de login do portal.`, confirmLabel: 'Desconectar', tone: 'danger' }))) return;
    await act(() => api.post(`/api/collaborators/sessions/${s.id}/revoke`), 'Celular desconectado.');
  };
  const authRequired = overview?.settings?.auth_required !== false;
  const toggleLogin = async (next) => {
    const ok = await askConfirm(next
      ? { title: 'Exigir login na VLAN 30?', description: 'Celulares que ainda não entraram no portal ficam sem internet até fazer login com usuário e senha.', confirmLabel: 'Exigir login' }
      : { title: 'Liberar a VLAN 30 sem login?', description: 'Os celulares navegam sem passar pelo portal. Os bloqueios de DNS e ACL continuam valendo, mas o relatório deixa de saber quem é quem.', confirmLabel: 'Liberar sem login', tone: 'danger' });
    if (!ok) return;
    await act(() => api.put('/api/collaborators/settings/access-mode', { auth_required: next }), next ? 'Login obrigatório ligado.' : 'Login obrigatório desligado.');
  };
  const reapply = () => act(async () => {
    const res = await api.post('/api/collaborators/enforcement/setup');
    const failed = Object.entries(res.data?.results || {}).filter(([, v]) => v !== 'ok');
    if (failed.length) throw new Error(`Falhou: ${failed.map(([k, v]) => `${k} (${v})`).join('; ')}`);
    toast('Portal reaplicado (página de login e firewall).', 'success');
  });

  const ov = overview || {};

  return (
    <div className="space-y-4">
      <PageHeader
        title="Colaboradores"
        description="Wi-Fi dos celulares da equipe (VLAN 30): contas de acesso, quem está conectado, uso e o relatório oficial."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading || busy}>{loading ? 'Carregando...' : 'Atualizar'}</Button>
            <Button variant="primary" icon={Plus} onClick={() => setDrawer({ open: true, item: null })}>Novo colaborador</Button>
          </>
        )}
      />
      <KpiRow>
        <Kpi label="Contas ativas" value={ov.users?.active ?? '—'} sub={`${ov.users?.total ?? 0} cadastradas`} />
        <Kpi label="Conectados agora" value={ov.sessions?.active ?? '—'} tone={ov.sessions?.active ? 'success' : 'neutral'} />
        <Kpi label="Liberados no portal" value={ov.enforcement?.authorized_count ?? '—'} sub={ov.enforcement?.session_hours ? `sessão de ${ov.enforcement.session_hours} h` : undefined} />
        <Kpi label="Login" value={overview ? (authRequired ? 'Obrigatório' : 'Desligado') : '—'} tone={overview ? (authRequired ? 'success' : 'warning') : 'neutral'} />
      </KpiRow>
      {error ? <Notice tone="danger" action={<Button onClick={load}>Tentar de novo</Button>}>{error}</Notice> : null}

      <Panel
        className="[&>div:first-child]:border-b-0"
        padded={false}
        title="Portal de login da VLAN 30"
        description={authRequired
          ? 'Ligado: o celular só navega depois de entrar com usuário e senha. Cada acesso fica no relatório com o nome do colaborador.'
          : 'Desligado: os celulares navegam sem login. Os bloqueios de DNS e ACL continuam valendo, mas o relatório não identifica a pessoa.'}
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-on-surface">
              <Switch checked={authRequired} onChange={toggleLogin} disabled={!overview || busy} label="Exigir login" />
              Exigir login
            </label>
            <Button icon={RefreshCw} onClick={reapply} disabled={busy} title="Regrava a página de login e reaplica no firewall a lista de celulares liberados">Reaplicar portal</Button>
          </div>
        )}
      />

      <Tabs tabs={TABS.map((t) => (t.key === 'sessoes' ? { ...t, count: sessions.length || null } : t.key === 'contas' ? { ...t, count: users.length } : t))} value={tab} onChange={setTab} />

      {tab === 'contas' ? (
        <Panel
          title={`Contas (${filtered.length} de ${users.length})`}
          description="Busque por nome, usuário, departamento ou cargo."
          padded={false}
          actions={(
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
                <input list="collab-suggestions" className={`${inputCls} pl-9`} value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Buscar colaborador" aria-label="Buscar colaborador" />
                <datalist id="collab-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="w-44">
                <select className={inputCls} value={filters.active} onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))} aria-label="Filtrar por situação">
                  <option value="all">Todas as situações</option>
                  <option value="active">Ativas</option>
                  <option value="inactive">Inativas</option>
                </select>
              </div>
              <div className="w-56">
                <select className={inputCls} value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} aria-label="Filtrar por departamento">
                  <option value="all">Todos os departamentos</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}
        >
          <DataTable
            rows={filtered}
            empty={loading ? 'Carregando...' : users.length ? 'Nenhuma conta para esses filtros.' : 'Nenhuma conta cadastrada. Use "Novo colaborador".'}
            columns={[
              { key: 'n', label: 'Colaborador', render: (u) => <div><div className="font-semibold text-on-surface">{formatPersonName(u.full_name)}</div>{u.position ? <div className="text-[11.5px] text-on-surface/50">{u.position}</div> : null}</div> },
              { key: 'u', label: 'Usuário', mono: true, render: (u) => u.username },
              { key: 'd', label: 'Departamento', render: (u) => u.department || '—' },
              { key: 's', label: 'Situação', render: (u) => <Badge tone={u.active ? 'success' : 'neutral'}>{u.active ? 'Ativa' : 'Inativa'}</Badge> },
              { key: 'c', label: 'Criada em', render: (u) => <span className="tabular text-[12px] text-on-surface/60">{dateTimeBR(u.created_at)}</span> },
              {
                key: 'a', label: '', align: 'right', render: (u) => (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" icon={Pencil} onClick={() => setDrawer({ open: true, item: u })} aria-label={`Editar ${formatPersonName(u.full_name)}`} title="Editar" />
                    <Button variant="ghost" icon={UserX} onClick={() => deactivate(u)} disabled={busy || !u.active} aria-label={`Inativar ${formatPersonName(u.full_name)}`} title={u.active ? 'Inativar' : 'Já inativa'} className="hover:!text-danger" />
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'sessoes' ? (
        <Panel title={`Conectados agora (${sessions.length})`} description="Celulares com sessão aberta no portal. Desconectar faz o celular voltar para a página de login." padded={false}>
          <DataTable
            rows={sessions}
            empty={loading ? 'Carregando...' : authRequired ? 'Nenhum celular conectado agora.' : 'Com o login desligado, os celulares navegam sem abrir sessão.'}
            columns={[
              { key: 'v', label: 'Colaborador', render: (s) => <div><div className="font-semibold">{formatPersonName(s.full_name || s.username || 'não identificado')}</div><div className="text-[11.5px] text-on-surface/50">{[s.username, s.department].filter(Boolean).join(' · ') || '—'}</div></div> },
              { key: 'ip', label: 'Celular', render: (s) => <div className="tabular text-[12px]"><div>{s.client_ip || '—'}</div><div className="text-on-surface/50">{s.mac_address || 'MAC não capturado'}</div></div> },
              { key: 'i', label: 'Entrou', render: (s) => <span className="tabular text-[12px]">{dateTimeBR(s.started_at)}</span> },
              { key: 'e', label: 'Expira', render: (s) => <span className="tabular text-[12px]">{dateTimeBR(s.expires_at)}</span> },
              { key: 'a', label: '', align: 'right', render: (s) => <Button variant="danger-soft" onClick={() => revoke(s)} disabled={busy} aria-label={`Desconectar ${formatPersonName(s.full_name || s.username || 'colaborador')}`}>Desconectar</Button> },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'uso' ? <PortalUsage metrics={metrics} loading={metricsLoading} onRefresh={loadMetrics} config={USAGE_CONFIG} /> : null}
      {tab === 'relatorio' ? <PortalReport people={users} config={COLLAB_REPORT} /> : null}

      <UserDrawer open={drawer.open} item={drawer.item} saving={saving} onClose={() => !saving && setDrawer({ open: false, item: null })} onSubmit={saveUser} />
    </div>
  );
}
