import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Database, KeyRound, Radar, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Field, Notice, Panel, Switch, askConfirm, errorMessage, inputCls, toast } from '../ui/kit';

/*
 * Módulo restrito ao GOD: chaves dos provedores de IA, ordem de uso e o catálogo de modelos GRATUITOS mantido pelo
 * caçador. A chave só vai do campo para o servidor (que grava no .env); ela nunca volta para esta tela.
 */

const KEY_LINK = {
  gemini: { href: 'https://aistudio.google.com/apikey', text: 'aistudio.google.com/apikey' },
  groq: { href: 'https://console.groq.com/keys', text: 'console.groq.com/keys' },
  openrouter: { href: 'https://openrouter.ai/keys', text: 'openrouter.ai/keys' },
};

const STATUS = {
  ok: { tone: 'success', label: 'Funcionando' },
  unverified: { tone: 'neutral', label: 'Ainda não testado' },
  limited: { tone: 'warning', label: 'Sem cota agora' },
  error: { tone: 'danger', label: 'Falhou' },
  gone: { tone: 'neutral', label: 'Descontinuado' },
};

const EVENT_TONE = { novo: 'success', voltou: 'success', recuperou: 'success', descontinuado: 'danger', falhou: 'danger', 'sem cota': 'warning' };

const when = (value) => (value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function ProviderCard({ item, index, total, onChanged, onMove }) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const link = KEY_LINK[item.provider];

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      const res = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(res) : ok, 'success');
      await onChanged();
      return res;
    } catch (e) {
      toast(errorMessage(e), 'danger');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const res = await run(() => api.put(`/api/ai/admin/keys/${item.provider}`, { key: key.trim() }), 'Chave salva no .env do servidor. Já estou procurando os modelos gratuitos dela.');
    if (res) {
      setKey('');
      setEditing(false);
    }
  };

  const remove = async () => {
    if (!(await askConfirm({ title: `Remover a chave do ${item.label}?`, description: 'O assistente deixa de usar este provedor e a chave é apagada do .env do servidor. Para voltar, será preciso cadastrar uma chave de novo.', confirmLabel: 'Remover chave', tone: 'danger' }))) return;
    await run(() => api.delete(`/api/ai/admin/keys/${item.provider}`), 'Chave removida.');
  };

  const test = () => run(() => api.post(`/api/ai/admin/keys/${item.provider}/test`).then((r) => r.data), (r) => (r.ok ? r.message : `Falhou: ${r.message}`));

  return (
    <div className="rounded-xl border border-outline p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound size={17} /></span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-on-surface">{index + 1}º · {item.label}</div>
            <div className="text-[12px] text-on-surface/55">{item.configured ? <>Chave <span className="tabular">{item.hint}</span> guardada no .env</> : 'Sem chave cadastrada'}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" icon={ArrowUp} onClick={() => onMove(item.provider, -1)} disabled={busy || index === 0} aria-label={`Subir ${item.label}`} title="Usar antes" />
          <Button variant="ghost" icon={ArrowDown} onClick={() => onMove(item.provider, 1)} disabled={busy || index === total - 1} aria-label={`Descer ${item.label}`} title="Usar depois" />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-on-surface/70">
          <Switch checked={item.enabled} disabled={busy} onChange={(v) => run(() => api.put('/api/ai/admin/settings', { enabled: { [item.provider]: v } }), v ? `${item.label} ligado.` : `${item.label} desligado.`)} label={`Usar ${item.label}`} />
          {item.enabled ? 'Ligado' : 'Desligado'}
        </label>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Field id={`key-${item.provider}`} label={`Chave do ${item.label}`} hint={<>Plano gratuito. Gere em <a className="text-primary underline" href={link.href} target="_blank" rel="noreferrer noopener">{link.text}</a>. Cole só a chave.</>}>
            <input id={`key-${item.provider}`} type="password" autoComplete="off" spellCheck={false} className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Cole a chave aqui" />
          </Field>
          <div className="flex gap-2">
            <Button variant="primary" onClick={save} disabled={busy || key.trim().length < 20}>{busy ? 'Salvando...' : 'Salvar chave'}</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setKey(''); }} disabled={busy}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setEditing(true)} disabled={busy}>{item.configured ? 'Trocar chave' : 'Cadastrar chave'}</Button>
          <Button onClick={test} disabled={busy || (!item.configured && item.provider !== 'openrouter')}>Testar</Button>
          {item.configured ? <Button variant="danger-soft" icon={Trash2} onClick={remove} disabled={busy}>Remover chave</Button> : null}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = {
  doc: 'Documentação', script: 'Scripts', config: 'Configurações', servico: 'Serviços', timer: 'Timers', porta: 'Portas', pm2: 'Processos pm2',
  nginx: 'Sites nginx', projeto: 'Projetos', banco: 'Bancos', tabela: 'Tabelas', firewall: 'Firewall', docker: 'Docker', sistema: 'Servidor',
};

/*
 * Base de conhecimento do servidor inteiro: o que o assistente "sabe" além do banco de auditoria. Indexada no PostgreSQL
 * a cada 30 min (e sob demanda) a partir de documentação, configurações, serviços, portas, projetos e catálogo do banco.
 * Segredos são apagados antes de gravar; projetos sensíveis ficam sem documentação na base.
 */
function KnowledgePanel() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/ai/admin/knowledge');
      setInfo(res.data);
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reindex = async () => {
    setBusy(true);
    try {
      const res = await api.post('/api/ai/admin/knowledge/reindex');
      const r = res.data.summary;
      toast(`Base atualizada: ${r.total} itens, ${r.changed} novos ou alterados, ${r.removed} removidos.`, 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const search = async (ev) => {
    ev.preventDefault();
    if (q.trim().length < 3) return;
    try {
      const res = await api.get('/api/ai/admin/knowledge/search', { params: { q: q.trim() } });
      setHits(res.data.hits);
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  const last = info?.last_runs?.[0];
  const errs = Object.entries(last?.errors || {});
  return (
    <Panel
      title="Base de conhecimento do servidor"
      description="O que o assistente consulta para responder sobre o servidor: documentação dos projetos, configurações, serviços, portas, timers, domínios e catálogo do banco. Atualiza a cada 30 minutos."
      action={<Button variant="primary" icon={RefreshCw} onClick={reindex} disabled={busy || info?.indexing}>{busy || info?.indexing ? 'Indexando…' : 'Reindexar agora'}</Button>}
    >
      {!info ? <p className="text-sm text-on-surface/55">Carregando…</p> : (
        <div className="space-y-3 text-[12.5px] text-on-surface/75">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold text-on-surface"><Database size={14} /> {info.total.toLocaleString('pt-BR')} itens</span>
            {info.by_kind.map((k) => <Badge key={k.kind} tone="neutral">{KIND_LABEL[k.kind] || k.kind}: {k.total}</Badge>)}
          </div>
          {last ? (
            <div>
              Última indexação: <b>{when(last.finished_at || last.started_at)}</b> ({last.trigger}) · {last.changed ?? 0} alterados, {last.removed ?? 0} removidos · {last.redactions ?? 0} trechos com segredo ou dado pessoal apagados antes de gravar.
              {errs.length ? <span className="text-danger"> · avisos: {errs.map(([k, v]) => `${k} (${v})`).join('; ')}</span> : null}
            </div>
          ) : null}
          <div>Sem documentação indexada (por cautela): <span className="tabular">{(info.excluded_projects || []).map((x) => String(x).replace(/[\^$]/g, '')).join(', ')}</span>. Os fatos operacionais deles (serviço, porta, memória) continuam, porque explicam o consumo do servidor.</div>
          <form onSubmit={search} className="flex flex-wrap items-center gap-2">
            <input aria-label="Testar a busca da base" className={`${inputCls} max-w-md flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Teste a busca: ex. porta do cafetech, timers do sgcg" />
            <Button type="submit" icon={Search} disabled={q.trim().length < 3}>Buscar</Button>
          </form>
          {hits ? (
            hits.length ? (
              <ul className="space-y-2">
                {hits.map((h, i) => (
                  <li key={`${h.fonte}-${i}`} className="rounded-lg border border-outline p-3">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone="primary">{KIND_LABEL[h.tipo] || h.tipo}</Badge><span className="tabular break-all font-medium text-on-surface">{h.fonte}</span><span className="text-on-surface/50">relevância {h.score} · indexado {when(h.atualizado_em)}</span></div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-on-surface/70">{h.trecho.slice(0, 420)}{h.trecho.length > 420 ? '…' : ''}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-on-surface/55">Nada encontrado.</p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

export default function AiProviders() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showGone, setShowGone] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/ai/admin/overview');
      setData(res.data);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Enquanto o caçador procura, atualiza a cada 4 s.
  useEffect(() => {
    if (!data?.hunting) return undefined;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [data?.hunting, load]);

  const move = async (provider, delta) => {
    const order = [...data.order];
    const from = order.indexOf(provider);
    const to = from + delta;
    if (to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    try {
      await api.put('/api/ai/admin/settings', { order });
      await load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  const hunt = async () => {
    try {
      await api.post('/api/ai/admin/hunt');
      toast('Caçador iniciado. Lista e testa os modelos gratuitos agora.', 'success');
      await load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  if (error && !data) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <p className="text-sm text-on-surface/55">Carregando…</p>;

  const providers = data.order.map((p) => data.providers.find((x) => x.provider === p)).filter(Boolean);
  const models = data.models.filter((m) => (showGone || m.status !== 'gone') && (filter === 'all' || m.provider === filter));
  const run = data.runs?.[0];
  const label = (p) => data.providers.find((x) => x.provider === p)?.label || p;

  return (
    <div className="space-y-4">
      <Notice tone="primary">
        <span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> Área restrita ao GOD.</span>{' '}
        As chaves ficam só no <code>.env</code> do servidor e nunca voltam para esta tela. Só entram modelos <b>gratuitos</b>, e o assistente os usa na ordem abaixo, trocando sozinho quando um falha, é aposentado ou fica sem cota.
      </Notice>

      <Panel title="Provedores de IA" description="Ordem de preferência (o assistente ainda escolhe o melhor modelo para cada pergunta entre os que estiverem funcionando).">
        <div className="space-y-3">
          {providers.map((p, i) => <ProviderCard key={p.provider} item={p} index={i} total={providers.length} onChanged={load} onMove={move} />)}
        </div>
      </Panel>

      <Panel
        title="Caçador de modelos gratuitos"
        description="Roda no boot e a cada 6 horas: lista o que cada provedor oferece de graça, testa os melhores, aposenta o que sumiu e inclui o que chegou."
        action={<Button variant="primary" icon={Radar} onClick={hunt} disabled={data.hunting}>{data.hunting ? 'Procurando…' : 'Caçar agora'}</Button>}
      >
        {run ? (
          <div className="space-y-2 text-[12.5px] text-on-surface/75">
            <div>Última busca: <b>{when(run.finished_at || run.started_at)}</b> ({String(run.trigger).split(':')[0]}){run.error ? <span className="text-danger"> · erro: {run.error}</span> : null}</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(run.summary?.providers || {}).map(([p, info]) => (
                <Badge key={p} tone={info.error ? 'danger' : info.skipped ? 'neutral' : 'success'}>
                  {label(p)}: {info.skipped ? info.skipped : info.error ? info.error.slice(0, 60) : `${info.free} gratuitos${info.added ? `, ${info.added} novos` : ''}${info.gone ? `, ${info.gone} saíram` : ''}${info.probed ? `, ${info.ok}/${info.probed} testados ok` : ''}`}
                </Badge>
              ))}
            </div>
          </div>
        ) : <p className="text-sm text-on-surface/55">Ainda não rodou.</p>}
      </Panel>

      <KnowledgePanel />

      <Panel title="Modelos gratuitos" description="Do melhor para o pior dentro de cada provedor. O assistente só chama modelos desta lista.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {['all', ...data.order].map((p) => (
            <button key={p} type="button" onClick={() => setFilter(p)} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${filter === p ? 'border-primary bg-primary text-on-primary' : 'border-outline text-on-surface/65 hover:border-primary/40'}`}>
              {p === 'all' ? 'Todos' : label(p)}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-on-surface/65"><Switch checked={showGone} onChange={setShowGone} label="Mostrar descontinuados" /> Mostrar descontinuados</label>
        </div>
        <DataTable
          rowKey="model_id"
          rows={models}
          empty="Nenhum modelo ainda. Cadastre uma chave e clique em Caçar agora."
          columns={[
            { key: 'p', label: 'Provedor', render: (m) => label(m.provider) },
            { key: 'm', label: 'Modelo', render: (m) => <span className="tabular break-all font-medium text-on-surface">{m.model_id}</span> },
            { key: 's', label: 'Estado', render: (m) => <Badge tone={STATUS[m.status]?.tone}>{STATUS[m.status]?.label || m.status}</Badge> },
            { key: 'l', label: 'Resposta', render: (m) => (m.latency_ms ? `${(m.latency_ms / 1000).toFixed(1)} s` : '—') },
            { key: 'c', label: 'Contexto', render: (m) => (m.context_length ? `${Math.round(m.context_length / 1000)} mil` : '—') },
            { key: 'n', label: 'Nota', render: (m) => m.score },
            { key: 'v', label: 'Testado', render: (m) => when(m.last_probe_at) },
            { key: 'e', label: 'Observação', render: (m) => <span className="text-[12px] text-on-surface/55">{m.last_error ? String(m.last_error).slice(0, 90) : m.free_basis}</span> },
          ]}
        />
      </Panel>

      <Panel title="O que mudou no menu de modelos" description="Modelos novos, aposentados, que voltaram, que falharam ou ficaram sem cota.">
        <DataTable
          rowKey="id"
          rows={(data.events || []).map((e, i) => ({ ...e, id: `${e.at}-${i}` }))}
          empty="Sem mudanças registradas ainda."
          columns={[
            { key: 'a', label: 'Quando', render: (e) => when(e.at) },
            { key: 'e', label: 'Evento', render: (e) => <Badge tone={EVENT_TONE[e.event] || 'neutral'}>{e.event}</Badge> },
            { key: 'm', label: 'Modelo', render: (e) => <span className="tabular break-all">{label(e.provider)} · {e.model_id}</span> },
            { key: 'd', label: 'Detalhe', render: (e) => <span className="text-[12px] text-on-surface/60">{e.detail || ''}</span> },
          ]}
        />
      </Panel>
    </div>
  );
}
