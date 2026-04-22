import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Router, Database, Server, Radio, Zap, CheckCircle, Activity, LayoutGrid, Play, Square, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';

export default function ControlPage() {
    const [services, setServices] = useState([]);
    const [selectedService, setSelectedService] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    
    const loadData = async () => { try { const res = await api.get('/api/control/services'); setServices(res.data || []); } catch {} };
    useEffect(() => { loadData(); const i = setInterval(loadData, 5000); return () => clearInterval(i); }, []);

    // Ações táticas globais
    const runTactical = async (action, label) => {
        if(!confirm(`Executar comando tático: ${label}?`)) return;
        try { await api.post('/api/control/tactical', { action }); alert(`Executado com sucesso!`); loadData(); } catch { alert("Falha na ação."); }
    };

    // Ações individuais no Modal
    const handleServiceAction = async (action) => {
        if(!selectedService) return;
        setActionLoading(true);
        try {
            await api.post('/api/control/service-action', { service: selectedService.name, action });
            // Pequeno delay para o systemctl atualizar o status real no linux
            setTimeout(() => { loadData(); setActionLoading(false); setSelectedService(null); }, 1500);
        } catch (e) {
            alert("Erro ao enviar comando ao serviço.");
            setActionLoading(false);
        }
    };

    const failed = services.filter(s => s.status !== 'active');

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <h2 className="text-4xl font-light text-on-surface">Módulo <span className="font-bold italic text-primary">Controle</span></h2>
            </div>

            {/* RADAR DE ANOMALIAS */}
            <div className={`p-8 rounded-[32px] border flex flex-col md:flex-row items-center gap-6 shadow-sm transition-colors ${failed.length > 0 ? 'bg-danger/10 border-danger/30' : 'bg-container border-outline/20'}`}>
                <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                    <div className={`absolute w-full h-full rounded-full animate-ping ${failed.length > 0 ? 'bg-danger/40' : 'bg-primary/20'}`}></div>
                    <div className={`bg-surface p-4 rounded-full shadow-lg relative z-10 ${failed.length > 0 ? 'text-danger' : 'text-primary'}`}>
                        {failed.length > 0 ? <Activity size={32} className="animate-pulse"/> : <ShieldAlert size={32} />}
                    </div>
                </div>
                <div className="text-center md:text-left flex-1">
                    <h3 className={`text-2xl font-black mb-1 ${failed.length > 0 ? 'text-danger' : 'text-on-surface'}`}>
                        {failed.length > 0 ? 'ALERTA: ANOMALIA DETECTADA NO CORE' : 'SISTEMA TOTALMENTE OPERACIONAL'}
                    </h3>
                    <p className="text-on-surface opacity-70 text-sm">
                        {failed.length > 0 ? `Os seguintes serviços falharam: ${failed.map(s=>s.label || s.name).join(', ')}. Clique neles abaixo para reiniciar.` : 'A IA Sentinela monitoriza os daemons vitais em tempo real. Tudo verde.'}
                    </p>
                </div>
            </div>

            {/* AÇÕES TÁTICAS GLOBAIS */}
            <div>
                <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2"><LayoutGrid className="text-primary"/> Comandos Rápidos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { id: 'fail2ban_unlock', label: 'Liberar Bloqueios', sub: 'Limpa logs Fail2Ban', icon: ShieldAlert, bg: 'bg-success/10', text: 'text-success', border: 'hover:border-success/50' },
                        { id: 'dhcp_restart', label: 'Reset DHCP', sub: 'Renova Leases IPs', icon: Router, bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'hover:border-blue-500/50' },
                        { id: 'db_restart', label: 'Recarregar Banco', sub: 'Destrava Postgre/SQL', icon: Database, bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'hover:border-orange-500/50' },
                        { id: 'clear_cache', label: 'Drop Cache RAM', sub: 'Limpa Memória Volátil', icon: Zap, bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'hover:border-purple-500/50' }
                    ].map(btn => (
                        <button key={btn.id} onClick={()=>runTactical(btn.id, btn.label)} className={`bg-container p-6 rounded-[28px] border border-outline/20 transition-all text-left flex flex-col items-start gap-4 shadow-sm hover:shadow-md ${btn.border} hover:bg-outline/5`}>
                            <div className={`p-4 rounded-2xl ${btn.bg} ${btn.text}`}><btn.icon size={28}/></div>
                            <div>
                                <h4 className="font-bold text-on-surface text-lg">{btn.label}</h4>
                                <p className="text-xs text-on-surface opacity-60 mt-1">{btn.sub}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* DAEMONS INTERATIVOS */}
            <div>
                <h3 className="text-xl font-bold text-on-surface mb-4 mt-8 flex items-center gap-2"><Server className="text-primary"/> Daemons do Sistema (Clique para gerir)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {services.map(svc => (
                        <button 
                            key={svc.name} 
                            onClick={() => setSelectedService(svc)}
                            className="bg-container p-5 rounded-[24px] border border-outline/20 flex flex-col items-center gap-3 text-center shadow-sm hover:border-primary/50 hover:bg-outline/5 transition-all focus:outline-none focus:ring-2 focus:ring-primary active:scale-95"
                        >
                            {svc.status === 'active' ? <CheckCircle size={28} className="text-success" /> : <Activity size={28} className="text-danger animate-pulse" />}
                            <span className="text-sm font-bold text-on-surface truncate w-full">{svc.label || svc.name}</span>
                            <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase ${svc.status === 'active' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{svc.status}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* MODAL MD3 DE CONTROLE DE SERVIÇO */}
            <AnimatePresence>
                {selectedService && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                            animate={{ opacity: 1, scale: 1, y: 0 }} 
                            exit={{ opacity: 0, scale: 0.95, y: 20 }} 
                            className="bg-surface border border-outline/20 p-8 rounded-[32px] w-full max-w-sm relative shadow-2xl"
                        >
                            <button onClick={() => !actionLoading && setSelectedService(null)} className="absolute top-6 right-6 text-on-surface opacity-50 hover:opacity-100 bg-container p-2 rounded-full"><X size={20}/></button>
                            
                            <div className="mb-8 mt-2">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${selectedService.status === 'active' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                                    <Server size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-on-surface mb-1 leading-tight">{selectedService.label || selectedService.name}</h3>
                                <p className="text-xs text-on-surface opacity-60 font-mono bg-container px-3 py-1 rounded-full w-fit mt-2 border border-outline/10">{selectedService.name}.service</p>
                            </div>

                            <div className="flex flex-col gap-3">
                                {selectedService.status !== 'active' && (
                                    <button onClick={() => handleServiceAction('start')} disabled={actionLoading} className="w-full py-4 bg-success/10 text-success border border-success/20 hover:bg-success hover:text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                        {actionLoading ? <Activity className="animate-spin" size={18}/> : <Play size={18}/>} Iniciar Serviço
                                    </button>
                                )}
                                
                                <button onClick={() => handleServiceAction('restart')} disabled={actionLoading} className="w-full py-4 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-on-primary font-bold rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                    {actionLoading ? <Activity className="animate-spin" size={18}/> : <RefreshCw size={18}/>} Reiniciar Serviço
                                </button>
                                
                                {selectedService.status === 'active' && (
                                    <button onClick={() => handleServiceAction('stop')} disabled={actionLoading} className="w-full py-4 bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
                                        {actionLoading ? <Activity className="animate-spin" size={18}/> : <Square size={18}/>} Parar Serviço
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
