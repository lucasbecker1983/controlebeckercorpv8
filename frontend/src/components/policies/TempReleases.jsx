import { useEffect, useMemo, useState } from 'react';
import { Clock, Timer, XCircle } from 'lucide-react';
import { Badge, Button, DataTable, Field, Notice, Panel, askConfirm, inputCls } from '../ui/kit';
import { IPV4, VlanChip, brSend, remaining, timeBR } from './shared';

/*
 * Liberações temporárias: passe livre por um prazo para um aparelho (ex.: curso no YouTube).
 * No motor atual o aparelho fica como VIP durante o prazo; o que foi pedido fica registrado.
 */

const NEEDS = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'redes_sociais', label: 'Redes sociais' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'noticias', label: 'Notícias' },
];
const NEED_LABEL = Object.fromEntries(NEEDS.map((n) => [n.key, n.label]));
const DURATIONS = [30, 60, 120, 240, 480];
const durLabel = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);
const EMPTY = { ip: '192.168.10.', requested_by: '', needs: ['youtube'], domains: '', duration: 60, custom: '', justification: '' };
const vlanOf = (ip) => Number(String(ip || '').split('.')[2]) || null;

export const isActiveRelease = (s, now = Date.now()) => s.active && new Date(s.expires_at).getTime() > now;

export default function TempReleases({ sporadic, devices, runChange, busy }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const active = useMemo(() => sporadic.filter((s) => isActiveRelease(s, now)).sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at)), [sporadic, now]);
  const history = useMemo(() => sporadic.filter((s) => !isActiveRelease(s, now)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30), [sporadic, now]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const seen = IPV4.test(form.ip) ? devices.get(form.ip) : null;
  const minutes = form.duration === 'custom' ? Number(form.custom) : form.duration;

  const submit = async (e) => {
    e.preventDefault();
    if (!IPV4.test(form.ip.trim())) return setError('IP inválido.');
    if (!form.requested_by.trim()) return setError('Informe quem pediu.');
    if (!(minutes >= 1 && minutes <= 1440)) return setError('Duração entre 1 minuto e 24 horas.');
    if (form.justification.trim().length < 5) return setError('Escreva o motivo (pelo menos 5 caracteres).');
    setError('');
    const domains = form.domains.split(/[\n,;\s]+/).map((d) => d.trim()).filter(Boolean);
    try {
      await runChange(() => brSend('post', 'sporadic-exceptions', {
        ip: form.ip.trim(),
        requested_by: form.requested_by.trim(),
        approved_categories: form.needs,
        custom_domains: domains,
        justification: form.justification.trim(),
        duration_minutes: minutes,
      }), `Liberação de ${durLabel(minutes)} criada para ${form.ip.trim()}.`, { rethrow: true });
      setForm(EMPTY);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Não foi possível liberar.');
    }
  };

  const revoke = async (s) => {
    const ok = await askConfirm({ title: `Encerrar a liberação de ${s.ip}?`, description: `O aparelho volta às regras normais agora, antes do prazo (${timeBR(s.expires_at)}).`, confirmLabel: 'Encerrar agora', tone: 'danger' });
    if (!ok) return;
    await runChange(() => brSend('post', `sporadic-exceptions/${s.id}/revoke`), `Liberação de ${s.ip} encerrada.`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-4">
        <Panel title={`Em vigor (${active.length})`} description="Terminam sozinhas no prazo. Encerre antes se não precisar mais." padded={false}>
          {active.length ? (
            <ul className="divide-y divide-outline">
              {active.map((s) => {
                const total = Number(s.duration_minutes) * 60000;
                const left = Math.max(0, new Date(s.expires_at).getTime() - now);
                const pct = total ? Math.min(100, Math.round((left / total) * 100)) : 0;
                const dev = devices.get(String(s.ip));
                return (
                  <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"><Timer size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular font-semibold text-on-surface">{s.ip}</span>
                        {vlanOf(s.ip) ? <VlanChip id={vlanOf(s.ip)} small /> : null}
                        {dev?.hostname ? <span className="text-[12px] text-on-surface/55">{dev.hostname}</span> : null}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-on-surface/60">
                        {s.requested_by} · {(s.approved_categories || []).map((c) => NEED_LABEL[c] || c).concat(s.custom_domains || []).join(', ') || 'liberação geral'} · “{s.justification}”
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-on-surface/[0.08]"><div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                      <div className="text-right"><div className="tabular text-[15px] font-bold text-on-surface">{remaining(s.expires_at, now)}</div><div className="text-[11px] text-on-surface/50">até {timeBR(s.expires_at)}</div></div>
                      <Button variant="danger-soft" icon={XCircle} onClick={() => revoke(s)} disabled={busy}>Encerrar</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="px-4 py-8 text-center text-sm text-on-surface/55">Nenhuma liberação temporária agora.</p>}
        </Panel>

        <Panel title="Histórico" description="Últimas 30 liberações encerradas ou vencidas." padded={false}>
          <DataTable
            rows={history}
            empty="Sem histórico."
            columns={[
              { key: 'ip', label: 'Aparelho', mono: true, render: (s) => s.ip },
              { key: 'q', label: 'Pedido por', render: (s) => s.requested_by },
              { key: 'm', label: 'Motivo', render: (s) => <span className="line-clamp-1 text-on-surface/70">{s.justification}</span> },
              { key: 'd', label: 'Duração', render: (s) => durLabel(Number(s.duration_minutes)) },
              { key: 'w', label: 'Quando', render: (s) => <span className="tabular text-[12px]">{new Date(s.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span> },
              { key: 's', label: 'Situação', render: (s) => (s.revoked_at ? <Badge>Encerrada{s.revoked_by ? ` por ${s.revoked_by}` : ''}</Badge> : <Badge>Venceu</Badge>) },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Nova liberação" description="Para um aparelho, por tempo limitado.">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="tr-ip" label="IP do aparelho" hint={seen ? (seen.hostname || 'na rede agora') : ' '}>
              <input id="tr-ip" className={`${inputCls} tabular`} value={form.ip} onChange={(e) => set({ ip: e.target.value.trim() })} />
            </Field>
            <Field id="tr-req" label="Quem pediu">
              <input id="tr-req" className={inputCls} value={form.requested_by} onChange={(e) => set({ requested_by: e.target.value })} placeholder="Nome" />
            </Field>
          </div>
          <Field label="O que precisa acessar">
            <div className="flex flex-wrap gap-1.5">
              {NEEDS.map((n) => {
                const on = form.needs.includes(n.key);
                return <button key={n.key} type="button" onClick={() => set({ needs: on ? form.needs.filter((x) => x !== n.key) : [...form.needs, n.key] })} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-outline text-on-surface/60 hover:border-primary/40'}`}>{n.label}</button>;
              })}
            </div>
          </Field>
          <Field id="tr-domains" label="Outros sites (opcional)">
            <input id="tr-domains" className={inputCls} value={form.domains} onChange={(e) => set({ domains: e.target.value })} placeholder="ex.: plataformacurso.com.br" />
          </Field>
          <Field label="Por quanto tempo">
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((m) => <button key={m} type="button" onClick={() => set({ duration: m })} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${form.duration === m ? 'border-primary bg-primary text-on-primary' : 'border-outline text-on-surface/65 hover:border-primary/40'}`}>{durLabel(m)}</button>)}
              <button type="button" onClick={() => set({ duration: 'custom' })} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${form.duration === 'custom' ? 'border-primary bg-primary text-on-primary' : 'border-outline text-on-surface/65 hover:border-primary/40'}`}>Outro</button>
            </div>
            {form.duration === 'custom' ? <div className="mt-2 flex items-center gap-2"><input type="number" min="1" max="1440" className={`${inputCls} tabular w-28`} value={form.custom} onChange={(e) => set({ custom: e.target.value })} aria-label="Minutos" /><span className="text-[12.5px] text-on-surface/60">minutos</span></div> : null}
          </Field>
          <Field id="tr-just" label="Motivo">
            <textarea id="tr-just" className={`${inputCls} min-h-[64px]`} value={form.justification} onChange={(e) => set({ justification: e.target.value })} placeholder="Ex.: curso obrigatório pelo YouTube" />
          </Field>
          <Notice tone="warning">Durante o prazo, o aparelho navega sem os filtros de categoria, como um VIP. Malware, phishing e conteúdo adulto continuam bloqueados.</Notice>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" variant="primary" icon={Clock} disabled={busy} className="w-full">{busy ? 'Aplicando...' : `Liberar por ${Number.isFinite(minutes) && minutes > 0 ? durLabel(minutes) : '...'}`}</Button>
        </form>
      </Panel>
    </div>
  );
}
