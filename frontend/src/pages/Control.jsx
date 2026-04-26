import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Router, Database, Server, Radio, Zap, CheckCircle, Activity, LayoutGrid, Play, Square, RefreshCw, ShieldCheck, Bug, ScanSearch, X } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, DialogShell, ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';

export default function ControlPage() {
    const [services, setServices] = useState([]);
    const [clamav, setClamav] = useState(null);
    const [selectedService, setSelectedService] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [servicesError, setServicesError] = useState('');
    const [clamavError, setClamavError] = useState('');
    
    const loadData = async () => {
        const [servicesRes, clamavRes] = await Promise.allSettled([
            api.get('/api/control/services'),
            api.get('/api/control/clamav'),
        ]);

        if (servicesRes.status === 'fulfilled') {
            setServices(Array.isArray(servicesRes.value.data) ? servicesRes.value.data : []);
            setServicesError('');
        } else {
            setServices([]);
            setServicesError('Falha ao carregar os daemons do sistema.');
        }

        if (clamavRes.status === 'fulfilled') {
            setClamav(clamavRes.value.data || null);
            setClamavError('');
        } else {
            setClamav(null);
            setClamavError('Falha ao carregar a telemetria do ClamAV.');
        }
    };
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
            <ModuleHeader
                eyebrow="Controle"
                title="Operações Técnicas"
                description="Ações rápidas, estado de serviços e resposta operacional do ambiente, com foco em continuidade e intervenção segura."
                badges={(
                    <>
                        <StatusChip label={`${services.length} serviços monitorados`} tone="primary" />
                        <StatusChip label={failed.length ? `${failed.length} com atenção` : 'Todos operacionais'} tone={failed.length ? 'warning' : 'success'} />
                    </>
                )}
            />

            <Surface className={`p-8 flex flex-col md:flex-row items-center gap-6 transition-colors ${failed.length > 0 ? 'border-danger/30 bg-danger/10' : ''}`}>
                <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                    <div className={`absolute w-full h-full rounded-full animate-ping ${failed.length > 0 ? 'bg-danger/40' : 'bg-primary/20'}`}></div>
                    <div className={`bg-surface p-4 rounded-full shadow-lg relative z-10 ${failed.length > 0 ? 'text-danger' : 'text-primary'}`}>
                        {failed.length > 0 ? <Activity size={32} className="animate-pulse"/> : <ShieldAlert size={32} />}
                    </div>
                </div>
                <div className="text-center md:text-left flex-1">
                    <h3 className={`text-2xl font-black mb-1 ${failed.length > 0 ? 'text-danger' : 'text-on-surface'}`}>
                        {failed.length > 0 ? 'Serviços exigem atenção operacional' : 'Serviços operacionais'}
                    </h3>
                    <p className="text-on-surface opacity-70 text-sm">
                        {failed.length > 0 ? `Os seguintes serviços falharam: ${failed.map(s=>s.label || s.name).join(', ')}. Clique neles abaixo para intervir.` : 'Os daemons vitais permanecem estáveis neste momento.'}
                    </p>
                </div>
            </Surface>

            {/* AÇÕES TÁTICAS GLOBAIS */}
            <div>
                <h3 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2"><LayoutGrid className="text-primary"/> Comandos Rápidos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                        { id: 'fail2ban_unlock', label: 'Liberar Bloqueios', sub: 'Limpa logs Fail2Ban', icon: ShieldAlert, bg: 'bg-info/10', text: 'text-info', border: 'hover:border-info/50' },
                        { id: 'dhcp_restart', label: 'Reset DHCP', sub: 'Renova Leases IPs', icon: Router, bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'hover:border-blue-500/50' },
                        { id: 'db_restart', label: 'Recarregar Banco', sub: 'Destrava Postgre/SQL', icon: Database, bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'hover:border-orange-500/50' },
                        { id: 'clear_cache', label: 'Drop Cache RAM', sub: 'Limpa Memória Volátil', icon: Zap, bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'hover:border-purple-500/50' }
                    ].map(btn => (
                        <Surface key={btn.id} className={`p-6 transition-all text-left flex flex-col items-start gap-4 ${btn.border} hover:bg-outline/5`}>
                            <div className={`p-4 rounded-2xl ${btn.bg} ${btn.text}`}><btn.icon size={28}/></div>
                            <div>
                                <h4 className="font-bold text-on-surface text-lg">{btn.label}</h4>
                                <p className="text-xs text-on-surface opacity-60 mt-1">{btn.sub}</p>
                            </div>
                            <ActionButton tone="ghost" onClick={()=>runTactical(btn.id, btn.label)}>Executar</ActionButton>
                        </Surface>
                    ))}
                    {[
                        { id: 'clamav_update', label: 'Atualizar ClamAV', sub: 'Sincroniza assinaturas antimalware', icon: ShieldCheck, bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'hover:border-blue-500/50' },
                        { id: 'clamav_scan', label: 'Varredura Antimalware', sub: 'Inspeciona superfícies críticas do gateway', icon: ScanSearch, bg: 'bg-orange-500/10', text: 'text-orange-600', border: 'hover:border-orange-500/50' },
                    ].map(btn => (
                        <Surface key={btn.id} className={`p-6 transition-all text-left flex flex-col items-start gap-4 ${btn.border} hover:bg-outline/5`}>
                            <div className={`p-4 rounded-2xl ${btn.bg} ${btn.text}`}><btn.icon size={28}/></div>
                            <div>
                                <h4 className="font-bold text-on-surface text-lg">{btn.label}</h4>
                                <p className="text-xs text-on-surface opacity-60 mt-1">{btn.sub}</p>
                            </div>
                            <ActionButton tone="ghost" onClick={()=>runTactical(btn.id, btn.label)}>Executar</ActionButton>
                        </Surface>
                    ))}
                </div>
            </div>

            <Surface className="p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-semibold tracking-tight text-primary">Proteção antimalware</div>
                        <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">ClamAV institucional</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/66">
                            O motor antimalware protege a borda do SGCG, monitora os serviços vinculados ao gateway e executa verificações nas superfícies críticas que sustentam as VLANs operacionais.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusChip label={`Daemon ${clamav?.services?.daemon || '—'}`} tone={clamav?.services?.daemon === 'active' ? 'success' : 'warning'} />
                        <StatusChip label={`Assinaturas ${clamav?.services?.freshclam || '—'}`} tone={clamav?.services?.freshclam === 'active' ? 'success' : 'warning'} />
                        <StatusChip label={`On-access ${clamav?.services?.clamonacc || '—'}`} tone={clamav?.services?.clamonacc === 'active' ? 'success' : 'warning'} />
                    </div>
                </div>

                {clamavError ? (
                    <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                        {clamavError}
                    </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(clamav?.coverage || []).map((item) => (
                            <Surface key={item.subnet} stripe={false} className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-info/18 bg-info/10 text-info">
                                        <Bug size={18} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-on-surface">{item.label}</div>
                                        <div className="text-xs text-on-surface/62">{item.subnet}</div>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-on-surface/66">{item.scope}</p>
                            </Surface>
                        ))}
                    </div>

                    <Surface stripe={false} className="p-4">
                        <div className="text-sm font-bold text-on-surface">Superfícies verificadas</div>
                        <div className="mt-3 space-y-2">
                            {(clamav?.scan_paths || []).map((path) => (
                                <div key={path} className="rounded-2xl border border-outline/12 bg-surface-high/64 px-3 py-2 text-xs font-medium text-on-surface/72">
                                    {path}
                                </div>
                            ))}
                        </div>
                    </Surface>
                </div>

                <div>
                    <div className="text-sm font-bold text-on-surface">Últimas execuções</div>
                    <div className="mt-3 grid gap-3">
                        {(clamav?.recent_runs || []).length ? clamav.recent_runs.map((run) => (
                            <Surface key={run.id} stripe={false} className="p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-bold text-on-surface">{run.action === 'clamav_update' ? 'Atualização de assinaturas' : 'Varredura antimalware'}</div>
                                        <div className="mt-1 text-xs text-on-surface/62">{new Date(run.created_at).toLocaleString('pt-BR')}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusChip label={run.success ? 'Concluído' : 'Falha'} tone={run.success ? 'success' : 'danger'} />
                                        <StatusChip label={`${run.infected_files || 0} achados`} tone={Number(run.infected_files || 0) > 0 ? 'warning' : 'primary'} />
                                    </div>
                                </div>
                            </Surface>
                        )) : (
                            <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                                Ainda não há execução registrada do ClamAV nesta camada institucional.
                            </div>
                        )}
                    </div>
                </div>
            </Surface>

            {/* DAEMONS INTERATIVOS */}
            <div>
                <h3 className="text-xl font-bold text-on-surface mb-4 mt-8 flex items-center gap-2"><Server className="text-primary"/> Daemons do Sistema (Clique para gerir)</h3>
                {servicesError ? (
                    <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                        {servicesError}
                    </div>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {services.map(svc => (
                        <Surface 
                            key={svc.name} 
                            className="p-5 flex flex-col items-center gap-3 text-center hover:border-primary/50 hover:bg-outline/5 transition-all cursor-pointer"
                            
                        >
                            <button
                              onClick={() => setSelectedService(svc)}
                              className="w-full flex flex-col items-center gap-3 text-center focus:outline-none"
                            >
                            {svc.status === 'active' ? <CheckCircle size={28} className="text-info" /> : <Activity size={28} className="text-danger animate-pulse" />}
                            <span className="text-sm font-bold text-on-surface truncate w-full">{svc.label || svc.name}</span>
                            <span className={`text-[10px] px-3 py-1 rounded-full font-bold uppercase ${svc.status === 'active' ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'}`}>{svc.status}</span>
                            </button>
                        </Surface>
                    ))}
                </div>
                {!services.length && !servicesError ? (
                    <div className="mt-4 rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                        Nenhum daemon foi retornado pelo backend nesta leitura.
                    </div>
                ) : null}
            </div>

            <AnimatePresence>
                {selectedService && (
                    <DialogShell
                        open={Boolean(selectedService)}
                        title={selectedService.label || selectedService.name}
                        subtitle="Ações operacionais diretas sobre o serviço selecionado."
                        onClose={() => !actionLoading && setSelectedService(null)}
                        size="max-w-sm"
                    >
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }} 
                            animate={{ opacity: 1, scale: 1, y: 0 }} 
                            exit={{ opacity: 0, scale: 0.95, y: 20 }} 
                            className="w-full"
                        >
                            <div className="mb-8 mt-2">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${selectedService.status === 'active' ? 'bg-info/20 text-info' : 'bg-danger/20 text-danger'}`}>
                                    <Server size={32} />
                                </div>
                                <h3 className="text-2xl font-bold text-on-surface mb-1 leading-tight">{selectedService.label || selectedService.name}</h3>
                                <p className="text-xs text-on-surface opacity-60 font-mono bg-container px-3 py-1 rounded-full w-fit mt-2 border border-outline/10">{selectedService.name}.service</p>
                            </div>

                            <div className="flex flex-col gap-3">
                                {selectedService.status !== 'active' && (
                                    <button onClick={() => handleServiceAction('start')} disabled={actionLoading} className="w-full py-4 bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
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
                    </DialogShell>
                )}
            </AnimatePresence>
        </div>
    );
}
