import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, Link2, Pencil, Plus, Power, RotateCcw, Search, ShieldCheck, Smartphone } from 'lucide-react';
import { Badge, Button, DataTable, Drawer, Field, Notice, Panel, askConfirm, inputCls } from '../ui/kit';
import { IPV4, MAC, VlanChip, addMonthsISO, brSend, dateBR, daysUntil, isPrivateMac, normMac } from './shared';

/*
 * VIPs: aparelhos com passe livre nos filtros de categoria (a segurança continua valendo).
 * Cada VIP mostra se está vinculado ao aparelho (MAC) e quando precisa ser revisado.
 */

const vipName = (v) => v.description || v.hostname || v.ip;
const vlanOf = (ip) => Number(String(ip || '').split('.')[2]) || null;

export function vipBinding(vip, devices) {
  const mac = vip.mac_address ? normMac(vip.mac_address) : null;
  const now = devices.get(String(vip.ip))?.mac ? normMac(devices.get(String(vip.ip)).mac) : null;
  if (mac && now && now !== mac) return { key: 'mismatch', mac, now };
  if (mac) return { key: 'bound', mac, now };
  return { key: now ? 'unbound-online' : 'unbound-offline', mac: null, now };
}

export function reviewState(vip) {
  const d = daysUntil(vip.review_date);
  if (d == null) return { key: 'none', tone: 'warning', label: 'Sem prazo' };
  if (d < 0) return { key: 'overdue', tone: 'danger', label: `Vencida há ${-d} dia${d === -1 ? '' : 's'}` };
  if (d <= 15) return { key: 'soon', tone: 'warning', label: d === 0 ? 'Vence hoje' : `Vence em ${d} dia${d === 1 ? '' : 's'}` };
  return { key: 'ok', tone: 'success', label: `Em ${d} dias` };
}

// Selo para MAC privado: o celular pode trocar o endereço e perder o VIP (e o IP reservado).
function PrivateMacTag({ onHelp }) {
  return (
    <button type="button" onClick={onHelp} title="Endereço privado do celular: pode mudar. Clique para ver como fixar." className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning hover:bg-warning/20">
      <Smartphone size={11} />MAC privado
    </button>
  );
}

function BindingCell({ vip, devices, busy, onBind, onHelp }) {
  const b = vipBinding(vip, devices);
  if (b.key === 'mismatch') {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1"><Badge tone="danger" dot>Outro aparelho no IP</Badge>{isPrivateMac(b.mac) ? <PrivateMacTag onHelp={onHelp} /> : null}</div>
        <div className="tabular text-[11px] text-on-surface/50">vinculado {b.mac}<br />agora {b.now}</div>
        {isPrivateMac(b.mac) ? <div className="max-w-[16rem] text-[11px] leading-4 text-on-surface/55">Pode ser o mesmo celular com endereço novo. Fixe o endereço nele antes de vincular de novo.</div> : null}
        <button type="button" disabled={busy} onClick={() => onBind(vip, b.now)} className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-50">Vincular ao aparelho atual</button>
      </div>
    );
  }
  if (b.key === 'bound') {
    return (
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-1"><Badge tone="success" dot>Vinculado</Badge>{isPrivateMac(b.mac) ? <PrivateMacTag onHelp={onHelp} /> : null}</div>
        <div className="tabular text-[11px] text-on-surface/45">{b.mac}</div>
      </div>
    );
  }
  if (b.key === 'unbound-online') {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1"><Badge tone="warning" dot>Sem vínculo</Badge>{isPrivateMac(b.now) ? <PrivateMacTag onHelp={onHelp} /> : null}</div>
        <div><button type="button" disabled={busy} onClick={() => onBind(vip, b.now)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline disabled:opacity-50"><Link2 size={12} />Vincular ({b.now})</button></div>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <Badge tone="warning" dot>Sem vínculo</Badge>
      <div className="text-[11px] text-on-surface/45">aparelho desligado agora</div>
    </div>
  );
}

const GUIDE = [
  {
    title: 'iPhone',
    steps: [
      'Ajustes → Wi-Fi.',
      'Toque no ⓘ ao lado da rede da prefeitura.',
      'Em "Endereço Wi-Fi Privado", escolha "Desativado". No iOS 18, "Fixo" também serve, mas muda se a rede for esquecida.',
      'O iPhone reconecta com o MAC de fábrica. Volte aqui e clique em "Vincular".',
    ],
  },
  {
    title: 'Android',
    steps: [
      'Configurações → Wi-Fi.',
      'Toque na engrenagem da rede da prefeitura.',
      'Em "Privacidade" (ou "Tipo de endereço MAC"), escolha "Usar MAC do dispositivo" / "MAC do telefone".',
      'Reconecte à rede, volte aqui e clique em "Vincular".',
    ],
  },
];

export function PrivateMacGuide({ open, onToggle, count = 0 }) {
  return (
    <section id="guia-mac-privado" className="sgcg-card scroll-mt-4">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning"><Smartphone size={16} /></span>
          <span>
            <span className="block text-[14px] font-semibold text-on-surface">Celular com MAC privado: como fixar o endereço</span>
            <span className="block text-[12px] text-on-surface/55">{count ? `${count} VIP${count > 1 ? 's' : ''} com MAC privado. ` : ''}Celulares novos trocam o MAC e perdem o VIP e o IP reservado.</span>
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-on-surface/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-outline px-4 py-4">
          <p className="text-[13px] leading-6 text-on-surface/70">
            iPhone e Android usam um endereço Wi-Fi privado (MAC aleatório) para cada rede, e ele pode mudar: ao esquecer a rede, ao restaurar o aparelho ou, em algumas versões, de tempos em tempos. Quando muda, o celular pega outro IP e deixa de ser reconhecido como VIP. A mudança abaixo vale só para a rede da prefeitura; nas outras redes o celular continua com endereço privado.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {GUIDE.map((g) => (
              <div key={g.title} className="rounded-lg border border-outline p-3">
                <div className="mb-2 text-[13.5px] font-semibold text-on-surface">{g.title}</div>
                <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-5 text-on-surface/70">
                  {g.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
            ))}
          </div>
          <p className="text-[12px] leading-5 text-on-surface/55">Os nomes dos menus variam um pouco entre marcas e versões. Celular pessoal que não puder ser ajustado não deve ser VIP vinculado: ele vai perder o acesso quando o endereço mudar.</p>
        </div>
      ) : null}
    </section>
  );
}

function VipEditor({ open, vip, devices, busy, onClose, onSave }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(vip ? {
      name: vipName(vip),
      ip: vip.ip,
      responsible: vip.responsible || vip.requested_by || '',
      review_date: vip.review_date ? String(vip.review_date).slice(0, 10) : addMonthsISO(6),
      bind: Boolean(vip.mac_address),
      mac: vip.mac_address || '',
      reason: vip.governance_summary || '',
    } : { name: '', ip: '192.168.10.', responsible: '', review_date: addMonthsISO(6), bind: true, mac: '', reason: '' });
  }, [open, vip]);
  if (!open || !form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const seen = IPV4.test(form.ip) ? devices.get(form.ip) : null;

  const submit = () => {
    if (!form.name.trim()) return setError('Informe o nome do aparelho (ex.: Notebook do Tiago).');
    if (!IPV4.test(form.ip.trim())) return setError('IP inválido.');
    if (!form.responsible.trim()) return setError('Informe quem é o responsável.');
    if (!form.review_date) return setError('Defina a data de revisão.');
    if (form.bind && !MAC.test(form.mac.trim())) return setError('Para vincular ao aparelho, informe o MAC (ou use o aparelho detectado na rede).');
    setError('');
    onSave({
      description: form.name.trim(),
      ip: form.ip.trim(),
      responsible: form.responsible.trim(),
      requested_by: form.responsible.trim(),
      review_date: form.review_date,
      mac_address: form.bind ? normMac(form.mac) : '',
      governance_summary: form.reason.trim() || undefined,
    }).catch((e) => setError(e?.response?.data?.error || e?.message || 'Não foi possível salvar.'));
  };

  return (
    <Drawer
      open={open}
      busy={busy}
      onClose={onClose}
      title={vip ? `Editar VIP · ${vipName(vip)}` : 'Novo VIP'}
      description="VIP navega sem os filtros de categoria. Malware, phishing, conteúdo adulto e DNS criptografado continuam bloqueados."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy}>{busy ? 'Aplicando...' : vip ? 'Salvar e aplicar' : 'Criar VIP'}</Button>
        </>
      )}
    >
      <Field id="vip-name" label="Aparelho">
        <input id="vip-name" className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Notebook do Tiago" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="vip-ip" label="IP" hint={seen ? `Na rede agora: ${seen.hostname || 'sem nome'}` : 'Use IP fixo (reserva no DHCP).'}>
          <input id="vip-ip" className={`${inputCls} tabular`} value={form.ip} onChange={(e) => set({ ip: e.target.value.trim() })} />
        </Field>
        <Field id="vip-resp" label="Responsável">
          <input id="vip-resp" className={inputCls} value={form.responsible} onChange={(e) => set({ responsible: e.target.value })} placeholder="Quem pediu ou usa" />
        </Field>
      </div>

      <div className="rounded-lg border border-outline p-3">
        <label className="flex items-start gap-2 text-[13.5px] font-semibold text-on-surface">
          <input type="checkbox" className="mt-1" checked={form.bind} onChange={(e) => set({ bind: e.target.checked })} />
          <span>Vincular ao aparelho<span className="block text-[12px] font-normal leading-5 text-on-surface/55">A liberação só vale para este equipamento. Outro aparelho que pegar o mesmo IP segue as regras normais.</span></span>
        </label>
        {form.bind ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1">
              <Field id="vip-mac" label="MAC do aparelho">
                <input id="vip-mac" className={`${inputCls} tabular`} value={form.mac} onChange={(e) => set({ mac: e.target.value })} placeholder="AA:BB:CC:DD:EE:FF" />
              </Field>
            </div>
            {seen?.mac && normMac(seen.mac) !== normMac(form.mac) ? <Button onClick={() => set({ mac: normMac(seen.mac) })}>Usar o detectado ({normMac(seen.mac)})</Button> : null}
          </div>
        ) : null}
        {form.bind && MAC.test(form.mac.trim()) && isPrivateMac(form.mac) ? (
          <div className="mt-3"><Notice tone="warning" title="MAC privado (aleatório)">Este endereço é do modo privado do celular e pode mudar. Antes de vincular, fixe o endereço no aparelho: no iPhone, Ajustes → Wi-Fi → ⓘ da rede → Endereço Wi-Fi Privado → Desativado; no Android, Wi-Fi → engrenagem da rede → Privacidade → Usar MAC do dispositivo. Depois use o MAC novo.</Notice></div>
        ) : null}
      </div>

      <Field id="vip-review" label="Revisar em" hint="Na data, o painel avisa para renovar ou desativar.">
        <div className="flex flex-wrap items-center gap-2">
          <input id="vip-review" type="date" className={`${inputCls} w-44`} value={form.review_date} onChange={(e) => set({ review_date: e.target.value })} />
          {[3, 6, 12].map((m) => <Button key={m} variant="ghost" onClick={() => set({ review_date: addMonthsISO(m) })}>{m} meses</Button>)}
        </div>
      </Field>

      <Field id="vip-reason" label="Motivo (opcional)" hint="Fica registrado na auditoria.">
        <textarea id="vip-reason" className={`${inputCls} min-h-[64px]`} value={form.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Ex.: reuniões online diárias" />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Drawer>
  );
}

export default function VipList({ exceptions, devices, runChange, busy }) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const active = useMemo(() => exceptions.filter((v) => v.active), [exceptions]);
  const inactive = useMemo(() => exceptions.filter((v) => !v.active), [exceptions]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => active
    .filter((v) => !term || [vipName(v), v.ip, v.responsible, v.mac_address].some((x) => String(x || '').toLowerCase().includes(term)))
    .sort((a, b) => {
      const rank = (v) => ({ mismatch: 0 }[vipBinding(v, devices).key] ?? ({ overdue: 1, soon: 2, none: 3 }[reviewState(v).key] ?? 4));
      return rank(a) - rank(b) || vipName(a).localeCompare(vipName(b), 'pt-BR');
    }), [active, term, devices]);

  const stats = useMemo(() => ({
    bound: active.filter((v) => v.mac_address).length,
    privateMac: active.filter((v) => isPrivateMac(v.mac_address || devices.get(String(v.ip))?.mac || '')).length,
    attention: active.filter((v) => vipBinding(v, devices).key === 'mismatch' || ['overdue', 'none'].includes(reviewState(v).key)).length,
  }), [active, devices]);

  const openGuide = () => {
    setShowGuide(true);
    window.setTimeout(() => document.getElementById('guia-mac-privado')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const bind = async (vip, mac) => {
    const priv = isPrivateMac(mac);
    const ok = await askConfirm({
      title: `Vincular "${vipName(vip)}" ao aparelho ${mac}?`,
      description: priv
        ? `Atenção: ${mac} é um MAC privado (aleatório) e pode mudar. Se mudar, o aparelho perde o VIP. O ideal é fixar o endereço no celular primeiro (veja o guia nesta tela) e vincular o MAC novo. A liberação do IP ${vip.ip} passa a valer só para este endereço.`
        : `A liberação VIP do IP ${vip.ip} passa a valer só para este aparelho. Se ele for trocado, o VIP precisa ser vinculado de novo.`,
      confirmLabel: priv ? 'Vincular mesmo assim' : 'Vincular',
      tone: priv ? 'danger' : 'primary',
    });
    if (!ok) return;
    await runChange(() => brSend('patch', `exceptions/${vip.id}`, { mac_address: mac }), `"${vipName(vip)}" vinculado ao aparelho.`);
  };
  const renew = async (vip) => {
    const next = addMonthsISO(6);
    const ok = await askConfirm({ title: `Renovar "${vipName(vip)}"?`, description: `A próxima revisão fica para ${dateBR(next)} (6 meses).`, confirmLabel: 'Renovar' });
    if (!ok) return;
    await runChange(() => brSend('patch', `exceptions/${vip.id}`, { review_date: next }), `"${vipName(vip)}" renovado até ${dateBR(next)}.`);
  };
  const deactivate = async (vip) => {
    const ok = await askConfirm({ title: `Desativar o VIP "${vipName(vip)}"?`, description: `O aparelho ${vip.ip} volta a seguir as regras normais da VLAN. Dá para reativar depois.`, confirmLabel: 'Desativar VIP', tone: 'danger' });
    if (!ok) return;
    await runChange(() => brSend('patch', `exceptions/${vip.id}`, { active: false }), `VIP "${vipName(vip)}" desativado.`);
  };
  const reactivate = async (vip) => {
    const ok = await askConfirm({ title: `Reativar o VIP "${vipName(vip)}"?`, description: `O IP ${vip.ip} volta a ter passe livre nos filtros de categoria. A revisão fica para ${dateBR(addMonthsISO(6))}.`, confirmLabel: 'Reativar' });
    if (!ok) return;
    await runChange(() => brSend('patch', `exceptions/${vip.id}`, { active: true, review_date: addMonthsISO(6) }), `VIP "${vipName(vip)}" reativado.`);
  };
  const save = async (payload) => {
    const vip = editing?.vip;
    await runChange(async () => {
      if (vip?.id) await brSend('patch', `exceptions/${vip.id}`, payload);
      else await brSend('post', 'exceptions', { ...payload, exception_type: 'bypass total', bypass_total: true, dns_audit_enabled: true, active: true });
    }, vip?.id ? `VIP "${payload.description}" atualizado.` : `VIP "${payload.description}" criado.`, { rethrow: true });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <Notice tone="primary" title="O que é um VIP">
        Um VIP navega sem os filtros de categoria (redes sociais, vídeo, streaming). Malware, phishing, conteúdo adulto e DNS criptografado continuam bloqueados para ele também. Use para quem precisa no trabalho e revise de tempos em tempos.
      </Notice>

      <Panel
        title={`VIPs ativos (${active.length})`}
        description={`${stats.bound} de ${active.length} vinculados ao aparelho${stats.attention ? ` · ${stats.attention} precisando de atenção` : ''}. Os que precisam de atenção aparecem primeiro.`}
        actions={(
          <>
            <div className="relative w-56">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input className={`${inputCls} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, IP ou MAC" aria-label="Buscar VIP" />
            </div>
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ vip: null })} disabled={busy}>Novo VIP</Button>
          </>
        )}
        padded={false}
      >
        <DataTable
          rows={rows}
          empty={term ? 'Nenhum VIP encontrado.' : 'Nenhum VIP ativo.'}
          columns={[
            { key: 'n', label: 'Aparelho', render: (v) => <div><div className="font-semibold text-on-surface">{vipName(v)}</div><div className="text-[11.5px] text-on-surface/50">{v.responsible || '—'}</div></div> },
            { key: 'ip', label: 'IP', render: (v) => <div className="space-y-1"><div className="tabular font-medium">{v.ip}</div>{vlanOf(v.ip) ? <VlanChip id={vlanOf(v.ip)} small /> : null}</div> },
            { key: 'mac', label: 'Aparelho vinculado', render: (v) => <BindingCell vip={v} devices={devices} busy={busy} onBind={bind} onHelp={openGuide} /> },
            { key: 'r', label: 'Revisão', render: (v) => { const r = reviewState(v); return <div className="space-y-1"><div className="tabular">{dateBR(v.review_date)}</div><Badge tone={r.tone}>{r.label}</Badge></div>; } },
            {
              key: 'a', label: '', align: 'right', render: (v) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" icon={CalendarClock} onClick={() => renew(v)} disabled={busy} title="Renovar por 6 meses">Renovar</Button>
                  <Button variant="ghost" icon={Pencil} onClick={() => setEditing({ vip: v })} disabled={busy} aria-label="Editar" title="Editar" />
                  <Button variant="ghost" icon={Power} onClick={() => deactivate(v)} disabled={busy} aria-label="Desativar" title="Desativar" className="hover:!text-danger" />
                </div>
              ),
            },
          ]}
        />
      </Panel>

      <PrivateMacGuide open={showGuide} onToggle={() => setShowGuide((s) => !s)} count={stats.privateMac} />

      {inactive.length ? (
        <section className="sgcg-card">
          <button type="button" onClick={() => setShowInactive((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="text-[14px] font-semibold text-on-surface/80">Desativados ({inactive.length})</span>
            <ChevronDown size={16} className={`text-on-surface/50 transition-transform ${showInactive ? 'rotate-180' : ''}`} />
          </button>
          {showInactive ? (
            <div className="border-t border-outline">
              <DataTable
                rows={inactive}
                columns={[
                  { key: 'n', label: 'Aparelho', render: (v) => <span className="text-on-surface/70">{vipName(v)}</span> },
                  { key: 'ip', label: 'IP', mono: true, render: (v) => v.ip },
                  { key: 'w', label: 'Desativado', render: (v) => <span className="text-[12px] text-on-surface/55">{v.revoked_at ? `${new Date(v.revoked_at).toLocaleDateString('pt-BR')}${v.revoked_by ? ` por ${v.revoked_by}` : ''}` : '—'}</span> },
                  { key: 'a', label: '', align: 'right', render: (v) => <Button variant="ghost" icon={RotateCcw} onClick={() => reactivate(v)} disabled={busy}>Reativar</Button> },
                ]}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center gap-2 px-1 text-[12px] text-on-surface/50"><ShieldCheck size={14} />Cada alteração em VIP é aplicada na rede na hora e fica registrada na auditoria.</div>

      <VipEditor open={Boolean(editing)} vip={editing?.vip} devices={devices} busy={busy} onClose={() => !busy && setEditing(null)} onSave={save} />
    </div>
  );
}
