import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Router, Database, Server, Radio, Zap, CheckCircle, Activity, LayoutGrid, Play, Square, RefreshCw, ShieldCheck, Bug, ScanSearch, X, Archive, Trash2, ShieldBan, Eraser, WifiOff, LockKeyhole, Wrench, BrainCircuit, AlertTriangle, ClipboardCheck, SearchCheck, BookOpenCheck, Send, FileSearch } from 'lucide-react';
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
    const [totalVlanBlocks, setTotalVlanBlocks] = useState([]);
    const [selectedService, setSelectedService] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [tacticalLoading, setTacticalLoading] = useState('');
    const [findingLoading, setFindingLoading] = useState('');
    const [servicesError, setServicesError] = useState('');
    const [clamavError, setClamavError] = useState('');
    const [emergencyError, setEmergencyError] = useState('');
    const [totalBlockError, setTotalBlockError] = useState('');
    const [aiInsights, setAiInsights] = useState(null);
    const [aiInsightsError, setAiInsightsError] = useState('');
    const [selectedInsight, setSelectedInsight] = useState(null);
    const [aiReanalysisLoading, setAiReanalysisLoading] = useState(false);
    const [aiReanalysisError, setAiReanalysisError] = useState('');
    const [ragStatus, setRagStatus] = useState(null);
    const [ragQuestion, setRagQuestion] = useState('Como está a observabilidade do SGCG?');
    const [ragAnswer, setRagAnswer] = useState(null);
    const [ragLoading, setRagLoading] = useState(false);
    const [ragError, setRagError] = useState('');
    const [emergencyDialog, setEmergencyDialog] = useState({ open: false, mode: 'activate', vlan: null });
    const [emergencyForm, setEmergencyForm] = useState({ duration_minutes: '30', reason: '' });
    const [totalBlockDialog, setTotalBlockDialog] = useState({ open: false, mode: 'activate', vlan: null });
    const [totalBlockForm, setTotalBlockForm] = useState({ reason: '' });
    
    const loadData = async () => {
        const [servicesRes, clamavRes, aiInsightsRes, ragStatusRes] = await Promise.allSettled([
            api.get('/api/control/services'),
            api.get('/api/control/clamav'),
            api.get('/api/control/ai-insights'),
            api.get('/api/control/ai-rag/status'),
        ]);
        const emergencyRes = await api.get('/api/bloqueios-liberacoes/emergency-vlan-bypass').catch((error) => error);
        const totalBlockRes = await api.get('/api/bloqueios-liberacoes/total-vlan-blocks').catch((error) => error);

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

        if (aiInsightsRes.status === 'fulfilled') {
            setAiInsights(aiInsightsRes.value.data || null);
            setAiInsightsError('');
        } else {
            setAiInsights(null);
            setAiInsightsError('Falha ao gerar os insights de IA operacional.');
        }

        if (ragStatusRes.status === 'fulfilled') {
            setRagStatus(ragStatusRes.value.data || null);
            setRagError('');
        } else {
            setRagStatus(null);
            setRagError('Falha ao carregar o estado do RAG operacional.');
        }

        if (emergencyRes?.data && Array.isArray(emergencyRes.data)) {
            setEmergencyBypasses(emergencyRes.data);
            setEmergencyError('');
        } else {
            setEmergencyBypasses([]);
            setEmergencyError('Falha ao carregar os bypasses emergenciais por VLAN.');
        }

        if (totalBlockRes?.data && Array.isArray(totalBlockRes.data)) {
            setTotalVlanBlocks(totalBlockRes.data);
            setTotalBlockError('');
        } else {
            setTotalVlanBlocks([]);
            setTotalBlockError('Falha ao carregar os Bloqueios Totais por VLAN.');
        }
    };
    useEffect(() => { loadData(); const i = setInterval(loadData, 5000); return () => clearInterval(i); }, []);

    const activeBypassByVlan = emergencyBypasses.reduce((acc, item) => {
        acc[String(item.vlan_id)] = item;
        return acc;
    }, {});

    const activeTotalBlockByVlan = totalVlanBlocks.reduce((acc, item) => {
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

    const submitTotalVlanBlock = async () => {
        const vlanId = Number(totalBlockDialog.vlan?.vlan_id || 0);
        if (!vlanId) return;

        if (totalBlockDialog.mode === 'activate' && !String(totalBlockForm.reason || '').trim()) {
            alert('Informe o motivo institucional do Bloqueio Total.');
            return;
        }

        setTacticalLoading(`total-vlan-${vlanId}-${totalBlockDialog.mode}`);
        try {
            if (totalBlockDialog.mode === 'activate') {
                await api.post('/api/bloqueios-liberacoes/total-vlan-blocks/activate', {
                    vlan_id: vlanId,
                    reason: totalBlockForm.reason.trim(),
                });
            } else {
                await api.post(`/api/bloqueios-liberacoes/total-vlan-blocks/${vlanId}/deactivate`, {
                    reason: totalBlockForm.reason.trim() || 'Retorno manual da VLAN ao enforcement institucional',
                });
            }
            setTotalBlockDialog({ open: false, mode: 'activate', vlan: null });
            setTotalBlockForm({ reason: '' });
            loadData();
        } catch (error) {
            alert(error?.response?.data?.error || 'Falha ao processar Bloqueio Total por VLAN.');
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
    const insightTone = (severity) => {
        if (severity === 'critical') return 'danger';
        if (severity === 'warning') return 'warning';
        if (severity === 'success') return 'success';
        return 'primary';
    };
    const insightIcon = (severity) => {
        if (severity === 'critical' || severity === 'warning') return AlertTriangle;
        if (severity === 'success') return ClipboardCheck;
        return SearchCheck;
    };
    const handleInsightAction = (insight) => {
        setSelectedInsight(insight);
        setAiReanalysisError('');
        const targetByInsight = {
            'daemon-health': 'control-daemons',
            'exception-state': 'control-vlan-exceptions',
            'malware-pending': 'control-clamav',
        };
        const targetId = targetByInsight[insight?.id];
        if (targetId) {
            window.setTimeout(() => {
                document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        }
    };
    const reanalyzeSelectedInsight = async () => {
        if (!selectedInsight) return;
        setAiReanalysisLoading(true);
        setAiReanalysisError('');
        try {
            const response = await api.get('/api/control/ai-insights');
            const nextPayload = response.data || null;
            const nextInsights = Array.isArray(nextPayload?.insights) ? nextPayload.insights : [];
            const nextSelected = nextInsights.find((item) => item.id === selectedInsight.id) || nextInsights[0] || selectedInsight;
            setAiInsights(nextPayload);
            setSelectedInsight(nextSelected);
            setAiInsightsError('');
        } catch (error) {
            setAiReanalysisError(error?.response?.data?.error || 'Falha ao reanalisar os sinais agora.');
        } finally {
            setAiReanalysisLoading(false);
        }
    };
    const askRag = async () => {
        const question = String(ragQuestion || '').trim();
        if (question.length < 3) {
            setRagError('Digite uma pergunta operacional para consultar o RAG.');
            return;
        }
        setRagLoading(true);
        setRagError('');
        try {
            const response = await api.post('/api/control/ai-rag/ask', { question });
            setRagAnswer(response.data || null);
        } catch (error) {
            setRagAnswer(null);
            setRagError(error?.response?.data?.error || 'Falha ao consultar o RAG operacional.');
        } finally {
            setRagLoading(false);
        }
    };
    const reindexRag = async () => {
        setRagLoading(true);
        setRagError('');
        try {
            const response = await api.post('/api/control/ai-rag/reindex');
            setRagStatus(response.data || null);
        } catch (error) {
            setRagError(error?.response?.data?.error || 'Falha ao reindexar a base RAG.');
        } finally {
            setRagLoading(false);
        }
    };

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

            <Surface id="control-ai-insights" className="p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-tight text-primary">
                            <BrainCircuit size={15} />
                            IA em Operações Técnicas
                        </div>
                        <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Insights operacionais acionáveis</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/66">
                            Leitura somente consulta dos sinais do gateway, cruzando daemons, NAT, bloqueios, exceções de VLAN, Hotspot e ClamAV para orientar investigação sem aplicar mudanças automaticamente.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusChip label={aiInsights?.mode === 'read-only' ? 'Somente leitura' : 'Sem automação'} tone="primary" />
                        <StatusChip label={`${aiInsights?.summary?.critical || 0} crítico(s)`} tone={(aiInsights?.summary?.critical || 0) ? 'danger' : 'success'} />
                        <StatusChip label={`${aiInsights?.summary?.warning || 0} atenção`} tone={(aiInsights?.summary?.warning || 0) ? 'warning' : 'success'} />
                        <ActionButton tone="ghost" icon={RefreshCw} onClick={loadData}>Atualizar</ActionButton>
                    </div>
                </div>

                {aiInsightsError ? (
                    <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                        {aiInsightsError}
                    </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-4">
                    <div className="rounded-[20px] border border-outline/12 bg-surface-high/60 p-4">
                        <div className="text-[11px] font-semibold text-on-surface/58">NAT runtime</div>
                        <div className="mt-2 text-2xl font-black text-on-surface">{aiInsights?.summary?.nat_rules ?? '—'}</div>
                        <div className="mt-1 text-xs text-on-surface/62">{aiInsights?.summary?.nat_duplicates ?? '—'} duplicidade(s)</div>
                    </div>
                    <div className="rounded-[20px] border border-outline/12 bg-surface-high/60 p-4">
                        <div className="text-[11px] font-semibold text-on-surface/58">Bloqueios 24h</div>
                        <div className="mt-2 text-2xl font-black text-on-surface">{aiInsights?.summary?.blocked_24h ?? '—'}</div>
                        <div className="mt-1 text-xs text-on-surface/62">{aiInsights?.summary?.blocked_5m ?? '—'} nos últimos 5 min</div>
                    </div>
                    <div className="rounded-[20px] border border-outline/12 bg-surface-high/60 p-4">
                        <div className="text-[11px] font-semibold text-on-surface/58">Serviços lidos</div>
                        <div className="mt-2 text-2xl font-black text-on-surface">{aiInsights?.summary?.services_checked ?? services.length}</div>
                        <div className="mt-1 text-xs text-on-surface/62">systemd + telemetria local</div>
                    </div>
                    <div className="rounded-[20px] border border-outline/12 bg-surface-high/60 p-4">
                        <div className="text-[11px] font-semibold text-on-surface/58">Última análise</div>
                        <div className="mt-2 text-sm font-black text-on-surface">{aiInsights?.generated_at ? new Date(aiInsights.generated_at).toLocaleString('pt-BR') : 'Aguardando'}</div>
                        <div className="mt-1 text-xs text-on-surface/62">{aiInsights?.model || 'SGCG IA operacional'}</div>
                    </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                    {(aiInsights?.insights || []).map((insight) => {
                        const Icon = insightIcon(insight.severity);
                        return (
                            <div key={insight.id} className="rounded-[22px] border border-outline/12 bg-surface-high/58 p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${insight.severity === 'critical' ? 'border-danger/20 bg-danger/10 text-danger' : insight.severity === 'warning' ? 'border-orange-500/20 bg-orange-500/12 text-orange-700 dark:text-orange-300' : insight.severity === 'success' ? 'border-info/18 bg-info/10 text-info' : 'border-primary/16 bg-primary/12 text-primary'}`}>
                                            <Icon size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-base font-black leading-tight text-on-surface">{insight.title}</h4>
                                            <p className="mt-2 text-sm leading-6 text-on-surface/66">{insight.probable_cause}</p>
                                        </div>
                                    </div>
                                    <StatusChip label={insight.severity} tone={insightTone(insight.severity)} />
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div>
                                        <div className="text-[11px] font-bold uppercase text-on-surface/50">Impacto</div>
                                        <p className="mt-1 text-sm leading-6 text-on-surface/70">{insight.impact}</p>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-bold uppercase text-on-surface/50">Ação recomendada</div>
                                        <p className="mt-1 text-sm leading-6 text-on-surface/70">{insight.recommendation}</p>
                                    </div>
                                </div>

                                <div className="mt-4 space-y-2">
                                    {(insight.evidence || []).slice(0, 4).map((item, index) => (
                                        <div key={`${insight.id}-${index}`} className="rounded-2xl border border-outline/10 bg-surface/70 px-3 py-2 text-xs font-medium leading-5 text-on-surface/68">
                                            {item}
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <ActionButton tone="ghost" icon={SearchCheck} onClick={() => handleInsightAction(insight)}>
                                        {insight.action}
                                    </ActionButton>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Surface>

            <Surface id="control-rag" className="p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-tight text-primary">
                            <BookOpenCheck size={15} />
                            RAG operacional
                        </div>
                        <h3 className="mt-2 text-xl font-black tracking-tight text-on-surface">Base de conhecimento com fontes</h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/66">
                            Consulta local sobre documentação, continuidade, configuração Prometheus/Grafana e sinais atuais do gateway. A resposta vem com fontes para auditoria.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusChip label={`${ragStatus?.chunks ?? '—'} trechos`} tone="primary" />
                        <StatusChip label={`${ragStatus?.sources ?? '—'} fontes`} tone="primary" />
                        <StatusChip label={`Prometheus ${ragStatus?.runtime?.prometheus_ready ? 'pronto' : 'verificar'}`} tone={ragStatus?.runtime?.prometheus_ready ? 'success' : 'warning'} />
                        <ActionButton tone="ghost" icon={RefreshCw} disabled={ragLoading} onClick={reindexRag}>
                            {ragLoading ? 'Atualizando...' : 'Reindexar'}
                        </ActionButton>
                    </div>
                </div>

                {ragError ? (
                    <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                        {ragError}
                    </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <textarea
                        value={ragQuestion}
                        onChange={(event) => setRagQuestion(event.target.value)}
                        rows={3}
                        placeholder="Pergunte sobre VLAN, Prometheus, Grafana, Hotspot, bloqueios, DNS, QoS ou algum sintoma operacional."
                        className="min-h-[92px] w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm leading-6 text-on-surface focus:border-primary/45 focus:outline-none"
                    />
                    <div className="flex items-end">
                        <ActionButton tone="primary" icon={Send} disabled={ragLoading} onClick={askRag}>
                            {ragLoading ? 'Consultando...' : 'Perguntar'}
                        </ActionButton>
                    </div>
                </div>

                {ragAnswer ? (
                    <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
                        <Surface stripe={false} className="p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusChip label={ragAnswer.mode || 'RAG local'} tone="primary" />
                                <StatusChip label={ragAnswer.external_ai_used ? `IA externa: ${ragAnswer.model || 'Gemini'}` : 'IA externa: fallback local'} tone={ragAnswer.external_ai_used ? 'success' : 'warning'} />
                                <StatusChip label={`Confiança ${ragAnswer.confidence || '—'}`} tone={ragAnswer.confidence === 'high' ? 'success' : ragAnswer.confidence === 'low' ? 'warning' : 'primary'} />
                                <StatusChip label={`${ragAnswer.runtime?.prometheus_targets_up ?? 0} alvos Prometheus up`} tone="success" />
                            </div>
                            {ragAnswer.external_ai_error ? (
                                <div className="mt-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                                    Gemini indisponível nesta consulta: {ragAnswer.external_ai_error}. A resposta abaixo veio do RAG local.
                                </div>
                            ) : null}
                            <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-on-surface/74">
                                {ragAnswer.answer}
                            </div>
                        </Surface>

                        <Surface stripe={false} className="p-4">
                            <div className="flex items-center gap-2 text-sm font-black text-on-surface">
                                <FileSearch size={18} className="text-primary" />
                                Fontes recuperadas
                            </div>
                            <div className="mt-3 space-y-3">
                                {(ragAnswer.sources || []).map((source, index) => (
                                    <div key={`${source.source}-${index}`} className="rounded-2xl border border-outline/12 bg-surface-high/60 p-3">
                                        <div className="text-xs font-black text-on-surface">{source.title || 'Fonte operacional'}</div>
                                        <div className="mt-1 break-all text-[11px] font-semibold text-primary">
                                            {source.source}:{source.line_start}-{source.line_end}
                                        </div>
                                        <p className="mt-2 line-clamp-4 text-xs leading-5 text-on-surface/64">{source.excerpt}</p>
                                    </div>
                                ))}
                            </div>
                        </Surface>
                    </div>
                ) : null}
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

            <Surface id="control-vlan-exceptions" className="p-6 space-y-5">
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

            <Surface className="p-6 space-y-5 border-danger/22 bg-danger/8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-semibold tracking-tight text-danger">Contenção máxima</div>
                        <h3 className="mt-2 flex items-center gap-2 text-xl font-black tracking-tight text-on-surface">
                            <WifiOff size={22} className="text-danger" />
                            Bloqueio Total por VLAN
                        </h3>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface/66">
                            Interrompe a navegação da VLAN inteira e apresenta uma página institucional de manutenção para conexões HTTP. Use somente para indisponibilidade, contenção de incidente ou janela técnica autorizada.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusChip label={`${totalVlanBlocks.length} VLAN(s) bloqueada(s)`} tone={totalVlanBlocks.length ? 'danger' : 'success'} />
                        <StatusChip label="VLANs 10, 30, 50 e 70" tone="primary" />
                    </div>
                </div>

                {totalBlockError ? (
                    <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                        {totalBlockError}
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {EMERGENCY_VLANS.map((vlan) => {
                        const activeBlock = activeTotalBlockByVlan[String(vlan.vlan_id)];
                        const actionKey = `total-vlan-${vlan.vlan_id}-${activeBlock ? 'deactivate' : 'activate'}`;
                        return (
                            <Surface key={vlan.vlan_id} stripe={false} className={`p-4 ${activeBlock ? 'border-danger/30 bg-danger/10' : ''}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-bold text-on-surface">VLAN {vlan.vlan_id}</div>
                                        <div className="mt-1 text-xs text-on-surface/62">{vlan.label}</div>
                                    </div>
                                    <StatusChip label={activeBlock ? 'Bloqueio Total' : 'Disponível'} tone={activeBlock ? 'danger' : 'success'} />
                                </div>
                                <div className="mt-4 text-xs leading-6 text-on-surface/66">
                                    {activeBlock ? (
                                        <>
                                            Motivo: {activeBlock.reason}<br />
                                            Desde: {formatDateTime(activeBlock.activated_at)}
                                        </>
                                    ) : (
                                        'Ao ativar, a VLAN entra em modo manutenção e deixa de navegar até a restauração manual.'
                                    )}
                                </div>
                                <div className="mt-4">
                                    <ActionButton
                                        tone={activeBlock ? 'primary' : 'danger'}
                                        icon={activeBlock ? ShieldCheck : LockKeyhole}
                                        disabled={tacticalLoading === actionKey}
                                        onClick={() => {
                                            setTotalBlockDialog({ open: true, mode: activeBlock ? 'deactivate' : 'activate', vlan });
                                            setTotalBlockForm({ reason: '' });
                                        }}
                                    >
                                        {tacticalLoading === actionKey
                                            ? 'Processando...'
                                            : activeBlock
                                                ? 'Restaurar VLAN'
                                                : 'Bloquear VLAN'}
                                    </ActionButton>
                                </div>
                            </Surface>
                        );
                    })}
                </div>
            </Surface>

            <Surface id="control-clamav" className="p-6 space-y-5">
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
            <div id="control-daemons">
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
                {selectedInsight && (
                    <DialogShell
                        open={Boolean(selectedInsight)}
                        title={selectedInsight.id === 'steady-state' ? 'Observação técnica ativa' : selectedInsight.action}
                        subtitle={selectedInsight.title}
                        onClose={() => setSelectedInsight(null)}
                        size="max-w-3xl"
                    >
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusChip label={selectedInsight.severity} tone={insightTone(selectedInsight.severity)} />
                                <StatusChip label={aiInsights?.mode === 'read-only' ? 'Somente leitura' : 'Diagnóstico'} tone="primary" />
                                <StatusChip label={aiInsights?.generated_at ? new Date(aiInsights.generated_at).toLocaleString('pt-BR') : 'Sem horário'} tone="neutral" />
                                {aiReanalysisLoading ? <StatusChip label="Reanalisando..." tone="warning" /> : null}
                            </div>

                            {aiReanalysisError ? (
                                <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                                    {aiReanalysisError}
                                </div>
                            ) : null}

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-[20px] border border-outline/12 bg-surface-high/60 p-4">
                                    <div className="text-[11px] font-bold uppercase text-on-surface/50">Causa provável</div>
                                    <p className="mt-2 text-sm leading-6 text-on-surface/72">{selectedInsight.probable_cause}</p>
                                </div>
                                <div className="rounded-[20px] border border-outline/12 bg-surface-high/60 p-4">
                                    <div className="text-[11px] font-bold uppercase text-on-surface/50">Impacto</div>
                                    <p className="mt-2 text-sm leading-6 text-on-surface/72">{selectedInsight.impact}</p>
                                </div>
                            </div>

                            <div>
                                <div className="text-sm font-black text-on-surface">Evidências lidas agora</div>
                                <div className="mt-3 space-y-2">
                                    {(selectedInsight.evidence || []).map((item, index) => (
                                        <div key={`selected-${selectedInsight.id}-${index}`} className="rounded-2xl border border-outline/10 bg-surface/70 px-3 py-2 text-sm font-medium leading-6 text-on-surface/72">
                                            {item}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[20px] border border-primary/14 bg-primary/8 p-4">
                                <div className="text-sm font-black text-on-surface">Próximo passo operacional</div>
                                <p className="mt-2 text-sm leading-6 text-on-surface/72">{selectedInsight.recommendation}</p>
                            </div>

                            {selectedInsight.id === 'steady-state' ? (
                                <div className="rounded-[20px] border border-info/18 bg-info/10 p-4">
                                    <div className="text-sm font-black text-on-surface">Para que serve esta observação</div>
                                    <p className="mt-2 text-sm leading-6 text-on-surface/72">
                                        Ela deixa registrado que a IA conferiu os sinais básicos e não achou anomalia crítica naquele instante. Não libera mudança, não reinicia serviço e não substitui validação em caso de reclamação de usuário; serve como ponto de controle para continuar monitorando sem inventar incidente.
                                    </p>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap justify-end gap-3">
                                <ActionButton
                                    tone="ghost"
                                    icon={RefreshCw}
                                    disabled={aiReanalysisLoading}
                                    onClick={reanalyzeSelectedInsight}
                                >
                                    {aiReanalysisLoading ? 'Reanalisando...' : 'Reanalisar sinais'}
                                </ActionButton>
                                <ActionButton tone="primary" icon={ClipboardCheck} onClick={() => setSelectedInsight(null)}>
                                    Entendido
                                </ActionButton>
                            </div>
                        </div>
                    </DialogShell>
                )}

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

                {totalBlockDialog.open && totalBlockDialog.vlan && (
                    <DialogShell
                        open={Boolean(totalBlockDialog.open)}
                        title={`${totalBlockDialog.mode === 'activate' ? 'Ativar' : 'Encerrar'} Bloqueio Total`}
                        subtitle={`VLAN ${totalBlockDialog.vlan.vlan_id} • ${totalBlockDialog.vlan.label}`}
                        onClose={() => !tacticalLoading && setTotalBlockDialog({ open: false, mode: 'activate', vlan: null })}
                        size="max-w-lg"
                    >
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-danger/18 bg-danger/10 px-4 py-3 text-sm leading-6 text-on-surface/70">
                                {totalBlockDialog.mode === 'activate'
                                    ? 'Esta ação bloqueia a navegação da VLAN inteira e prioriza uma página institucional de manutenção para conexões HTTP. Registre o motivo com clareza para manter rastreabilidade.'
                                    : 'Esta ação remove o modo manutenção e devolve a VLAN ao enforcement institucional vigente.'}
                            </div>

                            <label className="block">
                                <span className="mb-2 block text-sm font-bold text-on-surface">Motivo</span>
                                <textarea
                                    value={totalBlockForm.reason}
                                    onChange={(event) => setTotalBlockForm((current) => ({ ...current, reason: event.target.value }))}
                                    rows={4}
                                    placeholder={totalBlockDialog.mode === 'activate'
                                        ? 'Ex.: manutenção elétrica no setor, contenção de incidente, janela técnica autorizada.'
                                        : 'Registre o motivo do retorno da VLAN.'}
                                    className="w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm text-on-surface"
                                />
                            </label>

                            <div className="flex justify-end gap-3">
                                <ActionButton tone="ghost" onClick={() => setTotalBlockDialog({ open: false, mode: 'activate', vlan: null })}>
                                    Cancelar
                                </ActionButton>
                                <ActionButton
                                    tone={totalBlockDialog.mode === 'activate' ? 'danger' : 'primary'}
                                    icon={totalBlockDialog.mode === 'activate' ? Wrench : ShieldCheck}
                                    disabled={Boolean(tacticalLoading)}
                                    onClick={submitTotalVlanBlock}
                                >
                                    {tacticalLoading
                                        ? 'Processando...'
                                        : totalBlockDialog.mode === 'activate'
                                            ? 'Confirmar manutenção'
                                            : 'Restaurar navegação'}
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
