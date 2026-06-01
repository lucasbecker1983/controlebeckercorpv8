import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Server, Lock, Activity, Wifi, Globe, Trash2, Gauge, Plus, Smartphone, RefreshCw, Folder, User, CheckCircle, XCircle, Download, ArrowUp, ArrowDown, Zap, BarChart3, Database, Search, ShieldAlert, Monitor, Ban, Check, CornerDownRight, Target, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import QosLimiter from '../components/QosLimiter';
import { Clock } from 'lucide-react';
import VlanManagerMD3 from './VlanManagerMD3';
import { ModuleHeader, SegmentedTabs, StatusChip } from '../components/ui/primitives';
import DowntimeLog from '../components/DowntimeLog';

const fetchErrorMessage = (error, fallback) => error?.response?.data?.error || error?.message || fallback;

const ErrorBanner = ({ message }) => (
    message ? (
        <div className="rounded-[24px] border border-danger/20 bg-danger/8 px-4 py-3 text-sm font-semibold text-danger shadow-sm">
            {message}
        </div>
    ) : null
);

const secondsLabel = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return `${(number * 1000).toFixed(0)} ms`;
};

const CriticalServicesPanel = ({ data, onRefresh }) => {
    const services = Array.isArray(data?.services) ? data.services : [];
    const okCount = services.filter((item) => item.status === 'ok').length;
    const total = services.length;

    return (
        <div className="bg-container border border-outline/20 p-5 rounded-[24px] shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-on-surface font-black uppercase text-xs tracking-[0.18em] flex items-center gap-2">
                        <Shield size={16} className="text-info" /> Serviços críticos liberados
                    </h3>
                    <p className="mt-1 text-sm text-on-surface/62">
                        WhatsApp, gov.br, Caixa e Conectividade Social com DNS, ipset e HTTPS por VLAN.
                    </p>
                </div>
                <button onClick={onRefresh} className="inline-flex items-center justify-center gap-2 rounded-xl border border-outline/20 bg-surface px-3 py-2 text-xs font-black uppercase text-on-surface/70 transition hover:border-info/30 hover:text-info">
                    <RefreshCw size={14} /> Atualizar
                </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-outline/12 bg-surface/70 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface/46">Estado geral</div>
                    <div className={`mt-2 text-2xl font-black ${okCount === total && total ? 'text-info' : 'text-orange-500'}`}>
                        {okCount}/{total || 0}
                    </div>
                </div>
                <div className="rounded-2xl border border-outline/12 bg-surface/70 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface/46">WhatsApp ipset</div>
                    <div className="mt-2 text-2xl font-black text-on-surface">{data?.ipsets?.whatsapp?.total ?? '—'}</div>
                </div>
                <div className="rounded-2xl border border-outline/12 bg-surface/70 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface/46">Caixa/gov.br ipset</div>
                    <div className="mt-2 text-2xl font-black text-on-surface">{data?.ipsets?.govbr_caixa?.total ?? '—'}</div>
                </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {services.map((service) => {
                    const vlanOk = (service.https_by_vlan || []).filter((item) => item.ok).length;
                    const vlanTotal = (service.https_by_vlan || []).length;
                    const firstHttps = (service.https_by_vlan || []).find((item) => item.ok) || (service.https_by_vlan || [])[0];
                    return (
                        <div key={service.key} className="rounded-2xl border border-outline/12 bg-surface/70 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-black text-on-surface">{service.label}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${service.status === 'ok' ? 'bg-info/12 text-info' : 'bg-orange-500/12 text-orange-500'}`}>
                                            {service.status === 'ok' ? 'Operacional' : 'Atenção'}
                                        </span>
                                    </div>
                                    <div className="mt-1 truncate font-mono text-[11px] text-on-surface/52">{service.domain}</div>
                                </div>
                                {service.url ? (
                                    <a href={service.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-on-surface/45 transition hover:bg-outline/10 hover:text-info" title="Abrir serviço">
                                        <ExternalLink size={16} />
                                    </a>
                                ) : null}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-xl bg-container/70 p-3">
                                    <div className="text-on-surface/45 font-black uppercase">DNS VLAN</div>
                                    <div className={service.checks?.dns_ok ? 'text-info font-black' : 'text-danger font-black'}>{service.checks?.dns_ok ? 'OK' : 'Falha'}</div>
                                </div>
                                <div className="rounded-xl bg-container/70 p-3">
                                    <div className="text-on-surface/45 font-black uppercase">Bypass ipset</div>
                                    <div className={service.checks?.ipset_ok ? 'text-info font-black' : 'text-danger font-black'}>{service.checks?.ipset_ok ? 'OK' : 'Fora'}</div>
                                </div>
                                <div className="rounded-xl bg-container/70 p-3">
                                    <div className="text-on-surface/45 font-black uppercase">HTTPS</div>
                                    <div className={service.checks?.https_ok ? 'text-info font-black' : 'text-danger font-black'}>
                                        {vlanTotal ? `${vlanOk}/${vlanTotal}` : 'N/A'}
                                    </div>
                                </div>
                                <div className="rounded-xl bg-container/70 p-3">
                                    <div className="text-on-surface/45 font-black uppercase">Tempo</div>
                                    <div className="font-black text-on-surface">{secondsLabel(firstHttps?.total_seconds)}</div>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {(service.ipset_coverage || []).slice(0, 5).map((item) => (
                                    <span key={`${service.key}-${item.ip}`} className={`rounded-lg px-2 py-1 font-mono text-[10px] ${item.in_ipset ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'}`}>
                                        {item.ip}
                                    </span>
                                ))}
                                {(service.ipset_coverage || []).length > 5 ? <span className="rounded-lg bg-outline/10 px-2 py-1 text-[10px] font-bold text-on-surface/50">+{service.ipset_coverage.length - 5}</span> : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- VLAN TAB (CORREÇÃO DE MÉTRICAS E PERSPECTIVA) ---
const VlanTab = () => {
    const [ifaces, setIfaces] = useState([]);
    const [error, setError] = useState('');
    const lastRead = useRef({});
    
    const load = async () => {
        try {
            setError('');
            // Timestamp adicionado para evitar cache de requisição no navegador
            const res = await api.get(`/api/network/vlans-detail?_t=${Date.now()}`);
            
            if (Array.isArray(res.data)) {
                const now = Date.now();
                const calculated = res.data.map(i => {
                    const prev = lastRead.current[i.iface];
                    let rx = 0, tx = 0;
                    
                    if (prev && (now - prev.time) > 0) {
                        // Delta de tempo em segundos
                        const timeDiff = (now - prev.time) / 1000;
                        // Bytes por segundo (evitando valores negativos caso o contador resete)
                        rx = Math.max(0, (i.bytes_recv - prev.bytes_recv) / timeDiff);
                        tx = Math.max(0, (i.bytes_sent - prev.bytes_sent) / timeDiff);
                    }
                    
                    lastRead.current[i.iface] = { bytes_recv: i.bytes_recv, bytes_sent: i.bytes_sent, time: now };
                    return { ...i, rx, tx };
                });
                setIfaces(calculated);
            }
        } catch (e) {
            console.error("Falha ao ler redes", e);
            setError(fetchErrorMessage(e, 'Falha ao ler telemetria de interfaces.'));
        }
    };
    
    useEffect(() => { load(); const i = setInterval(load, 2000); return () => clearInterval(i); }, []);
    
    // Função travada estritamente em Megabits por Segundo (Mbps) com 2 casas decimais
    const fmtMbps = (bytesPerSec) => {
        const megabits = (bytesPerSec * 8) / 1000000;
        return megabits.toFixed(2);
    };
    
    const INTERFACES_CONFIG = [
        { id: 'enp6s0', label: 'ENP6S0 - Rede LAN', defaultIp: '', color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
        { id: 'enp8s0', label: 'ENP8S0 - Rede WAN', defaultIp: '', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
        { id: 'enp6s0.10', label: 'ENP6S0.10 - VLAN 10 (Secretaria)', defaultIp: '192.168.10.1/24', color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
        { id: 'enp6s0.30', label: 'ENP6S0.30 - VLAN 30 (Celulares Colaboradores)', defaultIp: '192.168.30.1/24', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
        { id: 'enp6s0.40', label: 'ENP6S0.40 - VLAN 40 (CFTV)', defaultIp: '192.168.40.1/24', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
        { id: 'enp6s0.50', label: 'ENP6S0.50 - VLAN 50 (SINE)', defaultIp: '192.168.50.1/24', color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
        { id: 'enp6s0.70', label: 'ENP6S0.70 - VLAN 70 (VISITANTES)', defaultIp: '192.168.70.1/24', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
        { id: 'enp6s0.80', label: 'ENP6S0.80 - VLAN 80 (VOiP)', defaultIp: '192.168.80.1/24', color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'border-pink-500/20' }
    ];

    return (
        <div className="space-y-4 pt-4">
            <ErrorBanner message={error} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {INTERFACES_CONFIG.map(conf => {
                const data = ifaces.find(i => i.iface === conf.id || i.iface.startsWith(`${conf.id}@`));
                const ip = data?.ip ? `${data.ip}${conf.defaultIp?.includes('/24') ? '/24' : ''}` : conf.defaultIp || 'Não detectado';
                const rx = data?.rx || 0;
                const tx = data?.tx || 0;
                const isUp = data?.operstate === 'up' || data?.operstate === 'unknown';

                // LÓGICA DE INVERSÃO (A Visão do Usuário)
                const isWan = conf.id === 'enp8s0';
                
                // Para a Internet (WAN): O que chega ao servidor é Download, o que sai é Upload.
                // Para a Rede Local (LAN/VLAN): O que o servidor ENVIA é o Download dos usuários. O que RECEBE é o Upload deles.
                const downloadBps = isWan ? rx : tx;
                const uploadBps = isWan ? tx : rx;

                    return (
                    <div key={conf.id} className={`bg-container p-4 rounded-[24px] border ${conf.border} shadow-sm group hover:shadow-md transition-all`}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${conf.bg} ${conf.color}`}>
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-on-surface text-sm leading-tight">{conf.label}</h3>
                                    <p className="text-[10px] font-mono text-on-surface opacity-60 mt-0.5">{conf.id.toUpperCase()}</p>
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase ${isUp ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'}`}>
                                {isUp ? 'ON' : 'OFF'}
                            </div>
                        </div>
                        <div className="bg-surface p-3 rounded-xl border border-outline/10 mb-4 flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-on-surface opacity-50 block">Endereço IP</span>
                            <span className="font-mono text-on-surface font-bold text-xs">{ip}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-on-surface opacity-50 flex items-center gap-1 mb-1"><ArrowDown size={12} className="text-blue-500"/> Download</span>
                                <div className="text-lg font-black text-on-surface">{fmtMbps(downloadBps)} <span className="text-[10px] opacity-50 font-normal">Mbps</span></div>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase text-on-surface opacity-50 flex items-center gap-1 mb-1"><ArrowUp size={12} className="text-purple-500"/> Upload</span>
                                <div className="text-lg font-black text-on-surface">{fmtMbps(uploadBps)} <span className="text-[10px] opacity-50 font-normal">Mbps</span></div>
                            </div>
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- ACCESS TAB (BLOQUEIOS) ---
const AccessTab = () => {
    const [blockedList, setBlockedList] = useState([]);
    const [scanList, setScanList] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [manualForm, setManualForm] = useState({ type: 'ip', value: '', reason: '' });
    const [error, setError] = useState('');

    const loadBlocked = async () => {
        try {
            setError('');
            const res = await api.get('/api/access');
            setBlockedList(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError(fetchErrorMessage(e, 'Falha ao carregar bloqueios.'));
        }
    };
    useEffect(() => { loadBlocked(); }, []);

    const handleBlock = async (type, value, vendor, reason) => {
        if(!value) return;
        if(confirm(`Bloquear acesso à internet de ${value}?`)) {
            try {
                setError('');
                await api.post('/api/access/block', { type, value, vendor, reason });
                loadBlocked();
                if(scanList.length > 0) setScanList(prev => prev.map(d => (d.ip === value || d.mac === value) ? {...d, is_blocked: true} : d));
            } catch (e) {
                setError(fetchErrorMessage(e, 'Falha ao bloquear alvo.'));
            }
        }
    };

    const handleUnblock = async (id, type, value) => {
        if(confirm(`Desbloquear ${value}?`)) {
            try {
                setError('');
                await api.post('/api/access/unblock', { id, type, value });
                loadBlocked();
                if(scanList.length > 0) setScanList(prev => prev.map(d => (d.ip === value || d.mac === value) ? {...d, is_blocked: false} : d));
            } catch (e) {
                setError(fetchErrorMessage(e, 'Falha ao desbloquear alvo.'));
            }
        }
    };

    const runScan = async () => {
        setIsScanning(true); setScanList([]);
        try {
            setError('');
            const res = await api.get('/api/access/scan');
            setScanList(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError(fetchErrorMessage(e, 'Falha ao escanear rede.'));
        }
        finally { setIsScanning(false); }
    };

    return (
        <div className="space-y-4 pt-4">
            <ErrorBanner message={error} />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="bg-danger/10 border border-danger/20 p-6 rounded-[24px]">
                    <h3 className="text-danger font-semibold mb-4 text-sm flex items-center gap-2"><ShieldAlert size={18}/> Bloqueio manual</h3>
                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <select value={manualForm.type} onChange={e=>setManualForm({...manualForm, type:e.target.value})} className="bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs font-semibold w-24 focus:ring-2 focus:ring-danger">
                                <option value="ip">IP</option>
                                <option value="mac">MAC</option>
                            </select>
                            <input value={manualForm.value} onChange={e=>setManualForm({...manualForm, value:e.target.value})} placeholder={manualForm.type === 'ip' ? "Ex: 192.168.10.55" : "Ex: AA:BB:CC:DD:EE:FF"} className="flex-1 bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs font-mono focus:ring-2 focus:ring-danger"/>
                        </div>
                        <div className="flex gap-4">
                            <input value={manualForm.reason} onChange={e=>setManualForm({...manualForm, reason:e.target.value})} placeholder="Motivo (Opcional)" className="flex-1 bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs focus:ring-2 focus:ring-danger"/>
                            <button onClick={() => handleBlock(manualForm.type, manualForm.value, 'Manual', manualForm.reason)} className="bg-danger hover:opacity-90 text-white px-6 rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-md">Bloquear</button>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h4 className="text-on-surface/72 font-semibold text-sm pl-2">Alvos bloqueados ({blockedList.length})</h4>
                    {blockedList.length === 0 && <p className="text-on-surface opacity-50 text-center text-xs py-4 bg-container rounded-2xl border border-outline/10">Nenhum dispositivo bloqueado.</p>}
                    {blockedList.map(item => (
                        <div key={item.id} className="bg-container border border-outline/20 p-4 rounded-2xl flex justify-between items-center group hover:border-danger/50 transition-all shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="bg-danger/10 p-3 rounded-xl text-danger"><Ban size={20}/></div>
                                <div>
                                    <span className="text-on-surface font-bold block text-sm font-mono">{item.target_value}</span>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[10px] bg-surface px-2 py-0.5 rounded text-on-surface/68 font-semibold border border-outline/10">{item.target_type}</span>
                                        <span className="text-[10px] text-on-surface opacity-50">{item.vendor}</span>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleUnblock(item.id, item.target_type, item.target_value)} className="opacity-0 group-hover:opacity-100 flex items-center gap-2 bg-info/20 hover:bg-info text-info hover:text-white px-4 py-2 rounded-xl transition-all">
                                <Check size={14}/> <span className="text-[11px] font-semibold">Liberar</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-container border border-outline/20 p-6 rounded-[24px] flex flex-col h-full min-h-[500px] shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-primary font-semibold text-sm flex items-center gap-2"><Activity size={18}/> Radar de rede</h3>
                    {isScanning && <span className="text-sm text-primary animate-pulse">Varredura em andamento...</span>}
                </div>
                
                <div className="flex justify-center mb-8">
                    <button onClick={runScan} disabled={isScanning} className={`relative group w-24 h-24 rounded-full flex items-center justify-center transition-all ${isScanning ? 'bg-primary/20' : 'bg-primary hover:opacity-90 shadow-lg active:scale-95'}`}>
                        {isScanning ? (
                            <><div className="absolute inset-0 border-4 border-primary/30 rounded-full animate-ping"></div><Search size={32} className="text-primary animate-spin"/></>
                        ) : (<Search size={32} className="text-on-primary"/>)}
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {scanList.length === 0 && !isScanning && (
                        <div className="text-center text-on-surface opacity-50 mt-10">
                            <Monitor size={48} className="mx-auto mb-4 opacity-40"/>
                            <p className="text-sm font-semibold">Nenhum dispositivo detectado</p>
                            <p className="text-[10px]">Inicie o scan para encontrar alvos</p>
                        </div>
                    )}
                    {scanList.map((dev, idx) => (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }} key={dev.mac + idx} className={`p-3 rounded-xl border flex justify-between items-center group transition-colors ${dev.is_blocked ? 'bg-danger/5 border-danger/30 opacity-70' : 'bg-surface border-outline/10 hover:border-primary/50'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${dev.is_blocked ? 'bg-danger' : 'bg-info shadow-[0_0_8px_rgba(var(--color-info),0.45)]'}`}/>
                                <div>
                                    <p className="text-on-surface font-mono text-xs font-bold">{dev.ip}</p>
                                    <p className="text-[10px] text-on-surface opacity-50 font-mono">{dev.mac}</p>
                                    <p className="text-[11px] text-primary font-semibold truncate max-w-[150px]">{dev.vendor || 'Desconhecido'}</p>
                                </div>
                            </div>
                            {!dev.is_blocked ? (
                                <button onClick={() => handleBlock('mac', dev.mac, dev.vendor, 'Scan Block')} className="opacity-0 group-hover:opacity-100 bg-danger/10 hover:bg-danger text-danger hover:text-white p-2 rounded-lg transition-all" title="Bloquear Dispositivo"><Ban size={16}/></button>
                            ) : (
                                <button onClick={() => handleUnblock(null, 'mac', dev.mac)} className="bg-surface border border-outline/10 text-danger p-2 rounded-lg cursor-not-allowed" title="Já Bloqueado"><Lock size={16}/></button>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
            </div>
        </div>
    );
};

// --- CONNECTIVITY TAB ---
const ConnectivityTab = () => {
    const [data, setData] = useState({ vpn: [], storage: [], status: { vpn: false, storage: false } });
    const [vpnName, setVpnName] = useState('');
    const [storageForm, setStorageForm] = useState({ username: '', password: '', path: '/mnt/dados', has_smb: false });
    const [error, setError] = useState('');

    const load = async () => {
        try {
            setError('');
            const res = await api.get('/api/connectivity/list');
            setData(res.data);
        } catch (e) {
            setError(fetchErrorMessage(e, 'Falha ao carregar conectividade.'));
        }
    };
    useEffect(() => { load(); const i = setInterval(load, 2000); return () => clearInterval(i); }, []);

    const createVpn = async () => {
        if(!vpnName) return;
        try {
            setError('');
            const res = await api.post('/api/connectivity/vpn/create', { name: vpnName });
            if(res.data.success) { downloadString(res.data.config, `vpn-${vpnName}.conf`); setVpnName(''); load(); }
        } catch (e) {
            setError(fetchErrorMessage(e, 'Falha ao gerar credencial VPN.'));
        }
    };
    const downloadVpn = async (id) => {
        try {
            setError('');
            const res = await api.post('/api/connectivity/vpn/download', { id });
            if (res.data.success) downloadString(res.data.config, res.data.filename);
        } catch (e) {
            setError(fetchErrorMessage(e, 'Falha ao baixar credencial VPN.'));
        }
    };
    const deleteVpn = async (id) => {
        if(confirm("Revogar certificado?")) {
            try {
                setError('');
                await api.post('/api/connectivity/vpn/delete', { id });
                load();
            } catch (e) {
                setError(fetchErrorMessage(e, 'Falha ao revogar credencial VPN.'));
            }
        }
    };

    const createStorage = async () => {
        if(!storageForm.username) return;
        try {
            setError('');
            await api.post('/api/connectivity/storage/create', storageForm);
            setStorageForm({...storageForm, username:'', password: ''}); load();
        } catch (e) {
            setError(fetchErrorMessage(e, 'Falha ao criar usuário de storage.'));
        }
    };
    const deleteStorage = async (id, u) => {
        if(confirm("Remover usuário?")) {
            try {
                setError('');
                await api.post('/api/connectivity/storage/delete', { id, username: u });
                load();
            } catch (e) {
                setError(fetchErrorMessage(e, 'Falha ao remover usuário de storage.'));
            }
        }
    };

    const downloadString = (text, filename) => {
        const element = document.createElement("a");
        const file = new Blob([text], {type: 'text/plain'});
        element.href = URL.createObjectURL(file);
        element.download = filename; document.body.appendChild(element); element.click();
    };

    return (
        <div className="space-y-4 pt-4">
            <ErrorBanner message={error} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-on-surface flex items-center gap-2"><Globe className="text-purple-500"/> Acesso remoto institucional</h3>
                    <span className={`px-2 py-1 rounded text-[11px] font-semibold ${data.status.vpn ? 'bg-info/20 text-info' : 'bg-danger/20 text-danger'}`}>{data.status.vpn ? 'Disponível' : 'Indisponível'}</span>
                </div>
                <div className="bg-container border border-outline/20 p-6 rounded-[24px]">
                    <div className="flex gap-2">
                        <input value={vpnName} onChange={e=>setVpnName(e.target.value)} placeholder="Nome do Cliente" className="flex-1 bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs focus:ring-2 focus:ring-purple-500"/>
                        <button onClick={createVpn} className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-xl font-semibold text-sm transition-all active:scale-95">Gerar credencial</button>
                    </div>
                </div>
                <div className="space-y-3">
                    {data.vpn.map(p=>(
                        <div key={p.id} className="bg-container border border-outline/20 p-4 rounded-2xl flex justify-between items-center group relative overflow-hidden transition-all hover:border-purple-500/50 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${p.is_active?'bg-info/20 text-info':'bg-surface text-on-surface opacity-50'}`}><Wifi size={18}/></div>
                                <div><span className="text-on-surface font-bold block text-sm">{p.name}</span><span className="text-on-surface opacity-50 text-[10px] font-mono">{p.ip}</span></div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={()=>downloadVpn(p.id)} className="p-2 bg-surface text-primary rounded-lg hover:bg-primary hover:text-on-primary transition-colors border border-outline/10"><Download size={16}/></button>
                                <button onClick={()=>deleteVpn(p.id)} className="p-2 bg-surface text-danger rounded-lg hover:bg-danger hover:text-white transition-colors border border-outline/10"><Trash2 size={16}/></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black text-on-surface flex items-center gap-2"><Database className="text-orange-500"/> Acesso a arquivos institucionais</h3>
                    <span className={`px-2 py-1 rounded text-[11px] font-semibold ${data.status.storage ? 'bg-info/20 text-info' : 'bg-danger/20 text-danger'}`}>{data.status.storage ? 'Disponível' : 'Indisponível'}</span>
                </div>
                <div className="bg-container border border-outline/20 p-6 rounded-[24px] space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input value={storageForm.username} onChange={e=>setStorageForm({...storageForm, username:e.target.value})} placeholder="Usuário" className="w-full bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs focus:ring-2 focus:ring-orange-500"/>
                        <input type="password" value={storageForm.password} onChange={e=>setStorageForm({...storageForm, password:e.target.value})} placeholder="Senha" className="w-full bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs focus:ring-2 focus:ring-orange-500"/>
                    </div>
                    <input value={storageForm.path} onChange={e=>setStorageForm({...storageForm, path:e.target.value})} placeholder="Caminho (ex: /mnt/dados)" className="w-full bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs font-mono focus:ring-2 focus:ring-orange-500"/>
                    <div onClick={() => setStorageForm({...storageForm, has_smb: !storageForm.has_smb})} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-lg hover:bg-outline/5 transition-colors">
                        {storageForm.has_smb ? <CheckCircle size={18} className="text-orange-500"/> : <div className="w-[18px] h-[18px] border border-outline/40 rounded"/>}
                        <span className="text-sm text-on-surface/72 font-semibold">Habilitar compatibilidade SMB (Windows)</span>
                    </div>
                    <button onClick={createStorage} className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-md">Criar usuário</button>
                </div>
                <div className="space-y-3">
                    {data.storage.map(u=>(
                        <div key={u.id} className="bg-container border border-outline/20 p-4 rounded-2xl flex justify-between items-center group shadow-sm hover:border-orange-500/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="bg-surface p-2 rounded-lg text-orange-500 border border-outline/10"><Folder size={18}/></div>
                                <div>
                                    <span className="text-on-surface font-bold block text-sm">{u.username}</span>
                                    <div className="flex gap-2 items-center">
                                        <span className="text-on-surface opacity-50 text-[10px] font-mono">{u.path}</span>
                                        {u.has_smb && <span className="bg-blue-500/10 text-blue-500 text-[9px] px-1.5 py-0.5 rounded font-bold border border-blue-500/20">SMB</span>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={()=>deleteStorage(u.id, u.username)} className="p-2 text-on-surface opacity-40 hover:opacity-100 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"><Trash2 size={16}/></button>
                        </div>
                    ))}
                </div>
            </div>
            </div>
        </div>
    );
};

// --- DNS TAB ---
const DnsTab = () => {
    const DEFAULT_VLANS = [
        { id: 'vlan10', vlan: 'VLAN10', name: 'VLAN 10 (Secretaria)', ip: '192.168.10.1/24', queries: 0, blocked_queries: 0, unique_ips: 0 },
        { id: 'vlan30', vlan: 'VLAN30', name: 'VLAN 30 (Celulares)', ip: '192.168.30.1/24', queries: 0, blocked_queries: 0, unique_ips: 0 },
        { id: 'vlan40', vlan: 'VLAN40', name: 'VLAN 40 (CFTV)', ip: '192.168.40.1/24', queries: 0, blocked_queries: 0, unique_ips: 0 },
        { id: 'vlan50', vlan: 'VLAN50', name: 'VLAN 50 (SINE)', ip: '192.168.50.1/24', queries: 0, blocked_queries: 0, unique_ips: 0 },
        { id: 'vlan70', vlan: 'VLAN70', name: 'VLAN 70 (Visitantes)', ip: '192.168.70.1/24', queries: 0, blocked_queries: 0, unique_ips: 0 },
        { id: 'vlan80', vlan: 'VLAN80', name: 'VLAN 80 (VOiP)', ip: '192.168.80.1/24', queries: 0, blocked_queries: 0, unique_ips: 0 }
    ];

    const [stats, setStats] = useState({ is_running: null, is_resolving: null, stats: { total_queries: 0, cache_hits: 0, avg_latency: 0 } });
    const [breakdown, setBreakdown] = useState(DEFAULT_VLANS);
    const [zones, setZones] = useState([]);
    const [criticalServices, setCriticalServices] = useState(null);
    const [form, setForm] = useState({ domain: '', ip: '', type: 'FWD' });
    const [verifyStatus, setVerifyStatus] = useState({});
    const [error, setError] = useState('');

    const normalizeDnsStats = (payload = {}) => {
        const next = payload && typeof payload === 'object' ? payload : {};
        const hasRunning = typeof next.is_running === 'boolean';
        const hasResolving = typeof next.is_resolving === 'boolean';

        return {
            ...next,
            is_running: hasRunning ? next.is_running : null,
            is_resolving: hasResolving ? next.is_resolving : (hasRunning && next.is_running ? false : null),
            stats: {
                total_queries: next.stats?.total_queries || 0,
                cache_hits: next.stats?.cache_hits || 0,
                avg_latency: next.stats?.avg_latency || 0,
            },
        };
    };

    const load = () => {
        setError('');
        const failures = [];
        api.get('/api/dns/stats').then(s => {
            if (s.data) setStats((current) => ({ ...current, ...normalizeDnsStats(s.data) }));
        }).catch((e)=>{
            failures.push(fetchErrorMessage(e, 'estatísticas DNS'));
            setError(`Falha parcial em: ${failures.join(', ')}.`);
        });
        
        api.get('/api/dns/vlan-summary').then(b => {
            if(b.data && Array.isArray(b.data) && b.data.length > 0) {
                setBreakdown(b.data);
            }
        }).catch((e)=>{
            failures.push(fetchErrorMessage(e, 'quadro por VLAN do DNS'));
            setError(`Falha parcial em: ${failures.join(', ')}.`);
        });
        
        api.get('/api/dns/zones').then(z => {
            if(z.data && Array.isArray(z.data)) setZones(z.data);
        }).catch((e)=>{
            failures.push(fetchErrorMessage(e, 'zonas DNS'));
            setError(`Falha parcial em: ${failures.join(', ')}.`);
        });

    };

    const loadCriticalServices = () => {
        api.get('/api/bloqueios-liberacoes/critical-services').then((res) => {
            if (res.data) setCriticalServices(res.data);
        }).catch((e) => {
            setError(fetchErrorMessage(e, 'Falha ao carregar serviços críticos.'));
        });
    };
    
    useEffect(() => { load(); const i = setInterval(load, 2000); return () => clearInterval(i); }, []);
    useEffect(() => { loadCriticalServices(); const i = setInterval(loadCriticalServices, 30000); return () => clearInterval(i); }, []);
    
    const vlanTotalQueries = breakdown.reduce((sum, item) => sum + (item.queries || 0), 0);
    const dnsStatusLabel = stats.is_resolving === true
        ? 'RESOLVENDO'
        : stats.is_running === true
            ? 'DEGRADADO'
            : stats.is_running === false
                ? 'PARADO'
                : 'VERIFICANDO';
    const dnsStatusTone = stats.is_resolving === true
        ? 'bg-info/10 text-info'
        : stats.is_running === true
            ? 'bg-orange-500/10 text-orange-500'
            : stats.is_running === false
                ? 'bg-danger/10 text-danger'
                : 'bg-outline/10 text-on-surface/60';
    const dnsStatusTextTone = stats.is_resolving === true
        ? 'text-info'
        : stats.is_running === true
            ? 'text-orange-500'
            : stats.is_running === false
                ? 'text-danger'
                : 'text-on-surface/60';

    const add = async () => { 
        if(!form.domain || !form.ip) return alert("Preencha todos os campos."); 
        try {
            setError('');
            await api.post('/api/dns/zones/add', form);
            setForm({ domain: '', ip: '', type: 'FWD' });
            load();
            alert("Regra Aplicada!");
        } catch(e) {
            const message = fetchErrorMessage(e, 'Falha ao salvar regra DNS.');
            setError(message);
            alert(`FALHA: ${message}`);
        }
    };
    const del = async (id) => {
        if(confirm("Remover regra?")) {
            try {
                setError('');
                await api.post('/api/dns/zones/delete', { id });
                load();
            } catch (e) {
                setError(fetchErrorMessage(e, 'Falha ao remover regra DNS.'));
            }
        }
    };
    const flushCache = async () => {
        if(confirm("Limpar cache?")) {
            try {
                setError('');
                await api.post('/api/dns/cache/flush');
                load();
            } catch (e) {
                setError(fetchErrorMessage(e, 'Falha ao limpar cache DNS.'));
            }
        }
    };
    const verifyZone = async (z) => { 
        setVerifyStatus(p => ({ ...p, [z.id]: 'loading' })); 
        try {
            setError('');
            const res = await api.post('/api/dns/zones/verify', { domain: z.domain, target_ip: z.target_ip, type: z.type });
            setVerifyStatus(p => ({ ...p, [z.id]: res.data.match ? 'ok' : 'error', resolved: res.data.resolved_to }));
        } catch(e) {
            setVerifyStatus(p => ({ ...p, [z.id]: 'error' }));
            setError(fetchErrorMessage(e, 'Falha ao verificar zona DNS.'));
        }
    };

    return (
        <div className="space-y-8 pt-4">
            <ErrorBanner message={error} />
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-container border border-outline/20 p-5 rounded-[24px] flex items-center gap-4 shadow-sm"><div className={`p-3 rounded-xl ${dnsStatusTone}`}><Server size={24}/></div><div><h3 className="text-on-surface opacity-50 font-bold uppercase text-[10px]">DNS Institucional</h3><p className={`text-lg font-black ${dnsStatusTextTone}`}>{dnsStatusLabel}</p></div></div>
                <div className="bg-container border border-outline/20 p-5 rounded-[24px] flex items-center gap-4 shadow-sm"><div className="p-3 rounded-xl bg-orange-500/10 text-orange-500"><Zap size={24}/></div><div><h3 className="text-on-surface opacity-50 font-bold uppercase text-[10px]">Latência</h3><p className="text-xl font-black text-orange-500">{stats.stats?.avg_latency || 0} <span className="text-xs text-on-surface opacity-40">ms</span></p></div></div>
                <div className="bg-container border border-outline/20 p-5 rounded-[24px] flex items-center gap-4 shadow-sm"><div className="p-3 rounded-xl bg-primary/10 text-primary"><Activity size={24}/></div><div><h3 className="text-on-surface opacity-50 font-bold uppercase text-[10px]">Consultas (Recentes)</h3><p className="text-xl font-black text-primary">{vlanTotalQueries.toLocaleString()}</p></div></div>
                <button onClick={flushCache} className="bg-danger/10 border border-danger/20 p-5 rounded-[24px] flex items-center justify-between hover:bg-danger/20 transition-all group active:scale-95 shadow-sm"><div className="flex items-center gap-4"><div className="p-3 rounded-xl bg-danger/20 text-danger group-hover:scale-110 transition-transform"><Trash2 size={24}/></div><div className="text-left"><h3 className="text-danger font-bold uppercase text-[10px]">Manutenção</h3><p className="text-lg font-black text-danger">Limpar Cache</p></div></div></button>
            </div>

            <CriticalServicesPanel data={criticalServices} onRefresh={() => { load(); loadCriticalServices(); }} />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-on-surface opacity-60 font-bold uppercase text-xs pl-2">Redes Monitoradas</h3>
                    <div className="bg-container border border-outline/20 rounded-[24px] p-2 shadow-sm">
                        {breakdown.map(v => (
                            <div key={v.id} className="p-3 border-b border-outline/10 last:border-0 flex justify-between items-center group hover:bg-outline/5 rounded-xl transition-colors">
                                <div>
                                    <span className="text-on-surface font-bold text-sm block">{v.name}</span>
                                    <span className="text-[10px] text-on-surface opacity-50 font-mono">{v.ip}</span>
                                </div>
                                <div className="text-right">
                                    <span className="block text-sm font-black text-primary">{(v.queries || 0).toLocaleString()} <span className="text-[9px] text-on-surface opacity-40 font-normal">reqs</span></span>
                                    <span className="block text-[10px] text-on-surface opacity-55">
                                        {(v.unique_ips || 0).toLocaleString()} IPs · {(v.blocked_queries || 0).toLocaleString()} bloqueios
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-[24px] shadow-sm">
                        <h3 className="text-indigo-500 font-bold uppercase mb-4 text-sm flex items-center gap-2"><Globe size={16}/> Configurar Exceção DNS</h3>
                        <div className="flex flex-col md:flex-row gap-3 mb-2">
                            <select value={form.type} onChange={e=>setForm({...form, type:e.target.value})} className="bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs uppercase font-black tracking-wider focus:ring-2 focus:ring-indigo-500">
                                <option value="FWD">BYPASS (FORWARD)</option>
                                <option value="A">REDIRECT (HOST)</option>
                            </select>
                            <input value={form.domain} onChange={e=>setForm({...form, domain:e.target.value})} placeholder="Domínio (ex: gov.br)" className="flex-1 bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs font-bold focus:ring-2 focus:ring-indigo-500"/>
                            <input value={form.ip} onChange={e=>setForm({...form, ip:e.target.value})} placeholder="DNS ou IP Alvo" className="w-full md:w-40 bg-surface border border-outline/20 p-3 rounded-xl text-on-surface outline-none text-xs font-mono focus:ring-2 focus:ring-indigo-500"/>
                            <button onClick={add} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-black uppercase text-xs transition-all shadow-md active:scale-95">SALVAR</button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-2">
                            <h4 className="text-on-surface opacity-60 font-bold uppercase text-xs">Regras de Exceção Ativas</h4>
                            <span className="text-[10px] text-on-surface opacity-50 font-bold uppercase">Total: {zones.length}</span>
                        </div>
                        
                        {zones.map(z => {
                            const isFwd = z.type === 'FWD' || !z.type;
                            return (
                                <div key={z.id} className="bg-container border border-outline/20 p-4 rounded-2xl flex justify-between items-center group relative overflow-hidden hover:border-outline/40 transition-all shadow-sm">
                                    <div className="flex items-center gap-5">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isFwd ? 'bg-cyan-500/10 text-cyan-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                            {isFwd ? <CornerDownRight size={20} /> : <Target size={20} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-on-surface font-black text-sm block">{z.domain}</span>
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${isFwd ? 'bg-cyan-500/20 text-cyan-500' : 'bg-amber-500/20 text-amber-500'}`}>
                                                    {isFwd ? 'BYPASS' : 'REDIRECT'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-on-surface opacity-50 text-[10px] font-mono flex items-center gap-1">
                                                    {isFwd ? 'Forward para' : 'Aponte para'} ➜ <span className="text-on-surface font-bold opacity-100">{z.target_ip}</span>
                                                </span>
                                                {verifyStatus[z.id] === 'ok' && <span className="text-[9px] bg-info/10 text-info border border-info/20 px-1.5 py-0.5 rounded flex items-center gap-1"><CheckCircle size={10}/> ATIVA</span>}
                                                {verifyStatus[z.id] === 'error' && <span className="text-[9px] bg-danger/10 text-danger border border-danger/20 px-1.5 py-0.5 rounded flex items-center gap-1"><XCircle size={10}/> OFF</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => verifyZone(z)} title="Testar Resolução" className="text-on-surface opacity-40 hover:opacity-100 hover:text-primary p-2 rounded-lg hover:bg-primary/10 transition-all">
                                            <RefreshCw size={16} className={verifyStatus[z.id] === 'loading' ? 'animate-spin' : ''}/>
                                        </button>
                                        <button onClick={()=>del(z.id)} title="Excluir" className="text-on-surface opacity-40 hover:opacity-100 hover:text-danger p-2 rounded-lg hover:bg-danger/10 transition-all">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
// --- TAB MAIN ---
export default function NetworkPage() {
    const [activeTab, setActiveTab] = useState('connect');
    const tabs = [
        { id: 'connect', label: 'Conectividade', icon: Globe, color: 'text-purple-500' },
        { id: 'link', label: 'Link Nicknetwork', icon: ShieldAlert, color: 'text-red-500' },
        { id: 'vlans', label: 'Escopos VLAN', icon: Activity, color: 'text-blue-500' },
        { id: 'qos', label: 'QoS', icon: Gauge, color: 'text-yellow-500' },
        { id: 'dns', label: 'DNS Institucional', icon: Server, color: 'text-info' },
        { id: 'scheduler', label: 'Horários', icon: Clock, color: 'text-blue-500' },
        { id: 'access', label: 'Controle de Acesso', icon: Lock, color: 'text-red-500' }
    ];
    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
            <ModuleHeader
                eyebrow="Controle"
                title="Controle de Rede"
                description="Conectividade, VLANs, QoS, DNS e controle de acesso sob uma mesma leitura institucional. Este módulo concentra execução operacional da rede sem perder clareza para supervisão administrativa."
                badges={(
                    <>
                        <StatusChip label="Infraestrutura ativa" tone="success" />
                        <StatusChip label="Operação contínua" tone="primary" />
                        <StatusChip label="Rede, DNS e acesso" tone="neutral" />
                    </>
                )}
            />

            <SegmentedTabs
                tabs={tabs.map((tab) => ({ key: tab.id, label: tab.label, icon: tab.icon }))}
                value={activeTab}
                onChange={setActiveTab}
                className="custom-scrollbar"
            />
            <div className="min-h-[500px]">
                <AnimatePresence mode="wait">
                    {activeTab === 'connect' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="connect"><ConnectivityTab/></motion.div>}
                    {activeTab === 'link' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="link"><DowntimeLog/></motion.div>}
                    {activeTab === 'vlans' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="vlans"><VlanTab/></motion.div>}
                    {activeTab === 'qos' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="qos"><QosLimiter/></motion.div>}
                    {activeTab === 'dns' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="dns"><DnsTab/></motion.div>}
                    {activeTab === 'scheduler' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="scheduler"><VlanManagerMD3/></motion.div>}
                    {activeTab === 'access' && <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0}} key="access"><AccessTab/></motion.div>}
                </AnimatePresence>
            </div>
        </div>
    );
}
