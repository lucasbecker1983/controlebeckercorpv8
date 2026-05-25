import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle, Clock3, Globe2, Network, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';

export default function DowntimeLog() {
    const [history, setHistory] = useState([]);
    const [summary, setSummary] = useState(null);
    const load = async () => {
        try {
            const [historyRes, summaryRes] = await Promise.all([
                api.get('/api/downtime/history'),
                api.get('/api/downtime/summary'),
            ]);
            setHistory(historyRes.data || []);
            setSummary(summaryRes.data || null);
        } catch {}
    };
    useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

    const formatDur = (value) => {
        const s = Math.max(0, Math.round(Number(value || 0)));
        if (s < 60) return `${s}s`;
        const minutes = Math.floor(s / 60);
        const seconds = s % 60;
        if (minutes < 60) return `${minutes}m ${seconds}s`;
        return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    };

    const sentinel = summary?.sentinel;
    const external = sentinel?.external;
    const gateway = sentinel?.gateway;
    const rows = Array.isArray(summary?.targets) ? summary.targets : [];
    const externalStats = rows.find((row) => row.target_key === 'external_internet') || {};
    const gatewayStats = rows.find((row) => row.target_key === 'provider_gateway') || {};

    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
                <div className={`rounded-[24px] border p-5 shadow-sm ${external?.online ? 'border-info/20 bg-info/8' : 'border-danger/30 bg-danger/8'}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wide text-on-surface/55">Sentinela principal</p>
                            <h3 className="mt-1 text-lg font-black text-on-surface">Internet externa</h3>
                        </div>
                        <div className={`rounded-2xl p-3 ${external?.online ? 'bg-info/12 text-info' : 'bg-danger/12 text-danger'}`}>
                            {external?.online ? <Globe2 size={22} /> : <ShieldAlert size={22} />}
                        </div>
                    </div>
                    <div className="mt-4 text-2xl font-black text-on-surface">{external?.online ? 'Online' : 'Fora do ar'}</div>
                    <p className="mt-1 text-xs font-semibold text-on-surface/58">{external?.path || 'Secretaria -> Provedor -> Internet'}</p>
                    <p className="mt-3 font-mono text-[11px] text-on-surface/62">{external?.label || 'Google DNS'} {external?.ip || '8.8.8.8'} via {external?.interface || 'enp8s0'}</p>
                </div>

                <div className={`rounded-[24px] border p-5 shadow-sm ${gateway?.online ? 'border-info/20 bg-container' : 'border-danger/30 bg-danger/8'}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wide text-on-surface/55">Contra prova local do provedor</p>
                            <h3 className="mt-1 text-lg font-black text-on-surface">Gateway Nicknetwork</h3>
                        </div>
                        <div className={`rounded-2xl p-3 ${gateway?.online ? 'bg-info/12 text-info' : 'bg-danger/12 text-danger'}`}>
                            <Network size={22} />
                        </div>
                    </div>
                    <div className="mt-4 text-2xl font-black text-on-surface">{gateway?.online ? 'Online' : 'Fora do ar'}</div>
                    <p className="mt-1 text-xs font-semibold text-on-surface/58">{gateway?.path || 'Secretaria -> Provedor'}</p>
                    <p className="mt-3 font-mono text-[11px] text-on-surface/62">{gateway?.ip || '186.251.14.25'} via {gateway?.interface || 'enp8s0'}</p>
                </div>

                <div className="rounded-[24px] border border-outline/15 bg-container p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wide text-on-surface/55">Métricas de hoje</p>
                            <h3 className="mt-1 text-lg font-black text-on-surface">Link Nicknetwork</h3>
                        </div>
                        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                            <Clock3 size={22} />
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-surface p-3">
                            <p className="text-[10px] font-bold uppercase text-on-surface/48">Quedas internet</p>
                            <p className="mt-1 text-xl font-black text-on-surface">{externalStats.drops_today || 0}</p>
                        </div>
                        <div className="rounded-2xl bg-surface p-3">
                            <p className="text-[10px] font-bold uppercase text-on-surface/48">Tempo fora</p>
                            <p className="mt-1 text-xl font-black text-on-surface">{formatDur(externalStats.downtime_seconds_today)}</p>
                        </div>
                        <div className="rounded-2xl bg-surface p-3">
                            <p className="text-[10px] font-bold uppercase text-on-surface/48">Quedas gateway</p>
                            <p className="mt-1 text-xl font-black text-on-surface">{gatewayStats.drops_today || 0}</p>
                        </div>
                        <div className="rounded-2xl bg-surface p-3">
                            <p className="text-[10px] font-bold uppercase text-on-surface/48">Gateway fora</p>
                            <p className="mt-1 text-xl font-black text-on-surface">{formatDur(gatewayStats.downtime_seconds_today)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-[24px] border border-outline/15 bg-container p-5 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-on-surface/60">
                    <Activity size={16} className="text-primary" /> Histórico de indisponibilidade
                </h3>
                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {history.length === 0 ? (
                    <div className="flex min-h-[180px] flex-col items-center justify-center text-on-surface/28"><CheckCircle size={32}/><p className="mt-2 text-[10px] font-bold uppercase">Link estável</p></div>
                ) : (
                    history.map(log => (
                        <div key={log.id} className={`rounded-2xl border p-3 ${log.is_active ? 'border-danger/35 bg-danger/8' : 'border-outline/12 bg-surface'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <span className={`text-[10px] font-black uppercase ${log.is_active ? 'text-danger' : 'text-info'}`}>{log.is_active ? 'Queda ativa' : 'Restabelecido'}</span>
                                    <p className="mt-1 text-sm font-black text-on-surface">{log.target_label || log.gateway_ip}</p>
                                    <p className="truncate text-[11px] font-semibold text-on-surface/55">{log.path_label}</p>
                                </div>
                                <span className="shrink-0 font-mono text-xs font-bold text-on-surface">{formatDur(log.duration)}</span>
                            </div>
                            <div className="mt-2 font-mono text-[10px] text-on-surface/48">{new Date(log.start_at).toLocaleString('pt-BR')}</div>
                        </div>
                    ))
                )}
                </div>
            </div>
        </div>
    );
}
