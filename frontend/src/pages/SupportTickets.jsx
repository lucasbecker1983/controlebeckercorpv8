import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, FileText, Inbox, Loader2, MessageSquare, Send, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../services/api';

const statuses = [
  ['all', 'Todos'],
  ['open', 'Aberto'],
  ['triage', 'Em triagem'],
  ['analysis', 'Em análise'],
  ['waiting_approval', 'Aguardando autorização'],
  ['in_progress', 'Em atendimento'],
  ['resolved', 'Resolvido'],
  ['denied', 'Não autorizado'],
];

const priorities = [
  ['low', 'Baixa'],
  ['medium', 'Média'],
  ['high', 'Alta'],
  ['critical', 'Urgente'],
];

function priorityClass(priority) {
  if (priority === 'critical') return 'border-red-200 bg-red-50 text-red-800';
  if (priority === 'high') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (priority === 'low') return 'border-slate-200 bg-slate-50 text-slate-600';
  return 'border-sky-200 bg-sky-50 text-sky-900';
}

function Stat({ icon: Icon, label, value, tone = 'sky' }) {
  const color = tone === 'red' ? 'bg-red-50 text-red-700' : tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-800';
  return (
    <div className="rounded-lg border border-outline/12 bg-surface-high/80 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}><Icon size={20} /></div>
        <div>
          <div className="text-2xl font-black text-on-surface">{value}</div>
          <div className="text-xs font-bold uppercase text-on-surface/55">{label}</div>
        </div>
      </div>
    </div>
  );
}

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [events, setEvents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const stats = useMemo(() => {
    const active = tickets.filter((t) => !['resolved', 'denied', 'canceled'].includes(t.status)).length;
    return {
      active,
      unread: tickets.filter((t) => t.admin_unread).length,
      urgent: tickets.filter((t) => t.priority === 'critical' || t.priority === 'high').length,
    };
  }, [tickets]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/support/tickets', { params: { status: statusFilter } });
      setTickets(res.data?.tickets || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, [statusFilter]);

  const openTicket = async (ticket) => {
    setSelected(ticket);
    const res = await api.get(`/api/support/tickets/${ticket.id}`);
    setSelected(res.data.ticket);
    setComments(res.data.comments || []);
    setEvents(res.data.events || []);
    setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, admin_unread: false } : item));
  };

  const updateTicket = async (patch) => {
    if (!selected) return;
    const res = await api.patch(`/api/support/tickets/${selected.id}`, patch);
    setSelected(res.data.ticket);
    setNotice('Chamado atualizado.');
    await loadTickets();
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    const res = await api.post(`/api/support/tickets/${selected.id}/comments`, { body: reply });
    setComments((current) => [...current, res.data.comment]);
    setReply('');
    setNotice('Resposta enviada ao colaborador.');
    await loadTickets();
  };

  return (
    <main className="space-y-5">
      <section className="rounded-lg border border-outline/12 bg-surface-high/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-primary">Governança Operacional de Rede</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-on-surface">Central de Chamados</h1>
            <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-on-surface/62">
              Receba solicitações dos colaboradores, classifique o atendimento e conduza liberações, lentidão e falhas com protocolo institucional.
            </p>
          </div>
          <div className="flex rounded-lg border border-outline/12 bg-surface-low p-1">
            {statuses.slice(0, 5).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setStatusFilter(id)} className={`h-9 rounded-md px-3 text-xs font-black ${statusFilter === id ? 'bg-primary text-white' : 'text-on-surface/62 hover:text-on-surface'}`}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Stat icon={Inbox} label="Chamados ativos" value={stats.active} />
        <Stat icon={AlertCircle} label="Novos avisos" value={stats.unread} tone="amber" />
        <Stat icon={Clock3} label="Alta prioridade" value={stats.urgent} tone="red" />
      </section>

      {notice ? <div className="rounded-lg border border-info/20 bg-info/10 px-4 py-3 text-sm font-bold text-info">{notice}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_1fr]">
        <div className="grid content-start gap-3">
          {loading ? (
            <div className="flex h-28 items-center justify-center rounded-lg border border-outline/12 bg-surface-high text-on-surface/55"><Loader2 className="animate-spin" /></div>
          ) : tickets.length ? tickets.map((ticket) => (
            <button key={ticket.id} type="button" onClick={() => openTicket(ticket)} className={`rounded-lg border p-4 text-left shadow-sm transition ${selected?.id === ticket.id ? 'border-primary bg-primary/6' : 'border-outline/12 bg-surface-high hover:border-primary/24'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black text-on-surface/50">{ticket.protocol}</span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${priorityClass(ticket.priority)}`}>{ticket.priority_label}</span>
                {ticket.admin_unread ? <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-white">Novo</span> : null}
              </div>
              <h2 className="mt-2 line-clamp-2 text-sm font-black text-on-surface">{ticket.title}</h2>
              <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-on-surface/55"><UserRound size={14} /> {ticket.requester_name}</div>
              <div className="mt-1 text-xs font-semibold text-on-surface/45">{ticket.category_label} · {ticket.status_label}</div>
            </button>
          )) : (
            <div className="rounded-lg border border-outline/12 bg-surface-high p-6 text-center text-sm font-bold text-on-surface/55">Nenhum chamado neste filtro.</div>
          )}
        </div>

        <div className="min-w-0 rounded-lg border border-outline/12 bg-surface-high p-4 shadow-sm sm:p-5">
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-on-surface/50">{selected.protocol}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${priorityClass(selected.priority)}`}>{selected.priority_label}</span>
                    <span className="rounded-full border border-outline/14 bg-surface-low px-2.5 py-1 text-xs font-black text-on-surface/65">{selected.status_label}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-on-surface">{selected.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-on-surface/62">{selected.description}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-outline/12 bg-surface-low p-3 text-sm"><div className="text-xs font-black uppercase text-on-surface/45">Solicitante</div><div className="mt-1 font-black">{selected.requester_name}</div><div className="text-xs font-semibold text-on-surface/50">{selected.requester_department}</div></div>
                <div className="rounded-lg border border-outline/12 bg-surface-low p-3 text-sm"><div className="text-xs font-black uppercase text-on-surface/45">Pedido</div><div className="mt-1 font-black">{selected.category_label}</div><div className="text-xs font-semibold text-on-surface/50">{selected.requested_site || 'Sem site informado'}</div></div>
                <div className="rounded-lg border border-outline/12 bg-surface-low p-3 text-sm"><div className="text-xs font-black uppercase text-on-surface/45">Origem</div><div className="mt-1 font-black">{selected.requester_ip || 'Não informado'}</div><div className="text-xs font-semibold text-on-surface/50">{selected.affected_area || 'Área não informada'}</div></div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-on-surface/50">Status</span>
                  <select value={selected.status} onChange={(e) => updateTicket({ status: e.target.value })} className="h-11 w-full rounded-lg border border-outline/18 bg-surface-low px-3 text-sm font-bold outline-none">
                    {statuses.filter(([id]) => id !== 'all').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-on-surface/50">Prioridade</span>
                  <select value={selected.priority} onChange={(e) => updateTicket({ priority: e.target.value })} className="h-11 w-full rounded-lg border border-outline/18 bg-surface-low px-3 text-sm font-bold outline-none">
                    {priorities.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => updateTicket({ status: 'resolved' })} className="mt-5 flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-black text-white hover:bg-emerald-800"><CheckCircle2 size={17} /> Resolver</button>
              </div>

              {selected.category === 'release_request' ? (
                <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
                  <div className="flex gap-2 font-black"><ShieldCheck size={17} /> Solicitação de acesso</div>
                  <p className="mt-1">Este chamado deve passar por autorização antes de virar liberação técnica. Na próxima etapa, este bloco poderá converter o pedido diretamente em política institucional ou exceção temporária.</p>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase text-on-surface/55"><MessageSquare size={17} /> Conversa</h3>
                {comments.length ? comments.map((comment) => (
                  <div key={comment.id} className={`rounded-lg border px-3 py-3 text-sm leading-6 ${comment.author_type === 'admin' ? 'border-primary/18 bg-primary/8 text-on-surface' : 'border-outline/12 bg-surface-low text-on-surface/72'}`}>
                    <div className="mb-1 font-black">{comment.author_type === 'admin' ? 'Equipe SGCG' : comment.author_name}</div>
                    {comment.body}
                  </div>
                )) : <div className="rounded-lg border border-outline/12 bg-surface-low p-4 text-sm font-bold text-on-surface/50">Ainda não há respostas.</div>}
                <div className="flex gap-2">
                  <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Responder ao colaborador" className="h-11 min-w-0 flex-1 rounded-lg border border-outline/18 bg-surface-low px-3 text-sm font-semibold outline-none" />
                  <button type="button" onClick={sendReply} className="flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white"><Send size={16} /> Enviar</button>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-outline/12 bg-surface-low p-4">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase text-on-surface/55"><FileText size={17} /> Linha do tempo</h3>
                <div className="mt-3 grid gap-2">
                  {events.map((event) => (
                    <div key={event.id} className="text-xs font-semibold text-on-surface/55">{new Date(event.created_at).toLocaleString('pt-BR')} · {event.event_type} · {event.actor_name || event.actor_type}</div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <Inbox size={42} className="text-on-surface/28" />
              <h2 className="mt-3 text-xl font-black text-on-surface">Selecione um chamado</h2>
              <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-on-surface/55">A conversa, classificação, prioridade e linha do tempo aparecem aqui.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
