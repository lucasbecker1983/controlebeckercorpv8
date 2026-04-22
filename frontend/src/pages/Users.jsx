import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, UserPlus, Edit3, Trash2, Shield, User } from 'lucide-react';
import { api } from '../services/api';

export default function Users() {
    const [users, setUsers] = useState([]);
    
    const loadUsers = async () => { try { const res = await api.get('/api/users'); setUsers(res.data); } catch {} };
    useEffect(() => { loadUsers(); }, []);

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-4xl font-light text-on-surface">Gestão de <span className="font-bold italic text-primary">Equipe</span></h2>
                <button className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-md hover:opacity-90 transition-all">
                    <UserPlus size={18}/> Novo Membro
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {users.map(u => (
                    <div key={u.id} className="bg-container border border-outline/20 p-6 rounded-[28px] shadow-sm flex flex-col items-center text-center hover:border-primary/50 transition-all group">
                        <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center text-3xl font-black mb-4">
                            {u.name.charAt(0).toUpperCase()}
                        </div>
                        <h3 className="font-bold text-lg text-on-surface">{u.name}</h3>
                        <p className="text-sm font-mono text-on-surface opacity-60 mb-4">@{u.username}</p>
                        
                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase flex items-center gap-1 mb-6 ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                            {u.role === 'admin' ? <Shield size={14}/> : <User size={14}/>} {u.role === 'admin' ? 'Admin' : 'Operador'}
                        </span>

                        <div className="w-full flex gap-2 border-t border-outline/10 pt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="flex-1 py-2 rounded-xl text-on-surface bg-outline/5 hover:bg-outline/20 font-bold text-xs flex justify-center items-center gap-2 transition-colors"><Edit3 size={14}/> Editar</button>
                            <button className="flex-1 py-2 rounded-xl text-danger bg-danger/5 hover:bg-danger/20 font-bold text-xs flex justify-center items-center gap-2 transition-colors"><Trash2 size={14}/> Excluir</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
