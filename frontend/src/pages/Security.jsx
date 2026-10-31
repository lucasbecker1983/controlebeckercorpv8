import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, Server, Activity, Globe, Trash2, Terminal, Radar, Ban, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Kpi, KpiRow, Notice, PageHeader, Panel, RiskItem, RiskZone, Tabs, errorMessage, inputCls, toast, useUrlTab } from '../components/ui/kit';

const SECURITY_TABS = [
    { key: 'firewall', label: 'Firewall' },
    { key: 'ataques', label: 'Bloqueio de ataques' },
];

export default function Security() {
    const navigate = useNavigate();
    // As notificações por e-mail mudaram para Configurações; links e favoritos antigos continuam funcionando.
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('tab') === 'email') navigate('/configuracoes?tab=email', { replace: true });
    }, [navigate]);
    const [tab, setTab] = useUrlTab(SECURITY_TABS, 'firewall');
    const [data, setData] = useState({
        ufw: { active: false, installed: true, runtime_source: 'ufw', message: '', rules: [] },
        fail2ban: { active: false, currently_banned: 0, total_banned: 0, banned_ips: [] },
        public_ips: [],
        sentinel_metrics: { top_ports: [], top_ips: [] },
    });
    const [banIp, setBanIp] = useState('');
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
    useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

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
            <PageHeader title="Segurança" description="Firewall do servidor e bloqueio de ataques." />
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
        </div>
    );
}
