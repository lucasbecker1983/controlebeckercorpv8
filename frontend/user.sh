#!/bin/bash
set -e

echo ">>> [BECKER CORP v8] Atualizando Frontend (Auth V8)..."

TARGET_FILE="src/pages/Users.jsx"

if [ ! -d "src/pages" ]; then
    echo "!!! ERRO: Execute na raiz do projeto Frontend."
    exit 1
fi

cat << 'EOF' > "$TARGET_FILE"
import React, { useState, useEffect } from 'react';
import { User, Plus, Shield, Lock, Unlock, UserCheck, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

export default function Users() {
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState({ display_name: '', username: '', password: '', role: 'USER' });
    const [loading, setLoading] = useState(false);

    const load = async () => {
        try {
            const res = await api.get('/access');
            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error("Erro ao carregar", error);
        }
    };

    useEffect(() => { load(); }, []);

    const create = async (e) => {
        e.preventDefault();
        if (!form.username || !form.password) return alert("Preencha Usuário e Senha!");

        setLoading(true);
        try {
            await api.post('/access/add', form);
            setForm({ display_name: '', username: '', password: '', role: 'USER' });
            load();
        } catch (error) {
            alert(error.response?.data?.error || "Erro");
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (user) => {
        const action = user.is_active ? "BLOQUEAR" : "DESBLOQUEAR";
        if (confirm(`Deseja ${action} o acesso de ${user.display_name}?`)) {
            try {
                await api.post('/access/toggle', { id: user.id, active: !user.is_active });
                load();
            } catch (error) {
                alert("Erro ao alterar status");
            }
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">
                        Becker Corp <span className="text-blue-500">Security</span>
                    </h2>
                    <p className="text-slate-400 mt-2 font-mono text-sm">Auth Module V8 | Audit Log Active</p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-emerald-500/10 px-3 py-1 rounded border border-emerald-500/20 text-emerald-400 font-mono text-xs flex items-center gap-2">
                        <Shield size={12} /> SECURE HASH
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* FORM */}
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-[30px] h-fit">
                    <h3 className="text-white font-bold mb-6 flex items-center gap-3 border-b border-slate-800 pb-4">
                        <Plus size={20} className="text-blue-500"/> Novo Credencial
                    </h3>
                    
                    <form onSubmit={create} className="space-y-4">
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Display Name</label>
                            <input 
                                value={form.display_name} 
                                onChange={e => setForm({...form, display_name: e.target.value})} 
                                placeholder="Ex: Lucas Becker" 
                                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Username (Login)</label>
                            <input 
                                value={form.username} 
                                onChange={e => setForm({...form, username: e.target.value})} 
                                placeholder="lucas.becker" 
                                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white focus:border-blue-500 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Password</label>
                            <input 
                                type="password"
                                value={form.password} 
                                onChange={e => setForm({...form, password: e.target.value})} 
                                placeholder="••••••••" 
                                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-500 font-bold uppercase ml-1">Role Permission</label>
                            <select 
                                value={form.role} 
                                onChange={e => setForm({...form, role: e.target.value})} 
                                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white focus:border-blue-500 outline-none"
                            >
                                <option value="USER">USER (Padrão)</option>
                                <option value="ADMIN">ADMIN (Full Access)</option>
                            </select>
                        </div>

                        <button disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl text-white font-black uppercase mt-2 transition-colors">
                            {loading ? 'Criptografando...' : 'Registrar Usuário'}
                        </button>
                    </form>
                </div>

                {/* LIST */}
                <div className="xl:col-span-2 space-y-4">
                    {users.map(u => (
                        <div key={u.id} className={`flex flex-col md:flex-row justify-between items-center p-5 rounded-2xl border transition-all ${u.is_active ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-red-900/30 opacity-75'}`}>
                            
                            <div className="flex items-center gap-4 w-full">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                                    ${u.role === 'ADMIN' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {u.role === 'ADMIN' ? 'A' : 'U'}
                                </div>
                                <div>
                                    <div className="text-white font-bold flex items-center gap-2">
                                        {u.display_name || u.username}
                                        {!u.is_active && <span className="text-[10px] bg-red-500 text-white px-2 rounded">BLOQUEADO</span>}
                                    </div>
                                    <div className="text-slate-500 text-xs font-mono">@{u.username}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 mt-4 md:mt-0 w-full md:w-auto justify-end">
                                <span className="text-[10px] font-mono text-slate-600">ID: {u.id}</span>
                                
                                {u.username !== 'lucas.becker' && (
                                    <button 
                                        onClick={() => toggleStatus(u)}
                                        className={`p-2 rounded-lg transition-colors ${u.is_active ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}
                                        title={u.is_active ? "Bloquear Acesso" : "Restaurar Acesso"}
                                    >
                                        {u.is_active ? <Lock size={18}/> : <Unlock size={18}/>}
                                    </button>
                                )}
                                {u.username === 'lucas.becker' && <Lock size={18} className="text-slate-700"/>}
                            </div>
                        </div>
                    ))}
                    
                    {users.length === 0 && <div className="text-slate-600 text-center italic">Nenhum registro no Auth DB.</div>}
                </div>
            </div>
        </div>
    );
}
EOF

echo ">>> Frontend V8 Atualizado!"
