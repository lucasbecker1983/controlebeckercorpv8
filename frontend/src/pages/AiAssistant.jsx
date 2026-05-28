import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileSearch, RefreshCw, Send, Sparkles, UserRound } from 'lucide-react';
import { api } from '../services/api';
import { storageGet, storageSet } from '../services/browserStorage';
import { ActionButton, ModuleHeader, StatusChip, Surface } from '../components/ui/primitives';

const STORAGE_KEY = 'sgcg_ai_assistant_thread_v1';

const starterPrompts = [
  'Como esta a saude do Prometheus e Grafana agora?',
  'A VLAN 70 tem algum sinal de problema?',
  'Explique o estado atual do RAG operacional.',
  'Quais evidencias existem sobre o Hotspot?',
];

const initialMessages = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Assistente IA do SGCG pronto. Posso consultar a base local, CODEX, documentacao e sinais vivos do Prometheus.',
    meta: { provider: 'local', model: 'RAG operacional' },
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

  const loadStatus = async () => {
    try {
      const response = await api.get('/api/control/ai-rag/status');
      setRagStatus(response.data || null);
    } catch {
      setRagStatus(null);
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
      const response = await api.post('/api/control/ai-rag/ask', { question: text });
      const payload = response.data || {};
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: payload.answer || 'Nao houve resposta do RAG operacional.',
        created_at: payload.generated_at || new Date().toISOString(),
        meta: {
          provider: payload.provider || 'local',
          model: payload.model || payload.mode || 'RAG operacional',
          mode: payload.mode,
          confidence: payload.confidence,
          external_ai_used: Boolean(payload.external_ai_used),
          external_ai_error: payload.external_ai_error || '',
          runtime: payload.runtime || null,
        },
        sources: Array.isArray(payload.sources) ? payload.sources : [],
      };
      setMessages((current) => [...current, assistantMessage]);
      loadStatus();
    } catch (requestError) {
      const message = requestError?.response?.data?.error || 'Falha ao consultar o assistente IA.';
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: message,
          created_at: new Date().toISOString(),
          meta: { provider: 'local', model: 'Erro de consulta' },
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
      <ModuleHeader
        eyebrow="Inteligencia operacional"
        title="Assistente IA"
        description="Conversa com o RAG do SGCG usando base local, fontes recuperadas e sinais vivos do ambiente."
        badges={(
          <>
            <StatusChip label={`${ragStatus?.chunks ?? '—'} trechos`} tone="primary" />
            <StatusChip label={`${ragStatus?.sources ?? '—'} fontes`} tone="primary" />
            <StatusChip
              label={`Prometheus ${ragStatus?.runtime?.prometheus_ready ? 'pronto' : 'verificar'}`}
              tone={ragStatus?.runtime?.prometheus_ready ? 'success' : 'warning'}
            />
          </>
        )}
      />

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Surface className="flex min-h-[68dvh] flex-col p-0" stripe={false}>
          <div className="flex items-center justify-between gap-3 border-b border-outline/10 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/16 bg-primary/12 text-primary">
                <Bot size={19} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-on-surface">Chat operacional</div>
                <div className="mt-0.5 text-xs text-on-surface/58">
                  {latestAssistant?.meta?.external_ai_used ? latestAssistant.meta.model : 'RAG local com fallback'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <ActionButton tone="ghost" icon={RefreshCw} onClick={loadStatus}>Status</ActionButton>
              <ActionButton tone="ghost" onClick={clearThread}>Limpar</ActionButton>
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
                    <div className={`max-w-[min(92%,760px)] rounded-[22px] border px-4 py-3 shadow-sm ${
                      assistant
                        ? 'border-outline/12 bg-surface-high/76 text-on-surface'
                        : 'border-primary/18 bg-primary text-on-primary'
                    }`}>
                      <div className="whitespace-pre-wrap text-sm leading-7">{message.content}</div>
                      {assistant && message.meta ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <StatusChip label={message.meta.external_ai_used ? 'Gemini' : 'Local'} tone={message.meta.external_ai_used ? 'success' : 'warning'} />
                          <StatusChip label={message.meta.model || 'RAG'} tone="primary" />
                          {message.meta.confidence ? <StatusChip label={`Confiança ${message.meta.confidence}`} tone="neutral" /> : null}
                          {message.meta.runtime?.prometheus_ready ? <StatusChip label={`${message.meta.runtime.prometheus_targets_up} alvos up`} tone="success" /> : null}
                        </div>
                      ) : null}
                      {assistant && message.meta?.external_ai_error ? (
                        <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-orange-700 dark:text-orange-300">
                          {message.meta.external_ai_error}
                        </div>
                      ) : null}
                      {assistant && message.sources?.length ? (
                        <details className="mt-3 rounded-2xl border border-outline/10 bg-surface/62 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-black text-on-surface/70">Fontes recuperadas</summary>
                          <div className="mt-3 space-y-2">
                            {message.sources.slice(0, 5).map((source, index) => (
                              <div key={`${message.id}-${source.source}-${index}`} className="rounded-xl border border-outline/10 bg-surface-high/70 p-2">
                                <div className="break-all text-[11px] font-black text-primary">{source.source}:{source.line_start}-{source.line_end}</div>
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
                  Consultando RAG e Gemini...
                </div>
              ) : null}
              <div ref={scrollRef} />
            </div>
          </div>

          {error ? (
            <div className="mx-4 mb-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300 sm:mx-5">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="border-t border-outline/10 bg-surface-high/60 p-3 sm:p-4">
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
                data-autofocus="true"
                placeholder="Pergunte sobre VLAN, Hotspot, DNS, Prometheus, Grafana, QoS, bloqueios ou um sintoma operacional."
                className="min-h-[var(--control-height)] flex-1 resize-none rounded-2xl border border-outline/14 bg-surface px-4 py-3 text-sm leading-6 text-on-surface focus:border-primary/45 focus:outline-none"
              />
              <ActionButton type="submit" tone="primary" icon={Send} disabled={loading || !question.trim()} className="self-end">
                Enviar
              </ActionButton>
            </div>
          </form>
        </Surface>

        <div className="space-y-4">
          <Surface className="p-4" stripe={false}>
            <div className="flex items-center gap-2 text-sm font-black text-on-surface">
              <Sparkles size={17} className="text-primary" />
              Perguntas rápidas
            </div>
            <div className="mt-3 space-y-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  disabled={loading}
                  className="w-full rounded-2xl border border-outline/12 bg-surface-high/62 px-3 py-2 text-left text-xs font-semibold leading-5 text-on-surface/72 transition-colors hover:border-primary/18 hover:text-primary disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Surface>

          <Surface className="p-4" stripe={false}>
            <div className="flex items-center gap-2 text-sm font-black text-on-surface">
              <FileSearch size={17} className="text-primary" />
              Estado do RAG
            </div>
            <div className="mt-3 grid gap-2">
              <StatusChip label={`${ragStatus?.chunks ?? '—'} trechos indexados`} tone="primary" />
              <StatusChip label={`${ragStatus?.sources ?? '—'} fontes locais`} tone="primary" />
              <StatusChip label={`${ragStatus?.runtime?.prometheus_targets_up ?? '—'} targets Prometheus up`} tone="success" />
              <StatusChip label={`${ragStatus?.runtime?.prometheus_targets_down ?? '—'} targets down`} tone={(ragStatus?.runtime?.prometheus_targets_down || 0) ? 'danger' : 'success'} />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
