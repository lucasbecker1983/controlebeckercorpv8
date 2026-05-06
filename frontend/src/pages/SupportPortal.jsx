import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Clock3, FileText, Globe2, HelpCircle,
  Loader2, LockKeyhole, MessageSquarePlus, Send, ShieldCheck, Sparkles,
  UserRound, WifiOff,
} from 'lucide-react';
import { api } from '../services/api';
import SupportBell from '../components/SupportBell';
import { storageGet, storageRemove, storageSet } from '../services/browserStorage';

const TOKEN_KEY = 'sgcg_support_token';
const USER_KEY = 'sgcg_support_user';

const categories = [
  { id: 'site_not_opening', label: 'Site ou sistema não abre', icon: Globe2, hint: 'Use quando uma página, sistema ou aplicativo não carregar.' },
  { id: 'release_request', label: 'Pedir acesso', icon: ShieldCheck, hint: 'Para solicitar acesso a site, aplicativo, rede social ou serviço.' },
  { id: 'slow_connection', label: 'Internet lenta', icon: Clock3, hint: 'Quando tudo abre devagar ou o trabalho fica prejudicado.' },
  { id: 'wifi_problem', label: 'Problema no Wi-Fi', icon: WifiOff, hint: 'Queda, sinal fraco ou dificuldade para conectar.' },
  { id: 'system_access', label: 'Sistema de trabalho', icon: FileText, hint: 'Dificuldade para entrar em sistema usado no serviço.' },
  { id: 'other', label: 'Outro atendimento', icon: HelpCircle, hint: 'Quando nenhuma opção acima representa bem o caso.' },
];

const impacts = [
  { id: 'person', label: 'Só comigo' },
  { id: 'few_people', label: 'Algumas pessoas' },
  { id: 'department', label: 'Meu setor' },
  { id: 'everyone', label: 'Muitos setores' },
];

const urgencies = [
  { id: 'can_wait', label: 'Pode aguardar' },
  { id: 'normal', label: 'Preciso hoje' },
  { id: 'work_blocked', label: 'Estou sem conseguir trabalhar' },
  { id: 'stopped', label: 'Serviço parado' },
];

function readJson(key) {
  try {
    return JSON.parse(storageGet(key, 'null') || 'null');
  } catch {
    return null;
  }
}

function StatusBadge({ ticket }) {
  const color = ticket.priority === 'critical'
    ? 'bg-red-50 text-red-800 border-red-200'
    : ticket.priority === 'high'
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : 'bg-sky-50 text-sky-900 border-sky-200';
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${color}`}>{ticket.priority_label}</span>;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export default function SupportPortal() {
  const [token, setToken] = useState(() => storageGet(TOKEN_KEY, ''));
  const [user, setUser] = useState(() => readJson(USER_KEY));
  const [login, setLogin] = useState({ username: '', password: '' });
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [comments, setComments] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    category: 'site_not_opening',
    title: '',
    requested_site: '',
    affected_area: '',
    impact: 'person',
    urgency: 'normal',
    description: '',
  });
  const [view, setView] = useState('new');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const authHeaders = useMemo(() => ({ headers: { 'X-SGCG-Support-Token': token } }), [token]);
  const selectedCategory = categories.find((item) => item.id === form.category) || categories[0];
  const SelectedCategoryIcon = selectedCategory.icon;

  const loadTickets = async () => {
    if (!token) return;
    const res = await api.get('/api/support/public/tickets', authHeaders);
    setTickets(res.data?.tickets || []);
  };

  useEffect(() => {
    if (!token) return;
    api.get('/api/support/public/me', authHeaders)
      .then((res) => {
        setUser(res.data?.user);
        storageSet(USER_KEY, JSON.stringify(res.data?.user || {}));
        return loadTickets();
      })
      .catch(() => {
        storageRemove(TOKEN_KEY);
        storageRemove(USER_KEY);
        setToken('');
        setUser(null);
      });
  }, [token]);

  const submitLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setNotice('');
    try {
      const res = await api.post('/api/support/public/login', login);
      storageSet(TOKEN_KEY, res.data.token);
      storageSet(USER_KEY, JSON.stringify(res.data.user || {}));
      setToken(res.data.token);
      setUser(res.data.user);
      setNotice('Entrada confirmada. Você já pode abrir e acompanhar chamados.');
    } catch (error) {
      setNotice(error?.response?.data?.error || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  const submitTicket = async (event) => {
    event.preventDefault();
    setLoading(true);
    setNotice('');
    try {
      const res = await api.post('/api/support/public/tickets', form, authHeaders);
      setForm({ category: 'site_not_opening', title: '', requested_site: '', affected_area: '', impact: 'person', urgency: 'normal', description: '' });
      setNotice(`Chamado aberto com protocolo ${res.data.ticket.protocol}.`);
      setView('list');
      await loadTickets();
    } catch (error) {
      setNotice(error?.response?.data?.error || 'Não foi possível abrir o chamado.');
    } finally {
      setLoading(false);
    }
  };

  const openTicket = async (ticket) => {
    setSelected(ticket);
    setView('detail');
    const res = await api.get(`/api/support/public/tickets/${ticket.id}`, authHeaders);
    setSelected(res.data.ticket);
    setComments(res.data.comments || []);
  };

  const sendComment = async () => {
    if (!message.trim() || !selected) return;
    const res = await api.post(`/api/support/public/tickets/${selected.id}/comments`, { body: message }, authHeaders);
    setComments((current) => [...current, res.data.comment]);
    setMessage('');
    await loadTickets();
  };

  const logout = () => {
    storageRemove(TOKEN_KEY);
    storageRemove(USER_KEY);
    setToken('');
    setUser(null);
  };

  if (!token) {
    return (
      <main className="min-h-screen bg-[#eaf1f7] px-4 py-5 text-slate-950 sm:px-6">
        <section className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-5xl content-center gap-5">
          <header className="overflow-hidden rounded-lg border border-sky-950/10 bg-white shadow-xl">
            <div className="grid gap-5 bg-sky-950 px-5 py-6 text-white md:grid-cols-[auto_1fr] md:items-center md:px-8">
              <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-white/20 bg-white p-2">
                <img src="/LOGO-JACAREZINHO.png" alt="Prefeitura Municipal de Jacarezinho" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-xs font-black uppercase text-sky-100">Prefeitura Municipal de Jacarezinho</p>
                <h1 className="mt-1 text-3xl font-black leading-tight sm:text-5xl">Portal de Atendimento ao Colaborador</h1>
                <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-sky-50/90">
                  Solicite ajuda de forma simples quando um site não abrir, quando a conexão estiver lenta ou quando precisar pedir acesso a um serviço de trabalho.
                </p>
              </div>
            </div>
            <div className="border-t border-sky-900/10 bg-white px-5 py-4 md:px-8">
              <p className="text-xs font-black uppercase text-sky-950">Secretaria Municipal de Comércio, Indústria, Serviços e Inovação</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                Este portal funciona pela rede interna. Mesmo que a internet externa esteja indisponível, acesse pelo endereço interno informado pela Prefeitura.
              </p>
            </div>
          </header>

          <form onSubmit={submitLogin} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Field label="Usuário do Portal do Colaborador">
              <input className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-semibold outline-none focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12" value={login.username} onChange={(e) => setLogin((c) => ({ ...c, username: e.target.value }))} autoComplete="username" />
            </Field>
            <Field label="Senha">
              <input type="password" className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-semibold outline-none focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12" value={login.password} onChange={(e) => setLogin((c) => ({ ...c, password: e.target.value }))} autoComplete="current-password" />
            </Field>
            <button type="submit" disabled={loading} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-900 px-5 text-base font-black text-white shadow-lg shadow-sky-900/15 transition hover:bg-sky-950 disabled:opacity-60">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
              Entrar
            </button>
            {notice ? <div className="md:col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950">{notice}</div> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#edf3f8] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-sky-950/10 bg-sky-950 text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
              <img src="/LOGO-JACAREZINHO.png" alt="Prefeitura Municipal de Jacarezinho" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-black uppercase text-sky-100">Atendimento ao Colaborador</p>
              <h1 className="truncate text-lg font-black">Secretaria Municipal de Comércio, Indústria, Serviços e Inovação</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SupportBell publicToken={token} compact onClick={() => setView('list')} />
            <button type="button" onClick={logout} className="h-10 rounded-lg border border-white/20 px-3 text-xs font-black text-white hover:bg-white/10">Sair</button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[320px_1fr]">
        <aside className="grid content-start gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-sky-900"><UserRound size={22} /></div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{user?.full_name || user?.username}</p>
                <p className="truncate text-xs font-bold text-slate-500">{user?.department || 'Colaborador'}</p>
              </div>
            </div>
          </div>
          <button onClick={() => setView('new')} className={`flex h-12 items-center gap-2 rounded-lg px-4 text-sm font-black ${view === 'new' ? 'bg-sky-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}><MessageSquarePlus size={18} /> Novo chamado</button>
          <button onClick={() => { setView('list'); loadTickets(); }} className={`flex h-12 items-center gap-2 rounded-lg px-4 text-sm font-black ${view === 'list' || view === 'detail' ? 'bg-sky-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}><FileText size={18} /> Meus chamados</button>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-950">
            <div className="flex gap-2 font-black"><Sparkles size={17} /> Dica rápida</div>
            <p className="mt-1">Escreva como você percebeu o problema. A equipe técnica traduz isso para a causa real.</p>
          </div>
        </aside>

        <div className="min-w-0">
          {notice ? <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-950">{notice}</div> : null}

          {view === 'new' ? (
            <form onSubmit={submitTicket} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-900"><SelectedCategoryIcon size={22} /></div>
                <div>
                  <h2 className="text-2xl font-black">Como podemos ajudar?</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Escolha a opção mais parecida com o que está acontecendo. Não precisa usar termos técnicos.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {categories.map((item) => {
                  const Icon = item.icon;
                  const active = form.category === item.id;
                  return (
                    <button key={item.id} type="button" onClick={() => setForm((c) => ({ ...c, category: item.id }))} className={`min-h-[96px] rounded-lg border p-3 text-left transition ${active ? 'border-sky-800 bg-sky-50 text-sky-950 ring-2 ring-sky-800/10' : 'border-slate-200 bg-white hover:border-sky-200'}`}>
                      <Icon size={20} />
                      <div className="mt-2 text-sm font-black">{item.label}</div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{item.hint}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4">
                <Field label="Título curto">
                  <input value={form.title} onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))} placeholder="Ex.: Não consigo abrir o sistema da nota fiscal" className="h-12 w-full rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12" />
                </Field>
                <Field label="Site, aplicativo ou sistema envolvido">
                  <input value={form.requested_site} onChange={(e) => setForm((c) => ({ ...c, requested_site: e.target.value }))} placeholder="Ex.: portal, endereço do site ou nome do aplicativo" className="h-12 w-full rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12" />
                </Field>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Onde acontece">
                    <input value={form.affected_area} onChange={(e) => setForm((c) => ({ ...c, affected_area: e.target.value }))} placeholder="Setor, sala ou prédio" className="h-12 w-full rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12" />
                  </Field>
                  <Field label="Quem foi afetado">
                    <select value={form.impact} onChange={(e) => setForm((c) => ({ ...c, impact: e.target.value }))} className="h-12 w-full rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-sky-800">
                      {impacts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Urgência">
                    <select value={form.urgency} onChange={(e) => setForm((c) => ({ ...c, urgency: e.target.value }))} className="h-12 w-full rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-sky-800">
                      {urgencies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Explique com suas palavras">
                  <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={5} placeholder="Conte o que tentou fazer, o que apareceu na tela e desde quando acontece." className="w-full rounded-lg border border-slate-300 px-3 py-3 font-semibold outline-none focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12" />
                </Field>
              </div>

              <button type="submit" disabled={loading} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-900 px-4 text-base font-black text-white shadow-lg shadow-sky-900/15 hover:bg-sky-950 disabled:opacity-60">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                Abrir chamado
              </button>
            </form>
          ) : null}

          {view === 'list' ? (
            <div className="grid gap-3">
              {tickets.length ? tickets.map((ticket) => (
                <button key={ticket.id} type="button" onClick={() => openTicket(ticket)} className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-500">{ticket.protocol}</span>
                    <StatusBadge ticket={ticket} />
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-600">{ticket.status_label}</span>
                    {ticket.requester_unread ? <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-black text-white">Nova resposta</span> : null}
                  </div>
                  <h3 className="mt-2 text-lg font-black text-slate-950">{ticket.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{ticket.category_label}</p>
                </button>
              )) : (
                <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm font-bold text-slate-500">Nenhum chamado aberto ainda.</div>
              )}
            </div>
          ) : null}

          {view === 'detail' && selected ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <button type="button" onClick={() => setView('list')} className="mb-4 flex items-center gap-2 text-sm font-black text-sky-900"><ArrowLeft size={17} /> Voltar</button>
              <div className="flex flex-wrap items-center gap-2"><span className="font-black">{selected.protocol}</span><StatusBadge ticket={selected} /><span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-black">{selected.status_label}</span></div>
              <h2 className="mt-3 text-2xl font-black">{selected.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{selected.description}</p>
              <div className="mt-5 grid gap-3">
                {comments.map((comment) => (
                  <div key={comment.id} className={`rounded-lg border px-3 py-3 text-sm leading-6 ${comment.author_type === 'admin' ? 'border-sky-200 bg-sky-50 text-sky-950' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                    <div className="mb-1 font-black">{comment.author_type === 'admin' ? 'Equipe de atendimento' : comment.author_name}</div>
                    {comment.body}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Responder ou complementar informação" className="h-12 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 font-semibold outline-none focus:border-sky-800" />
                <button type="button" onClick={sendComment} className="flex h-12 items-center gap-2 rounded-lg bg-sky-900 px-4 font-black text-white"><Send size={17} /> Enviar</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
