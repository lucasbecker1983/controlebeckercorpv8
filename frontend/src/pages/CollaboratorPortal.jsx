import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, Eye, EyeOff, FileCheck2, Loader2, LockKeyhole,
  ShieldCheck, UserPlus, Wifi,
} from 'lucide-react';
import { api } from '../services/api';

const DEFAULT_REDIRECT_URL = 'https://www.jacarezinho.pr.gov.br/';

const emptyRegister = {
  full_name: '',
  cpf: '',
  department: '',
  username: '',
  password: '',
  lgpd_accepted: false,
};

const emptyLogin = {
  username: '',
  password: '',
};

function redirectAfterLogin(data) {
  window.setTimeout(() => {
    window.location.assign(data?.redirect_url || DEFAULT_REDIRECT_URL);
  }, 800);
}

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function Field({ label, value, onChange, type = 'text', autoComplete, placeholder, inputMode, required = false, minLength, maxLength }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase text-slate-600">
        {label}{required ? <span className="text-red-700"> *</span> : null}
      </span>
      <div className="relative">
        <input
          type={isPassword && showPassword ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          className={`h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-800 focus:ring-4 focus:ring-sky-800/12 ${isPassword ? 'pr-12' : ''}`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-800/30"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}
      </div>
    </label>
  );
}

function Notice({ tone = 'info', children }) {
  const classes = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    danger: 'border-red-200 bg-red-50 text-red-900',
  };
  return <div className={`rounded-lg border px-3 py-2 text-sm font-semibold leading-5 ${classes[tone]}`}>{children}</div>;
}

function DeveloperCredit() {
  return (
    <a
      href="https://jmbtecnologia.com.br"
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500 shadow-sm"
      title="JMB Tecnologia"
    >
      <span>Desenvolvido por</span>
      <img src="/jmb-logo-clean.png" alt="JMB Tecnologia" className="h-7 w-auto object-contain" />
    </a>
  );
}

function TermsView({ onBack }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <ShieldCheck size={24} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">LGPD e uso da rede</p>
          <h2 className="mt-1 text-xl font-black leading-tight text-slate-950">Termo de Acesso Mobile de Colaboradores</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Acesso institucional à VLAN 30 mediante identificação do colaborador e registro da sessão.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 text-sm leading-6 text-slate-700">
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <h3 className="font-black text-emerald-950">Proteção de dados pessoais</h3>
          <p className="mt-1">
            O tratamento dos dados informados neste portal observa a Lei Federal nº 13.709/2018, Lei Geral de Proteção de Dados Pessoais (LGPD). Os dados são usados para identificação, controle de acesso, segurança da rede, auditoria e responsabilização institucional.
          </p>
        </section>
        <section className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3">
          <h3 className="font-black text-sky-950">Dados tratados</h3>
          <p className="mt-1">
            Poderão ser registrados nome completo, CPF, setor, usuário, IP, MAC quando identificado, data e hora de acesso, duração da sessão e evidências técnicas necessárias à segurança da rede.
          </p>
        </section>
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <h3 className="font-black text-amber-950">Bloqueio antes da autenticação</h3>
          <p className="mt-1">
            Antes do cadastro, login ou confirmação explícita do dispositivo reconhecido, a navegação externa permanece bloqueada. A liberação só ocorre após a ação consciente do colaborador neste portal.
          </p>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <h3 className="font-black text-slate-950">Aceite</h3>
          <p className="mt-1">
            Ao prosseguir, o colaborador declara ciência sobre o tratamento de dados, o uso responsável da conexão institucional e a sujeição às políticas de DNS, RPZ, firewall, auditoria e segurança operacional do SGCG.
          </p>
        </section>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-base font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-700/20"
      >
        <ArrowLeft size={18} />
        Voltar e continuar
      </button>
    </div>
  );
}

export default function CollaboratorPortal() {
  const [view, setView] = useState('connect');
  const [mode, setMode] = useState('register');
  const [context, setContext] = useState({ auth_required: true, vlan_ok: true, requires_login: true });
  const [registerForm, setRegisterForm] = useState(emptyRegister);
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [status, setStatus] = useState({ type: 'info', message: 'Cadastre-se ou entre com usuário e senha para liberar a navegação deste dispositivo.' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isRecognized = !!context?.recognized && !!context?.requires_confirm;
  const deviceText = useMemo(() => {
    if (!context) return 'Identificação em andamento';
    return context.mac ? `Dispositivo ${context.mac}` : 'Dispositivo ainda não identificado pelo gateway';
  }, [context]);

  const loadContext = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/collaborators/public/context', { timeout: 4000 });
      if (!res.data || typeof res.data !== 'object') {
        throw new Error('invalid_context_response');
      }
      setContext(res.data);
      if (res.data?.authenticated) {
        setStatus({ type: 'success', message: `Acesso liberado para ${res.data.user?.full_name || res.data.user?.username}.` });
        redirectAfterLogin(res.data);
      } else if (res.data?.recognized && res.data?.requires_confirm) {
        setStatus({ type: 'success', message: res.data?.message || `Bem-vindo, ${res.data?.user?.full_name || 'colaborador'}. Clique em Entrar na Internet para navegar.` });
      } else if (res.data?.vlan_ok === false) {
        setStatus({ type: 'danger', message: 'Este portal só libera dispositivos conectados à VLAN 30.' });
      } else {
        setStatus({ type: 'info', message: 'Cadastre-se ou entre com usuário e senha para liberar a navegação deste dispositivo.' });
      }
    } catch (error) {
      setContext((current) => ({ ...(current || {}), auth_required: true, vlan_ok: true, requires_login: true, authenticated: false }));
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'Não foi possível verificar a conexão. Abra o portal pela rede Wi-Fi da VLAN 30 ou tente novamente em alguns segundos.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContext(); }, []);

  const submitContinue = async () => {
    setSubmitting(true);
    try {
      const res = await api.post('/api/collaborators/public/continue');
      setContext(res.data);
      setStatus({ type: 'success', message: 'Acesso confirmado. Navegação liberada para este dispositivo.' });
      redirectAfterLogin(res.data);
    } catch (error) {
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'Não foi possível confirmar o dispositivo. Faça login com usuário e senha.' });
      setContext((current) => ({ ...(current || {}), recognized: false, requires_confirm: false, authenticated: false }));
      setMode('login');
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async (event) => {
    event.preventDefault();
    if (!registerForm.lgpd_accepted) {
      setStatus({ type: 'danger', message: 'Para concluir o cadastro, marque a ciência e aceite da LGPD.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/api/collaborators/public/register', {
        ...registerForm,
        cpf: registerForm.cpf.replace(/\D/g, ''),
      });
      setContext(res.data);
      setStatus({ type: 'success', message: 'Cadastro concluído. Navegação liberada para este dispositivo.' });
      redirectAfterLogin(res.data);
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
      const res = await api.post('/api/collaborators/public/login', loginForm);
      setContext(res.data);
      setStatus({ type: 'success', message: 'Login confirmado. Navegação liberada para este dispositivo.' });
      redirectAfterLogin(res.data);
    } catch (error) {
      setStatus({ type: 'danger', message: error?.response?.data?.error || 'Usuário ou senha inválidos.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <header className="overflow-hidden rounded-lg border border-sky-950/10 bg-white shadow-lg">
          <div className="bg-sky-950 px-4 py-5 text-white sm:px-6">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white p-2 shadow-sm">
                <img src="/LOGO-JACAREZINHO.png" alt="Brasão de Jacarezinho" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide text-sky-100">Prefeitura Municipal de Jacarezinho</p>
                <h1 className="mt-1 text-3xl font-black leading-tight sm:text-4xl">Portal do Colaborador</h1>
                <p className="mt-2 text-sm font-semibold leading-6 text-sky-50/90">
                  Cadastro e autenticação pessoal para liberar o acesso mobile institucional com segurança, auditoria e respeito à LGPD.
                </p>
              </div>
            </div>
          </div>
          <div className="border-t border-sky-900/10 bg-slate-50 px-4 py-4 sm:px-6">
            <p className="text-xs font-black uppercase tracking-wide text-sky-950">Secretaria Municipal de Comércio, Indústria, Serviços e Inovação</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
              Use seus dados reais para criar ou acessar sua conta. As informações são registradas no SGCG para identificação, liberação da rede e responsabilização institucional.
            </p>
          </div>
        </header>

        <div className="mt-4 grid gap-4">
          {view === 'terms' ? (
            <TermsView onBack={() => setView('connect')} />
          ) : (
            <>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-900">
                  <Wifi size={23} />
                </div>
                <div>
                  <h2 className="text-lg font-black">Identificação obrigatória do colaborador</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Sem cadastro, login ou confirmação explícita, este dispositivo permanece sem navegação externa. O primeiro acesso cria sua conta local no SGCG e vincula o dispositivo quando o gateway conseguir identificar o MAC.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="block text-[10px] font-black uppercase text-slate-400">Rede</span>
                  VLAN 30
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="block text-[10px] font-black uppercase text-slate-400">Sessão</span>
                  8 horas
                </div>
                <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950 sm:col-span-1">
                  <span className="block text-[10px] font-black uppercase text-emerald-700">Dados</span>
                  Tratamento conforme LGPD
                </div>
              </div>

              <div className="mt-4">
                <Notice tone={status.type}>{status.message}</Notice>
              </div>

              <button
                type="button"
                onClick={() => setView('terms')}
                className="mt-3 flex w-full items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-left text-xs font-bold leading-5 text-emerald-950"
              >
                <ShieldCheck className="mt-0.5 shrink-0" size={16} />
                <span>Ao continuar, você declara ciência sobre o tratamento de dados pessoais conforme a Lei Geral de Proteção de Dados nº 13.709/2018 - LGPD. Consulte o termo completo antes de concluir o cadastro.</span>
              </button>

              {loading && !isRecognized && !context?.authenticated ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                  <Loader2 className="animate-spin" size={14} />
                  Atualizando identificação do dispositivo...
                </div>
              ) : null}

              {isRecognized ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 shrink-0" size={22} />
                    <div>
                      <h3 className="text-lg font-black">Bem-vindo, {context.user?.full_name || 'colaborador'}</h3>
                      <p className="mt-1 text-sm leading-6">{deviceText}. A navegação só será liberada após sua confirmação.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={submitContinue}
                    disabled={submitting}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-base font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Wifi size={18} />}
                    Entrar na Internet
                  </button>
                </div>
              ) : context?.authenticated ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                  <div className="flex items-center gap-2 font-black"><CheckCircle2 size={20} /> Acesso liberado</div>
                  <p className="mt-2 text-sm">{context.user?.full_name || context.user?.username}</p>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black transition ${mode === 'register' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-500'}`}
                    >
                      <UserPlus size={16} />
                      Cadastro
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-black transition ${mode === 'login' ? 'bg-white text-sky-950 shadow-sm' : 'text-slate-500'}`}
                    >
                      <Wifi size={16} />
                      <span className="font-black">Login</span>
                    </button>
                  </div>

                  {mode === 'register' ? (
                    <form className="mt-5 grid gap-4" onSubmit={submitRegister}>
                      <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-sm font-semibold leading-6 text-sky-950">
                        Primeiro acesso: preencha o cadastro para criar sua conta de colaborador. Após a confirmação, o registro fica disponível no módulo Acesso Mobile do SGCG para gestão administrativa.
                      </div>
                      <Field label="Nome completo" required minLength={6} value={registerForm.full_name} onChange={(value) => setRegisterForm((current) => ({ ...current, full_name: value }))} autoComplete="name" />
                      <Field label="CPF" required minLength={14} maxLength={14} value={registerForm.cpf} onChange={(value) => setRegisterForm((current) => ({ ...current, cpf: formatCpf(value) }))} inputMode="numeric" autoComplete="off" />
                      <Field label="Setor" required minLength={2} value={registerForm.department} onChange={(value) => setRegisterForm((current) => ({ ...current, department: value }))} autoComplete="organization-title" />
                      <Field label="Usuário" required minLength={3} value={registerForm.username} onChange={(value) => setRegisterForm((current) => ({ ...current, username: value }))} autoComplete="username" />
                      <Field label="Senha" required minLength={6} type="password" value={registerForm.password} onChange={(value) => setRegisterForm((current) => ({ ...current, password: value }))} autoComplete="new-password" />
                      <label className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold leading-5 text-emerald-950">
                        <input
                          type="checkbox"
                          required
                          checked={registerForm.lgpd_accepted}
                          onChange={(event) => setRegisterForm((current) => ({ ...current, lgpd_accepted: event.target.checked }))}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-emerald-400 text-emerald-700 focus:ring-emerald-700"
                        />
                        <span>
                          Declaro ciência da Lei Geral de Proteção de Dados - LGPD, autorizo o tratamento dos dados informados para identificação, segurança da rede e auditoria institucional, e confirmo que todos os campos obrigatórios foram preenchidos corretamente.
                        </span>
                      </label>
                      <button
                        type="submit"
                        disabled={submitting || context?.vlan_ok === false}
                        className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-900 px-4 text-base font-black text-white shadow-lg shadow-sky-900/15 transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? <Loader2 className="animate-spin" size={18} /> : <FileCheck2 size={18} />}
                        Cadastrar e liberar navegação
                      </button>
                    </form>
                  ) : (
                    <form className="mt-5 grid gap-4" onSubmit={submitLogin}>
                      <Field label="Usuário institucional" value={loginForm.username} onChange={(value) => setLoginForm((current) => ({ ...current, username: value }))} autoComplete="username" />
                      <Field label="Senha" type="password" value={loginForm.password} onChange={(value) => setLoginForm((current) => ({ ...current, password: value }))} autoComplete="current-password" />
                      <button
                        type="submit"
                        disabled={submitting || context?.vlan_ok === false}
                        className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-900 px-4 text-base font-black text-white shadow-lg shadow-sky-900/15 transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
                        Entrar e liberar navegação
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
            <DeveloperCredit />
            </>
          )}
        </div>

        <footer className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={16} />
            <span>O acesso é pessoal e auditável. A liberação vale para o IP atual e permanece sujeita às políticas institucionais de DNS, RPZ, firewall e segurança operacional.</span>
          </div>
        </footer>
      </section>
    </main>
  );
}
