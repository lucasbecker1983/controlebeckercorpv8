import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity, CheckCircle, Calendar } from 'lucide-react';
import { api } from '../services/api';

export default function DowntimeLog() {
    const [history, setHistory] = useState([]);
    const load = async () => { try { const res = await api.get('/api/downtime/history'); setHistory(res.data || []); } catch {} };
    useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

    const formatDur = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-[24px] p-5 h-full flex flex-col">
            <h3 className="text-white font-black uppercase text-xs tracking-widest flex items-center gap-2 mb-4">
                <Activity size={16} className="text-blue-500" /> Logs Gateway ICMP
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-20"><CheckCircle size={32}/><p className="text-[10px] font-bold mt-2">LINK ESTÁVEL</p></div>
                ) : (
                    history.map(log => (
                        <div key={log.id} className={`p-3 rounded-xl border ${log.is_active ? 'bg-red-500/10 border-red-500/50 animate-pulse' : 'bg-slate-950 border-slate-800'}`}>
                            <div className="flex justify-between items-start">
                                <span className={`text-[10px] font-black uppercase ${log.is_active ? 'text-red-500' : 'text-slate-400'}`}>{log.is_active ? 'Queda' : 'Restabelecido'}</span>
                                <span className="text-[10px] font-mono text-white">{formatDur(log.duration)}</span>
                            </div>
                            <div className="text-[9px] text-slate-500 mt-1 font-mono">{new Date(log.start_at).toLocaleString()}</div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
