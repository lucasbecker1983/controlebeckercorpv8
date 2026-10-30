import { useMemo, useState } from 'react';
import { Ban, Check, Globe2, ShieldAlert, ShieldCheck, Ticket, Network, CircleSlash } from 'lucide-react';
import { Badge, Panel, askConfirm, toast } from '../ui/kit';
import { VlanChip, applyRules, brSend, vlanName } from './shared';

/*
 * Visão geral: em que ordem a rede decide e um quadro "regra × VLAN".
 * Clicar numa célula de regra por VLAN liga ou tira a regra daquela VLAN.
 */

const STEPS = [
  { icon: ShieldAlert, tone: 'danger', title: 'Segurança', text: 'Malware, phishing, conteúdo adulto e DNS criptografado. Sempre bloqueado, para todos, inclusive VIPs.' },
  { icon: Ticket, tone: 'warning', title: 'VIP, liberação e exceção', text: 'VIP e liberação temporária: sem filtros de categoria. Exceção por IP: libera só redes sociais.' },
  { icon: Network, tone: 'primary', title: 'Regras da VLAN', text: 'Liberações e bloqueios escolhidos para cada VLAN. Liberar vence bloquear.' },
  { icon: Globe2, tone: 'primary', title: 'Regras gerais', text: 'Valem para todas as VLANs com filtro. Liberar vence bloquear.' },
  { icon: Check, tone: 'success', title: 'Sem regra', text: 'O que não aparece em nenhuma regra fica liberado.' },
];

const toneCls = {
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
};

function DecisionFlow() {
  return (
    <Panel title="Como a rede decide" description="Cada consulta passa por estas etapas, nesta ordem. A primeira que se aplica decide.">
      <ol className="grid gap-3 md:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 rounded-lg border border-outline p-3 md:flex-col md:gap-2">
            <div className="flex items-center gap-2">
              <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-on-surface/[0.07] text-[12px] font-bold text-on-surface/60">{i + 1}</span>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneCls[s.tone]}`}><s.icon size={15} /></span>
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-on-surface">{s.title}</div>
              <p className="mt-0.5 text-[12.5px] leading-5 text-on-surface/60">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Cell({ rule, on, global, onToggle, busy, vlanId }) {
  const block = rule.policy_type === 'block';
  const action = on ? 'Desativar' : 'Ativar';
  if (global) {
    return (
      <span title="Regra geral: vale para todas as VLANs com filtro" className={`inline-flex h-7 w-full items-center justify-center rounded-md ${rule.enabled ? (block ? 'bg-danger/[0.07] text-danger/70' : 'bg-success/[0.07] text-success/70') : 'text-on-surface/25'}`}>
        {block ? <Ban size={14} /> : <Check size={14} />}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onToggle}
      title={`${action} a regra nesta VLAN`}
      aria-label={`${action} a regra "${rule.name}" na VLAN ${vlanId}`}
      className={`inline-flex h-7 w-full items-center justify-center rounded-md border transition-colors disabled:cursor-wait ${on
        ? (rule.enabled ? (block ? 'border-danger/30 bg-danger/10 text-danger hover:bg-danger/20' : 'border-success/30 bg-success/10 text-success hover:bg-success/20') : 'border-outline bg-on-surface/[0.05] text-on-surface/40')
        : 'border-dashed border-outline text-transparent hover:border-primary/50 hover:text-primary/60'}`}
    >
      {block ? <Ban size={14} /> : <Check size={14} />}
    </button>
  );
}

export default function PolicyOverview({ rules, vlans, runChange, busy, onEdit }) {
  const [onlyEnabled, setOnlyEnabled] = useState(true);
  const filtered = useMemo(() => vlans.filter((v) => v.blocking_enabled && !v.exempt).sort((a, b) => a.vlan_id - b.vlan_id), [vlans]);
  const unfiltered = useMemo(() => vlans.filter((v) => !v.blocking_enabled || v.exempt).sort((a, b) => a.vlan_id - b.vlan_id), [vlans]);

  const groups = useMemo(() => {
    const list = rules.filter((r) => !onlyEnabled || r.enabled).slice().sort((a, b) => Number(b.enabled) - Number(a.enabled) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
    return [
      { key: 'block', title: 'Bloqueios', rows: list.filter((r) => r.policy_type === 'block') },
      { key: 'allow', title: 'Liberações', rows: list.filter((r) => r.policy_type === 'allow') },
    ];
  }, [rules, onlyEnabled]);

  const toggleCell = async (rule, vlanId, on) => {
    const current = (rule.vlan_ids || []).map(Number);
    const next = on ? current.filter((id) => id !== vlanId) : [...current, vlanId].sort((a, b) => a - b);
    const block = rule.policy_type === 'block';
    const sites = rule.domain_count || rule.domains?.length || 0;
    const where = `VLAN ${vlanId} (${vlanName(vlanId)})`;

    // Era a última VLAN da regra: desativar aqui é desativar a regra inteira.
    if (!next.length) {
      if (!rule.enabled) {
        toast(`A regra "${rule.name}" já está desativada. Para ativá-la, use a chave em "Regras de sites".`, 'warning');
        return;
      }
      const okAll = await askConfirm({
        title: `Desativar a regra "${rule.name}"?`,
        description: `Ela só valia na ${where}. Os ${sites} sites deixam de ser ${block ? 'bloqueados' : 'liberados'} por ela. A regra continua na lista, desativada, e dá para ativá-la de novo em "Regras de sites".`,
        confirmLabel: 'Desativar a regra',
        tone: 'danger',
      });
      if (!okAll) return;
      await runChange(async () => {
        await brSend('post', `domain-policies/${rule.id}/toggle`);
        await applyRules();
      }, `Regra "${rule.name}" desativada.`);
      return;
    }

    const ok = await askConfirm({
      title: on ? `Desativar a regra "${rule.name}" na VLAN ${vlanId}?` : `Ativar a regra "${rule.name}" na VLAN ${vlanId}?`,
      description: on
        ? `Os ${sites} sites desta regra deixam de ser ${block ? 'bloqueados' : 'liberados'} na ${where}. Nas outras VLANs a regra continua valendo. ${rule.enabled ? 'A mudança é aplicada na rede em seguida.' : 'A regra está desligada; a mudança só vale quando ela for ligada.'}`
        : `Os ${sites} sites desta regra passam a ser ${block ? 'bloqueados' : 'liberados'} na ${where}${block ? ', e as conexões abertas para eles são derrubadas' : ''}. ${rule.enabled ? 'A mudança é aplicada na rede em seguida.' : 'A regra está desligada; a mudança só vale quando ela for ligada.'}`,
      confirmLabel: on ? `Desativar na VLAN ${vlanId}` : `Ativar na VLAN ${vlanId}`,
      tone: on || block ? 'danger' : 'primary',
    });
    if (!ok) return;
    await runChange(async () => {
      await brSend('patch', `domain-policies/${rule.id}`, { scope_type: 'vlan', vlan_ids: next });
      const disconnect = !on && rule.enabled && block;
      await applyRules(disconnect ? { disconnect_active_sessions: true, domains: rule.domains, vlan_ids: [vlanId], lookback_minutes: 20 } : undefined);
    }, on ? `Regra "${rule.name}" desativada na VLAN ${vlanId}.` : `Regra "${rule.name}" ativada na VLAN ${vlanId}.`);
  };

  return (
    <div className="space-y-4">
      <DecisionFlow />

      <Panel
        title="Regras por VLAN"
        description="Cada linha é uma regra; cada coluna, uma VLAN. Clique numa célula para ativar ou desativar a regra naquela VLAN. Clique no nome para editar a regra."
        actions={(
          <label className="flex items-center gap-2 text-[12.5px] text-on-surface/70">
            <input type="checkbox" checked={onlyEnabled} onChange={(e) => setOnlyEnabled(e.target.checked)} /> Só regras ligadas
          </label>
        )}
        padded={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-outline">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">Regra</th>
                {filtered.map((v) => (
                  <th key={v.vlan_id} className="w-[92px] px-1.5 py-2.5 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <VlanChip id={v.vlan_id} small />
                      <span className="text-[10.5px] font-medium text-on-surface/45">{vlanName(v.vlan_id, v.label)}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} className="divide-y divide-outline">
                <tr className="bg-on-surface/[0.025]">
                  <td colSpan={filtered.length + 1} className="px-4 py-1.5 text-[11.5px] font-bold uppercase tracking-wide text-on-surface/55">
                    <span className="inline-flex items-center gap-1.5">{g.key === 'block' ? <Ban size={13} className="text-danger" /> : <ShieldCheck size={13} className="text-success" />}{g.title} <span className="tabular font-semibold text-on-surface/40">{g.rows.length}</span></span>
                  </td>
                </tr>
                {g.rows.length ? g.rows.map((rule) => {
                  const global = rule.scope_type === 'global';
                  return (
                    <tr key={rule.id} className={rule.enabled ? '' : 'opacity-60'}>
                      <td className="px-4 py-1.5">
                        <button type="button" onClick={() => onEdit(rule)} className="group flex min-w-0 flex-col text-left">
                          <span className="font-semibold text-on-surface group-hover:text-primary">{rule.name}</span>
                          <span className="text-[11.5px] text-on-surface/50">
                            {rule.domain_count ?? rule.domains?.length ?? 0} sites{global ? ' · todas as VLANs' : ''}{rule.enabled ? '' : ' · desligada'}
                          </span>
                        </button>
                      </td>
                      {filtered.map((v) => {
                        const on = global || (rule.vlan_ids || []).map(Number).includes(Number(v.vlan_id));
                        return (
                          <td key={v.vlan_id} className="px-1.5 py-1.5">
                            <Cell rule={rule} on={on} global={global} busy={busy} vlanId={Number(v.vlan_id)} onToggle={() => toggleCell(rule, Number(v.vlan_id), on)} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={filtered.length + 1} className="px-4 py-3 text-[12.5px] text-on-surface/50">Nenhuma regra.</td></tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline px-4 py-2.5 text-[12px] text-on-surface/55">
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-5 w-5 items-center justify-center rounded border border-danger/30 bg-danger/10 text-danger"><Ban size={11} /></span>Bloqueado</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-5 w-5 items-center justify-center rounded border border-success/30 bg-success/10 text-success"><Check size={11} /></span>Liberado</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-5 w-5 rounded border border-dashed border-outline" />Regra desativada nesta VLAN (clique para ativar)</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-5 w-5 items-center justify-center rounded bg-danger/[0.07] text-danger/70"><Ban size={11} /></span>Regra geral (todas as VLANs)</span>
        </div>
      </Panel>

      {unfiltered.length ? (
        <div className="sgcg-card flex flex-wrap items-center gap-2 px-4 py-3 text-[12.5px] text-on-surface/65">
          <CircleSlash size={15} className="text-on-surface/45" />
          <span>Sem filtro de sites:</span>
          {unfiltered.map((v) => <VlanChip key={v.vlan_id} id={v.vlan_id} label={`VLAN ${v.vlan_id} · ${vlanName(v.vlan_id, v.label)}`} />)}
          <span className="text-on-surface/50">As regras acima não valem nelas. Para mudar, use "Ajustes das VLANs".</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {filtered.map((v) => (
          <div key={v.vlan_id} className="sgcg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <VlanChip id={v.vlan_id} label={`VLAN ${v.vlan_id} · ${vlanName(v.vlan_id, v.label)}`} />
              <Badge tone="success" dot>Filtro ligado</Badge>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div><div className="tabular text-[17px] font-bold text-on-surface">{Number(v.clients_seen || 0)}</div><div className="text-[11px] text-on-surface/50">aparelhos</div></div>
              <div><div className="tabular text-[17px] font-bold text-danger">{Number(v.blocked_today || 0).toLocaleString('pt-BR')}</div><div className="text-[11px] text-on-surface/50">bloqueios hoje</div></div>
              <div><div className="tabular text-[17px] font-bold text-on-surface">{rules.filter((r) => r.enabled && (r.scope_type === 'global' || (r.vlan_ids || []).map(Number).includes(Number(v.vlan_id)))).length}</div><div className="text-[11px] text-on-surface/50">regras</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
