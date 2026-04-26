import React, { useState } from 'react';
import { ArrowRight, Building2, Lock, ShieldAlert, ShieldCheck, User } from 'lucide-react';
import { api, resetAuthInvalidation } from '../services/api';
import { motion } from 'framer-motion';
import { resetAuthFetchInvalidation } from '../services/authFetch';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      resetAuthInvalidation();
      resetAuthFetchInvalidation();
      localStorage.removeItem('becker_token');
      localStorage.removeItem('becker_user');
      const res = await api.post('/api/auth/login', { username, password });
      const token = res.data?.accessToken || res.data?.token || '';
      if (!res.data?.user || !token) {
        throw new Error('login-incompleto');
      }

      resetAuthInvalidation();
      resetAuthFetchInvalidation();
      localStorage.setItem('becker_token', token);
      localStorage.setItem('becker_user', JSON.stringify(res.data.user));
      window.history.replaceState({}, '', '/');
      onLogin(res.data.user);
    } catch (err) {
      localStorage.removeItem('becker_token');
      localStorage.removeItem('becker_user');
      setError('Sessão não iniciada. Verifique backend/proxy.');
    }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-surface text-on-surface font-sans lg:flex-row">
      <div className="relative overflow-hidden border-b border-outline/10 px-5 pb-8 pt-24 sm:px-8 md:px-10 lg:hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.2),transparent_24%),linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_28%,#08111c)_0%,color-mix(in_srgb,var(--color-secondary)_24%,#0f172a)_55%,#07111b_100%)]" />
        <div className="absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative z-10 mx-auto max-w-xl">
          <img src="/jmb-logo.png" alt="JMB Tecnologia" className="h-11 w-auto" />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/84 backdrop-blur-md">
            <Building2 size={13} />
            SGCG
          </div>
          <h2 className="mt-5 max-w-lg text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">
            Sistema de Governança e Controle Governamental
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/74 sm:text-base">
            Plataforma institucional para operação, auditoria, continuidade e governança centralizada de dados sob critérios rigorosos de proteção e responsabilização.
          </p>
        </div>
      </div>

      <div className="relative hidden min-h-screen flex-1 overflow-hidden border-r border-outline/10 lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_26%),linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_26%,#07111f)_0%,color-mix(in_srgb,var(--color-secondary)_28%,#0f172a)_50%,#08111c_100%)]" />
        <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute -left-16 top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-primary/24 blur-3xl" />

        <div className="relative z-10 flex w-full max-w-5xl flex-col justify-between p-16 xl:p-20">
          <div>
            <img src="/jmb-logo.png" alt="JMB Tecnologia" className="h-14 w-auto" />
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/84 backdrop-blur-md">
              <Building2 size={14} />
              SGCG
            </div>
            <h2 className="mt-8 max-w-4xl text-5xl font-black leading-[1.02] tracking-tight text-white xl:text-6xl">
              Sistema de Governança e Controle Governamental da JMB Tecnologia
            </h2>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-white/74 xl:text-lg">
              Ambiente institucional para operação, auditoria, resiliência, proteção de dados e controle centralizado da infraestrutura crítica.
            </p>
          </div>

          <div className="grid max-w-3xl grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-md">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/58">Governança</div>
              <p className="mt-2 text-sm leading-6 text-white/82">Políticas, supervisão técnica e controle operacional em uma única superfície institucional.</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-md">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/58">Auditoria</div>
              <p className="mt-2 text-sm leading-6 text-white/82">Rastreabilidade de acessos, eventos de rede e decisões críticas sobre serviços do ambiente.</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-5 backdrop-blur-md xl:col-span-2">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/58">Dados e Continuidade</div>
              <p className="mt-2 text-sm leading-6 text-white/82">Operação preparada para contingência, sustentação de serviços essenciais e governança institucional de dados pessoais em aderência à Lei Geral de Proteção de Dados.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-20 flex w-full flex-1 flex-col bg-surface px-5 pb-8 pt-6 transition-colors duration-300 sm:px-8 sm:pb-10 md:px-10 lg:w-[540px] lg:flex-none lg:border-l lg:border-outline/10 lg:px-12 lg:py-10 lg:shadow-[-20px_0_50px_rgba(0,0,0,0.08)] xl:px-16">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center lg:max-w-sm">
            <div className="mb-8 text-center lg:mb-10 lg:text-left">
                <img src="/jmb-logo.png" alt="JMB Tecnologia" className="mx-auto h-10 w-auto sm:h-12 lg:mx-0" />
                <div className="mx-auto mb-5 mt-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 sm:h-16 sm:w-16 lg:mx-0 lg:mb-6 lg:mt-6">
                    <ShieldCheck size={32} className="text-primary" />
                </div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">SGCG</div>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-on-surface sm:text-3xl">Acesso institucional</h1>
                <p className="mt-2 text-sm font-medium leading-6 text-on-surface/60">
                  Autentique-se para operar o Sistema de Governança e Controle Governamental.
                </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6">
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-70 text-on-surface">Utilizador</label>
                    <div className="relative group">
                        <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface opacity-40 group-focus-within:opacity-100 group-focus-within:text-primary transition-all" />
                        <input 
                            type="text" required value={username} onChange={e => setUsername(e.target.value)}
                            className="w-full rounded-2xl border border-outline/20 bg-container py-3.5 pl-12 pr-4 text-base font-medium text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:py-4 sm:text-lg"
                            placeholder="admin" 
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-70 text-on-surface">Palavra-passe</label>
                    <div className="relative group">
                        <Lock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface opacity-40 group-focus-within:opacity-100 group-focus-within:text-primary transition-all" />
                        <input 
                            type="password" required value={password} onChange={e => setPassword(e.target.value)}
                            className="w-full rounded-2xl border border-outline/20 bg-container py-3.5 pl-12 pr-4 text-base font-medium tracking-widest text-on-surface outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 sm:py-4 sm:text-lg"
                            placeholder="••••••••" 
                        />
                    </div>
                </div>

                {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-danger/10 border border-danger/20 text-danger rounded-2xl text-sm font-bold flex items-center justify-center gap-2">
                        <ShieldAlert size={18}/> {error}
                    </motion.div>
                )}

                <button 
                    type="submit" disabled={loading} 
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-base font-black text-on-primary shadow-[0_10px_40px_-10px_rgba(var(--color-primary),0.5)] transition-all hover:opacity-90 active:scale-95 sm:mt-4 sm:py-4 sm:text-lg"
                >
                    {loading ? <ShieldCheck className="animate-pulse" size={20} /> : <>Entrar no sistema <ArrowRight size={18} /></>}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
}
