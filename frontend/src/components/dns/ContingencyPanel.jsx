import { useCallback, useEffect, useState } from 'react';
import { Clock3, Flame, Network, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Drawer, Field, Kpi, KpiRow, Notice, Panel, askConfirm, errorMessage, inputCls, toast } from '../ui/kit';
import { BASE, buildGovernanceText, formatDate, formatRemaining, parseGovernanceText } from './governance';

/*
 * Contingência DNS: libera temporariamente resolvedores públicos quando o Unbound está degradado. Fica registrada
 * com motivo, escopo e prazo, e toda ativação, renovação e retorno ao normal vai para a auditoria.
 */

const PROVIDERS = [
  { key: 'google', label: 'Google DNS' },
  { key: 'cloudflare', label: 'Cloudflare' },
  { key: 'quad9', label: 'Quad9' },
  { key: 'opendns', label: 'OpenDNS' },
];
const DURATIONS = [{ value: '15', label: '15 minutos' }, { value: '30', label: '30 minutos' }, { value: '60', label: '60 minutos' }, { value: 'manual', label: 'Manual (sem prazo)' }];
const LIFECYCLE = ['Em análise', 'Aprovado', 'Em vigor', 'Em revisão', 'Revogado', 'Expirado'];
const EMPTY = { scope_type: 'global', vlan_ids: [], providers: PROVIDERS.map((p) => p.key), duration_minutes: '15', reason: '', legal_basis: '', requested_by: '', approval_scope: '', lifecycle_status: '', review_date: '' };

function Chip({ on, danger, onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-md border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${on ? (danger ? 'border-danger bg-danger text-white' : 'border-primary bg-primary text-on-primary') : 'border-outline text-on-surface/70 hover:border-primary/40'}`}>
      {children}
    </button>
  );
}

function ContingencyDrawer({ open, mode, vlans, saving, onClose, onSubmit }) {
  const [f, setF] = useState(EMPTY);
  useEffect(() => { if (open) setF(EMPTY); }, [open, mode]);
  const renew = mode === 'renew';
  const toggle = (key, value) => setF((cur) => ({ ...cur, [key]: cur[key].includes(value) ? cur[key].filter((x) => x !== value) : [...cur[key], value] }));
  const set = (key) => (e) => setF((cur) => ({ ...cur, [key]: e.target.value }));
  const invalid = !f.reason.trim() || (!renew && !f.providers.length) || (!renew && f.scope_type === 'vlan' && !f.vlan_ids.length);
  const submit = () => onSubmit({
    ...f,
    reason: buildGovernanceText(f.reason, {
      'Base legal': f.legal_basis,
      Solicitante: f.requested_by,
      'Alcada de aprovacao': f.approval_scope,
      'Status institucional': f.lifecycle_status,
      'Revisao prevista': f.review_date,
    }),
  });
  return (
    <Drawer
      open={open}
      busy={saving}
      onClose={onClose}
      width="max-w-2xl"
      title={renew ? 'Renovar contingência DNS' : 'Ativar contingência DNS'}
      description={renew ? 'Estende o prazo mantendo o registro de auditoria.' : 'Libera resolvedores públicos temporariamente. Use quando o Unbound estiver degradado.'}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant={renew ? 'primary' : 'danger'} onClick={submit} disabled={saving || invalid}>{saving ? 'Processando…' : renew ? 'Renovar' : 'Ativar contingência'}</Button>
        </>
      )}
    >
      {!renew ? (
        <Notice tone="warning" title="Atenção">Durante a contingência, os aparelhos da rede passam a poder usar DNS público e os bloqueios por DNS deixam de valer no escopo escolhido.</Notice>
      ) : null}
      {!renew ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cont-scope" label="Escopo">
            <select id="cont-scope" className={inputCls} value={f.scope_type} onChange={(e) => setF((cur) => ({ ...cur, scope_type: e.target.value, vlan_ids: [] }))}>
              <option value="global">Todas as VLANs</option>
              <option value="vlan">Somente VLANs específicas</option>
            </select>
          </Field>
          <Field id="cont-duration" label="Duração">
            <select id="cont-duration" className={inputCls} value={f.duration_minutes} onChange={set('duration_minutes')}>{DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
          </Field>
        </div>
      ) : (
        <Field id="cont-duration" label="Novo prazo">
          <select id="cont-duration" className={inputCls} value={f.duration_minutes} onChange={set('duration_minutes')}>{DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        </Field>
      )}
      {!renew && f.scope_type === 'vlan' ? (
        <Field label="VLANs afetadas">
          <div className="flex flex-wrap gap-2">{vlans.map((v) => <Chip key={v.vlan_id} on={f.vlan_ids.includes(v.vlan_id)} onClick={() => toggle('vlan_ids', v.vlan_id)}>VLAN {v.vlan_id}</Chip>)}</div>
        </Field>
      ) : null}
      {!renew ? (
        <Field label="Resolvedores públicos autorizados">
          <div className="flex flex-wrap gap-2">{PROVIDERS.map((p) => <Chip key={p.key} danger on={f.providers.includes(p.key)} onClick={() => toggle('providers', p.key)}>{p.label}</Chip>)}</div>
        </Field>
      ) : null}
      <Field id="cont-reason" label="Motivo *" hint="Fica registrado na auditoria.">
        <textarea id="cont-reason" rows={3} className={inputCls} value={f.reason} onChange={set('reason')} placeholder="Explique por que a contingência precisa ficar ativa." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cont-legal" label="Base legal ou diretriz"><input id="cont-legal" className={inputCls} value={f.legal_basis} onChange={set('legal_basis')} /></Field>
        <Field id="cont-by" label="Solicitante"><input id="cont-by" className={inputCls} value={f.requested_by} onChange={set('requested_by')} placeholder="Gestão ou unidade responsável" /></Field>
        <Field id="cont-approval" label="Alçada de aprovação"><input id="cont-approval" className={inputCls} value={f.approval_scope} onChange={set('approval_scope')} placeholder="Diretoria, comitê…" /></Field>
        <Field id="cont-status" label="Status institucional">
          <select id="cont-status" className={inputCls} value={f.lifecycle_status} onChange={set('lifecycle_status')}><option value="">Não definido</option>{LIFECYCLE.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field id="cont-review" label="Revisão prevista"><input id="cont-review" type="date" className={inputCls} value={f.review_date} onChange={set('review_date')} /></Field>
      </div>
    </Drawer>
  );
}

export default function ContingencyPanel() {
  const [contingency, setContingency] = useState(null);
  const [audit, setAudit] = useState([]);
  const [vlans, setVlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState({ open: false, mode: 'activate' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [c, a, v] = await Promise.allSettled([
      api.get(`${BASE}/contingency/status`),
      api.get(`${BASE}/contingency/audit`),
      api.get(`${BASE}/vlans`),
    ]);
    if (c.status === 'fulfilled') setContingency(c.value.data);
    if (a.status === 'fulfilled') setAudit(Array.isArray(a.value.data) ? a.value.data : []);
    if (v.status === 'fulfilled') setVlans(Array.isArray(v.value.data) ? v.value.data : []);
    setError(c.status === 'rejected' ? errorMessage(c.reason, 'Não foi possível ler o estado da contingência.') : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = contingency?.status === 'active';
  const scopeText = contingency?.scope_type === 'vlan' ? `VLAN ${(contingency?.vlan_ids || []).join(', ')}` : 'Todas as VLANs';

  const submit = async (form) => {
    setSaving(true);
    try {
      const duration = form.duration_minutes === 'manual' ? 'manual' : Number(form.duration_minutes);
      if (drawer.mode === 'renew') await api.post(`${BASE}/contingency/renew`, { duration_minutes: duration, reason: form.reason });
      else await api.post(`${BASE}/contingency/activate`, { scope_type: form.scope_type, vlan_ids: form.scope_type === 'vlan' ? form.vlan_ids : [], providers: form.providers, duration_minutes: duration, reason: form.reason });
      toast(drawer.mode === 'renew' ? 'Contingência renovada.' : 'Contingência DNS ativada.');
      setDrawer({ open: false, mode: 'activate' });
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível processar a contingência.'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!(await askConfirm({ title: 'Desativar a contingência DNS', description: 'Os aparelhos voltam a usar só o DNS interno e os bloqueios por DNS voltam a valer.', confirmLabel: 'Desativar', tone: 'danger' }))) return;
    try {
      await api.post(`${BASE}/contingency/deactivate`, { reason: 'Desativação manual pela tela DNS & Proxy' });
      toast('Contingência DNS desativada.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível desativar a contingência.'), 'danger');
    }
  };

  const columns = [
    { key: 'created_at', label: 'Quando', width: '150px', render: (i) => <span className="tabular text-on-surface/70">{formatDate(i.created_at)}</span> },
    { key: 'action', label: 'Ação', render: (i) => <span className="font-semibold">{i.action}</span> },
    { key: 'scope', label: 'Escopo', render: (i) => (i.scope_type === 'vlan' ? `VLAN ${(i.vlan_ids || []).join(', ')}` : 'Todas as VLANs') },
    { key: 'reason', label: 'Motivo e governança', render: (i) => {
      const g = parseGovernanceText(i.reason || '');
      const m = g.metadata;
      return (
        <div className="min-w-[220px]">
          <div className="text-on-surface/80">{g.summary || 'Sem motivo informado.'}</div>
          {(m['base-legal'] || m.solicitante || m['alcada-de-aprovacao'] || m['status-institucional'] || m['revisao-prevista']) ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {m['base-legal'] ? <Badge>Base legal: {m['base-legal']}</Badge> : null}
              {m.solicitante ? <Badge tone="primary">Solicitante: {m.solicitante}</Badge> : null}
              {m['alcada-de-aprovacao'] ? <Badge tone="warning">Aprovação: {m['alcada-de-aprovacao']}</Badge> : null}
              {m['status-institucional'] ? <Badge>Status: {m['status-institucional']}</Badge> : null}
              {m['revisao-prevista'] ? <Badge tone="success">Revisão: {m['revisao-prevista']}</Badge> : null}
            </div>
          ) : null}
        </div>
      );
    } },
    { key: 'requested_by', label: 'Operador', render: (i) => i.requested_by || '—' },
    { key: 'success', label: 'Resultado', render: (i) => <Badge tone={i.success ? 'success' : 'danger'} dot>{i.success ? 'OK' : 'Erro'}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <ContingencyDrawer open={drawer.open} mode={drawer.mode} vlans={vlans} saving={saving} onClose={() => setDrawer({ open: false, mode: 'activate' })} onSubmit={submit} />
      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}

      <KpiRow>
        <Kpi icon={Flame} label="Estado" value={active ? 'Ativa' : 'Normal'} tone={active ? 'danger' : 'success'} sub={active ? 'Resolvedores públicos em uso' : 'Somente o DNS interno'} />
        <Kpi icon={Network} label="Escopo" value={active ? scopeText : '—'} sub="Onde a contingência vale agora" />
        <Kpi icon={Clock3} label="Tempo restante" value={active ? formatRemaining(contingency?.remaining_seconds) : '—'} tone={active ? 'warning' : 'neutral'} sub={active ? `Expira em ${formatDate(contingency?.expires_at)}` : 'Sem prazo em curso'} />
        <Kpi icon={ShieldCheck} label="Saúde do Unbound" value={contingency?.runtime?.healthy ? 'Saudável' : 'Verificar'} tone={contingency?.runtime?.healthy ? 'success' : 'warning'} sub={contingency?.runtime?.recommendation || 'Sem recomendação.'} />
      </KpiRow>

      <Panel
        title="Contingência DNS"
        description="Fallback público temporário, com prazo e auditoria. Ative só quando o DNS interno estiver degradado."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
            <Button variant="secondary" onClick={() => setDrawer({ open: true, mode: 'renew' })} disabled={!active}>Renovar</Button>
            {active
              ? <Button variant="danger" icon={Flame} onClick={deactivate}>Desativar</Button>
              : <Button variant="danger" icon={Flame} onClick={() => setDrawer({ open: true, mode: 'activate' })}>Ativar contingência</Button>}
          </>
        )}
      >
        {active ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Resolvedores liberados', (contingency?.resolvers || []).join(', ') || '—'],
              ['Impacto', contingency?.impact_summary || '—'],
              ['Operador', `${contingency?.requested_by || '—'} · ${formatDate(contingency?.activated_at)}`],
              ['Motivo', parseGovernanceText(contingency?.reason || '').summary || '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-outline px-3 py-2">
                <dt className="text-[11.5px] text-on-surface/50">{label}</dt>
                <dd className="mt-0.5 break-words text-[13px] font-medium text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="text-[13px] text-on-surface/60">Nenhuma contingência ativa. Os aparelhos usam só o DNS interno, que aplica os bloqueios.</p>}
      </Panel>

      <Panel title="Auditoria da contingência" description="Ativações, renovações e retornos ao normal." padded={false}>
        <DataTable columns={columns} rows={audit} rowKey={(i) => `${i.created_at}-${i.action}`} empty={loading ? 'Carregando…' : 'Nenhuma ativação ou renovação registrada ainda.'} />
      </Panel>
    </div>
  );
}
