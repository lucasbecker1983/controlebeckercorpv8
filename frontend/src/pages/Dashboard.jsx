import React, { useState, useEffect } from 'react';
import { Cpu, Database, Shield, Clock, Globe, ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { api } from '../services/api';
import { ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';

const LiveAreaChart = ({ data, color }) => {
    if (!data || data.length < 2) return <div className="h-full w-full flex items-center justify-center opacity-20"><Activity/></div>;
    const max = Math.max(...data, 10);
    const points = data.map((val, i) => `${(i / (data.length - 1)) * 100},${100 - (val / max) * 100}`).join(' ');
    return (
        <div className="w-full h-16 relative overflow-hidden opacity-80 mt-2">
            <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <path d={`M0,100 ${points} L100,100 Z`} fill="currentColor" className="opacity-20" />
                <path d={`M0,100 ${points}`} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
        </div>
    );
};

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [history, setHistory] = useState({ wan: Array(15).fill(0), lan: Array(15).fill(0) });

    useEffect(() => {
        const load = async () => { 
            try { 
                const res = await api.get('/api/dashboard/metrics'); 
                setData(res.data);
                if(res.data?.network) {
                    setHistory(p => ({ wan: [...p.wan.slice(1), res.data?.network?.wan.down], lan: [...p.lan.slice(1), res.data?.network?.lan.down] }));
                }
            } catch {} 
        };
        load(); const i = setInterval(load, 2000); return () => clearInterval(i);
    }, []);

    if (!data) return <div className="p-10 font-bold text-primary flex items-center gap-2"><Activity className="animate-spin"/> Sincronizando Módulos...</div>;

    const fmtUptime = (s) => {
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${d} dias, ${h} horas e ${m} minutos`;
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <ModuleHeader
                eyebrow="Governança"
                title="Centro de Governança"
                description="Painel executivo para leitura institucional do ambiente, com visão consolidada de disponibilidade, ameaça, infraestrutura e tráfego operacional."
                badges={(
                    <>
                        <StatusChip label="Visão executiva" tone="primary" />
                        <StatusChip label="Governança + Controle" tone="success" />
                    </>
                )}
            />
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                    { title: "Carga CPU", val: `${data?.system?.cpu}%`, sub: "Processamento", icon: Cpu, col: "text-orange-500" },
                    { title: "Memória RAM", val: `${data?.system?.ram}%`, sub: data?.system?.ram_text, icon: Database, col: "text-blue-500" },
                    { title: "Ameaças", val: data?.modules?.threats_blocked, sub: `Bloqueios ${data?.threats?.window || '24h'}${data?.threats?.recent_5m ? ` • ${data.threats.recent_5m} em 5min` : ''}`, icon: Shield, col: "text-danger" },
                    { title: "Uptime", val: "Servidor", sub: fmtUptime(data?.system?.uptime), icon: Clock, col: "text-success" }
                ].map((c, i) => (
                    <Surface key={i} className="h-full p-5 sm:p-6">
                        <div className="flex h-full items-start gap-4">
                            <div className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-outline/10 bg-surface ${c.col}`}>
                                <c.icon size={22} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold tracking-tight text-on-surface/60">{c.title}</p>
                                <h3 className={`mt-2 break-words font-black tracking-tight text-on-surface ${i === 3 ? 'text-xl' : 'text-3xl'}`}>{c.val}</h3>
                                <p className="mt-2 text-sm leading-6 text-on-surface/56">{c.sub}</p>
                            </div>
                        </div>
                    </Surface>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Surface className="p-6">
                    <div className="text-[11px] font-semibold tracking-tight text-primary">Governança</div>
                    <h3 className="mt-2 text-xl font-black text-on-surface">Decisão, política e conformidade</h3>
                    <p className="mt-3 text-sm leading-6 text-on-surface/62">
                        Use a camada de governança para definir políticas, exceções, perfis, critérios de auditoria e parâmetros institucionais do SGCG.
                    </p>
                </Surface>
                <Surface className="p-6">
                    <div className="text-[11px] font-semibold tracking-tight text-primary">Controle</div>
                    <h3 className="mt-2 text-xl font-black text-on-surface">Execução técnica e observabilidade</h3>
                    <p className="mt-3 text-sm leading-6 text-on-surface/62">
                        A camada de controle executa enforcement, monitora serviços, expõe telemetria e valida tecnicamente o comportamento da infraestrutura.
                    </p>
                </Surface>
            </div>

            <Surface className="p-6 md:p-8">
                <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-on-surface"><Globe className="text-primary"/> Tráfego em tempo real</h3>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-[24px] border border-outline/10 bg-surface p-5 text-blue-500 sm:p-6">
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-tight text-on-surface"><ArrowDown size={14} className="text-blue-500"/> Internet WAN</p>
                        <h4 className="text-3xl font-black text-on-surface">{(data?.network?.wan?.down || 0).toFixed(1)} <span className="text-sm opacity-50">Mbps</span></h4>
                        <LiveAreaChart data={history.wan} />
                    </div>
                    <div className="rounded-[24px] border border-outline/10 bg-surface p-5 text-purple-500 sm:p-6">
                        <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-tight text-on-surface"><ArrowUp size={14} className="text-purple-500"/> Rede local (VLANs)</p>
                        <h4 className="text-3xl font-black text-on-surface">{(data?.network?.lan?.down || 0).toFixed(1)} <span className="text-sm opacity-50">Mbps</span></h4>
                        <LiveAreaChart data={history.lan} />
                    </div>
                </div>
            </Surface>
        </div>
    );
}
