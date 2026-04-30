import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, FileCheck2, Loader2, LockKeyhole, ShieldCheck, UserPlus, Wifi } from 'lucide-react';
import { api } from '../services/api';

const emptyRegister = {
  full_name: '',
  cpf: '',
  birth_date: '',
  password: '',
};

const emptyLogin = {
  cpf: '',
  password: '',
};

const DEFAULT_SUCCESS_REDIRECT_URL = 'https://www.jacarezinho.pr.gov.br/';

function redirectAfterAuthentication(data) {
  const target = data?.redirect_url || DEFAULT_SUCCESS_REDIRECT_URL;
  window.setTimeout(() => {
    window.location.assign(target);
  }, 800);
}

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function Field({ label, value, onChange, type = 'text', autoComplete, placeholder, ...inputProps }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        {...inputProps}
        className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12"
      />
    </label>
  );
}

function Notice({ tone = 'info', children }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    danger: 'border-red-200 bg-red-50 text-red-900',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm leading-5 ${tones[tone]}`}>{children}</div>;
}

function TermsView({ onBack }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <ShieldCheck size={24} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Termo oficial</p>
          <h2 className="mt-1 text-xl font-black leading-tight text-slate-950">Termo de Uso da Rede Pública de Visitantes</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Hotspot Institucional da Prefeitura Municipal de Jacarezinho, destinado ao acesso temporário de visitantes mediante identificação pessoal.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 text-sm leading-6 text-slate-700">
        <section className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
          <h3 className="font-black text-sky-950">1. Finalidade do serviço</h3>
          <p className="mt-1">
            A rede pública de visitantes é disponibilizada para apoiar o acesso à internet em ambiente institucional, observadas as regras de segurança da informação, governança pública, proteção de dados e uso responsável dos recursos tecnológicos municipais.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="font-black text-slate-950">2. Identificação e responsabilidade</h3>
          <p className="mt-1">
            O acesso é pessoal e intransferível. O usuário declara que as informações fornecidas no cadastro são verdadeiras e assume responsabilidade pelo uso realizado durante sua sessão, inclusive por acessos feitos a partir do dispositivo identificado no portal.
          </p>
        </section>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <h3 className="font-black text-emerald-950">3. Proteção de dados pessoais</h3>
          <p className="mt-1">
            O tratamento de dados pessoais no Hotspot Institucional segue rigorosamente a Lei Federal nº 13.709/2018, Lei Geral de Proteção de Dados Pessoais (LGPD). Os dados são utilizados para identificação do usuário, controle de acesso, segurança da rede, auditoria institucional e cumprimento de obrigações legais.
          </p>
        </section>

        <section className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
          <h3 className="font-black text-indigo-950">4. Marco Civil da Internet</h3>
          <p className="mt-1">
            O uso da rede também observa a Lei Federal nº 12.965/2014, Marco Civil da Internet, especialmente quanto à responsabilidade no uso da conexão, à segurança, à rastreabilidade necessária e à preservação de registros nos limites legais aplicáveis.
          </p>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <h3 className="font-black text-amber-950">5. Registros e auditoria</h3>
          <p className="mt-1">
            Ao utilizar o Hotspot Institucional, o usuário fica ciente de que todos os dados necessários à segurança e à auditoria são gravados, incluindo dados cadastrais informados, dispositivo associado, endereço IP, data e hora de acesso, duração da sessão e registros técnicos de navegação permitidos pela legislação.
          </p>
        </section>

        <section className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
          <h3 className="font-black text-red-950">6. Uso permitido e restrições</h3>
          <p className="mt-1">
            É vedado utilizar a rede para atividades ilícitas, ofensivas, fraudulentas, que comprometam a segurança de sistemas públicos ou privados, que tentem burlar políticas de bloqueio, ou que contrariem normas legais e administrativas. A navegação permanece sujeita às políticas institucionais de DNS, ACL, RPZ e segurança operacional.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <h3 className="font-black text-slate-950">7. Aceite</h3>
          <p className="mt-1">
            Ao prosseguir com o cadastro, login ou conexão, o usuário confirma que leu, compreendeu e aceita este Termo de Uso da Rede, concordando com o tratamento de dados pessoais conforme a LGPD e com as regras de responsabilidade previstas no Marco Civil da Internet.
          </p>
        </section>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-base font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-700/20"
      >
        <ArrowLeft size={18} />
        Voltar e se conectar
      </button>
    </div>
  );
}

export default function HotspotPortal() {
  const [mode, setMode] = useState('register');
  const [view, setView] = useState('connect');
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [context, setContext] = useState(null);
  const [status, setStatus] = useState({ type: 'info', message: 'Verificando dispositivo...' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isAuthenticated = !!context?.authenticated;
  const isRecognized = !!context?.recognized && !!context?.requires_confirm;
  const deviceText = useMemo(() => {
    if (!context) return 'Identificação em andamento';
    return context.mac ? `Dispositivo ${context.mac}` : 'Dispositivo ainda não identificado pelo gateway';
  }, [context]);

  const loadContext = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/hotspot/public/context');
      setContext(res.data);
      if (res.data?.authenticated) {
        setStatus({ type: 'success', message: 'Acesso institucional reconhecido automaticamente para este dispositivo.' });
        redirectAfterAuthentication(res.data);
      } else if (res.data?.recognized && res.data?.requires_confirm) {
        setStatus({ type: 'success', message: res.data?.message || `Bem-vindo de volta, ${res.data?.visitor?.full_name || 'visitante'}. Clique para navegar.` });
      } else {
        setStatus({ type: 'info', message: 'Identifique-se para uso da rede pública de visitantes. No primeiro acesso, realize o cadastro institucional.' });
      }
    } catch (error) {
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'Não foi possível verificar o dispositivo.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContext();
  }, []);

  const submitContinue = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/api/hotspot/public/continue');
      setContext(res.data);
      setStatus({ type: 'success', message: 'Acesso confirmado. Você será encaminhado ao site oficial da Prefeitura.' });
      redirectAfterAuthentication(res.data);
    } catch (error) {
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'Não foi possível confirmar o dispositivo. Faça login com CPF e senha.' });
      setContext((current) => ({ ...(current || {}), recognized: false, requires_confirm: false, authenticated: false }));
      setMode('login');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/api/hotspot/public/register', {
        ...registerForm,
        cpf: registerForm.cpf.replace(/\D/g, ''),
      });
      setContext(res.data);
      setStatus({ type: 'success', message: 'Cadastro institucional concluído. Este dispositivo foi associado ao seu acesso.' });
      redirectAfterAuthentication(res.data);
    } catch (error) {
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'Falha ao concluir cadastro.' });
    } finally {
      setSubmitting(false);
    }
  };

  const submitLogin = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/api/hotspot/public/login', {
        ...loginForm,
        cpf: loginForm.cpf.replace(/\D/g, ''),
      });
      setContext(res.data);
      setStatus({ type: 'success', message: 'Identificação confirmada. Este dispositivo foi associado ao seu cadastro institucional.' });
      redirectAfterAuthentication(res.data);
    } catch (error) {
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'CPF ou senha inválidos.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="rounded-lg bg-sky-950 px-4 py-5 text-white shadow-lg sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10">
              <Building2 size={25} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-sky-100">Prefeitura Municipal de Jacarezinho</p>
              <h1 className="mt-1 text-xl font-black leading-tight sm:text-2xl">Hotspot Institucional</h1>
              <p className="mt-2 text-sm font-semibold leading-5 text-sky-50">Secretaria do Comércio, Indústria, Serviços e Inovação</p>
            </div>
          </div>
          <div className="mt-4 border-t border-white/15 pt-3 text-xs leading-5 text-sky-50">
            Rede pública de visitantes com identificação pessoal, registro de acesso e políticas institucionais de segurança.
          </div>
        </header>

        <div className="mt-4 grid gap-4">
          {view === 'terms' ? (
            <TermsView onBack={() => setView('connect')} />
          ) : (
          <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-sky-800" size={22} />
              <div>
                <h2 className="text-base font-black">Identificação obrigatória de visitante</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  O acesso é pessoal, intransferível e auditado. A navegação permanece sujeita às políticas institucionais de DNS, ACL e RPZ da rede municipal.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <FileCheck2 className="mt-0.5 shrink-0 text-slate-700" size={22} />
              <div>
                <h2 className="text-base font-black">Termo de uso da rede</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Antes de se conectar, consulte as regras oficiais de uso, proteção de dados pessoais e registro institucional da navegação.
                </p>
                <button
                  type="button"
                  onClick={() => setView('terms')}
                  className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-900 px-4 text-sm font-black text-white transition hover:bg-sky-950 focus:outline-none focus:ring-4 focus:ring-sky-800/20"
                >
                  <FileCheck2 size={16} />
                  Ler termo completo
                </button>
              </div>
            </div>
          </div>

          {status.message ? <Notice tone={status.type}>{status.message}</Notice> : null}

          {!isAuthenticated ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-950 shadow-sm">
              <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={22} />
              <p className="text-sm font-bold leading-5">
                Ao se conectar você aceita os termos e concorda com a Lei Geral de Proteção de Dados 13.709/2018 - LGPD.
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-slate-200 bg-white p-6 text-sky-900">
              <Loader2 className="mr-2 animate-spin" size={20} />
              <span className="text-sm font-bold">Verificando dispositivo...</span>
            </div>
          ) : isRecognized ? (
            <div className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 shrink-0 text-emerald-700" size={28} />
                <div className="min-w-0">
                  <h2 className="text-xl font-black text-emerald-950">Bem-vindo de volta</h2>
                  <p className="mt-2 text-sm leading-5 text-slate-700">
                    {context?.visitor?.full_name}, seu dispositivo foi reconhecido. Confirme para iniciar uma nova sessão de navegação.
                  </p>
                  <div className="mt-4 grid gap-2 text-sm text-slate-700">
                    <div className="break-words rounded-lg bg-slate-50 px-3 py-2">{deviceText}</div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">VLAN observada: {context?.vlan_id || 'não identificada'}</div>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={submitContinue}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-base font-black text-white transition hover:bg-emerald-800 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Wifi size={18} />}
                    Clique aqui para navegar
                  </button>
                </div>
              </div>
            </div>
          ) : isAuthenticated ? (
            <div className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 shrink-0 text-emerald-700" size={28} />
                <div className="min-w-0">
                  <h2 className="text-xl font-black text-emerald-950">Acesso institucional identificado</h2>
                  <p className="mt-2 text-sm leading-5 text-slate-700">
                    {context?.visitor?.full_name}, sua sessão foi registrada para este dispositivo.
                  </p>
                  <div className="mt-4 grid gap-2 text-sm text-slate-700">
                    <div className="break-words rounded-lg bg-slate-50 px-3 py-2">{deviceText}</div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">VLAN observada: {context?.vlan_id || 'não identificada'}</div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">Expira em: {context?.session?.expires_at ? new Date(context.session.expires_at).toLocaleString('pt-BR') : 'sessão ativa'}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className={`h-11 rounded-md text-sm font-black ${mode === 'register' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-600'}`}
                >
                  Primeiro acesso
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`h-11 rounded-md text-sm font-black ${mode === 'login' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-600'}`}
                >
                  Já tenho cadastro
                </button>
              </div>

              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{deviceText}</div>

              {mode === 'register' ? (
                <form className="mt-5 grid gap-4" onSubmit={submitRegister}>
                  <Field label="Nome completo" value={registerForm.full_name} onChange={(value) => setRegisterForm((f) => ({ ...f, full_name: value }))} autoComplete="name" />
                  <Field label="CPF" value={registerForm.cpf} onChange={(value) => setRegisterForm((f) => ({ ...f, cpf: formatCpf(value) }))} autoComplete="username" inputMode="numeric" />
                  <Field label="Data de nascimento" type="date" value={registerForm.birth_date} onChange={(value) => setRegisterForm((f) => ({ ...f, birth_date: value }))} />
                  <Field label="Senha" type="password" value={registerForm.password} onChange={(value) => setRegisterForm((f) => ({ ...f, password: value }))} autoComplete="new-password" />
                  <button disabled={submitting} className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-900 px-4 text-base font-black text-white transition hover:bg-sky-950 disabled:opacity-60">
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
                    Cadastrar acesso
                  </button>
                </form>
              ) : (
                <form className="mt-5 grid gap-4" onSubmit={submitLogin}>
                  <Field label="CPF" value={loginForm.cpf} onChange={(value) => setLoginForm((f) => ({ ...f, cpf: formatCpf(value) }))} autoComplete="username" />
                  <Field label="Senha" type="password" value={loginForm.password} onChange={(value) => setLoginForm((f) => ({ ...f, password: value }))} autoComplete="current-password" />
                  <button disabled={submitting} className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-900 px-4 text-base font-black text-white transition hover:bg-sky-950 disabled:opacity-60">
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
                    Identificar dispositivo
                  </button>
                </form>
              )}
            </div>
          )}
          </>
          )}
        </div>
      </section>
    </main>
  );
}
