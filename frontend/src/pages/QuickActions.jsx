import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, Check, Gauge, Timer, Trash2, Unlock } from 'lucide-react';
import { api } from '../services/api';

/*
 * Ações do dia a dia em formulários curtos, sem precisar entender ACL, RPZ ou tc.
 * Cada ação chama a mesma API que as telas completas já usam.
 */

const ACTIONS = [
  { key: 'banda', icon: Gauge, title: 'Banda total para um dispositivo', desc: 'Tira o limite de banda da VLAN para um IP. Útil para videoconferência, atualização ou quem precisa de prioridade.' },
  { key: 'temporaria', icon: Timer, title: 'Liberar sites por um tempo', desc: 'Libera redes sociais, YouTube ou sites específicos para um IP, com prazo e justificativa.' },
  { key: 'liberar', icon: Unlock, title: 'Liberar um site', desc: 'Libera um domínio para todas as VLANs ou para uma VLAN, de forma permanente.' },
  { key: 'bloquear', icon: Ban, title: 'Bloquear um site', desc: 'Bloqueia um domínio para todas as VLANs ou para uma VLAN, de forma permanente.' },
];

const POLICY_VLANS = [
  { value: 'global', label: 'Todas as VLANs' },
  { value: '10', label: 'VLAN 10 · Secretaria' },
  { value: '30', label: 'VLAN 30 · Celulares' },
  { value: '50', label: 'VLAN 50 · SINE' },
  { value: '70', label: 'VLAN 70 · Visitantes' },
];

const CATEGORIES = [
  { key: 'redes_sociais', label: 'Redes sociais' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'streaming', label: 'Streaming de vídeo' },
  { key: 'noticias', label: 'Portais de notícias' },
];

const DURATIONS = [
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: 'Expediente (8 h)' },
];

const IP_RE = /^192\.168\.(\d{1,3})\.(\d{1,3})$/;
const cleanDomain = (value) => value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
const errorText = (error) => error?.response?.data?.error || error?.message || 'Falha ao aplicar.';

const inputCls = 'w-full rounded-lg border border-outline bg-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
const labelCls = 'mb-1 block text-[12.5px] font-semibold text-on-surface/75';

function Field({ id, label, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {hint ? <p className="mt-1 text-[11.5px] text-on-surface/50">{hint}</p> : null}
    </div>
  );
}

function Result({ result }) {
  if (!result) return null;
  return (
    <p className={`rounded-lg px-3 py-2 text-[13px] ${result.ok ? 'bg-success/8 text-success' : 'bg-danger/8 text-danger'}`} role="status">
      {result.text}
    </p>
  );
}

function BandwidthForm({ initialIp, qos, reloadQos }) {
  const [ip, setIp] = useState(initialIp || '');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState(null);
  const match = ip.trim().match(IP_RE);
  const iface = match ? `enp6s0.${match[1]}` : null;
  const policy = iface ? qos?.[iface] : null;
  const already = policy?.vips?.some((v) => String(v.ip).replace(/\/32$/, '') === ip.trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!policy) return;
    if (!confirm) { setConfirm(true); return; }
    setBusy(true);
    setResult(null);
    try {
      const vips = [...(policy.vips || []).map((v) => ({ ip: String(v.ip).replace(/\/32$/, ''), label: v.label || '' })), { ip: ip.trim(), label: label.trim() || 'Banda total' }];
      await api.post('/api/qos/apply', { interface: iface, download: policy.down_limit, upload: policy.up_limit, vips });
      setResult({ ok: true, text: `${ip.trim()} agora usa a banda sem o limite da VLAN.` });
      setConfirm(false);
      setLabel('');
      reloadQos();
    } catch (error) {
      setResult({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bw-ip" label="IP do dispositivo" hint={iface && !policy ? 'Esta VLAN não tem controle de banda.' : iface ? `VLAN ${match[1]} · limite atual ${policy?.down_limit || '—'} Mbps` : 'Ex.: 192.168.10.50'}>
          <input id="bw-ip" className={inputCls} value={ip} onChange={(e) => { setIp(e.target.value); setConfirm(false); }} placeholder="192.168.10.50" inputMode="decimal" required />
        </Field>
        <Field id="bw-label" label="Identificação" hint="Quem é ou por que precisa.">
          <input id="bw-label" className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Gabinete · videoconferência" maxLength={60} />
        </Field>
      </div>
      {already ? <p className="text-[12.5px] text-on-surface/60">Este IP já tem banda total.</p> : null}
      {confirm ? (
        <p className="rounded-lg bg-warning/8 px-3 py-2 text-[12.5px] text-warning">As filas de banda da VLAN {match?.[1]} serão reaplicadas. A rede dessa VLAN pisca por menos de um segundo. Clique de novo para confirmar.</p>
      ) : null}
      <button type="submit" disabled={busy || !policy || already} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">
        <Gauge size={15} />{busy ? 'Aplicando...' : confirm ? 'Confirmar banda total' : 'Dar banda total'}
      </button>
      <Result result={result} />
    </form>
  );
}

function TemporaryForm({ initialIp, onDone }) {
  const [form, setForm] = useState({ ip: initialIp || '', requested_by: '', justification: '', duration_minutes: 60, categories: [], domains: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const domains = form.domains.split(/[\n,;\s]+/).map(cleanDomain).filter(Boolean);
  const valid = IP_RE.test(form.ip.trim()) && form.requested_by.trim() && form.justification.trim().length >= 10 && (form.categories.length || domains.length);

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setResult(null);
    try {
      await api.post('/api/bloqueios-liberacoes/sporadic-exceptions', {
        ip: form.ip.trim(),
        requested_by: form.requested_by.trim(),
        justification: form.justification.trim(),
        duration_minutes: Number(form.duration_minutes),
        approved_categories: form.categories,
        custom_domains: domains,
      });
      setResult({ ok: true, text: `Liberação aplicada para ${form.ip.trim()} por ${DURATIONS.find((d) => d.value === Number(form.duration_minutes))?.label || `${form.duration_minutes} min`}.` });
      setForm((f) => ({ ...f, justification: '', categories: [], domains: '' }));
      onDone();
    } catch (error) {
      setResult({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="tmp-ip" label="IP do dispositivo">
          <input id="tmp-ip" className={inputCls} value={form.ip} onChange={(e) => set('ip', e.target.value)} placeholder="192.168.10.50" required />
        </Field>
        <Field id="tmp-who" label="Quem pediu">
          <input id="tmp-who" className={inputCls} value={form.requested_by} onChange={(e) => set('requested_by', e.target.value)} placeholder="Nome do solicitante" required />
        </Field>
        <Field id="tmp-dur" label="Por quanto tempo">
          <select id="tmp-dur" className={inputCls} value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)}>
            {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className={labelCls}>O que liberar</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = form.categories.includes(c.key);
            return (
              <button key={c.key} type="button" aria-pressed={on} onClick={() => set('categories', on ? form.categories.filter((k) => k !== c.key) : [...form.categories, c.key])} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold ${on ? 'border-primary bg-primary/10 text-primary' : 'border-outline text-on-surface/70 hover:text-on-surface'}`}>
                {on ? <Check size={13} /> : null}{c.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Field id="tmp-domains" label="Sites específicos (opcional)" hint="Um por linha ou separados por vírgula.">
        <textarea id="tmp-domains" className={`${inputCls} min-h-[64px]`} value={form.domains} onChange={(e) => set('domains', e.target.value)} placeholder="exemplo.com.br" />
      </Field>
      <Field id="tmp-why" label="Justificativa" hint="Mínimo de 10 caracteres. Fica registrada na auditoria.">
        <input id="tmp-why" className={inputCls} value={form.justification} onChange={(e) => set('justification', e.target.value)} placeholder="Divulgação de evento da Secretaria nas redes sociais" required />
      </Field>
      <button type="submit" disabled={busy || !valid} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">
        <Timer size={15} />{busy ? 'Aplicando...' : 'Liberar por tempo'}
      </button>
      <Result result={result} />
    </form>
  );
}

function DomainForm({ kind, initialDomain }) {
  const [domain, setDomain] = useState(initialDomain || '');
  const [scope, setScope] = useState('global');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const block = kind === 'bloquear';
  const clean = cleanDomain(domain);
  const valid = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean) && reason.trim().length >= 10;

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setResult(null);
    try {
      await api.post(`/api/bloqueios-liberacoes/${block ? 'blocklist' : 'allowlist'}`, {
        domain: clean,
        scope_type: scope === 'global' ? 'global' : 'vlan',
        scope_value: scope === 'global' ? 'global' : scope,
        reason: reason.trim(),
        origin_rule: 'acoes-rapidas',
      });
      setResult({ ok: true, text: `${clean} ${block ? 'bloqueado' : 'liberado'} em ${POLICY_VLANS.find((v) => v.value === scope)?.label}.` });
      setDomain('');
      setReason('');
    } catch (error) {
      setResult({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${kind}-domain`} label="Site" hint={clean && clean !== domain.trim() ? `Será usado: ${clean}` : 'Ex.: instagram.com'}>
          <input id={`${kind}-domain`} className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="exemplo.com.br" required />
        </Field>
        <Field id={`${kind}-scope`} label="Onde">
          <select id={`${kind}-scope`} className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)}>
            {POLICY_VLANS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field id={`${kind}-reason`} label="Motivo" hint="Mínimo de 10 caracteres. Fica registrado na auditoria.">
        <input id={`${kind}-reason`} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={block ? 'Site sem relação com o trabalho' : 'Sistema usado pelo setor de compras'} required />
      </Field>
      <button type="submit" disabled={busy || !valid} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${block ? 'bg-danger' : 'bg-primary'}`}>
        {block ? <Ban size={15} /> : <Unlock size={15} />}{busy ? 'Aplicando...' : block ? 'Bloquear site' : 'Liberar site'}
      </button>
      <Result result={result} />
    </form>
  );
}

export default function QuickActions() {
  const [params, setParams] = useSearchParams();
  const active = ACTIONS.some((a) => a.key === params.get('acao')) ? params.get('acao') : 'banda';
  const [qos, setQos] = useState(null);
  const [sporadic, setSporadic] = useState([]);
  const [removing, setRemoving] = useState(null);
  const [listMsg, setListMsg] = useState(null);

  const reloadQos = () => api.get('/api/qos').then((res) => setQos(res.data)).catch(() => null);
  const reloadSporadic = () => api.get('/api/bloqueios-liberacoes/sporadic-exceptions').then((res) => {
    const rows = Array.isArray(res.data) ? res.data : res.data?.items || res.data?.rows || [];
    setSporadic(rows.filter((r) => r.active && new Date(r.expires_at) > new Date()));
  }).catch(() => null);

  useEffect(() => { reloadQos(); reloadSporadic(); }, []);

  const vips = useMemo(() => Object.values(qos || {}).flatMap((p) => (p.vips || []).map((v) => ({ ...v, ip: String(v.ip).replace(/\/32$/, ''), iface: p.interface, policy: p }))), [qos]);

  const removeVip = async (vip) => {
    if (removing !== vip.ip) { setRemoving(vip.ip); return; }
    try {
      const rest = (vip.policy.vips || []).map((v) => ({ ip: String(v.ip).replace(/\/32$/, ''), label: v.label || '' })).filter((v) => v.ip !== vip.ip);
      await api.post('/api/qos/apply', { interface: vip.iface, download: vip.policy.down_limit, upload: vip.policy.up_limit, vips: rest });
      setListMsg({ ok: true, text: `${vip.ip} voltou ao limite da VLAN.` });
      reloadQos();
    } catch (error) {
      setListMsg({ ok: false, text: errorText(error) });
    } finally {
      setRemoving(null);
    }
  };

  const revoke = async (item) => {
    try {
      await api.post(`/api/bloqueios-liberacoes/sporadic-exceptions/${item.id}/revoke`);
      setListMsg({ ok: true, text: `Liberação de ${item.ip} encerrada.` });
      reloadSporadic();
    } catch (error) {
      setListMsg({ ok: false, text: errorText(error) });
    }
  };

  const current = ACTIONS.find((a) => a.key === active);
  const choose = (key) => {
    const next = new URLSearchParams(params);
    next.set('acao', key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Ações Rápidas</h1>
        <p className="text-sm text-on-surface/55">As tarefas mais comuns em um formulário só. Tudo fica registrado na auditoria.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="tablist">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const on = action.key === active;
          return (
            <button
              key={action.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => choose(action.key)}
              className={`sgcg-card flex flex-col items-start gap-1.5 p-4 text-left transition-colors ${on ? 'border-primary ring-2 ring-primary/15' : 'hover:border-primary/40'}`}
            >
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${action.key === 'bloquear' ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}><Icon size={17} /></span>
              <span className="text-sm font-semibold text-on-surface">{action.title}</span>
              <span className="text-[12.5px] leading-5 text-on-surface/55">{action.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="sgcg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-on-surface">{current.title}</h2>
          {active === 'banda' ? <BandwidthForm key={`b-${params.get('ip')}`} initialIp={params.get('ip')} qos={qos} reloadQos={reloadQos} /> : null}
          {active === 'temporaria' ? <TemporaryForm key={`t-${params.get('ip')}`} initialIp={params.get('ip')} onDone={reloadSporadic} /> : null}
          {active === 'liberar' ? <DomainForm key={`l-${params.get('dominio')}`} kind="liberar" initialDomain={params.get('dominio')} /> : null}
          {active === 'bloquear' ? <DomainForm key={`x-${params.get('dominio')}`} kind="bloquear" initialDomain={params.get('dominio')} /> : null}
        </section>

        <aside className="space-y-4">
          <Result result={listMsg} />
          <section className="sgcg-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-on-surface">Com banda total ({vips.length})</h2>
            {vips.length ? (
              <ul className="divide-y divide-outline text-[13px]">
                {vips.map((vip) => (
                  <li key={`${vip.iface}-${vip.ip}`} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="tabular font-medium text-on-surface">{vip.ip}</div>
                      <div className="truncate text-[12px] text-on-surface/55">{vip.label || 'Sem identificação'} · VLAN {vip.iface.split('.').pop()}</div>
                    </div>
                    <button type="button" onClick={() => removeVip(vip)} className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[12px] font-semibold ${removing === vip.ip ? 'border-danger bg-danger text-white' : 'border-outline text-on-surface/60 hover:text-danger'}`}>
                      <Trash2 size={13} />{removing === vip.ip ? 'Confirmar' : 'Remover'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[12.5px] text-on-surface/55">Nenhum dispositivo com banda total.</p>}
          </section>
          <section className="sgcg-card p-4">
            <h2 className="mb-2 text-sm font-semibold text-on-surface">Liberações temporárias em vigor ({sporadic.length})</h2>
            {sporadic.length ? (
              <ul className="divide-y divide-outline text-[13px]">
                {sporadic.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="tabular font-medium text-on-surface">{item.ip}</div>
                      <div className="truncate text-[12px] text-on-surface/55">até {new Date(item.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {item.requested_by}</div>
                    </div>
                    <button type="button" onClick={() => revoke(item)} className="shrink-0 rounded-lg border border-outline px-2 py-1 text-[12px] font-semibold text-on-surface/60 hover:text-danger">Encerrar</button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[12.5px] text-on-surface/55">Nenhuma liberação temporária ativa.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
