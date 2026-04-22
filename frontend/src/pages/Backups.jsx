import React, { useState, useEffect } from 'react';
import { Database, Download, Trash2, RefreshCcw, Save } from 'lucide-react';
import { api } from '../services/api';

export default function Backups() {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = async () => { try { const res = await api.get('/api/backups'); setFiles(Array.isArray(res.data) ? res.data : []); } catch (e) { setFiles([]); } };
    useEffect(() => { load(); }, []);

    const create = async () => {
        if(!confirm("Gerar NOVO backup (Código + Banco)?")) return;
        setLoading(true);
        try { await api.post('/api/backups/create'); alert("Backup gerado!"); await load(); } catch(e) { alert("Erro ao criar."); }
        setLoading(false);
    };

    const remove = async (filename) => {
        if(!confirm(`EXCLUIR PERMANENTEMENTE o arquivo ${filename}?`)) return;
        try { await api.post('/api/backups/delete', { filename }); load(); } catch(e) {}
    };

    const download = async (filename) => {
        try {
            const res = await api.post('/api/backups/download', { filename }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a'); link.href = url; link.setAttribute('download', filename);
            document.body.appendChild(link); link.click(); link.remove();
        } catch(e) { alert("Erro no download."); }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <h2 className="text-4xl font-light text-md-on-surface">Cofre de <span className="font-bold italic text-md-primary">Segurança</span></h2>
                <button onClick={create} disabled={loading} className="px-6 py-3 bg-md-primary text-md-on-primary rounded-full font-bold text-sm flex items-center gap-2 hover:opacity-90 shadow-md">
                    <Save size={18}/> {loading ? 'Gerando...' : 'Criar Backup Agora'}
                </button>
            </div>

            <div className="bg-md-container rounded-[32px] overflow-hidden border border-black/5 dark:border-white/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-black/5 dark:bg-white/5 text-md-on-surface opacity-70 uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-4 font-bold">Arquivo</th>
                                <th className="p-4 font-bold">Tamanho</th>
                                <th className="p-4 font-bold">Data de Criação</th>
                                <th className="p-4 text-right font-bold">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {files.map(f => (
                                <tr key={f.name} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                    <td className="p-4 text-md-on-surface font-bold flex items-center gap-2"><Database size={16} className="text-md-primary"/> {f.name}</td>
                                    <td className="p-4 text-emerald-600 dark:text-emerald-400 font-mono">{f.size}</td>
                                    <td className="p-4 text-md-on-surface opacity-80">{new Date(f.date).toLocaleString('pt-BR')}</td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button onClick={() => download(f.name)} className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-500 hover:text-on-surface transition-all"><Download size={18}/></button>
                                        <button onClick={() => remove(f.name)} className="p-2 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-500 hover:text-on-surface transition-all"><Trash2 size={18}/></button>
                                    </td>
                                </tr>
                            ))}
                            {files.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-md-on-surface opacity-50 italic">Cofre Vazio. Nenhum backup encontrado.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
