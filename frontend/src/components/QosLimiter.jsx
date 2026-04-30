import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Crown, ShieldCheck, Database, Smartphone, Users, Trash2, Plus, Save, Activity, Phone, RefreshCcw } from 'lucide-react';
import { api } from '../services/api';

const VLANS = [
    { id: 10, label: 'Secretaria', iface: 'enp6s0.10', icon: ShieldCheck, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', btn: 'bg-indigo-500 hover:bg-indigo-600', ring: 'focus:ring-indigo-500' },
    { id: 30, label: 'Celulares', iface: 'enp6s0.30', icon: Smartphone, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/30', btn: 'bg-purple-500 hover:bg-purple-600', ring: 'focus:ring-purple-500' },
    { id: 40, label: 'CFTV', iface: 'enp6s0.40', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30', btn: 'bg-orange-500 hover:bg-orange-600', ring: 'focus:ring-orange-500' },
    { id: 50, label: 'SINE', iface: 'enp6s0.50', icon: Database, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', btn: 'bg-cyan-500 hover:bg-cyan-600', ring: 'focus:ring-cyan-500' },
    { id: 70, label: 'Visitantes', iface: 'enp6s0.70', icon: Users, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', btn: 'bg-yellow-500 hover:bg-yellow-600', ring: 'focus:ring-yellow-500' },
    { id: 80, label: 'VOIP', iface: 'enp6s0.80', icon: Phone, color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/30', btn: 'bg-pink-500 hover:bg-pink-600', ring: 'focus:ring-pink-500' },
];

const QosLimiter = () => {
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [configs, setConfigs] = useState({});

    const loadConfigs = async () => {
        const res = await api.get('/api/qos');
        setConfigs(res.data || {});
    };

    useEffect(() => {
        loadConfigs().catch(() => {
            alert('Falha ao carregar o estado do QoS.');
        });
    }, []);

    const handleChange = (iface, field, value) => {
        setConfigs((prev) => ({ ...prev, [iface]: { ...prev[iface], [field]: value } }));
    };

    const addVipLocal = (iface) => {
        setConfigs((prev) => {
            const current = prev[iface] || {};
            const vips = current.vips || [];
            return { ...prev, [iface]: { ...current, vips: [{ ip: '', label: '' }, ...vips] } };
        });
    };

    const updateVipLocal = (iface, index, field, value) => {
        setConfigs((prev) => {
            const vips = [...(prev[iface]?.vips || [])];
            if (!vips[index]) return prev;
            vips[index] = { ...vips[index], [field]: value };
            return { ...prev, [iface]: { ...prev[iface], vips } };
        });
    };

    const removeVipLocal = (iface, index) => {
        setConfigs((prev) => {
            const vips = [...(prev[iface]?.vips || [])];
            vips.splice(index, 1);
            return { ...prev, [iface]: { ...prev[iface], vips } };
        });
    };

    const handleApply = async (vlan) => {
        setLoading(true);
        try {
            const payload = {
                interface: vlan.iface,
                download: configs[vlan.iface]?.down_limit || 0,
                upload: configs[vlan.iface]?.up_limit || 0,
                vips: configs[vlan.iface]?.vips || [],
            };
            const res = await api.post('/api/qos/apply', payload);
            await loadConfigs();
            const warnings = res.data?.warnings || [];
            alert(warnings.length ? `QoS aplicado em ${vlan.label}.\n\n${warnings.join('\n')}` : `QoS aplicado com sucesso em ${vlan.label}.`);
        } catch (error) {
            alert(error?.response?.data?.error || 'Erro ao aplicar limites de banda.');
        }
        setLoading(false);
    };

    const handleReconcile = async () => {
        setSyncing(true);
        try {
            await api.post('/api/qos/reconcile');
            await loadConfigs();
            alert('Runtime do QoS reconciliado com o banco.');
        } catch (error) {
            alert(error?.response?.data?.error || 'Falha ao reconciliar o runtime do QoS.');
        }
        setSyncing(false);
    };

    return (
        <div className="space-y-4 pt-4">
            <div className="bg-container border border-outline/20 rounded-[24px] p-4 md:p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="text-sm font-bold text-on-surface">QoS operacional com verificação de runtime</div>
                    <p className="text-xs text-on-surface/64 mt-1">
                        O módulo agora mostra quando o banco e o `tc` do kernel estão fora de sincronia. VIP de QoS só é considerado válido depois da regra real ser aplicada.
                    </p>
                </div>
                <button onClick={handleReconcile} disabled={syncing || loading} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold bg-surface border border-outline/20 text-on-surface hover:border-outline/40 transition-all disabled:opacity-60">
                    <RefreshCcw size={14} className={syncing ? 'animate-spin' : ''} />
                    Reconciliar runtime
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-in fade-in duration-500">
                {VLANS.map((v) => {
                    const conf = configs[v.iface] || {};
                    const vips = conf.vips || [];
                    const runtime = conf.runtime || {};
                    const runtimeLabel = runtime.mode === 'managed'
                        ? 'QoS aplicado'
                        : runtime.mode === 'legacy'
                            ? 'Runtime legado'
                            : 'Sem runtime';

                    return (
                        <div key={v.id} className={`bg-container p-5 rounded-[24px] border ${v.border} shadow-sm relative overflow-hidden flex flex-col justify-between group hover:shadow-md transition-all`}>
                            <div className={`absolute top-0 left-0 w-full h-1.5 ${v.btn}`}></div>

                            <div>
                                <div className="flex justify-between items-center mb-4 mt-1 gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${v.bg} ${v.color}`}><v.icon size={20} /></div>
                                        <div>
                                            <h3 className="font-bold text-on-surface text-sm leading-none">{v.label}</h3>
                                            <span className="text-[10px] font-mono text-on-surface opacity-60 mt-1 block">VLAN {v.id} • {v.iface}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-semibold tracking-tight ${conf.active ? 'bg-info/10 text-info' : 'bg-outline/10 text-on-surface opacity-60'}`}>
                                            {conf.active ? 'Ativa' : 'Inativa'}
                                        </span>
                                        <span className={`px-2 py-1 rounded-md text-[10px] font-semibold tracking-tight ${runtime.mode === 'managed' ? 'bg-success/10 text-success' : runtime.mode === 'legacy' ? 'bg-warning/10 text-warning' : 'bg-outline/10 text-on-surface/60'}`}>
                                            {runtimeLabel}
                                        </span>
                                    </div>
                                </div>

                                <div className="mb-5">
                                    <label className="mb-2 block text-[11px] font-semibold tracking-tight text-on-surface/72">Limite de download (Mbit/s)</label>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div className="relative group/input">
                                            <ArrowDown size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${v.color} opacity-70 transition-transform group-focus-within/input:-translate-y-2`} />
                                            <input
                                                type="number"
                                                min="0"
                                                value={conf.down_limit || ''}
                                                onChange={(e) => handleChange(v.iface, 'down_limit', e.target.value)}
                                                placeholder="Down"
                                                className={`w-full bg-surface border border-outline/20 rounded-lg py-2 pl-8 pr-2 text-on-surface text-xs font-mono focus:outline-none focus:ring-2 ${v.ring} transition-all`}
                                            />
                                        </div>
                                        <div className="relative group/input">
                                            <ArrowUp size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface/40" />
                                            <input
                                                type="number"
                                                min="0"
                                                value={conf.up_limit || ''}
                                                onChange={(e) => handleChange(v.iface, 'up_limit', e.target.value)}
                                                placeholder="Upload"
                                                className={`w-full bg-surface border border-outline/20 rounded-lg py-2 pl-8 pr-2 text-on-surface text-xs font-mono focus:outline-none focus:ring-2 ${v.ring} transition-all`}
                                            />
                                        </div>
                                    </div>
                                    <p className="mt-2 text-[10px] text-on-surface/54">
                                        Download é aplicado na própria VLAN. Upload é controlado por redirecionamento de ingresso para uma interface virtual IFB desta VLAN.
                                    </p>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-[11px] font-semibold tracking-tight text-on-surface/72 flex items-center gap-1"><Crown size={12} className="text-yellow-500" /> VIPs do QoS</label>
                                        <button onClick={() => addVipLocal(v.iface)} className={`p-1 rounded ${v.bg} ${v.color} hover:opacity-80 transition-all`}><Plus size={14} /></button>
                                    </div>
                                    <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                                        {vips.map((vip, idx) => (
                                            <div key={`${vip.ip || 'vip'}-${idx}`} className="flex items-center gap-1.5">
                                                <input type="text" value={vip.ip || ''} onChange={(e) => updateVipLocal(v.iface, idx, 'ip', e.target.value)} placeholder="IP" className={`w-24 bg-surface border border-outline/20 rounded text-[10px] p-1.5 text-on-surface font-mono focus:outline-none focus:ring-1 ${v.ring}`} />
                                                <input type="text" value={vip.label || ''} onChange={(e) => updateVipLocal(v.iface, idx, 'label', e.target.value)} placeholder="Aparelho" className={`flex-1 bg-surface border border-outline/20 rounded text-[10px] p-1.5 text-on-surface focus:outline-none focus:ring-1 ${v.ring}`} />
                                                <button onClick={() => removeVipLocal(v.iface, idx)} className="p-1.5 text-danger hover:bg-danger/10 rounded transition-colors"><Trash2 size={12} /></button>
                                            </div>
                                        ))}
                                        {vips.length === 0 ? <p className="text-[11px] text-on-surface/52 text-center py-1 bg-surface rounded-lg border border-outline/10">Nenhum dispositivo prioritário cadastrado.</p> : null}
                                    </div>
                                    <p className="mt-2 text-[10px] text-on-surface/54">
                                        VIP de QoS sai da classe limitada desta VLAN. Se a interface estiver em runtime legado, essa exceção pode não estar sendo respeitada.
                                    </p>
                                </div>

                                {Array.isArray(conf.warnings) && conf.warnings.length ? (
                                    <div className="mb-4 rounded-2xl border border-outline/15 bg-surface p-3 text-[10px] text-on-surface/62 space-y-1">
                                        {conf.warnings.map((warning, index) => (
                                            <div key={`${v.iface}-warning-${index}`}>{warning}</div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            <button onClick={() => handleApply(v)} disabled={loading || syncing} className={`w-full py-2.5 text-white rounded-xl font-semibold text-[12px] flex justify-center items-center gap-1.5 transition-all active:scale-95 shadow-sm hover:shadow-md disabled:opacity-60 ${v.btn}`}>
                                <Save size={14} /> Aplicar QoS desta VLAN
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default QosLimiter;
