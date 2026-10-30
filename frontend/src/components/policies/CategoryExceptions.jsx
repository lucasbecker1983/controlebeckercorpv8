import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, History, Plus, ShieldOff, UserCheck } from 'lucide-react';
import { Badge, Button, ConfirmDialog, DataTable, Drawer, Field, Notice, Panel, askConfirm, inputCls } from '../ui/kit';
import { IPV4, MAC, VlanChip, addMonthsISO, brGet, brSend, dateBR, daysUntil, normMac } from './shared';

/*
 * Exceções por IP: libera só uma categoria (hoje, redes sociais) para um aparelho, mantendo o resto do filtro.
 * Cada exceção guarda quem pediu, quem aprovou, motivo e prazo; criar, alterar, revogar e vencer vão para a auditoria.
 */

const vlanOf = (ip) => Number(String(ip || '').split('.')[2]) || null;
const fmtDT = (v) => (v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const ACTION_LABEL = {
  'category-exception:create': 'Criada',
  'category-exception:update': 'Alterada',
  'category-exception:revoke': 'Revogada',
  'category-exception:expire': 'Venceu',
};

function deadline(exc) {
  if (exc.expires_at) {
    const ms = new Date(exc.expires_at).getTime() - Date.now();
    const days = Math.ceil(ms / 864e5);
    return { label: `Até ${fmtDT(exc.expires_at)}`, tone: days <= 3 ? 'warning' : 'neutral', badge: days <= 0 ? 'Vencendo' : `${days} dia${days === 1 ? '' : 's'}` };
  }
  const d = daysUntil(exc.review_date);
  if (d == null) return { label: 'Sem prazo', tone: 'warning', badge: 'Sem revisão' };
  return { label: `Revisar em ${dateBR(exc.review_date)}`, tone: d < 0 ? 'danger' : d <= 15 ? 'warning' : 'success', badge: d < 0 ? `Revisão vencida há ${-d} d` : `Em ${d} dias` };
}

function ExceptionEditor({ open, exc, devices, busy, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(exc ? {
      ip: exc.ip, holder_name: exc.holder_name || '', requested_by: exc.requested_by || '', approved_by: exc.approved_by || '', justification: exc.justification || '',
      mac_address: exc.mac_address || '', mode: exc.expires_at ? 'until' : 'review',
      expires_at: exc.expires_at ? new Date(exc.expires_at).toISOString().slice(0, 16) : '', review_date: exc.review_date ? String(exc.review_date).slice(0, 10) : addMonthsISO(6),
    } : { ip: '192.168.', holder_name: '', requested_by: '', approved_by: '', justification: '', mac_address: '', mode: 'review', expires_at: '', review_date: addMonthsISO(6) });
  }, [open, exc]);
  if (!open || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const seen = IPV4.test(form.ip) ? devices.get(form.ip) : null;

  const submit = () => {
    if (!IPV4.test(form.ip.trim())) return setError('IP inválido.');
    if (form.holder_name.trim().length < 2) return setError('Informe quem usa o aparelho.');
    if (form.requested_by.trim().length < 2) return setError('Informe quem pediu.');
    if (form.approved_by.trim().length < 2) return setError('Informe quem aprovou.');
    if (form.justification.trim().length < 10) return setError('Escreva o motivo (pelo menos 10 caracteres).');
    if (form.mac_address.trim() && !MAC.test(form.mac_address.trim())) return setError('MAC inválido.');
    if (form.mode === 'until' && !form.expires_at) return setError('Defina até quando vale.');
    setError('');
    onSave({
      ip: form.ip.trim(),
      holder_name: form.holder_name.trim(),
      requested_by: form.requested_by.trim(),
      approved_by: form.approved_by.trim(),
      justification: form.justification.trim(),
      mac_address: form.mac_address.trim() ? normMac(form.mac_address) : '',
      expires_at: form.mode === 'until' ? new Date(form.expires_at).toISOString() : null,
      review_date: form.mode === 'review' ? form.review_date : null,
      category: 'redes_sociais',
    }).catch((e) => setError(e?.response?.data?.error || e?.message || 'Não foi possível salvar.'));
  };

  return (
    <Drawer
      open={open}
      busy={busy}
      onClose={onClose}
      title={exc ? `Alterar exceção · ${exc.ip}` : 'Nova exceção por IP'}
      description="Libera só redes sociais para este aparelho. Segurança (malware, adulto) e as outras regras continuam valendo."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Aplicando...' : exc ? 'Salvar e aplicar' : 'Criar exceção'}</Button>
        </>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ce-ip" label="IP do aparelho" hint={exc ? 'Para outro IP, revogue e crie outra.' : seen ? `Na rede agora: ${seen.hostname || 'sem nome'}` : 'Use IP fixo (reserva no DHCP).'}>
          <input id="ce-ip" className={`${inputCls} tabular`} value={form.ip} disabled={Boolean(exc)} onChange={(e) => set({ ip: e.target.value.trim() })} />
        </Field>
        <Field id="ce-holder" label="Quem usa">
          <input id="ce-holder" className={inputCls} value={form.holder_name} onChange={(e) => set({ holder_name: e.target.value })} placeholder="Ex.: Comunicação · notebook da Ana" />
        </Field>
        <Field id="ce-req" label="Pedido por">
          <input id="ce-req" className={inputCls} value={form.requested_by} onChange={(e) => set({ requested_by: e.target.value })} placeholder="Nome de quem pediu" />
        </Field>
        <Field id="ce-appr" label="Aprovado por">
          <input id="ce-appr" className={inputCls} value={form.approved_by} onChange={(e) => set({ approved_by: e.target.value })} placeholder="Nome de quem autorizou" />
        </Field>
      </div>
      <Field id="ce-just" label="Motivo" hint="Fica registrado na auditoria. Ex.: gestão das redes sociais da Prefeitura.">
        <textarea id="ce-just" className={`${inputCls} min-h-[72px]`} value={form.justification} onChange={(e) => set({ justification: e.target.value })} />
      </Field>
      <Field id="ce-mac" label="MAC do aparelho (opcional)" hint="Registra qual equipamento recebeu a exceção.">
        <div className="flex flex-wrap items-center gap-2">
          <input id="ce-mac" className={`${inputCls} tabular w-56`} value={form.mac_address} onChange={(e) => set({ mac_address: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
          {seen?.mac && normMac(seen.mac) !== normMac(form.mac_address) ? <Button variant="ghost" onClick={() => set({ mac_address: normMac(seen.mac) })}>Usar o detectado ({normMac(seen.mac)})</Button> : null}
        </div>
      </Field>
      <Field label="Prazo">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={form.mode === 'review'} onChange={() => set({ mode: 'review' })} /> Sem data de fim, com revisão</label>
          {form.mode === 'review' ? (
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <input type="date" className={`${inputCls} w-44`} value={form.review_date} onChange={(e) => set({ review_date: e.target.value })} aria-label="Data de revisão" />
              {[1, 3, 6].map((m) => <Button key={m} variant="ghost" onClick={() => set({ review_date: addMonthsISO(m) })}>{m} {m === 1 ? 'mês' : 'meses'}</Button>)}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[13px]"><input type="radio" checked={form.mode === 'until'} onChange={() => set({ mode: 'until' })} /> Vale até uma data (vence sozinha)</label>
          {form.mode === 'until' ? <div className="pl-6"><input type="datetime-local" className={`${inputCls} w-60`} value={form.expires_at} onChange={(e) => set({ expires_at: e.target.value })} aria-label="Vale até" /></div> : null}
        </div>
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Drawer>
  );
}

function HistoryDrawer({ open, exc, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !exc) return;
    setData(null);
    setError('');
    brGet(`category-exceptions/${exc.id}/history`).then(setData).catch((e) => setError(e?.response?.data?.error || 'Não foi possível ler o histórico.'));
  }, [open, exc]);
  if (!open || !exc) return null;
  const e = data?.exception || exc;
  return (
    <Drawer open={open} onClose={onClose} title={`Histórico · ${exc.ip}`} description={`${e.holder_name} · ${e.category_label || 'Redes sociais'}`}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Panel title="Dados da exceção" padded>
        <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-on-surface/55">Pedido por</dt><dd>{e.requested_by}</dd>
          <dt className="text-on-surface/55">Aprovado por</dt><dd>{e.approved_by}</dd>
          <dt className="text-on-surface/55">Motivo</dt><dd>{e.justification}</dd>
          <dt className="text-on-surface/55">MAC</dt><dd className="tabular">{e.mac_address || '—'}</dd>
          <dt className="text-on-surface/55">Criada</dt><dd>{fmtDT(e.created_at)} por {e.created_by}</dd>
          <dt className="text-on-surface/55">Prazo</dt><dd>{deadline(e).label}</dd>
          {e.revoked_at ? (<><dt className="text-on-surface/55">Encerrada</dt><dd>{fmtDT(e.revoked_at)} por {e.revoked_by}{e.revoke_reason ? ` · ${e.revoke_reason}` : ''}</dd></>) : null}
        </dl>
      </Panel>
      <Panel title="Linha do tempo (auditoria)" padded={false}>
        {data?.audit?.length ? (
          <ol className="divide-y divide-outline">
            {data.audit.map((a, i) => (
              <li key={i} className="px-4 py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={a.action.endsWith('revoke') || a.action.endsWith('expire') ? 'danger' : 'primary'}>{ACTION_LABEL[a.action] || a.action}</Badge><span className="tabular text-on-surface/55">{fmtDT(a.created_at)}</span><span className="text-on-surface/55">por {a.requested_by}</span></div>
                <p className="mt-1 text-on-surface/70">{a.message}</p>
              </li>
            ))}
          </ol>
        ) : <p className="px-4 py-4 text-sm text-on-surface/55">{data ? 'Sem registros.' : 'Carregando...'}</p>}
      </Panel>
      <Panel title="Uso de redes sociais (7 dias)" description="Consultas de DNS deste IP aos domínios da categoria." padded={false}>
        <DataTable
          rows={data?.top_domains || []}
          rowKey="domain"
          empty={data ? 'Nenhum acesso no período.' : 'Carregando...'}
          columns={[
            { key: 'd', label: 'Domínio', render: (r) => <span className="break-all">{r.domain}</span> },
            { key: 't', label: 'Consultas', mono: true, align: 'right', render: (r) => Number(r.total).toLocaleString('pt-BR') },
            { key: 'l', label: 'Última', render: (r) => <span className="tabular text-[12px]">{fmtDT(r.last_at)}</span> },
          ]}
        />
      </Panel>
    </Drawer>
  );
}

export default function CategoryExceptions({ items, devices, runChange, busy }) {
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [showOld, setShowOld] = useState(false);
  const active = useMemo(() => items.filter((e) => e.active), [items]);
  const old = useMemo(() => items.filter((e) => !e.active), [items]);

  const save = async (payload) => {
    const exc = editing?.exc;
    await runChange(async () => {
      if (exc?.id) await brSend('patch', `category-exceptions/${exc.id}`, payload);
      else await brSend('post', 'category-exceptions', payload);
    }, exc?.id ? `Exceção de ${exc.ip} atualizada.` : `Exceção criada para ${payload.ip}: redes sociais liberadas.`, { rethrow: true });
    setEditing(null);
  };
  const renew = async (exc) => {
    const next = addMonthsISO(6);
    const ok = await askConfirm({ title: `Renovar a exceção de ${exc.ip}?`, description: `A próxima revisão fica para ${dateBR(next)}. Fica registrado na auditoria.`, confirmLabel: 'Renovar' });
    if (!ok) return;
    await runChange(() => brSend('patch', `category-exceptions/${exc.id}`, { review_date: next, expires_at: null }), `Exceção de ${exc.ip} renovada até ${dateBR(next)}.`);
  };
  const revoke = async (reason) => {
    const exc = revoking;
    setRevoking(null);
    await runChange(() => brSend('post', `category-exceptions/${exc.id}/revoke`, { reason }), `Exceção de ${exc.ip} revogada: redes sociais bloqueadas de novo.`);
  };

  return (
    <div className="space-y-4">
      <Notice tone="primary" title="Quando usar">
        Redes sociais ficam bloqueadas em todas as VLANs. A exceção por IP libera <b>só redes sociais</b> para um aparelho; segurança e as outras regras continuam valendo. Para liberar tudo, use VIP. Para algumas horas, use Liberações temporárias.
      </Notice>

      <Panel
        title={`Exceções ativas (${active.length})`}
        description="Cada exceção registra quem pediu, quem aprovou, o motivo e o prazo. Toda mudança fica na auditoria."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ exc: null })} disabled={busy}>Nova exceção</Button>}
        padded={false}
      >
        <DataTable
          rows={active}
          empty="Nenhuma exceção ativa. Só VIPs acessam redes sociais."
          columns={[
            { key: 'ip', label: 'Aparelho', render: (e) => <div className="space-y-1"><div className="tabular font-semibold">{e.ip}</div><div className="flex flex-wrap items-center gap-1">{vlanOf(e.ip) ? <VlanChip id={vlanOf(e.ip)} small /> : null}<span className="text-[11.5px] text-on-surface/55">{e.holder_name}</span></div></div> },
            { key: 'who', label: 'Pedido / aprovado', render: (e) => <div className="text-[12.5px]"><div>{e.requested_by}</div><div className="text-on-surface/55">aprovado por {e.approved_by}</div></div> },
            { key: 'why', label: 'Motivo', render: (e) => <span className="line-clamp-2 max-w-[18rem] text-[12.5px] text-on-surface/70">{e.justification}</span> },
            { key: 'dl', label: 'Prazo', render: (e) => { const d = deadline(e); return <div className="space-y-1"><div className="text-[12.5px]">{d.label}</div><Badge tone={d.tone}>{d.badge}</Badge></div>; } },
            { key: 'use', label: 'Uso (7 dias)', render: (e) => <div className="text-[12.5px]"><div className="tabular font-semibold">{Number(e.usage?.total_7d || 0).toLocaleString('pt-BR')} consultas</div><div className="text-on-surface/50">{e.usage?.last_at ? `última ${fmtDT(e.usage.last_at)}` : 'sem uso'}</div></div> },
            {
              key: 'a', label: '', align: 'right', render: (e) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" icon={History} onClick={() => setHistory(e)} title="Histórico e auditoria">Histórico</Button>
                  <Button variant="ghost" icon={CalendarClock} onClick={() => renew(e)} disabled={busy} title="Renovar por 6 meses" aria-label="Renovar" />
                  <Button variant="ghost" icon={UserCheck} onClick={() => setEditing({ exc: e })} disabled={busy} title="Alterar" aria-label="Alterar" />
                  <Button variant="ghost" icon={ShieldOff} onClick={() => setRevoking(e)} disabled={busy} title="Revogar" aria-label="Revogar" className="hover:!text-danger" />
                </div>
              ),
            },
          ]}
        />
      </Panel>

      {old.length ? (
        <section className="sgcg-card">
          <button type="button" onClick={() => setShowOld((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="text-[14px] font-semibold text-on-surface/80">Revogadas e vencidas ({old.length})</span>
            <ChevronDown size={16} className={`text-on-surface/50 transition-transform ${showOld ? 'rotate-180' : ''}`} />
          </button>
          {showOld ? (
            <div className="border-t border-outline">
              <DataTable
                rows={old}
                columns={[
                  { key: 'ip', label: 'Aparelho', render: (e) => <div><div className="tabular">{e.ip}</div><div className="text-[11.5px] text-on-surface/50">{e.holder_name}</div></div> },
                  { key: 'p', label: 'Vigência', render: (e) => <span className="text-[12px] text-on-surface/60">{fmtDT(e.created_at)} → {fmtDT(e.revoked_at)}</span> },
                  { key: 'r', label: 'Encerrada por', render: (e) => <span className="text-[12px] text-on-surface/60">{e.revoked_by}{e.revoke_reason ? ` · ${e.revoke_reason}` : ''}</span> },
                  { key: 'h', label: '', align: 'right', render: (e) => <Button variant="ghost" icon={History} onClick={() => setHistory(e)}>Histórico</Button> },
                ]}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <ExceptionEditor open={Boolean(editing)} exc={editing?.exc} devices={devices} busy={busy} onClose={() => !busy && setEditing(null)} onSave={save} />
      <HistoryDrawer open={Boolean(history)} exc={history} onClose={() => setHistory(null)} />
      <ConfirmDialog
        open={Boolean(revoking)}
        title={revoking ? `Revogar a exceção de ${revoking.ip}?` : ''}
        description="As redes sociais voltam a ser bloqueadas para este aparelho na hora."
        confirmLabel="Revogar"
        tone="danger"
        minReason={5}
        reasonLabel="Motivo da revogação"
        busy={busy}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
      />
    </div>
  );
}
