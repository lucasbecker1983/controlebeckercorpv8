import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Router, Database, Server, Radio, Zap, CheckCircle, Activity, LayoutGrid, Play, Square, RefreshCw, ShieldCheck, Bug, ScanSearch, X, Archive, Trash2, ShieldBan, Eraser } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, DialogShell, ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';

const EMERGENCY_VLANS = [
    { vlan_id: 10, label: 'Secretaria' },
    { vlan_id: 30, label: 'Celulares' },
    { vlan_id: 50, label: 'SINE' },
    { vlan_id: 70, label: 'Visitantes' },
];

const formatDateTime = (value) => {
    if (!value) return 'Manual';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Manual';
    return date.toLocaleString('pt-BR');
};

export default function ControlPage() {
    const [services, setServices] = useState([]);
    const [clamav, setClamav] = useState(null);
    const [emergencyBypasses, setEmergencyBypasses] = useState([]);
    const [selectedService, setSelectedService] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [tacticalLoading, setTacticalLoading] = useState('');
    const [findingLoading, setFindingLoading] = useState('');
    const [servicesError, setServicesError] = useState('');
    const [clamavError, setClamavError] = useState('');
    const [emergencyError, setEmergencyError] = useState('');
    const [emergencyDialog, setEmergencyDialog] = useState({ open: false, mode: 'activate', vlan: null });
    const [emergencyForm, setEmergencyForm] = useState({ duration_minutes: '30', reason: '' });
    
    const loadData = async () => {
        const [servicesRes, clamavRes] = await Promise.allSettled([
            api.get('/api/control/services'),
            api.get('/api/control/clamav'),
        ]);
        const emergencyRes = await api.get('/api/bloqueios-liberacoes/emergency-vlan-bypass').catch((error) => error);

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

        if (emergencyRes?.data && Array.isArray(emergencyRes.data)) {
            setEmergencyBypasses(emergencyRes.data);
            setEmergencyError('');
        } else {
            setEmergencyBypasses([]);
            setEmergencyError('Falha ao carregar os bypasses emergenciais por VLAN.');
        }
    };
    useEffect(() => { loadData(); const i = setInterval(loadData, 5000); return () => clearInterval(i); }, []);

    const activeBypassByVlan = emergencyBypasses.reduce((acc, item) => {
        acc[String(item.vlan_id)] = item;
        return acc;
    }, {});

    const submitEmergencyBypass = async () => {
        const vlanId = Number(emergencyDialog.vlan?.vlan_id || 0);
        if (!vlanId) return;

        if (emergencyDialog.mode === 'activate' && !String(emergencyForm.reason || '').trim()) {
            alert('Informe o motivo institucional da liberação emergencial.');
            return;
        }

        setTacticalLoading(`emergency-vlan-${vlanId}-${emergencyDialog.mode}`);
        try {
            if (emergencyDialog.mode === 'activate') {
                await api.post('/api/bloqueios-liberacoes/emergency-vlan-bypass/activate', {
                    vlan_id: vlanId,
                    duration_minutes: emergencyForm.duration_minutes === 'manual' ? 'manual' : Number(emergencyForm.duration_minutes),
                    reason: emergencyForm.reason.trim(),
                });
            } else {
                await api.post(`/api/bloqueios-liberacoes/emergency-vlan-bypass/${vlanId}/deactivate`, {
                    reason: emergencyForm.reason.trim() || 'Retorno manual ao enforcement institucional',
                });
            }
            setEmergencyDialog({ open: false, mode: 'activate', vlan: null });
            setEmergencyForm({ duration_minutes: '30', reason: '' });
            loadData();
        } catch (error) {
            alert(error?.response?.data?.error || 'Falha ao processar bypass emergencial por VLAN.');
        } finally {
            setTacticalLoading('');
        }
    };

    // Ações táticas globais
    const runTactical = async (action, label) => {
        if(!confirm(`Executar comando tático: ${label}?`)) return;
        setTacticalLoading(action);
        try {
            const res = await api.post('/api/control/tactical', { action });
            if (action === 'clamav_scan') {
                if (res?.data?.queued) {
                    alert('Varredura institucional iniciada em segundo plano. Acompanhe o status nas últimas execuções do ClamAV.');
                    loadData();
                    return;
                }
                const infectedFiles = Number(res?.data?.infected_files || 0);
                alert(infectedFiles > 0
                    ? `Varredura concluída com ${infectedFiles} possível(is) achado(s). Verifique o histórico do ClamAV.`
                    : 'Varredura antimalware concluída sem achados.');
            } else if (action === 'clamav_update') {
                alert('Assinaturas do ClamAV atualizadas.');
            } else {
                alert('Executado com sucesso!');
            }
            loadData();
        } catch (error) {
            const message = error?.response?.data?.error || '';
            if (action === 'clamav_scan' && error?.response?.status === 409) {
                alert('Já existe uma varredura antimalware em execução. Aguarde a conclusão antes de iniciar outra.');
            } else {
                alert(message || 'Falha na ação.');
            }
        } finally {
            setTacticalLoading('');
        }
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

    const clearRuns = async () => {
        if (!confirm('Limpar todo o histórico de execuções do ClamAV? Achados vinculados também serão removidos.')) return;
        try {
            await api.delete('/api/control/clamav/runs');
            loadData();
        } catch (error) {
            alert(error?.response?.data?.error || 'Falha ao limpar histórico.');
        }
    };

    const decideFinding = async (finding, action) => {
        if (action === 'clean') {
            alert('Limpeza automática indisponível: o ClamAV não oferece desinfecção genérica confiável neste fluxo. Use quarentena ou exclusão.');
            return;
        }
        const label = action === 'quarantine' ? 'colocar em quarentena' : 'excluir definitivamente';
        if (!confirm(`Confirmar decisão: ${label}?\n\nArquivo: ${finding.file_path}`)) return;
        setFindingLoading(`${finding.id}:${action}`);
        try {
            await api.post(`/api/control/clamav/findings/${finding.id}/decision`, {
                action,
                decided_by: 'operador',
            });
            alert(action === 'quarantine' ? 'Arquivo enviado para quarentena.' : 'Arquivo excluído.');
            loadData();
        } catch (error) {
            alert('Falha ao executar a decisão sobre o achado.');
        } finally {
            setFindingLoading('');
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
                        <div className="text-[11px] font-semibold tracking-tight text-primary">Resposta emergencial</div>
                        <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Liberação emergencial por VLAN</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/66">
                            Use esta camada apenas quando uma rede inteira precisar de bypass temporário. A VLAN sai do enforcement categórico do Squid e do RPZ do Unbound, e a contingência DNS conflitante é retirada.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusChip label={`${emergencyBypasses.length} VLAN(s) em bypass`} tone={emergencyBypasses.length ? 'warning' : 'success'} />
                        <StatusChip label="Escopo técnico emergencial" tone="primary" />
                    </div>
                </div>

                {emergencyError ? (
                    <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                        {emergencyError}
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {EMERGENCY_VLANS.map((vlan) => {
                        const activeBypass = activeBypassByVlan[String(vlan.vlan_id)];
                        const actionKey = `emergency-vlan-${vlan.vlan_id}-${activeBypass ? 'deactivate' : 'activate'}`;
                        return (
                            <Surface key={vlan.vlan_id} stripe={false} className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-bold text-on-surface">VLAN {vlan.vlan_id}</div>
                                        <div className="mt-1 text-xs text-on-surface/62">{vlan.label}</div>
                                    </div>
                                    <StatusChip label={activeBypass ? 'Bypass ativo' : 'Protegida'} tone={activeBypass ? 'warning' : 'success'} />
                                </div>
                                <div className="mt-4 text-xs leading-6 text-on-surface/66">
                                    {activeBypass ? (
                                        <>
                                            Motivo: {activeBypass.reason}<br />
                                            Expira: {formatDateTime(activeBypass.expires_at)}
                                        </>
                                    ) : (
                                        'Enforcement institucional ativo: ACL categórica, RPZ e comportamento normal da camada de controle.'
                                    )}
                                </div>
                                <div className="mt-4">
                                    <ActionButton
                                        tone={activeBypass ? 'danger' : 'primary'}
                                        icon={activeBypass ? X : Zap}
                                        disabled={tacticalLoading === actionKey}
                                        onClick={() => {
                                            setEmergencyDialog({ open: true, mode: activeBypass ? 'deactivate' : 'activate', vlan });
                                            setEmergencyForm({
                                                duration_minutes: '30',
                                                reason: activeBypass ? '' : '',
                                            });
                                        }}
                                    >
                                        {tacticalLoading === actionKey
                                            ? 'Processando...'
                                            : activeBypass
                                                ? 'Encerrar bypass'
                                                : 'Ativar bypass'}
                                    </ActionButton>
                                </div>
                            </Surface>
                        );
                    })}
                </div>
            </Surface>

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
                        {clamav?.running_scan ? <StatusChip label="Varredura em execução" tone="warning" /> : null}
                        <ActionButton
                            tone="primary"
                            icon={ScanSearch}
                            disabled={tacticalLoading === 'clamav_scan' || Boolean(clamav?.running_scan)}
                            onClick={() => runTactical('clamav_scan', 'Verificar vírus e malwares')}
                        >
                            {tacticalLoading === 'clamav_scan'
                                ? 'Solicitando varredura...'
                                : clamav?.running_scan
                                    ? 'Varredura em execução'
                                    : 'Verificar vírus e malwares'}
                        </ActionButton>
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
                    <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="text-sm font-bold text-on-surface">Últimas execuções</div>
                        {(clamav?.recent_runs || []).length > 0 && (
                            <ActionButton tone="ghost" icon={Eraser} onClick={clearRuns}>
                                Limpar histórico
                            </ActionButton>
                        )}
                    </div>
                    <div className="mt-3 grid gap-3">
                        {(clamav?.recent_runs || []).length ? clamav.recent_runs.map((run) => (
                            <Surface key={run.id} stripe={false} className="p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-bold text-on-surface">{run.action === 'clamav_update' ? 'Atualização de assinaturas' : 'Varredura antimalware'}</div>
                                        <div className="mt-1 text-xs text-on-surface/62">{new Date(run.created_at).toLocaleString('pt-BR')}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusChip
                                            label={run.status === 'running' ? 'Em execução' : run.success ? 'Concluído' : 'Falha'}
                                            tone={run.status === 'running' ? 'warning' : run.success ? 'success' : 'danger'}
                                        />
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

                <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-bold text-on-surface">Achados e decisão operacional</div>
                            <div className="mt-1 text-xs text-on-surface/62">
                                Esta camada permite decisão real sobre cada arquivo detectado. Limpeza automática permanece indisponível por limitação técnica do engine.
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <StatusChip label={`${(clamav?.findings || []).filter((item) => item.decision_status === 'pending').length} pendentes`} tone="warning" />
                            <StatusChip label={`${(clamav?.findings || []).filter((item) => item.decision_status === 'quarantined').length} em quarentena`} tone="primary" />
                            <StatusChip label={`${(clamav?.findings || []).filter((item) => item.decision_status === 'deleted').length} excluídos`} tone="danger" />
                        </div>
                    </div>
                    <div className="mt-3 grid gap-3">
                        {(clamav?.findings || []).length ? clamav.findings.map((finding) => (
                            <Surface key={finding.id} stripe={false} className="p-4">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusChip
                                                label={finding.decision_status === 'pending'
                                                    ? 'Pendente'
                                                    : finding.decision_status === 'quarantined'
                                                        ? 'Em quarentena'
                                                        : finding.decision_status === 'deleted'
                                                            ? 'Excluído'
                                                            : finding.decision_status}
                                                tone={finding.decision_status === 'pending' ? 'warning' : finding.decision_status === 'deleted' ? 'danger' : 'primary'}
                                            />
                                            {finding.signature ? <StatusChip label={finding.signature} tone="danger" /> : null}
                                        </div>
                                        <div className="mt-3 break-all text-sm font-bold text-on-surface">{finding.file_path}</div>
                                        <div className="mt-2 text-xs text-on-surface/62">
                                            Detectado em {new Date(finding.created_at).toLocaleString('pt-BR')}
                                            {finding.quarantined_path ? ` • quarentena: ${finding.quarantined_path}` : ''}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {finding.decision_status === 'pending' ? (
                                            <>
                                                <ActionButton
                                                    tone="primary"
                                                    icon={Archive}
                                                    disabled={findingLoading === `${finding.id}:quarantine`}
                                                    onClick={() => decideFinding(finding, 'quarantine')}
                                                >
                                                    {findingLoading === `${finding.id}:quarantine` ? 'Quarentenando...' : 'Quarentena'}
                                                </ActionButton>
                                                <ActionButton
                                                    tone="danger"
                                                    icon={Trash2}
                                                    disabled={findingLoading === `${finding.id}:delete`}
                                                    onClick={() => decideFinding(finding, 'delete')}
                                                >
                                                    {findingLoading === `${finding.id}:delete` ? 'Excluindo...' : 'Excluir'}
                                                </ActionButton>
                                                <ActionButton
                                                    tone="ghost"
                                                    icon={ShieldBan}
                                                    onClick={() => decideFinding(finding, 'clean')}
                                                >
                                                    Limpar indisponível
                                                </ActionButton>
                                            </>
                                        ) : (
                                            <StatusChip label={`Decisão: ${finding.decided_action || 'registrada'}`} tone="success" />
                                        )}
                                    </div>
                                </div>
                            </Surface>
                        )) : (
                            <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                                Nenhum achado antimalware pendente de decisão foi registrado até o momento.
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
                {emergencyDialog.open && emergencyDialog.vlan && (
                    <DialogShell
                        open={Boolean(emergencyDialog.open)}
                        title={`${emergencyDialog.mode === 'activate' ? 'Ativar' : 'Encerrar'} bypass emergencial`}
                        subtitle={`VLAN ${emergencyDialog.vlan.vlan_id} • ${emergencyDialog.vlan.label}`}
                        onClose={() => !tacticalLoading && setEmergencyDialog({ open: false, mode: 'activate', vlan: null })}
                        size="max-w-lg"
                    >
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-outline/12 bg-surface-high/55 px-4 py-3 text-sm leading-6 text-on-surface/70">
                                {emergencyDialog.mode === 'activate'
                                    ? 'Esta ação libera temporariamente a VLAN inteira do enforcement categórico. O Unbound deixa de aplicar RPZ para essa rede e o Squid sai do fluxo categórico correspondente.'
                                    : 'Esta ação retira a VLAN do bypass emergencial e recompõe o enforcement institucional atual do módulo.'}
                            </div>

                            {emergencyDialog.mode === 'activate' ? (
                                <label className="block">
                                    <span className="mb-2 block text-sm font-bold text-on-surface">Duração</span>
                                    <select
                                        value={emergencyForm.duration_minutes}
                                        onChange={(event) => setEmergencyForm((current) => ({ ...current, duration_minutes: event.target.value }))}
                                        className="w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm text-on-surface"
                                    >
                                        <option value="15">15 minutos</option>
                                        <option value="30">30 minutos</option>
                                        <option value="60">60 minutos</option>
                                        <option value="120">120 minutos</option>
                                        <option value="manual">Manual</option>
                                    </select>
                                </label>
                            ) : null}

                            <label className="block">
                                <span className="mb-2 block text-sm font-bold text-on-surface">Motivo</span>
                                <textarea
                                    value={emergencyForm.reason}
                                    onChange={(event) => setEmergencyForm((current) => ({ ...current, reason: event.target.value }))}
                                    rows={4}
                                    placeholder={emergencyDialog.mode === 'activate'
                                        ? 'Descreva a indisponibilidade ou necessidade operacional.'
                                        : 'Registre o motivo do retorno ao enforcement institucional.'}
                                    className="w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm text-on-surface"
                                />
                            </label>

                            <div className="flex justify-end gap-3">
                                <ActionButton tone="ghost" onClick={() => setEmergencyDialog({ open: false, mode: 'activate', vlan: null })}>
                                    Cancelar
                                </ActionButton>
                                <ActionButton
                                    tone={emergencyDialog.mode === 'activate' ? 'danger' : 'primary'}
                                    icon={emergencyDialog.mode === 'activate' ? Zap : ShieldCheck}
                                    disabled={Boolean(tacticalLoading)}
                                    onClick={submitEmergencyBypass}
                                >
                                    {tacticalLoading
                                        ? 'Processando...'
                                        : emergencyDialog.mode === 'activate'
                                            ? 'Confirmar bypass'
                                            : 'Restaurar enforcement'}
                                </ActionButton>
                            </div>
                        </div>
                    </DialogShell>
                )}

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
