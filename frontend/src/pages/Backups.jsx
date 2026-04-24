import React, { useState, useEffect } from 'react';
import { Database, Download, Trash2, RefreshCcw, Save } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, ModuleHeader, Surface } from '../components/ui/primitives';

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
            <ModuleHeader
                eyebrow="Controle"
                title="Continuidade & Backup"
                description="Gerencie salvaguardas operacionais do ambiente, preservando a recuperação técnica e a continuidade de serviços essenciais do SGCG."
                badges={[
                    <span key="arquivos" className="inline-flex min-h-[var(--chip-height)] items-center rounded-full border border-primary/16 bg-primary/10 px-[var(--chip-padding-x)] py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                        {files.length} artefatos no cofre
                    </span>,
                ]}
                actions={[
                    <ActionButton key="backup" tone="primary" icon={Save} onClick={create} disabled={loading}>
                        {loading ? 'Gerando...' : 'Criar Backup Agora'}
                    </ActionButton>,
                ]}
            />

            <Surface className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-surface-high/72 text-on-surface/70 uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-4 font-bold">Arquivo</th>
                                <th className="p-4 font-bold">Tamanho</th>
                                <th className="p-4 font-bold">Data de Criação</th>
                                <th className="p-4 text-right font-bold">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline/10">
                            {files.map(f => (
                                <tr key={f.name} className="hover:bg-surface-high/52 transition-colors">
                                    <td className="p-4 text-on-surface font-bold flex items-center gap-2"><Database size={16} className="text-primary"/> {f.name}</td>
                                    <td className="p-4 text-info font-mono">{f.size}</td>
                                    <td className="p-4 text-on-surface opacity-80">{new Date(f.date).toLocaleString('pt-BR')}</td>
                                    <td className="p-4 flex justify-end gap-2">
                                        <button onClick={() => download(f.name)} className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-500 hover:text-on-surface transition-all"><Download size={18}/></button>
                                        <button onClick={() => remove(f.name)} className="p-2 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-500 hover:text-on-surface transition-all"><Trash2 size={18}/></button>
                                    </td>
                                </tr>
                            ))}
                            {files.length === 0 && <tr><td colSpan="4" className="p-12 text-center text-on-surface opacity-50 italic">Cofre vazio. Nenhum backup encontrado.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Surface>
        </div>
    );
}
