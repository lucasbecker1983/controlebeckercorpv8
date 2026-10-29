import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Drawer, Field, Notice, Switch, askConfirm, inputCls } from '../ui/kit';
import { VlanChip, applyRules, brSend, mentionsPornography, vlanName } from './shared';

/*
 * Regras de sites: lista legível (o que faz, onde vale, quantos sites) e editor lateral.
 */

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'block', label: 'Bloqueios' },
  { key: 'allow', label: 'Liberações' },
  { key: 'off', label: 'Desligadas' },
];

function RuleRow({ rule, busy, onEdit, onToggle, onDuplicate, onDelete }) {
  const block = rule.policy_type === 'block';
  const global = rule.scope_type === 'global';
  const domains = rule.domains || [];
  return (
    <li className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${rule.enabled ? '' : 'bg-on-surface/[0.02]'}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${block ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'} ${rule.enabled ? '' : 'opacity-50'}`}>
          {block ? <Ban size={16} /> : <Check size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onEdit(rule)} className="text-left text-[14px] font-semibold text-on-surface hover:text-primary">{rule.name}</button>
            <Badge tone={block ? 'danger' : 'success'}>{block ? 'Bloqueia' : 'Libera'}</Badge>
            {rule.enabled ? null : <Badge>Desligada</Badge>}
          </div>
          {rule.description ? <p className="mt-0.5 line-clamp-1 text-[12.5px] text-on-surface/55">{String(rule.description).split('\n[Governanca]')[0]}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px] text-on-surface/55">
            <span className="font-medium">Onde:</span>
            {global ? <Badge tone="primary">Todas as VLANs</Badge> : (rule.vlan_ids || []).map((id) => <VlanChip key={id} id={id} small />)}
            <span className="mx-1 text-on-surface/25">|</span>
            <span className="tabular">{rule.domain_count ?? domains.length} sites</span>
            <span className="hidden truncate text-on-surface/40 md:inline">· {domains.slice(0, 3).join(', ')}{domains.length > 3 ? '…' : ''}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pl-11 sm:pl-0">
        <label className="mr-2 flex items-center gap-2 text-[12px] text-on-surface/60">
          <Switch checked={Boolean(rule.enabled)} disabled={busy} onChange={() => onToggle(rule)} label={rule.enabled ? 'Desligar regra' : 'Ligar regra'} />
          {rule.enabled ? 'Ligada' : 'Desligada'}
        </label>
        <Button variant="ghost" icon={Pencil} onClick={() => onEdit(rule)} disabled={busy} aria-label="Editar">Editar</Button>
        <Button variant="ghost" icon={Copy} onClick={() => onDuplicate(rule)} disabled={busy} aria-label="Duplicar" title="Duplicar (a cópia nasce desligada)" />
        <Button variant="ghost" icon={Trash2} onClick={() => onDelete(rule)} disabled={busy} aria-label="Excluir" title="Excluir" className="hover:!text-danger" />
      </div>
    </li>
  );
}

function RuleEditor({ open, rule, vlans, busy, onClose, onSave }) {
  const filteredVlans = vlans.filter((v) => v.blocking_enabled && !v.exempt).map((v) => Number(v.vlan_id)).sort((a, b) => a - b);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (rule) {
      const global = rule.scope_type === 'global';
      const keepGlobal = global && rule.policy_type === 'block' && mentionsPornography(rule.name, rule.description || '');
      setForm({
        policy_type: rule.policy_type,
        name: rule.name || '',
        scope: keepGlobal ? 'global' : 'vlan',
        vlan_ids: global ? filteredVlans : (rule.vlan_ids || []).map(Number),
        domainsText: (rule.domains || []).join('\n'),
        description: String(rule.description || '').split('\n[Governanca]')[0],
        enabled: Boolean(rule.enabled),
        wasGlobal: global && !keepGlobal,
      });
    } else {
      setForm({ policy_type: 'block', name: '', scope: 'vlan', vlan_ids: [10], domainsText: '', description: '', enabled: true, wasGlobal: false });
    }
  }, [open, rule]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const domains = form.domainsText.split(/[\n,;\s]+/).map((d) => d.trim()).filter(Boolean);
  const uniqueDomains = Array.from(new Set(domains.map((d) => d.toLowerCase())));
  const block = form.policy_type === 'block';

  const submit = () => {
    if (!form.name.trim()) return setError('Dê um nome para a regra.');
    if (form.scope === 'vlan' && !form.vlan_ids.length) return setError('Escolha pelo menos uma VLAN.');
    if (!uniqueDomains.length) return setError('Informe pelo menos um site.');
    if (!block && mentionsPornography(form.name, form.description, uniqueDomains)) return setError('Conteúdo adulto nunca pode ser liberado.');
    setError('');
    onSave({
      name: form.name.trim(),
      policy_type: form.policy_type,
      scope_type: form.scope,
      vlan_ids: form.scope === 'vlan' ? form.vlan_ids : [],
      domains: uniqueDomains,
      description: form.description.trim(),
      enabled: form.enabled,
    }).catch((e) => setError(e?.response?.data?.error || e?.message || 'Não foi possível salvar.'));
  };

  return (
    <Drawer
      open={open}
      busy={busy}
      onClose={onClose}
      title={rule ? 'Editar regra' : 'Nova regra de sites'}
      description="Ao salvar, a regra é aplicada na rede em seguida (até 1 minuto)."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Aplicando...' : 'Salvar e aplicar'}</Button>
        </>
      )}
    >
      <Field label="O que a regra faz">
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'block', icon: Ban, title: 'Bloquear', text: 'Ninguém da VLAN acessa estes sites.', on: 'border-danger bg-danger/[0.06] text-danger' },
            { key: 'allow', icon: Check, title: 'Liberar', text: 'Garante acesso mesmo se outra regra bloquear.', on: 'border-success bg-success/[0.06] text-success' },
          ].map((o) => (
            <button key={o.key} type="button" onClick={() => set({ policy_type: o.key })} className={`flex flex-col gap-1 rounded-lg border-2 p-3 text-left transition-colors ${form.policy_type === o.key ? o.on : 'border-outline text-on-surface/70 hover:border-primary/40'}`}>
              <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold"><o.icon size={16} />{o.title}</span>
              <span className="text-[12px] leading-5 text-on-surface/60">{o.text}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field id="rule-name" label="Nome">
        <input id="rule-name" className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={block ? 'Ex.: Bloquear jogos online' : 'Ex.: Liberar sistema da Receita'} />
      </Field>

      <Field label="Onde vale" hint={form.scope === 'global' ? 'Regra geral: vale para todas as VLANs com filtro. Só o bloqueio de conteúdo adulto pode ser geral.' : 'Clique nas VLANs para marcar ou desmarcar.'}>
        {form.scope === 'global' ? (
          <Badge tone="primary">Todas as VLANs (regra geral)</Badge>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filteredVlans.map((id) => {
              const on = form.vlan_ids.includes(id);
              return (
                <button key={id} type="button" onClick={() => set({ vlan_ids: on ? form.vlan_ids.filter((x) => x !== id) : [...form.vlan_ids, id].sort((a, b) => a - b) })} className={`inline-flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-[13px] font-semibold transition-colors ${on ? 'border-primary bg-primary/[0.07] text-on-surface' : 'border-outline text-on-surface/50 hover:border-primary/40'}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--vlan-${id})`, opacity: on ? 1 : 0.35 }} />
                  VLAN {id} <span className="font-normal text-on-surface/50">{vlanName(id)}</span>
                </button>
              );
            })}
          </div>
        )}
        {form.wasGlobal ? <div className="mt-2"><Notice tone="warning">Esta regra era geral. Regras gerais antigas passam a valer por VLAN ao salvar; já marcamos todas as VLANs com filtro, então nada muda na prática.</Notice></div> : null}
      </Field>

      <Field id="rule-domains" label={`Sites (${uniqueDomains.length})`} hint="Um por linha. Pode colar endereços completos (https://...), o sistema separa o domínio.">
        <textarea id="rule-domains" className={`${inputCls} tabular min-h-[180px] text-[12.5px]`} value={form.domainsText} onChange={(e) => set({ domainsText: e.target.value })} placeholder={'exemplo.com.br\nsistema.gov.br'} />
      </Field>

      <Field id="rule-desc" label="Por que esta regra existe (opcional)" hint="Aparece na lista e na auditoria.">
        <textarea id="rule-desc" className={`${inputCls} min-h-[64px]`} value={form.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>

      <label className="flex items-center gap-2 text-[13px] text-on-surface/75">
        <Switch checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Regra ligada" /> Regra ligada
      </label>

      {block && form.enabled ? <Notice tone="primary">Bloqueios novos derrubam as conexões já abertas para estes sites nas VLANs marcadas.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Drawer>
  );
}

export default function SiteRules({ rules, vlans, runChange, busy, editing, setEditing }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => ({
    all: rules.length,
    block: rules.filter((r) => r.policy_type === 'block').length,
    allow: rules.filter((r) => r.policy_type === 'allow').length,
    off: rules.filter((r) => !r.enabled).length,
  }), [rules]);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rules
      .filter((r) => (filter === 'all' ? true : filter === 'off' ? !r.enabled : r.policy_type === filter))
      .filter((r) => !term || String(r.name).toLowerCase().includes(term) || (r.domains || []).some((d) => d.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.policy_type === b.policy_type ? 0 : a.policy_type === 'block' ? -1 : 1) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [rules, filter, search]);

  const save = async (payload) => {
    const rule = editing?.rule;
    await runChange(async () => {
      if (rule?.id) await brSend('patch', `domain-policies/${rule.id}`, payload);
      else await brSend('post', 'domain-policies', payload);
      const disconnect = payload.policy_type === 'block' && payload.enabled;
      await applyRules(disconnect ? { disconnect_active_sessions: true, domains: payload.domains, vlan_ids: payload.vlan_ids, lookback_minutes: 20 } : undefined);
    }, rule?.id ? `Regra "${payload.name}" atualizada e aplicada.` : `Regra "${payload.name}" criada e aplicada.`, { rethrow: true });
    setEditing(null);
  };

  const toggle = async (rule) => {
    if (rule.enabled) {
      const ok = await askConfirm({ title: `Desligar "${rule.name}"?`, description: `A regra para de valer em ${rule.scope_type === 'global' ? 'todas as VLANs' : `VLAN ${(rule.vlan_ids || []).join(', ')}`}. Dá para religar depois.`, confirmLabel: 'Desligar', tone: 'danger' });
      if (!ok) return;
    }
    await runChange(async () => {
      await brSend('post', `domain-policies/${rule.id}/toggle`);
      const disconnect = !rule.enabled && rule.policy_type === 'block';
      await applyRules(disconnect ? { disconnect_active_sessions: true, domains: rule.domains, vlan_ids: rule.scope_type === 'vlan' ? rule.vlan_ids : [], lookback_minutes: 20 } : undefined);
    }, rule.enabled ? `"${rule.name}" desligada.` : `"${rule.name}" ligada.`);
  };

  const duplicate = (rule) => runChange(() => brSend('post', `domain-policies/${rule.id}/duplicate`), `Cópia de "${rule.name}" criada (desligada).`);

  const remove = async (rule) => {
    const ok = await askConfirm({ title: `Excluir "${rule.name}"?`, description: `Os ${rule.domain_count ?? rule.domains?.length ?? 0} sites desta regra deixam de ser ${rule.policy_type === 'block' ? 'bloqueados' : 'liberados'} por ela. Para pausar sem perder a lista, prefira desligar.`, confirmLabel: 'Excluir regra', tone: 'danger' });
    if (!ok) return;
    await runChange(async () => {
      await brSend('delete', `domain-policies/${rule.id}`);
      await applyRules();
    }, `Regra "${rule.name}" excluída.`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${filter === f.key ? 'border-primary bg-primary text-on-primary' : 'border-outline text-on-surface/65 hover:border-primary/40'}`}>
              {f.label}<span className={`tabular rounded-full px-1.5 text-[11px] ${filter === f.key ? 'bg-white/20' : 'bg-on-surface/[0.07]'}`}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative w-full sm:w-72">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
            <input className={`${inputCls} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar regra ou site (ex.: youtube)" aria-label="Buscar regra ou site" />
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setEditing({ rule: null })} disabled={busy}>Nova regra</Button>
        </div>
      </div>
      <div className="sgcg-card overflow-hidden">
        {list.length ? (
          <ul className="divide-y divide-outline">
            {list.map((rule) => <RuleRow key={rule.id} rule={rule} busy={busy} onEdit={(r) => setEditing({ rule: r })} onToggle={toggle} onDuplicate={duplicate} onDelete={remove} />)}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-on-surface/55">{search ? `Nenhuma regra contém "${search}". Esse site não é bloqueado nem liberado por regra de sites.` : 'Nenhuma regra neste filtro.'}</p>
        )}
      </div>
      <RuleEditor open={Boolean(editing)} rule={editing?.rule} vlans={vlans} busy={busy} onClose={() => !busy && setEditing(null)} onSave={save} />
    </div>
  );
}
