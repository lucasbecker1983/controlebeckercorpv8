import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, Server, Activity, Globe, Trash2, Terminal, Radar, Ban, Mail, X, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';
import { Badge, Button, ConfirmDialog, DataTable, Kpi, KpiRow, Notice, PageHeader, Panel, RiskItem, RiskZone, Tabs, errorMessage, inputCls, toast, useUrlTab } from '../components/ui/kit';

const SECURITY_TABS = [
    { key: 'firewall', label: 'Firewall' },
    { key: 'ataques', label: 'Bloqueio de ataques' },
    { key: 'email', label: 'Notificações por e-mail' },
];

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
    is_active: false,
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
            <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-outline/20 bg-container p-6 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <div className="mb-3 inline-flex rounded-2xl bg-primary/10 p-3 text-primary">
                            <Mail size={24} />
                        </div>
                        <h3 className="text-2xl font-bold text-on-surface">Notificações institucionais</h3>
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
                            <div className="space-y-4 rounded-xl border border-outline/20 bg-surface p-5">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">SMTP Host</span>
                                        <input value={form.host} onChange={(e) => updateForm('host', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">Porta</span>
                                        <input type="number" value={form.port} onChange={(e) => updateForm('port', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                </div>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">Usuario SMTP</span>
                                    <input value={form.username} onChange={(e) => updateForm('username', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                </label>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">Senha</span>
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
                                        <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">From E-mail</span>
                                        <input value={form.from_email} onChange={(e) => updateForm('from_email', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">From Name</span>
                                        <input value={form.from_name} onChange={(e) => updateForm('from_name', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                    </label>
                                </div>

                                <label className="space-y-2">
                                    <span className="text-[10px] font-bold uppercase text-on-surface opacity-60">E-mail de teste / destino padrrao</span>
                                    <input value={form.to_email} onChange={(e) => updateForm('to_email', e.target.value)} className="w-full rounded-xl border border-outline/20 bg-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary" />
                                </label>
                            </div>

                            <div className="space-y-4 rounded-xl border border-outline/20 bg-surface p-5">
                                <ToggleField label="TLS" checked={form.use_tls} onChange={(value) => updateForm('use_tls', value)} hint="STARTTLS e negociacao segura." />
                                <ToggleField label="SSL Direto" checked={form.use_ssl} onChange={(value) => updateForm('use_ssl', value)} hint="Use para portas como 465." />
                                <ToggleField label="Exigir Autenticacao" checked={form.requires_auth} onChange={(value) => updateForm('requires_auth', value)} hint="Anexa usuario e senha no transporte." />
                                <ToggleField label="Servico Ativo" checked={form.is_active} onChange={(value) => updateForm('is_active', value)} hint="Sentinela so envia alertas quando ativo." />

                                <div className="rounded-xl border border-outline/20 bg-container p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface opacity-50">Resumo operacional</p>
                                    <div className="mt-3 space-y-2 text-xs text-on-surface opacity-80">
                                        <p>Host: <span className="font-mono">{form.host || 'nao definido'}</span></p>
                                        <p>Destino: <span className="font-mono">{form.to_email || form.username || 'nao definido'}</span></p>
                                        <p>Credencial atual: <span className="font-mono">{form.password ? 'nova senha informada' : (form.has_password ? 'senha salva mascarada' : 'sem senha')}</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button onClick={loadConfig} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-outline/20 bg-surface px-5 py-3 text-xs font-bold uppercase text-on-surface transition-all hover:border-primary/40">
                                <RefreshCw size={16} />
                                Recarregar
                            </button>
                            <button onClick={handleTest} disabled={testing || saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-xs font-bold uppercase text-white transition-all hover:bg-primary disabled:opacity-60">
                                {testing ? <Activity className="animate-spin" size={16} /> : <Mail size={16} />}
                                Testar envio
                            </button>
                            <button onClick={handleSave} disabled={saving || testing} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-xs font-bold uppercase text-on-primary transition-all hover:opacity-90 disabled:opacity-60">
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
    const [tab, setTab] = useUrlTab(SECURITY_TABS, 'firewall');
    const [data, setData] = useState({
        ufw: { active: false, installed: true, runtime_source: 'ufw', message: '', rules: [] },
        fail2ban: { active: false, currently_banned: 0, total_banned: 0, banned_ips: [] },
        public_ips: [],
        sentinel_metrics: { top_ports: [], top_ips: [] },
    });
    const [banIp, setBanIp] = useState('');
    const [smtpModalOpen, setSmtpModalOpen] = useState(false);
    const [smtp, setSmtp] = useState(defaultSmtpForm);
    const [smtpError, setSmtpError] = useState('');
    const [ruleFilter, setRuleFilter] = useState('');
    const [dialog, setDialog] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dialogError, setDialogError] = useState('');

    const load = async () => {
        try {
            const res = await api.get('/api/security/dashboard');
            setData((current) => ({
                ...current,
                ...res.data,
                ufw: { ...current.ufw, ...(res.data.ufw || {}) },
                fail2ban: { ...current.fail2ban, ...(res.data.fail2ban || {}) },
                sentinel_metrics: { ...current.sentinel_metrics, ...(res.data.sentinel_metrics || {}) },
            }));
        } catch {}
    };
    const loadSmtp = async () => {
        try {
            const res = await api.get('/api/security/smtp');
            setSmtp({ ...defaultSmtpForm, ...res.data });
            setSmtpError('');
        } catch (error) {
            setSmtp({ ...defaultSmtpForm });
            setSmtpError(errorMessage(error, 'Falha ao carregar a configuração de e-mail.'));
        }
    };
    useEffect(() => { load(); loadSmtp(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

    const run = async (fn, ok) => {
        setBusy(true);
        setDialogError('');
        try {
            await fn();
            toast(ok);
            setDialog(null);
            load();
        } catch (error) {
            setDialogError(errorMessage(error));
        } finally {
            setBusy(false);
        }
    };

    const banned = data.fail2ban.banned_ips || [];
    const ask = (config) => { setDialogError(''); setDialog(config); };
    const askBan = (ip) => ask({ title: `Bloquear o IP ${ip}`, description: 'O IP fica bloqueado pelo Fail2ban e não acessa mais o servidor.', tone: 'danger', confirmLabel: 'Bloquear', onConfirm: () => run(async () => { await api.post('/api/security/f2b/ban', { ip }); setBanIp(''); }, `${ip} bloqueado.`) });
    const askUnban = (ip) => ask({ title: `Desbloquear o IP ${ip}`, description: 'O IP volta a poder tentar acesso ao servidor.', confirmLabel: 'Desbloquear', onConfirm: () => run(() => api.post('/api/security/f2b/unban', { ip }), `${ip} desbloqueado.`) });
    const askDeleteRule = (r) => ask({ title: `Excluir a regra ${r.id} do firewall`, description: `${r.action} ${r.to} vindo de ${r.from}. A mudança vale na hora.`, tone: 'danger', confirmLabel: 'Excluir regra', onConfirm: () => run(() => api.post('/api/security/ufw/delete', { id: r.id }), `Regra ${r.id} excluída.`) });
    const askHardening = () => ask({ title: 'Aplicar a blindagem do SSH', description: 'Abre o SSH externo na porta 18122, restringe a porta 22 à rede interna e à VPN e fecha a 22 para a internet. Se você estiver conectado pela 22 de fora, vai perder a conexão.', tone: 'danger', minReason: 10, reasonLabel: 'Motivo', confirmLabel: 'Aplicar blindagem', onConfirm: () => run(() => api.post('/api/security/setup-cockpit'), 'Blindagem aplicada.') });

    const rules = (data.ufw.rules || []).filter((r) => !ruleFilter || `${r.id} ${r.to} ${r.from} ${r.action}`.toLowerCase().includes(ruleFilter.toLowerCase()));
    const onlinePublic = (data.public_ips || []).filter((ip) => ip.online).length;

    return (
        <div className="space-y-4">
            <PageHeader title="Segurança" description="Firewall do servidor, bloqueio de ataques e notificações por e-mail." />
            <KpiRow>
                <Kpi icon={Shield} label="Firewall (UFW)" value={data.ufw.active ? 'Ativo' : 'Atenção'} tone={data.ufw.active ? 'success' : 'danger'} sub={`${(data.ufw.rules || []).length} regras · fonte ${data.ufw.runtime_source === 'iptables' ? 'iptables' : 'ufw'}`} />
                <Kpi icon={Lock} label="IPs bloqueados agora" value={data.fail2ban.currently_banned ?? 0} tone={data.fail2ban.currently_banned ? 'warning' : 'success'} sub={`${data.fail2ban.total_banned ?? 0} bloqueios no histórico`} />
                <Kpi icon={Radar} label="Origens hostis recentes" value={(data.sentinel_metrics?.top_ips || []).length} sub="Tentativas barradas pelo firewall" />
                <Kpi icon={Globe} label="IPs públicos" value={(data.public_ips || []).length ? `${onlinePublic}/${data.public_ips.length}` : '—'} tone={onlinePublic === (data.public_ips || []).length ? 'success' : 'danger'} sub="Respondendo" />
            </KpiRow>
            {data.ufw.message ? <Notice tone="warning">{data.ufw.message}</Notice> : null}
            <Tabs tabs={SECURITY_TABS.map((t) => (t.key === 'ataques' ? { ...t, count: banned.length || null } : t))} value={tab} onChange={setTab} />

            {tab === 'firewall' ? (
                <div className="space-y-4">
                    <Panel title="Regras do firewall" description="Regras ativas no UFW. As marcadas como do sistema são aplicadas pelo SGCG e não podem ser excluídas aqui." padded={false}
                        actions={<input aria-label="Filtrar regras" className={`${inputCls} w-56`} value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} placeholder="Filtrar regras" />}>
                        <DataTable
                            rowKey={(r) => `${r.id}-${r.to}-${r.from}`}
                            rows={rules}
                            empty="Nenhuma regra encontrada."
                            columns={[
                                { key: 'id', label: 'Nº', mono: true, width: 56, render: (r) => r.id },
                                { key: 'to', label: 'Porta / destino', render: (r) => <span className="tabular font-medium text-on-surface">{r.to}</span> },
                                { key: 'action', label: 'Ação', render: (r) => (r.action === 'ALLOW' ? <Badge tone="success">Permite</Badge> : <Badge tone="danger">{r.action === 'DENY' ? 'Nega' : r.action}</Badge>) },
                                { key: 'from', label: 'Origem', mono: true, render: (r) => r.from },
                                { key: 'a', label: '', align: 'right', render: (r) => (r.source === 'ufw' ? <Button variant="ghost" icon={Trash2} onClick={() => askDeleteRule(r)}>Excluir</Button> : <Badge>Do sistema</Badge>) },
                            ]}
                        />
                    </Panel>
                    <RiskZone description="Muda o acesso remoto ao servidor.">
                        <RiskItem title="Blindagem do SSH" description="SSH externo na 18122, porta 22 só para a rede interna e a VPN." action={<Button variant="danger-soft" icon={ShieldCheck} onClick={askHardening}>Aplicar</Button>} />
                    </RiskZone>
                </div>
            ) : null}

            {tab === 'ataques' ? (
                <div className="space-y-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                        <Panel title={`IPs bloqueados (${banned.length})`} padded={false}
                            actions={(
                                <form onSubmit={(e) => { e.preventDefault(); if (banIp.trim()) askBan(banIp.trim()); }} className="flex gap-2">
                                    <input aria-label="IP para bloquear" className={`${inputCls} tabular w-40`} value={banIp} onChange={(e) => setBanIp(e.target.value)} placeholder="IP suspeito" />
                                    <Button type="submit" variant="danger-soft" icon={Ban} disabled={!banIp.trim()}>Bloquear</Button>
                                </form>
                            )}>
                            <DataTable
                                rowKey={(ip) => ip}
                                rows={banned}
                                empty="Nenhum IP bloqueado agora."
                                columns={[
                                    { key: 'ip', label: 'IP', mono: true, render: (ip) => ip },
                                    { key: 'a', label: '', align: 'right', render: (ip) => <Button variant="ghost" icon={Unlock} onClick={() => askUnban(ip)}>Desbloquear</Button> },
                                ]}
                            />
                        </Panel>
                        <Panel title="Origens das tentativas" description="IPs que mais tentaram acessar o servidor e foram barrados." padded={false}>
                            <DataTable
                                rowKey="ip"
                                rows={data.sentinel_metrics?.top_ips || []}
                                empty="Sem tentativas recentes."
                                columns={[
                                    { key: 'ip', label: 'IP', mono: true, render: (p) => p.ip },
                                    { key: 'c', label: 'Tentativas', mono: true, render: (p) => p.count },
                                    { key: 'a', label: '', align: 'right', render: (p) => (banned.includes(p.ip) ? <Button variant="ghost" icon={Unlock} onClick={() => askUnban(p.ip)}>Desbloquear</Button> : <Button variant="danger-soft" icon={Ban} onClick={() => askBan(p.ip)}>Bloquear</Button>) },
                                ]}
                            />
                        </Panel>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <Panel title="Portas mais visadas" padded={false}>
                            <DataTable
                                rowKey="port"
                                rows={data.sentinel_metrics?.top_ports || []}
                                empty="Sem registros recentes."
                                columns={[
                                    { key: 'p', label: 'Porta', mono: true, render: (p) => p.port },
                                    { key: 'c', label: 'Tentativas', mono: true, render: (p) => p.count },
                                ]}
                            />
                        </Panel>
                        <Panel title="IPs públicos do servidor" padded={false}>
                            <DataTable
                                rowKey="ip"
                                rows={data.public_ips || []}
                                empty="Nenhum IP público monitorado."
                                columns={[
                                    { key: 'ip', label: 'IP', mono: true, render: (p) => p.ip },
                                    { key: 's', label: 'Situação', render: (p) => (p.online ? <Badge tone="success" dot>Respondendo</Badge> : <Badge tone="danger" dot>Sem resposta</Badge>) },
                                ]}
                            />
                        </Panel>
                    </div>
                </div>
            ) : null}

            {tab === 'email' ? (
                <Panel title="Notificações por e-mail" description="Servidor de e-mail usado para alertas e avisos do SGCG." actions={<><Button icon={RefreshCw} onClick={loadSmtp}>Recarregar</Button><Button variant="primary" icon={Mail} onClick={() => setSmtpModalOpen(true)}>Configurar</Button></>}>
                    {smtpError ? <Notice tone="danger">{smtpError}</Notice> : null}
                    <dl className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
                        {[
                            ['Situação', smtp.is_active ? <Badge tone="success" dot>Ativo</Badge> : <Badge tone="warning" dot>Inativo</Badge>],
                            ['Servidor', smtp.host ? `${smtp.host}:${smtp.port}` : 'Não configurado'],
                            ['Autenticação', smtp.requires_auth ? 'Com usuário e senha' : 'Sem autenticação'],
                            ['Usuário', smtp.username || '—'],
                            ['Remetente', smtp.from_email || '—'],
                            ['Destino padrão', smtp.to_email || '—'],
                        ].map(([k, v]) => (
                            <div key={k} className="rounded-lg border border-outline p-3">
                                <dt className="text-[11.5px] text-on-surface/50">{k}</dt>
                                <dd className="mt-0.5 font-medium text-on-surface">{v}</dd>
                            </div>
                        ))}
                    </dl>
                </Panel>
            ) : null}

            <ConfirmDialog
                open={Boolean(dialog)}
                title={dialog?.title}
                description={dialog?.description}
                tone={dialog?.tone}
                confirmLabel={dialog?.confirmLabel}
                minReason={dialog?.minReason || 0}
                reasonLabel={dialog?.reasonLabel}
                busy={busy}
                error={dialogError}
                onClose={() => !busy && setDialog(null)}
                onConfirm={(reason) => dialog?.onConfirm?.(reason)}
            />
            <SmtpModal open={smtpModalOpen} onClose={() => { setSmtpModalOpen(false); loadSmtp(); }} />
        </div>
    );
}
