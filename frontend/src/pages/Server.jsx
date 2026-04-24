import React, { useState, useEffect } from 'react';
import { Server as ServerIcon, Cpu, HardDrive, Thermometer, Zap, Database, CheckCircle, Activity } from 'lucide-react';
import { api } from '../services/api';
import { ModuleHeader, Surface } from '../components/ui/primitives';

export default function Server() {
    const [hw, setHw] = useState(null);

    useEffect(() => {
        const load = async () => { try { const res = await api.get('/api/server/hardware'); setHw(res.data); } catch {} };
        load(); const i = setInterval(load, 5000); return () => clearInterval(i);
    }, []);

    if (!hw) return <div className="p-10 text-primary font-bold flex items-center gap-3"><Activity className="animate-spin"/> Carregando Hardware...</div>;

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            <ModuleHeader
                eyebrow="Controle"
                title="Controle de Infraestrutura"
                description="Acompanhe a saúde técnica do host, recursos computacionais e dispositivos de armazenamento responsáveis pela continuidade do SGCG."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Surface className="flex flex-col justify-between p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl"><ServerIcon size={24}/></div>
                        <h3 className="font-bold text-on-surface text-lg">Sistema Operacional</h3>
                    </div>
                    <div>
                        <p className="text-2xl font-black text-primary truncate" title={hw.os?.distro}>{hw.os?.distro}</p>
                        <p className="text-sm text-on-surface opacity-70 mt-1 font-mono">{hw.os?.kernel}</p>
                    </div>
                </Surface>

                <Surface className="flex flex-col justify-between p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-orange-500/10 text-orange-500 rounded-2xl"><Cpu size={24}/></div>
                        <h3 className="font-bold text-on-surface text-lg">Processador (CPU)</h3>
                    </div>
                    <div>
                        <p className="text-lg font-bold text-on-surface leading-tight">{hw.cpu?.model}</p>
                        <p className="text-sm text-on-surface opacity-70 mt-2 font-mono flex items-center gap-2"><Zap size={14}/> {hw.cpu?.cores} Núcleos @ {hw.cpu?.speed}GHz</p>
                    </div>
                </Surface>

                <Surface className="flex flex-col justify-between p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-purple-500/10 text-purple-500 rounded-2xl"><Database size={24}/></div>
                        <h3 className="font-bold text-on-surface text-lg">Memória RAM</h3>
                    </div>
                    <div>
                        <p className="text-3xl font-black text-on-surface">{hw.mem?.used} <span className="text-sm font-normal opacity-50">/ {hw.mem?.total}</span></p>
                        <div className="w-full bg-outline/10 h-2 rounded-full mt-4 overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full" style={{width: hw.mem?.percent_used}}></div>
                        </div>
                    </div>
                </Surface>
            </div>

            {hw.disks && (
                <div>
                    <h3 className="text-xl font-bold text-on-surface mb-4 mt-8 flex items-center gap-2"><HardDrive size={20} className="text-primary"/> Armazenamento Físico</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {Object.entries(hw.disks).map(([key, disk]) => (
                            <Surface key={key} className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="font-bold text-on-surface uppercase">{key === 'system' ? 'Root (Sistema)' : key === 'cftv' ? 'Storage (CFTV)' : 'Storage (Dados)'}</h4>
                                        <p className="text-[10px] font-mono text-on-surface opacity-50">{disk.mount}</p>
                                    </div>
                                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-bold uppercase">{disk.type}</span>
                                </div>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-2xl font-black text-on-surface">{disk.used} <span className="text-sm font-normal opacity-50">usado</span></span>
                                    <span className="text-sm font-bold text-on-surface opacity-70">Total: {disk.size}</span>
                                </div>
                                <div className="w-full bg-outline/10 h-3 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${parseInt(disk.percent) > 85 ? 'bg-danger' : 'bg-primary'}`} style={{width: disk.percent}}></div>
                                </div>
                            </Surface>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
