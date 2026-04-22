import React, { useState, useEffect } from 'react';
import { Cpu, Database, Shield, Clock, Globe, ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { api } from '../services/api';

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
            <h2 className="text-4xl font-light text-on-surface">Visão <span className="font-bold italic text-primary">Geral</span></h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { title: "Carga CPU", val: `${data?.system?.cpu}%`, sub: "Processamento", icon: Cpu, col: "text-orange-500" },
                    { title: "Memória RAM", val: `${data?.system?.ram}%`, sub: data?.system?.ram_text, icon: Database, col: "text-blue-500" },
                    { title: "Ameaças", val: data?.modules?.threats_blocked, sub: `Bloqueios ${data?.threats?.window || '24h'}${data?.threats?.recent_5m ? ` • ${data.threats.recent_5m} em 5min` : ''}`, icon: Shield, col: "text-danger" },
                    { title: "Uptime", val: "Servidor", sub: fmtUptime(data?.system?.uptime), icon: Clock, col: "text-success" }
                ].map((c, i) => (
                    <div key={i} className="bg-container p-6 rounded-[28px] border border-outline/20 relative overflow-hidden group">
                        <c.icon size={80} className={`absolute -right-4 -top-4 opacity-10 ${c.col} group-hover:scale-110 transition-transform`} />
                        <div className="relative z-10">
                            <c.icon size={24} className={`${c.col} mb-4`} />
                            <p className="text-on-surface opacity-60 text-xs font-bold uppercase mb-1">{c.title}</p>
                            <h3 className={`text-2xl font-black text-on-surface ${i===3 ? 'text-lg' : ''}`}>{c.val}</h3>
                            <p className="text-[10px] text-on-surface opacity-50 font-mono mt-2 uppercase">{c.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-container p-6 md:p-8 rounded-[32px] border border-outline/20">
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-on-surface"><Globe className="text-primary"/> Tráfego em Tempo Real</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-surface p-6 rounded-[24px] border border-outline/10 text-blue-500">
                        <p className="text-[10px] font-bold uppercase mb-2 flex items-center gap-2 text-on-surface"><ArrowDown size={14} className="text-blue-500"/> Internet WAN</p>
                        <h4 className="text-3xl font-black text-on-surface">{(data?.network?.wan?.down || 0).toFixed(1)} <span className="text-sm opacity-50">Mbps</span></h4>
                        <LiveAreaChart data={history.wan} />
                    </div>
                    <div className="bg-surface p-6 rounded-[24px] border border-outline/10 text-purple-500">
                        <p className="text-[10px] font-bold uppercase mb-2 flex items-center gap-2 text-on-surface"><ArrowUp size={14} className="text-purple-500"/> Rede Local (VLANs)</p>
                        <h4 className="text-3xl font-black text-on-surface">{(data?.network?.lan?.down || 0).toFixed(1)} <span className="text-sm opacity-50">Mbps</span></h4>
                        <LiveAreaChart data={history.lan} />
                    </div>
                </div>
            </div>
        </div>
    );
}
