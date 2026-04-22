import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, ArrowDown, ArrowUp } from 'lucide-react';
import { api } from '../services/api';

export default function Traffic() {
    const [ifaces, setIfaces] = useState([]);
    
    // Polling rápido para tráfego (1s)
    useEffect(() => {
        const i = setInterval(async () => {
            const data = await api.get('/traffic');
            if(data) setIfaces(data);
        }, 1000);
        return () => clearInterval(i);
    }, []);

    const fmt = (bytes) => {
        if(bytes > 1073741824) return (bytes/1073741824).toFixed(2) + " GB";
        if(bytes > 1048576) return (bytes/1048576).toFixed(2) + " MB";
        return (bytes/1024).toFixed(2) + " KB";
    };

    return (
        <div className="space-y-8">
            <h2 className="text-4xl font-black text-white italic uppercase">Tráfego <span className="text-blue-600">Tempo Real</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {ifaces.map(net => (
                    <div key={net.iface} className="bg-slate-900 border border-slate-800 p-6 rounded-[30px]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-white">{net.iface}</h3>
                            <ArrowRightLeft className="text-slate-600"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex gap-2"><ArrowDown size={14}/> Download (Total)</div>
                                <div className="text-2xl font-mono text-blue-400">{fmt(net.rx_bytes)}</div>
                            </div>
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                <div className="text-slate-500 text-xs font-bold uppercase mb-1 flex gap-2"><ArrowUp size={14}/> Upload (Total)</div>
                                <div className="text-2xl font-mono text-purple-400">{fmt(net.tx_bytes)}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
