import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, Server, Activity, Globe, Trash2, Terminal, Radar, Ban, Mail, X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';

const defaultSmtpForm = {
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: 'Becker Sentinel',
    to_email: '',
    use_tls: true,
    use_ssl: false,
    requires_auth: true,
    is_active: true,
    has_password: false,
};

function ToggleField({ label, checked, onChange, hint }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${checked ? 'border-primary/40 bg-primary/10 text-on-surface' : 'border-outline/20 bg-surface text-on-surface opacity-80'}`}
        >
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold tracking-tight">{label}</p>
                    {hint && <p className="mt-1 text-[10px] opacity-60">{hint}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-tight ${checked ? 'bg-info/20 text-info' : 'bg-outline/10 text-on-surface opacity-60'}`}>
                    {checked ? 'Ativo' : 'Inativo'}
                </span>
            </div>
        </button>
    );
}

function SmtpModal({ open, onClose }) {
    const [form, setForm] = useState(defaultSmtpForm);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    const updateForm = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const loadConfig = async () => {
        setLoading(true);
        setStatus(null);
        try {
            const res = await api.get('/api/security/smtp');
            setForm({ ...defaultSmtpForm, ...res.data });
        } catch (error) {
            setStatus({ type: 'error', message: error?.response?.data?.error || 'Falha ao carregar configuracao SMTP.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) loadConfig();
    }, [open]);

    if (!open) return null;

    const normalizedPayload = {
        host: form.host.trim(),
        port: Number(form.port || 587),
        username: form.username.trim(),
        password: form.password,
        from_email: form.from_email.trim(),
        from_name: form.from_name.trim(),
        to_email: form.to_email.trim(),
        use_tls: !!form.use_tls,
        use_ssl: !!form.use_ssl,
        requires_auth: !!form.requires_auth,
        is_active: !!form.is_active,
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus(null);
        try {
            const res = await api.post('/api/security/smtp', normalizedPayload);
            setForm((current) => ({ ...current, ...res.data.config, password: '', has_password: res.data.config?.has_password ?? current.has_password }));
            setStatus({ type: 'success', message: 'Configuracao SMTP salva com sucesso.' });
        } catch (error) {
            setStatus({ type: 'error', message: error?.response?.data?.error || 'Falha ao salvar configuracao SMTP.' });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setStatus(null);
        try {
            const res = await api.post('/api/security/smtp/test', normalizedPayload);
            setStatus({ type: 'success', message: res.data?.message || 'Teste SMTP enviado com sucesso.' });
        } catch (error) {
            setStatus({ type: 'error', message: error?.response?.data?.error || 'Falha ao testar envio SMTP.' });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-outline/20 bg-container p-6 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <div className="mb-3 inline-flex rounded-2xl bg-primary/10 p-3 text-primary">
                            <Mail size={24} />
                        </div>
                        <h3 className="text-2xl font-black text-on-surface">Notificações institucionais</h3>
                        <p className="mt-2 text-sm text-on-surface/68">
                            Administração do envio de alertas por correio eletrônico.
                        </p>
                    </div>
                    <button onClick={onClose} className="rounded-full bg-surface p-3 text-on-surface opacity-70 transition-all hover:opacity-100">
                        <X size={20} />
                    </button>
                </div>

                {status && (
                    <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${status.type === 'success' ? 'border-info/30 bg-info/10 text-info' : 'border-danger/30 bg-danger/10 text-danger'}`}>
                        {status.message}
                    </div>
                )}

                {loading ? (
                    <div className="flex min-h-[240px] items-center justify-center gap-3 text-primary">
                        <Activity className="animate-spin" size={20} />
                        <span className="font-semibold text-sm">Carregando configuração...</span>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <div className="space-y-4 rounded-[28px] border border-outline/20 bg-surface p-5">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase text-on-surface opacity-60">SMTP Host</span>
                                        <input value={form.host} onChange={(e) => updateForm('host', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase text-on-surface opacity-60">Porta</span>
                                        <input type="number" value={form.port} onChange={(e) => updateForm('port', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                </div>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-black uppercase text-on-surface opacity-60">Usuario SMTP</span>
                                    <input value={form.username} onChange={(e) => updateForm('username', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-black uppercase text-on-surface opacity-60">Senha</span>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.password}
                                            onChange={(e) => updateForm('password', e.target.value)}
                                            placeholder={form.has_password ? 'Senha atual mantida em branco' : 'Informe a senha SMTP'}
                                            className="w-full rounded-xl border border-outline/20 bg-container p-3 pr-12 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                                        />
                                        <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface opacity-60 hover:opacity-100">
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </label>

                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase text-on-surface opacity-60">From E-mail</span>
                                        <input value={form.from_email} onChange={(e) => updateForm('from_email', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-black uppercase text-on-surface opacity-60">From Name</span>
                                        <input value={form.from_name} onChange={(e) => updateForm('from_name', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                </div>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-black uppercase text-on-surface opacity-60">E-mail de teste / destino padrrao</span>
                                    <input value={form.to_email} onChange={(e) => updateForm('to_email', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                </label>
                            </div>

                            <div className="space-y-4 rounded-[28px] border border-outline/20 bg-surface p-5">
                                <ToggleField label="TLS" checked={form.use_tls} onChange={(value) => updateForm('use_tls', value)} hint="STARTTLS e negociacao segura." />
                                <ToggleField label="SSL Direto" checked={form.use_ssl} onChange={(value) => updateForm('use_ssl', value)} hint="Use para portas como 465." />
                                <ToggleField label="Exigir Autenticacao" checked={form.requires_auth} onChange={(value) => updateForm('requires_auth', value)} hint="Anexa usuario e senha no transporte." />
                                <ToggleField label="Servico Ativo" checked={form.is_active} onChange={(value) => updateForm('is_active', value)} hint="Sentinela so envia alertas quando ativo." />

                                <div className="rounded-[24px] border border-outline/20 bg-container p-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface opacity-50">Resumo operacional</p>
                                    <div className="mt-3 space-y-2 text-xs text-on-surface opacity-80">
                                        <p>Host: <span className="font-mono">{form.host || 'nao definido'}</span></p>
                                        <p>Destino: <span className="font-mono">{form.to_email || form.username || 'nao definido'}</span></p>
                                        <p>Credencial atual: <span className="font-mono">{form.password ? 'nova senha informada' : (form.has_password ? 'senha salva mascarada' : 'sem senha')}</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button onClick={loadConfig} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-outline/20 bg-surface px-5 py-3 text-xs font-black uppercase text-on-surface transition-all hover:border-primary/40">
                                <RefreshCw size={16} />
                                Recarregar
                            </button>
                            <button onClick={handleTest} disabled={testing || saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 text-xs font-black uppercase text-white transition-all hover:bg-blue-400 disabled:opacity-60">
                                {testing ? <Activity className="animate-spin" size={16} /> : <Mail size={16} />}
                                Testar envio
                            </button>
                            <button onClick={handleSave} disabled={saving || testing} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-xs font-black uppercase text-on-primary transition-all hover:opacity-90 disabled:opacity-60">
                                {saving ? <Activity className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                Salvar configuracao
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function Security() {
    const [data, setData] = useState({
        ufw: { active: false, rules: [] },
        fail2ban: { active: false, currently_banned: 0, total_banned: 0, banned_ips: [] },
        public_ips: [],
        sentinel_metrics: { top_ports: [], top_ips: [] }
    });
    const [loading, setLoading] = useState(false);
    const [banIp, setBanIp] = useState('');
    const [smtpModalOpen, setSmtpModalOpen] = useState(false);

    const load = async () => {
        try {
            const res = await api.get('/api/security/dashboard');
            setData(res.data);
        } catch {}
    };

    useEffect(() => {
        load();
        const i = setInterval(load, 5000);
        return () => clearInterval(i);
    }, []);

    const handleBlindagem = async () => {
        if (!confirm('Isso aplicara as regras: SSH Ext (18122), SSH Int (22) restrito a LAN/VPN e fechara a 22 na WAN. Confirmar?')) return;
        setLoading(true);
        try {
            await api.post('/api/security/setup-cockpit');
            alert('Blindagem V8 aplicada com sucesso.');
            load();
        } catch {
            alert('Erro ao aplicar blindagem.');
        }
        setLoading(false);
    };

    const handleUnban = async (ip) => {
        if (!confirm(`Perdoar e remover banimento de ${ip}?`)) return;
        try {
            await api.post('/api/security/f2b/unban', { ip });
            load();
        } catch {}
    };

    const handleBan = async () => {
        if (!banIp) return;
        try {
            await api.post('/api/security/f2b/ban', { ip: banIp });
            setBanIp('');
            load();
        } catch {}
    };

    const handleBanSpecific = async (ip) => {
        if (!confirm(`Bloquear imediatamente o IP hostil ${ip}?`)) return;
        try {
            await api.post('/api/security/f2b/ban', { ip });
            load();
        } catch {}
    };

    const deleteRule = async (id) => {
        if (!confirm(`Excluir regra UFW [${id}]?`)) return;
        try {
            await api.post('/api/security/ufw/delete', { id });
            load();
        } catch {}
    };

    return (
        <>
            <div className="space-y-8 pb-20 animate-in fade-in duration-500">
                <ModuleHeader
                    eyebrow="Controle"
                    title="Segurança Operacional"
                    description="Firewall, fail2ban, resposta rápida, sentinela de ataque e trilha de regras ativas em uma linguagem mais adequada à gestão institucional do ambiente."
                    badges={(
                        <>
                            <StatusChip label="Enforcement local" tone="primary" />
                            <StatusChip label="Resposta imediata" tone="warning" />
                            <StatusChip label="Firewall e banimento" tone="neutral" />
                        </>
                    )}
                    actions={(
                        <>
                            <ActionButton tone="ghost" icon={Mail} onClick={() => setSmtpModalOpen(true)}>
                                SMTP institucional
                            </ActionButton>
                            <ActionButton tone="primary" icon={loading ? Activity : ShieldCheck} onClick={handleBlindagem} disabled={loading}>
                                {loading ? 'Aplicando blindagem...' : 'Aplicar blindagem'}
                            </ActionButton>
                        </>
                    )}
                />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="space-y-6">
                        <Surface className="flex items-center justify-between p-6">
                            <div>
                                <p className="text-[10px] font-bold uppercase opacity-60 text-on-surface">Firewall UFW</p>
                                <h3 className={`text-xl font-black ${data.ufw.active ? 'text-info' : 'text-danger'}`}>{data.ufw.active ? 'Ativo e blindado' : 'Requer atenção'}</h3>
                            </div>
                            <div className={`rounded-2xl p-4 ${data.ufw.active ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'}`}>
                                {data.ufw.active ? <Shield size={28} /> : <ShieldAlert size={28} />}
                            </div>
                        </Surface>

                        <Surface className="flex items-center justify-between p-6">
                            <div>
                                <p className="text-[10px] font-bold uppercase opacity-60 text-on-surface">Fail2Ban (SSHD)</p>
                                <h3 className="text-xl font-black text-on-surface"><span className="text-danger">{data.fail2ban.currently_banned}</span> IPs bloqueados</h3>
                                <p className="text-[10px] text-on-surface opacity-40">Historico de {data.fail2ban.total_banned} banimentos</p>
                            </div>
                            <div className="rounded-2xl bg-danger/10 p-4 text-danger">
                                <Lock size={28} />
                            </div>
                        </Surface>

                        <Surface className="p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase text-primary"><Ban size={18} /> Resposta rapida</h3>
                                <span className="text-[10px] font-bold uppercase opacity-50 text-on-surface">Manual</span>
                            </div>
                            <div className="flex gap-2">
                                <input value={banIp} onChange={(e) => setBanIp(e.target.value)} placeholder="IP suspeito" className="flex-1 rounded-xl border border-outline/20 bg-surface p-3 text-xs text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                <button onClick={handleBan} className="rounded-xl bg-danger px-4 text-xs font-black uppercase text-white transition-all hover:opacity-90">Banir</button>
                            </div>
                        </Surface>

                        <Surface className="p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase text-info"><Globe size={18} /> IPs publicos</h3>
                                <span className="text-[10px] font-bold uppercase opacity-50 text-on-surface">Monitorados</span>
                            </div>
                            <div className="space-y-2">
                                {(data.public_ips || []).map((ip) => (
                                    <div key={ip.ip} className="group flex items-center justify-between rounded-xl border border-outline/10 bg-surface p-3 transition-colors hover:border-outline/30">
                                        <div className="flex items-center gap-3">
                                            <span className={`h-2.5 w-2.5 rounded-full ${ip.online ? 'bg-info' : 'bg-danger'}`} />
                                            <span className="font-mono text-xs text-on-surface">{ip.ip}</span>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${ip.online ? 'bg-info/20 text-info' : 'bg-danger/20 text-danger'}`}>{ip.online ? 'ONLINE' : 'OFFLINE'}</span>
                                    </div>
                                ))}
                            </div>
                        </Surface>

                        <Surface className="p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-bold uppercase text-orange-500"><Unlock size={18} /> Bans atuais</h3>
                                <span className="text-[10px] font-bold uppercase opacity-50 text-on-surface">{data.fail2ban.banned_ips.length} IPs</span>
                            </div>
                            <div className="space-y-2">
                                {data.fail2ban.banned_ips.length === 0 ? (
                                    <p className="py-4 text-center text-xs italic text-on-surface opacity-40">Nenhum IP bloqueado no momento.</p>
                                ) : (
                                    data.fail2ban.banned_ips.map((ip) => (
                                        <div key={ip} className="group flex items-center justify-between rounded-xl border border-outline/10 bg-surface p-3 transition-colors hover:border-outline/30">
                                            <div className="flex items-center gap-3">
                                                <Lock size={14} className="text-danger" />
                                                <span className="font-mono text-xs text-on-surface">{ip}</span>
                                            </div>
                                            <button onClick={() => handleUnban(ip)} className="rounded-lg bg-info/10 px-3 py-1.5 text-[9px] font-black uppercase text-info opacity-0 transition-all group-hover:opacity-100 hover:bg-info hover:text-white">
                                                <Unlock size={12} className="inline" /> Perdoar
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Surface>

                        <Surface className="flex flex-col p-6">
                            <h3 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase text-orange-500"><Radar size={18} /> Sentinela: vetores observados</h3>
                            <div className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2">
                                <div>
                                    <span className="mb-3 block text-[10px] font-bold uppercase opacity-50 text-on-surface">Portas alvo</span>
                                    {(!data.sentinel_metrics?.top_ports || data.sentinel_metrics.top_ports.length === 0) ? (
                                        <p className="text-xs italic opacity-40">Sem registros recentes.</p>
                                    ) : (
                                        data.sentinel_metrics.top_ports.map((p, i) => (
                                            <div key={i} className="mb-2 flex items-center justify-between border-b border-outline/10 pb-2 font-mono text-xs last:border-0">
                                                <span className="font-bold text-on-surface">Porta {p.port}</span>
                                                <span className="rounded bg-orange-500/10 px-2 py-0.5 font-black text-orange-500">{p.count}x</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div>
                                    <span className="mb-3 block text-[10px] font-bold uppercase opacity-50 text-on-surface">Origens hostis</span>
                                    {(!data.sentinel_metrics?.top_ips || data.sentinel_metrics.top_ips.length === 0) ? (
                                        <p className="text-xs italic opacity-40">Sem registros recentes.</p>
                                    ) : (
                                        data.sentinel_metrics.top_ips.map((p, i) => {
                                            const isBanned = data.fail2ban.banned_ips.includes(p.ip);
                                            return (
                                                <div key={i} className="group mb-2 flex items-center justify-between border-b border-outline/10 pb-2 font-mono text-xs last:border-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="max-w-[90px] truncate text-on-surface" title={p.ip}>{p.ip}</span>
                                                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[9px] font-black text-danger">{p.count}x</span>
                                                    </div>
                                                    <button
                                                        onClick={() => isBanned ? handleUnban(p.ip) : handleBanSpecific(p.ip)}
                                                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase shadow-sm transition-all ${isBanned ? 'bg-danger text-white hover:bg-danger/80' : 'bg-info text-white hover:bg-info/80'}`}
                                                    >
                                                        {isBanned ? <Lock size={10} /> : <Ban size={10} />}
                                                        {isBanned ? 'BLOQUEADO' : 'BLOQUEAR'}
                                                    </button>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </Surface>
                    </div>

                    <Surface className="flex min-h-[500px] flex-col p-6 lg:col-span-2">
                        <div className="mb-6 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-sm font-bold uppercase text-blue-500"><Terminal size={18} /> Regras ativas do firewall</h3>
                            <span className="text-[10px] font-bold uppercase opacity-50 text-on-surface">Total: {data.ufw.rules.length}</span>
                        </div>

                        <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-2">
                            {data.ufw.rules.length === 0 ? (
                                <p className="py-10 text-center text-xs italic text-on-surface opacity-50">Nenhuma regra ativa no momento.</p>
                            ) : (
                                data.ufw.rules.map((r, i) => (
                                    <div key={i} className="group flex items-center justify-between rounded-xl border border-outline/10 bg-surface p-3 transition-colors hover:border-outline/40">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 text-center text-[10px] font-bold opacity-30">[{r.id}]</div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-on-surface">{r.to}</span>
                                                    <span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${r.action === 'ALLOW' ? 'bg-info/20 text-info' : 'bg-danger/20 text-danger'}`}>
                                                        {r.action}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-[10px] font-mono text-on-surface opacity-50">Origem: {r.from}</div>
                                            </div>
                                        </div>
                                        <button onClick={() => deleteRule(r.id)} className="rounded-lg p-2 text-on-surface opacity-30 transition-all hover:bg-danger/10 hover:text-danger hover:opacity-100">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </Surface>
                </div>
            </div>

            <SmtpModal open={smtpModalOpen} onClose={() => setSmtpModalOpen(false)} />
        </>
    );
}
