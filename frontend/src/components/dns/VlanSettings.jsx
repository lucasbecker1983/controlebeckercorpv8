import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Drawer, Field, Notice, Panel, Switch, askConfirm, errorMessage, inputCls, toast } from '../ui/kit';
import { BASE } from './governance';

/*
 * Cadastro das VLANs sob o filtro: quais entram no padrão (monitoramento + bloqueio), quais ficam isentas
 * (câmeras, VoIP) e os dados de rede de cada uma. As regras de sites ficam nas outras abas de Políticas de Acesso.
 */

const inStandard = (v) => Boolean(v && v.blocking_enabled !== false && v.monitoring_enabled !== false && v.exempt !== true);
const EMPTY = { vlan_id: '', label: '', interface_name: '', subnet_cidr: '', notes: '', exempt: false, blocking_enabled: true, monitoring_enabled: true };

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-outline px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-on-surface">{label}</div>
        {hint ? <div className="text-[12px] text-on-surface/55">{hint}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function VlanDrawer({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(item ? {
      vlan_id: item.vlan_id ?? '', label: item.label || '', interface_name: item.interface_name || '', subnet_cidr: item.subnet_cidr || '',
      notes: item.notes || '', exempt: item.exempt ?? false, blocking_enabled: item.blocking_enabled ?? true, monitoring_enabled: item.monitoring_enabled ?? true,
    } : EMPTY);
  }, [open, item]);
  const set = (key) => (e) => setF((cur) => ({ ...cur, [key]: e.target.value }));
  const standard = inStandard(f);
  const setStandard = (on) => setF((cur) => ({ ...cur, blocking_enabled: on, monitoring_enabled: on, exempt: !on }));
  const submit = () => {
    const id = Number(f.vlan_id);
    if (!Number.isInteger(id) || id < 1 || id > 4094) return setError('O ID da VLAN deve ser um número de 1 a 4094.');
    if (!f.label.trim()) return setError('Informe o nome da VLAN.');
    if (!f.subnet_cidr.trim()) return setError('Informe a sub-rede, por exemplo 192.168.90.0/24.');
    setError('');
    return onSubmit({ vlan_id: id, label: f.label.trim(), interface_name: f.interface_name.trim(), subnet_cidr: f.subnet_cidr.trim(), notes: f.notes.trim(), exempt: f.exempt, blocking_enabled: f.blocking_enabled, monitoring_enabled: f.monitoring_enabled });
  };
  return (
    <Drawer
      open={open}
      busy={saving}
      onClose={onClose}
      title={item ? `Editar VLAN ${item.vlan_id}` : 'Nova VLAN'}
      description="ID, nome, interface, sub-rede e como a VLAN participa do filtro."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Salvando…' : item ? 'Salvar VLAN' : 'Criar VLAN'}</Button>
        </>
      )}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Notice tone={standard ? 'success' : 'warning'} title={standard ? 'Entra no padrão' : 'Fora do padrão'}>
        {standard ? 'Esta VLAN recebe monitoramento, liberações e bloqueios.' : 'Esta VLAN aparece no cadastro, mas não recebe regras do filtro. Serve para câmeras, VoIP e redes de equipamentos.'}
      </Notice>
      <ToggleRow label="Participa do padrão do filtro" hint="Liga monitoramento e bloqueio e tira a isenção de uma vez." checked={standard} onChange={setStandard} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="vlan-id" label="ID da VLAN *"><input id="vlan-id" className={inputCls} value={f.vlan_id} onChange={set('vlan_id')} placeholder="90" inputMode="numeric" /></Field>
        <Field id="vlan-label" label="Nome *"><input id="vlan-label" className={inputCls} value={f.label} onChange={set('label')} placeholder="Financeiro" /></Field>
        <Field id="vlan-iface" label="Interface"><input id="vlan-iface" className={inputCls} value={f.interface_name} onChange={set('interface_name')} placeholder="enp6s0.90" /></Field>
        <Field id="vlan-cidr" label="Sub-rede *"><input id="vlan-cidr" className={inputCls} value={f.subnet_cidr} onChange={set('subnet_cidr')} placeholder="192.168.90.0/24" /></Field>
      </div>
      <details className="rounded-lg border border-outline px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-on-surface/80">Ajustes separados</summary>
        <div className="mt-3 space-y-2">
          <ToggleRow label="Bloqueio" hint="Aplica as listas de bloqueio nesta VLAN." checked={f.blocking_enabled} onChange={(v) => setF((cur) => ({ ...cur, blocking_enabled: v }))} />
          <ToggleRow label="Monitoramento" hint="Registra as consultas e acessos desta VLAN." checked={f.monitoring_enabled} onChange={(v) => setF((cur) => ({ ...cur, monitoring_enabled: v }))} />
          <ToggleRow label="Isenta" hint="Fica fora do filtro, mesmo com as opções acima ligadas." checked={f.exempt} onChange={(v) => setF((cur) => ({ ...cur, exempt: v }))} />
        </div>
      </details>
      <Field id="vlan-notes" label="Notas"><textarea id="vlan-notes" rows={3} className={inputCls} value={f.notes} onChange={set('notes')} placeholder="Contexto da VLAN." /></Field>
    </Drawer>
  );
}

export default function VlanSettings() {
  const [vlans, setVlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState({ open: false, item: null });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`${BASE}/vlans`);
      setVlans((Array.isArray(res.data) ? res.data : []).sort((a, b) => Number(a.vlan_id) - Number(b.vlan_id)));
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar as VLANs.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? vlans.filter((v) => [v.vlan_id, v.label, v.interface_name, v.subnet_cidr].some((x) => String(x || '').toLowerCase().includes(q))) : vlans;
  }, [vlans, search]);

  const run = async (request, okMessage, after) => {
    setSaving(true);
    try {
      await request();
      toast(okMessage);
      after?.();
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível concluir a ação.'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const save = (form) => run(
    () => (drawer.item?.id ? api.patch(`${BASE}/vlans/${drawer.item.id}`, form) : api.post(`${BASE}/vlans`, form)),
    drawer.item ? `VLAN ${form.vlan_id} atualizada.` : `VLAN ${form.vlan_id} criada.`,
    () => setDrawer({ open: false, item: null }),
  );

  const toggleStandard = async (v) => {
    const entering = !inStandard(v);
    if (!entering && !(await askConfirm({ title: `Tirar a VLAN ${v.vlan_id} do padrão`, description: `Os aparelhos da VLAN ${v.vlan_id} deixam de ser monitorados e as regras de bloqueio e liberação deixam de valer para eles. Dá para voltar pelo mesmo botão.`, confirmLabel: 'Tirar do padrão' }))) return;
    await run(
      () => api.patch(`${BASE}/vlans/${v.id}`, { vlan_id: v.vlan_id, label: v.label, interface_name: v.interface_name, subnet_cidr: v.subnet_cidr, notes: v.notes || '', exempt: !entering, blocking_enabled: entering, monitoring_enabled: entering }),
      entering ? `VLAN ${v.vlan_id} entrou no padrão.` : `VLAN ${v.vlan_id} saiu do padrão.`,
    );
  };

  const remove = async (v) => {
    if (!(await askConfirm({ title: `Excluir a VLAN ${v.vlan_id}`, description: `A VLAN ${v.vlan_id} (${v.label}) sai do cadastro do filtro. A rede e os aparelhos continuam existindo, mas sem regras. Isso não pode ser desfeito por aqui.`, confirmLabel: 'Excluir VLAN', tone: 'danger' }))) return;
    await run(() => api.delete(`${BASE}/vlans/${v.id}`), `VLAN ${v.vlan_id} excluída.`);
  };

  const columns = [
    { key: 'vlan_id', label: 'VLAN', render: (v) => <div className="min-w-[140px]"><div className="font-semibold text-on-surface">VLAN {v.vlan_id}</div><div className="text-[12px] text-on-surface/55">{v.label}</div></div> },
    { key: 'interface_name', label: 'Rede', render: (v) => <div><div className="tabular">{v.subnet_cidr || '—'}</div><div className="text-[12px] text-on-surface/55">{v.interface_name || 'sem interface'}</div></div> },
    { key: 'standard', label: 'No padrão', width: '100px', render: (v) => <Switch checked={inStandard(v)} onChange={() => toggleStandard(v)} disabled={saving} label={`${inStandard(v) ? 'Tirar' : 'Colocar'} a VLAN ${v.vlan_id} do padrão`} /> },
    { key: 'flags', label: 'Filtro', render: (v) => (
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={v.blocking_enabled ? 'success' : 'neutral'}>{v.blocking_enabled ? 'Bloqueio' : 'Sem bloqueio'}</Badge>
        <Badge tone={v.monitoring_enabled ? 'success' : 'neutral'}>{v.monitoring_enabled ? 'Monitorada' : 'Sem monitoramento'}</Badge>
        {v.exempt ? <Badge tone="warning">Isenta</Badge> : null}
      </div>
    ) },
    { key: 'actions', label: '', align: 'right', render: (v) => (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" icon={Pencil} onClick={() => setDrawer({ open: true, item: v })} aria-label={`Editar a VLAN ${v.vlan_id}`} title="Editar" />
        <Button variant="ghost" icon={Trash2} onClick={() => remove(v)} aria-label={`Excluir a VLAN ${v.vlan_id}`} title="Excluir" />
      </div>
    ) },
  ];

  return (
    <div className="space-y-4">
      <VlanDrawer open={drawer.open} item={drawer.item} saving={saving} onClose={() => setDrawer({ open: false, item: null })} onSubmit={save} />
      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}
      <Panel
        title="VLANs sob o filtro"
        description="Cada VLAN pode estar no padrão (monitorada e com bloqueio) ou isenta. As regras de sites ficam nas outras abas."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
            <Button variant="primary" icon={Plus} onClick={() => setDrawer({ open: true, item: null })}>Nova VLAN</Button>
          </>
        )}
        padded={false}
      >
        <div className="border-b border-outline px-4 py-3">
          <div className="relative max-w-sm">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
            <input aria-label="Buscar VLAN" className={`${inputCls} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar VLAN, nome, interface ou sub-rede" />
          </div>
        </div>
        <DataTable columns={columns} rows={rows} empty={loading ? 'Carregando…' : vlans.length ? 'Nenhuma VLAN neste filtro.' : 'Nenhuma VLAN cadastrada. Use "Nova VLAN".'} />
      </Panel>
    </div>
  );
}
