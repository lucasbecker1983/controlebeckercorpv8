import React, { useState, useEffect } from 'react';
import { ArrowRight, Building2, Lock, Moon, Palette, ShieldAlert, ShieldCheck, Sun, User } from 'lucide-react';
import { api } from '../services/api';
import { motion } from 'framer-motion';

const accentChoices = [
  { value: 'government', label: 'Governamental' },
  { value: 'navy', label: 'Institucional' },
  { value: 'copper', label: 'Executivo' },
];

export default function Login({ onLogin, theme, accent, onThemeChange, onAccentChange }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await api.post('/api/auth/login', { username, password });
      if (res.data.token) {
        localStorage.setItem('becker_token', res.data.token);
        localStorage.setItem('becker_user', JSON.stringify(res.data.user));
        onLogin(res.data.token, res.data.user);
        window.location.href = '/';
      }
    } catch (err) { setError('Credenciais inválidas. Acesso negado.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen w-full bg-surface text-on-surface font-sans">
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
            <p className="mt-6 max-w-2xl text-base font-medium leading-7 text-white/74 xl:text-lg">
              Ambiente institucional para operação, auditoria, resiliência e controle centralizado da infraestrutura crítica.
            </p>
          </div>

          <div className="grid max-w-4xl grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-3xl border border-white/12 bg-white/8 p-6 backdrop-blur-md">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/58">Governança</div>
              <p className="mt-3 text-sm leading-6 text-white/82">Políticas, supervisão técnica e controle operacional em uma única superfície institucional.</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-6 backdrop-blur-md">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/58">Auditoria</div>
              <p className="mt-3 text-sm leading-6 text-white/82">Rastreabilidade de acessos, eventos de rede e decisões críticas sobre serviços do ambiente.</p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/8 p-6 backdrop-blur-md">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/58">Continuidade</div>
              <p className="mt-3 text-sm leading-6 text-white/82">Operação preparada para contingência, recuperação e sustentação de serviços essenciais.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-20 flex w-full flex-col border-l border-outline/10 bg-surface p-8 shadow-[-20px_0_50px_rgba(0,0,0,0.08)] transition-colors duration-300 md:p-16 lg:w-[540px]">
        <div className="absolute right-6 top-6 flex items-center gap-2 lg:right-10 lg:top-10">
            <button
                type="button"
                onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                className="p-3 rounded-full bg-container border border-outline/20 hover:scale-105 transition-all shadow-sm text-on-surface"
                title="Alternar tema"
            >
                {theme === 'dark' ? <Sun size={22} className="text-yellow-500" /> : <Moon size={22} className="text-primary" />}
            </button>
            <div className="hidden items-center gap-1 rounded-full border border-outline/16 bg-container/80 p-1 md:flex">
              {accentChoices.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => onAccentChange(choice.value)}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
                    accent === choice.value ? 'bg-primary text-on-primary' : 'text-on-surface/58 hover:text-on-surface'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
        </div>

        <div className="flex flex-col justify-center flex-1 w-full max-w-sm mx-auto mt-12 lg:mt-0">
            <div className="mb-10 text-center lg:text-left">
                <img src="/jmb-logo.png" alt="JMB Tecnologia" className="mx-auto h-12 w-auto lg:mx-0" />
                <div className="mt-6 w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 mx-auto lg:mx-0 border border-primary/20">
                    <ShieldCheck size={32} className="text-primary" />
                </div>
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">SGCG</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-on-surface">Acesso institucional</h1>
                <p className="mt-2 text-sm font-medium text-on-surface/60">
                  Autentique-se para operar o Sistema de Governança e Controle Governamental.
                </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-70 text-on-surface">Utilizador</label>
                    <div className="relative group">
                        <User size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface opacity-40 group-focus-within:opacity-100 group-focus-within:text-primary transition-all" />
                        <input 
                            type="text" required value={username} onChange={e => setUsername(e.target.value)}
                            className="w-full bg-container border border-outline/20 rounded-2xl py-4 pl-12 pr-4 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium text-lg"
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
                            className="w-full bg-container border border-outline/20 rounded-2xl py-4 pl-12 pr-4 text-on-surface focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium text-lg tracking-widest"
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
                    className="w-full bg-primary text-on-primary font-black py-4 rounded-2xl hover:opacity-90 active:scale-95 transition-all shadow-[0_10px_40px_-10px_rgba(var(--color-primary),0.5)] mt-4 text-lg flex items-center justify-center gap-2"
                >
                    {loading ? <ShieldCheck className="animate-pulse" size={20} /> : <>Entrar no sistema <ArrowRight size={18} /></>}
                </button>
            </form>

            <div className="mt-10 rounded-3xl border border-outline/12 bg-surface-high/62 p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-on-surface/46">
                <Palette size={14} className="text-primary" />
                Aparência inicial
              </div>
              <p className="mt-2 text-sm leading-6 text-on-surface/62">
                O módulo de Configurações ficará disponível após o login para ajuste de temas e cores institucionais.
              </p>
            </div>
        </div>
      </div>
    </div>
  );
}
