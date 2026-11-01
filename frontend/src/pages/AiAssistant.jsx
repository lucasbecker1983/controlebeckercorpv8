import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, RefreshCw, Send, Sparkles, UserRound } from 'lucide-react';
import { api } from '../services/api';
import { storageGet, storageSet } from '../services/browserStorage';
import { Badge, Button, Notice, PageHeader, Panel } from '../components/ui/kit';

const STORAGE_KEY = 'sgcg_ai_assistant_thread_v2';

const starterPrompts = [
  'Quem parou ou reiniciou serviços do servidor nos últimos 7 dias? Diga serviço, horário e IP.',
  'Quem cadastrou, inativou ou apagou colaboradores recentemente? De qual IP?',
  'Quais logins aconteceram no console nos últimos dias e de quais IPs?',
  'Como está a LGPD? Há incidentes ou solicitações de titulares abertas?',
  'A memória do servidor preocupa? Qual decisão você recomenda?',
  'O que mudou nas políticas de acesso e nas exceções esta semana?',
];

const initialMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Assistente IA do SGCG pronto. Pergunte sobre a trilha de auditoria (quem fez o quê, quando e de qual IP), LGPD, cadastros, serviços do servidor, políticas e a situação da memória. Consulto os registros reais e mostro as evidências de cada resposta. Uso só modelos de IA gratuitos e troco de modelo sozinho se um falhar.',
    meta: { provider: 'local', model: 'Auditoria e RAG' },
  },
];

const readStoredMessages = () => {
  try {
    const parsed = JSON.parse(storageGet(STORAGE_KEY, '[]') || '[]');
    return Array.isArray(parsed) && parsed.length ? parsed : initialMessages;
  } catch {
    return initialMessages;
  }
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR');
};

const cell = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  const text = String(value);
  return text.length > 110 ? `${text.slice(0, 110)}…` : text;
};

// Mostra o que cada consulta devolveu (dados reais), para o operador conferir a resposta da IA.
function Evidence({ steps }) {
  if (!steps?.length) return null;
  return (
    <details className="mt-3 rounded-2xl border border-outline/10 bg-surface/62 px-3 py-2">
      <summary className="cursor-pointer text-xs font-bold text-on-surface/70">Como cheguei nisso ({steps.length} consulta{steps.length === 1 ? '' : 's'})</summary>
      <div className="mt-3 space-y-3">
        {steps.map((step, index) => {
          const rows = Array.isArray(step.linhas) ? step.linhas.slice(0, 12) : [];
          const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
          return (
            <div key={`${step.ferramenta}-${index}`} className="rounded-xl border border-outline/10 bg-surface-high/70 p-2">
              <div className="text-[11px] font-bold text-primary">
                {step.ferramenta} <span className="font-normal text-on-surface/55">{Object.keys(step.argumentos || {}).length ? JSON.stringify(step.argumentos) : ''}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-on-surface/55">
                {step.erro ? `Erro: ${step.erro}` : `${step.total ?? rows.length} registro(s)${step.nota ? ` · ${step.nota}` : ''}`} · {step.ms} ms
              </div>
              {rows.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="tabular w-full min-w-[420px] text-[11px]">
                    <thead>
                      <tr className="text-left text-on-surface/50">{columns.map((c) => <th key={c} className="px-1.5 py-1 font-semibold">{c}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-outline/10">
                      {rows.map((row, i) => (
                        <tr key={i}>{columns.map((c) => <td key={c} className="px-1.5 py-1 align-top text-on-surface/80">{cell(row[c])}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}

// Diagnóstico automático do ambiente (antes ficava em Operações).
function InsightsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/api/control/ai-insights');
      setData(res.data || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível gerar o diagnóstico agora.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  const toneFor = (s) => (s === 'critical' ? 'danger' : s === 'warning' ? 'warning' : s === 'success' ? 'success' : 'primary');
  const labelFor = (s) => (s === 'critical' ? 'Crítico' : s === 'warning' ? 'Atenção' : s === 'success' ? 'OK' : 'Informação');
  return (
    <Panel
      title="Diagnóstico automático"
      description={data?.generated_at ? `Gerado em ${new Date(data.generated_at).toLocaleString('pt-BR')}${data?.model ? ` · ${data.model}` : ''}` : 'Leitura dos sinais do servidor, VLANs e antivírus.'}
      actions={<Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Analisando...' : 'Analisar de novo'}</Button>}
    >
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {typeof data?.summary === 'string' && data.summary ? <p className="mb-3 text-[13px] leading-6 text-on-surface/70">{data.summary}</p> : null}
      {data?.summary && typeof data.summary === 'object' ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <Badge tone={data.summary.critical ? 'danger' : 'success'}>{data.summary.critical ?? 0} crítico{data.summary.critical === 1 ? '' : 's'}</Badge>
          <Badge tone={data.summary.warning ? 'warning' : 'success'}>{data.summary.warning ?? 0} {data.summary.warning === 1 ? 'atenção' : 'atenções'}</Badge>
          {data.summary.services_checked != null ? <Badge>{data.summary.services_checked} serviços verificados</Badge> : null}
          {data.summary.blocked_24h != null ? <Badge>{Number(data.summary.blocked_24h).toLocaleString('pt-BR')} bloqueios em 24 h</Badge> : null}
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {(data?.insights || []).map((item) => (
          <div key={item.id} className="rounded-lg border border-outline p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[13.5px] font-semibold text-on-surface">{item.title}</div>
              <Badge tone={toneFor(item.severity)}>{labelFor(item.severity)}</Badge>
            </div>
            {item.impact ? <p className="mt-1 text-[12.5px] leading-5 text-on-surface/65">{item.impact}</p> : null}
            {item.probable_cause ? <p className="mt-1 text-[12.5px] leading-5 text-on-surface/65"><b>Causa provável:</b> {item.probable_cause}</p> : null}
            {item.recommendation ? <p className="mt-1 text-[12.5px] leading-5 text-on-surface/80"><b>O que fazer:</b> {item.recommendation}</p> : null}
          </div>
        ))}
        {data && !(data.insights || []).length ? <p className="text-sm text-on-surface/55">Nenhum ponto de atenção encontrado.</p> : null}
      </div>
    </Panel>
  );
}

export default function AiAssistant() {
  const [messages, setMessages] = useState(readStoredMessages);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [ragStatus, setRagStatus] = useState(null);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && message.id !== 'welcome'),
    [messages],
  );

  useEffect(() => {
    storageSet(STORAGE_KEY, JSON.stringify(messages.slice(-24)));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const [aiStatus, setAiStatus] = useState(null);
  const loadStatus = async () => {
    try {
      const response = await api.get('/api/control/ai-rag/status');
      setRagStatus(response.data || null);
    } catch {
      setRagStatus(null);
    }
    try {
      const response = await api.get('/api/ai/status');
      setAiStatus(response.data || null);
    } catch {
      setAiStatus(null);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const ask = async (forcedQuestion) => {
    const text = String(forcedQuestion || question || '').trim();
    if (!text || loading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/ai/ask', { question: text });
      const payload = response.data || {};
      const failed = (payload.attempts || []).filter((attempt) => !attempt.ok).length;
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: payload.answer || 'Não houve resposta do assistente.',
        created_at: new Date().toISOString(),
        meta: {
          provider: payload.provider_label || payload.provider,
          model: payload.model,
          external_ai_used: true,
          profile: payload.profile,
          ms: payload.ms,
          switched: failed,
          protected_items: payload.protected_items || 0,
        },
        steps: Array.isArray(payload.steps) ? payload.steps : [],
      };
      setMessages((current) => [...current, assistantMessage]);
      loadStatus();
    } catch (requestError) {
      const data = requestError?.response?.data || {};
      const message = data.error || 'Falha ao consultar o assistente IA.';
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: message,
          created_at: new Date().toISOString(),
          meta: { provider: 'local', model: 'Sem IA disponível' },
          sources: (data.fallback_docs || []).map((doc) => ({ source: doc.fonte, line_start: String(doc.linhas || '').split('-')[0], line_end: String(doc.linhas || '').split('-')[1], excerpt: doc.trecho })),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearThread = () => {
    setMessages(initialMessages);
    setError('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    ask();
  };

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-5 pb-8">
      <PageHeader
        title="Assistente IA"
        description="Pergunte sobre auditoria, LGPD, cadastros, serviços e o servidor. A IA consulta os registros reais, mostra as evidências e usa só modelos gratuitos."
        meta={(
          <span className="flex flex-wrap gap-2">
            <Badge tone="primary">{ragStatus?.chunks ?? '—'} trechos</Badge>
            <Badge tone="primary">{ragStatus?.sources ?? '—'} fontes</Badge>
            <Badge tone={ragStatus?.runtime?.prometheus_ready ? 'success' : 'warning'} dot>Prometheus {ragStatus?.runtime?.prometheus_ready ? 'pronto' : 'a verificar'}</Badge>
          </span>
        )}
      />

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="sgcg-card flex min-h-[68dvh] min-w-0 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-outline px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Bot size={19} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-on-surface">Chat operacional</div>
                <div className="mt-0.5 text-xs text-on-surface/58">
                  {latestAssistant?.meta?.external_ai_used ? `${latestAssistant.meta.provider} · ${latestAssistant.meta.model}` : 'IA gratuita com troca automática de modelo'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" icon={RefreshCw} onClick={loadStatus}>Atualizar status</Button>
              <Button variant="ghost" onClick={clearThread}>Limpar conversa</Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
            <div className="mx-auto flex max-w-5xl flex-col gap-4">
              {messages.map((message) => {
                const assistant = message.role === 'assistant';
                return (
                  <div key={message.id} className={`flex gap-3 ${assistant ? 'justify-start' : 'justify-end'}`}>
                    {assistant ? (
                      <div className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/16 bg-primary/12 text-primary">
                        <Bot size={17} />
                      </div>
                    ) : null}
                    <div className={`max-w-[min(92%,760px)] rounded-xl border px-4 py-3 shadow-sm ${
                      assistant
                        ? 'border-outline/12 bg-surface-high/76 text-on-surface'
                        : 'border-primary/18 bg-primary text-on-primary'
                    }`}>
                      <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
                      {assistant && message.meta ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge tone={message.meta.external_ai_used ? 'success' : 'warning'}>{message.meta.external_ai_used ? message.meta.provider : 'Local'}</Badge>
                          <Badge tone="primary">{message.meta.model || 'RAG'}</Badge>
                          {message.meta.profile ? <Badge>{message.meta.profile === 'analise' ? 'Análise' : 'Consulta rápida'}{message.meta.ms ? ` · ${(message.meta.ms / 1000).toFixed(1)} s` : ''}</Badge> : null}
                          {message.meta.switched ? <Badge tone="warning">Trocou de modelo {message.meta.switched}x até responder</Badge> : null}
                          {message.meta.protected_items ? <Badge tone="success" title="Nomes, CPFs, e-mails, telefones, MACs e IPs públicos foram trocados por códigos antes de sair para a IA">{message.meta.protected_items} dado(s) pessoal(is) protegido(s)</Badge> : null}
                          {message.meta.confidence ? <Badge>Confiança {message.meta.confidence}</Badge> : null}
                        </div>
                      ) : null}
                      {assistant && message.meta?.external_ai_error ? (
                        <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                          {message.meta.external_ai_error}
                        </div>
                      ) : null}
                      {assistant ? <Evidence steps={message.steps} /> : null}
                      {assistant && message.sources?.length ? (
                        <details className="mt-3 rounded-2xl border border-outline/10 bg-surface/62 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-bold text-on-surface/70">Fontes recuperadas</summary>
                          <div className="mt-3 space-y-2">
                            {message.sources.slice(0, 5).map((source, index) => (
                              <div key={`${message.id}-${source.source}-${index}`} className="rounded-xl border border-outline/10 bg-surface-high/70 p-2">
                                <div className="break-all text-[11px] font-bold text-primary">{source.source}:{source.line_start}-{source.line_end}</div>
                                <div className="mt-1 text-xs leading-5 text-on-surface/64">{source.excerpt}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                      {message.created_at ? (
                        <div className={`mt-2 text-[11px] ${assistant ? 'text-on-surface/46' : 'text-on-primary/72'}`}>
                          {formatDateTime(message.created_at)}
                        </div>
                      ) : null}
                    </div>
                    {!assistant ? (
                      <div className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/18 bg-primary text-on-primary">
                        <UserRound size={17} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {loading ? (
                <div className="flex items-center gap-3 text-sm text-on-surface/62">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-primary/16 bg-primary/12 text-primary">
                    <Sparkles size={17} className="animate-pulse" />
                  </div>
                  Consultando a auditoria e a IA...
                </div>
              ) : null}
              <div ref={scrollRef} />
            </div>
          </div>

          {error ? <div className="mx-4 mb-3 sm:mx-5"><Notice tone="warning">{error}</Notice></div> : null}

          <form onSubmit={handleSubmit} className="border-t border-outline p-3 sm:p-4">
            <div className="mx-auto flex max-w-5xl gap-3">
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    ask();
                  }
                }}
                rows={2}
                aria-label="Pergunta ao assistente"
                data-autofocus="true"
                placeholder="Ex.: quem desligou o serviço unbound, quando e de qual IP? Quem cadastrou o colaborador fulano?"
                className="min-h-[var(--control-height)] flex-1 resize-none rounded-2xl border border-outline/14 bg-surface px-4 py-3 text-sm leading-6 text-on-surface focus:border-primary/45 focus:outline-none"
              />
              <Button type="submit" variant="primary" icon={Send} disabled={loading || !question.trim()} className="self-end">
                Enviar
              </Button>
            </div>
          </form>
        </section>

        <div className="space-y-4">
          <Panel title="Perguntas rápidas" description="Toque para enviar ao assistente.">
            <div className="space-y-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  disabled={loading}
                  className="w-full rounded-lg border border-outline px-3 py-2 text-left text-[12.5px] font-medium leading-5 text-on-surface/80 transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Modelos de IA gratuitos" description="Cada pergunta vai para o melhor modelo disponível; se falhar ou faltar cota, passa para o próximo.">
            <div className="grid gap-2">
              {(aiStatus?.providers || []).map((p) => (
                <div key={p.provider} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="font-medium text-on-surface/85">{p.label}</span>
                  {!p.configured ? <Badge>sem chave</Badge> : !p.enabled ? <Badge tone="warning">desligado</Badge> : <Badge tone={p.models_ok ? 'success' : 'warning'} dot>{p.models_ok} de {p.models_total} testados</Badge>}
                </div>
              ))}
              {!aiStatus ? <span className="text-xs text-on-surface/55">Carregando…</span> : null}
            </div>
          </Panel>

          <Panel title="Estado do RAG" description="Base local indexada e monitoramento do ambiente.">
            <div className="grid gap-2">
              <Badge tone="primary">{ragStatus?.chunks ?? '—'} trechos indexados</Badge>
              <Badge tone="primary">{ragStatus?.sources ?? '—'} fontes locais</Badge>
              <Badge tone="success">Alvos do Prometheus no ar: {ragStatus?.runtime?.prometheus_targets_up ?? '—'}</Badge>
              <Badge tone={(ragStatus?.runtime?.prometheus_targets_down || 0) ? 'danger' : 'success'}>Alvos fora do ar: {ragStatus?.runtime?.prometheus_targets_down ?? '—'}</Badge>
            </div>
          </Panel>
        </div>
      </div>
      <InsightsPanel />
    </div>
  );
}
