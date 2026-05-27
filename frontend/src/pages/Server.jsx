import React, { useState, useEffect } from 'react';
import { Server as ServerIcon, Cpu, HardDrive, Zap, Database, Activity, CircuitBoard } from 'lucide-react';
import { api } from '../services/api';
import { ModuleHeader, Surface } from '../components/ui/primitives';

export default function Server() {
    const [hw, setHw] = useState(null);

    useEffect(() => {
        const load = async () => { try { const res = await api.get('/api/server/hardware'); setHw(res.data); } catch {} };
        load(); const i = setInterval(load, 5000); return () => clearInterval(i);
    }, []);

    if (!hw) return <div className="p-10 text-primary font-bold flex items-center gap-3"><Activity className="animate-spin"/> Carregando Hardware...</div>;

    const rootDisk = hw.storage?.root || hw.disks?.system;
    const physicalSsds = hw.storage?.physical_ssds || [];

    return (
        <div className="space-y-8 pb-10 animate-in fade-in duration-500">
            <ModuleHeader
                eyebrow="Controle"
                title="Controle de Infraestrutura"
                description="Acompanhe a saúde técnica do host, recursos computacionais e dispositivos de armazenamento responsáveis pela continuidade do SGCG."
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Surface className="flex min-h-[156px] flex-col justify-between p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg"><ServerIcon size={20}/></div>
                        <h3 className="font-bold text-on-surface text-sm">Sistema Operacional</h3>
                    </div>
                    <div>
                        <p className="text-base font-black text-primary truncate" title={hw.os?.distro}>{hw.os?.distro}</p>
                        <p className="text-xs text-on-surface opacity-70 mt-1 font-mono truncate">{hw.os?.kernel}</p>
                    </div>
                </Surface>

                <Surface className="flex min-h-[156px] flex-col justify-between p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg"><Cpu size={20}/></div>
                        <h3 className="font-bold text-on-surface text-sm">Processador</h3>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-on-surface leading-tight line-clamp-2">{hw.cpu?.model}</p>
                        <p className="text-xs text-on-surface opacity-70 mt-2 font-mono flex items-center gap-2"><Zap size={13}/> {hw.cpu?.cores} Núcleos @ {hw.cpu?.speed}GHz</p>
                    </div>
                </Surface>

                <Surface className="flex min-h-[156px] flex-col justify-between p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg"><Database size={20}/></div>
                        <h3 className="font-bold text-on-surface text-sm">Memória RAM</h3>
                    </div>
                    <div>
                        <p className="text-xl font-black text-on-surface">{hw.mem?.used} <span className="text-xs font-normal opacity-50">/ {hw.mem?.total}</span></p>
                        <div className="w-full bg-outline/10 h-2 rounded-full mt-3 overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full" style={{width: hw.mem?.percent_used}}></div>
                        </div>
                    </div>
                </Surface>

                <Surface className="flex min-h-[156px] flex-col justify-between p-4">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg"><CircuitBoard size={20}/></div>
                        <h3 className="font-bold text-on-surface text-sm">Placa Mãe</h3>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-on-surface leading-tight line-clamp-2">{hw.motherboard?.model || 'Não identificado'}</p>
                        <p className="text-xs text-on-surface opacity-70 mt-2 font-mono truncate">{hw.motherboard?.vendor}</p>
                    </div>
                </Surface>
            </div>

            {rootDisk && (
                <div>
                    <h3 className="text-xl font-bold text-on-surface mb-4 mt-8 flex items-center gap-2"><HardDrive size={20} className="text-primary"/> Armazenamento Físico</h3>
                    <Surface className="p-5 mb-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <h4 className="font-black text-on-surface uppercase tracking-wide">Disco ROOT (SISTEMA)</h4>
                                <p className="text-xs font-mono text-on-surface opacity-55 mt-1">{rootDisk.mount || '/'}</p>
                                <p className="text-xs text-on-surface opacity-70 mt-2">{rootDisk.layout || `${physicalSsds.length || 4} SSDs em volume unificado`}</p>
                            </div>
                            <div className="min-w-[240px]">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-2xl font-black text-on-surface">{rootDisk.used} <span className="text-sm font-normal opacity-50">usado</span></span>
                                    <span className="text-sm font-bold text-on-surface opacity-70">Total: {rootDisk.size}</span>
                                </div>
                                <div className="w-full bg-outline/10 h-3 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${parseInt(rootDisk.percent) > 85 ? 'bg-danger' : 'bg-primary'}`} style={{width: rootDisk.percent}}></div>
                                </div>
                            </div>
                        </div>
                    </Surface>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        {physicalSsds.map((disk) => (
                            <Surface key={disk.id} className="p-4">
                                <div className="flex justify-between items-start gap-3 mb-3">
                                    <div>
                                        <h4 className="font-bold text-on-surface uppercase">{disk.label}</h4>
                                        <p className="text-[10px] font-mono text-on-surface opacity-50">{disk.device}</p>
                                    </div>
                                    <span className="bg-primary/10 text-primary px-2 py-1 rounded-md text-[10px] font-bold uppercase">SSD</span>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-on-surface truncate" title={disk.model}>{disk.model}</p>
                                    <p className="text-xs text-on-surface opacity-70">{disk.size} · {disk.transport}</p>
                                    <p className="text-[11px] text-on-surface opacity-55 truncate" title={disk.serial}>{disk.serial || 'Serial não informado'}</p>
                                </div>
                            </Surface>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
