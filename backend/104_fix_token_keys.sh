#!/bin/bash
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FRONT_DIR="/opt/controlebeckercorp-v8/frontend/src"

echo -e "${YELLOW}>>> SINCRONIZANDO CHAVES DE LOGIN (becker_token)...${NC}"

# 1. Ajustar api.js para ler o token correto
cat > "$FRONT_DIR/services/api.js" << 'EOF'
import axios from 'axios';

export const api = axios.create({
    baseURL: 'https://console.jacarezinho.cloud',
    headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
    // CORREÇÃO: Lê 'becker_token' em vez de 'token'
    const token = localStorage.getItem('becker_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
EOF

# 2. Ajustar Login.jsx para SALVAR como becker_token
# Mantendo todo o visual, apenas alterando a lógica do sucesso.
cat > "$FRONT_DIR/pages/Login.jsx" << 'EOF'
import React, { useState } from 'react';
import { ShieldCheck, Lock, User } from 'lucide-react';
import { api } from '../services/api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/auth/login', { username, password });

      if (response.data.success || response.data.token) {
        // CORREÇÃO 1: Usar as chaves que o App.jsx espera
        localStorage.setItem('becker_token', response.data.token);
        localStorage.setItem('becker_user', JSON.stringify(response.data.user));
        
        // CORREÇÃO 2: Passar os argumentos na ordem certa para o App.jsx
        // O App.jsx espera: onLogin(token, user)
        if (onLogin) onLogin(response.data.token, response.data.user);
        
        // Redireciona para o Dashboard
        window.location.href = '/';
      } else {
        setError('Login falhou: Resposta inesperada.');
      }
    } catch (err) {
      console.error("Login Error:", err);
      const msg = err.response?.data?.error || 'Erro ao conectar ao servidor.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a14] text-white font-inter relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative w-full max-w-md p-8 bg-[#13131f] rounded-2xl border border-gray-800/50 shadow-2xl backdrop-blur-xl z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600/10 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-blue-500/30 shadow-[0_0_30px_-5px_rgba(37,99,235,0.3)]">
            <ShieldCheck className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            BECKER<span className="text-blue-500 italic">V8</span>
          </h1>
          <p className="text-gray-400 text-xs tracking-[0.2em] mt-1 font-medium">ACESSO RESTRITO</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 bg-[#0a0a14] border border-gray-800 rounded-xl text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-sm"
                placeholder="Usuário"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 bg-[#0a0a14] border border-gray-800 rounded-xl text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-sm"
                placeholder="••••••"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#13131f] focus:ring-blue-500 disabled:opacity-50 transition-all"
          >
            {loading ? 'CONECTANDO...' : 'ENTRAR NO SISTEMA'}
          </button>
        </form>
         <div className="mt-8 text-center">
          <p className="text-[10px] text-gray-600">
            &copy; 2026 Becker Corp &bull; Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
EOF

# 3. Recompilar
echo -e "${YELLOW}-> Recompilando Frontend...${NC}"
cd /opt/controlebeckercorp-v8/frontend
npm run build
pm2 restart bcc-frontend

echo -e "${GREEN}>>> CORREÇÃO APLICADA! PODE LOGAR!${NC}"
