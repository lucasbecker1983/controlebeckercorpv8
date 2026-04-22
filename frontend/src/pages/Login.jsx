import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, User, Server, Sun, Moon, Activity, Globe, Database, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { motion } from 'framer-motion';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [theme, setTheme] = useState(localStorage.getItem('becker_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('becker_theme', theme);
  }, [theme]);

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
      
      {/* LADO ESQUERDO: IMAGEM DATACENTER */}
      {/* Ajustei a opacidade para 60% e removi mix-blend para garantir que a imagem apareça */}
      <div className="hidden lg:flex flex-1 relative bg-slate-950 overflow-hidden z-10 w-full h-full min-h-screen">
        <img 
          src="https://images.unsplash.com/photo-1558494949-ef010cbdcc48?q=80&w=1200&auto=format&fit=crop" 
          className="absolute inset-0 w-full h-full object-cover opacity-60 z-10" 
          alt="Racks Datacenter" 
          loading="lazy"
        />
        {/* O único gradiente necessário: escurece de baixo para cima para o texto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent z-20"></div>
        
        {/* Conteúdo do lado esquerdo (sobre a imagem) */}
        <div className="relative z-30 flex flex-col justify-center p-20 w-full h-full max-w-5xl">
            <div className="bg-blue-500/20 w-20 h-20 rounded-3xl flex items-center justify-center border border-blue-400/30 shadow-[0_0_30px_rgba(59,130,246,0.3)] mb-8 backdrop-blur-sm">
                <Server size={40} className="text-blue-400" />
            </div>
            
            <h2 className="text-5xl lg:text-7xl font-black text-white leading-normal mb-6 drop-shadow-lg">
                Controle <br/>
                {/* Correção do "8" cortado: Adicionado pr-1 e removido tracking-tighter */}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 italic pr-1">BeckerCorp - V8</span>
            </h2>
            
            <p className="text-slate-200 text-lg mb-12 max-w-2xl font-medium leading-relaxed drop-shadow-md">
                Plataforma de comando unificada. Potência de nível empresarial para orquestração de rede, telemetria em tempo real e defesa cibernética ativa.
            </p>

            <div className="grid grid-cols-2 gap-6 max-w-3xl">
                <div className="bg-black/30 border border-white/10 p-5 rounded-2xl backdrop-blur-md hover:bg-black/50 transition-colors">
                    <Activity className="text-blue-400 mb-3" size={24} />
                    <h3 className="text-white font-bold mb-1">Telemetria Real-Time</h3>
                    <p className="text-slate-300 text-xs">Monitoramento de links WAN/LAN, agregação de VLANs e limites de QoS de alta precisão.</p>
                </div>
                <div className="bg-black/30 border border-white/10 p-5 rounded-2xl backdrop-blur-md hover:bg-black/50 transition-colors">
                    <ShieldAlert className="text-red-400 mb-3" size={24} />
                    <h3 className="text-white font-bold mb-1">IA Sentinela & Firewall</h3>
                    <p className="text-slate-300 text-xs">Proteção proativa UFW, mitigação de Brute Force (Fail2Ban) e isolamento de intrusos.</p>
                </div>
                <div className="bg-black/30 border border-white/10 p-5 rounded-2xl backdrop-blur-md hover:bg-black/50 transition-colors">
                    <Globe className="text-emerald-400 mb-3" size={24} />
                    <h3 className="text-white font-bold mb-1">Roteamento Inteligente</h3>
                    <p className="text-slate-300 text-xs">Gestão DHCP, DNS Unbound integrado, túneis VPN WireGuard e controle de Proxy Squid.</p>
                </div>
                <div className="bg-black/30 border border-white/10 p-5 rounded-2xl backdrop-blur-md hover:bg-black/50 transition-colors">
                    <Database className="text-purple-400 mb-3" size={24} />
                    <h3 className="text-white font-bold mb-1">Cofre de Infraestrutura</h3>
                    <p className="text-slate-300 text-xs">Backups automatizados de banco e configurações, auditoria de acessos e monitor de HDs.</p>
                </div>
            </div>
        </div>
      </div>

      {/* LADO DIREITO: FORMULÁRIO DE LOGIN */}
      <div className="w-full lg:w-[500px] flex flex-col p-8 md:p-16 relative bg-surface z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.1)] transition-colors duration-300 border-l border-outline/10">
        
        {/* Botão Tema Sol/Lua */}
        <div className="absolute top-6 right-6 lg:top-10 lg:right-10">
            <button 
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
                className="p-3 rounded-full bg-container border border-outline/20 hover:scale-105 transition-all shadow-sm text-on-surface"
                title="Alternar Modo de Cor"
            >
                {theme === 'dark' ? <Sun size={24} className="text-yellow-500" /> : <Moon size={24} className="text-primary" />}
            </button>
        </div>

        <div className="flex flex-col justify-center flex-1 w-full max-w-sm mx-auto mt-12 lg:mt-0">
            <div className="mb-10 text-center lg:text-left">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 mx-auto lg:mx-0 border border-primary/20">
                    <ShieldCheck size={32} className="text-primary" />
                </div>
                <h1 className="text-3xl font-black tracking-tight mb-2 text-on-surface">Acesso Restrito</h1>
                <p className="text-on-surface opacity-60 text-sm font-medium">Insira suas credenciais de operador.</p>
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
                    {loading ? <Activity className="animate-spin" size={20} /> : 'ENTRAR NO SISTEMA'}
                </button>
            </form>
            
            <p className="text-center text-xs font-bold text-on-surface opacity-40 uppercase tracking-widest mt-12">
                Conexão Segura Criptografada
            </p>
        </div>
      </div>
    </div>
  );
}
