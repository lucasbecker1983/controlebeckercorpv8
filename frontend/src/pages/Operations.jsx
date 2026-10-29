import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bug, Database, Eraser, Power, RefreshCw, RotateCcw, Router, Server, ShieldAlert, ShieldCheck, Siren, Play, Square, Zap } from 'lucide-react';
import { api } from '../services/api';
import {
  Badge, Button, ConfirmDialog, DataTable, Field, Kpi, KpiRow, Notice, PageHeader, Panel, RiskItem, RiskZone, Tabs,
  errorMessage, fmtDateTime, inputCls, toast, useUrlTab,
} from '../components/ui/kit';

const EMERGENCY_VLANS = [
  { vlan_id: 10, label: 'Secretaria' },
  { vlan_id: 30, label: 'Celulares' },
  { vlan_id: 50, label: 'SINE' },
  { vlan_id: 70, label: 'Visitantes' },
];

const QUICK_COMMANDS = [
  { id: 'dhcp_restart', icon: Router, title: 'Reiniciar o DHCP', desc: 'Reinicia a distribuição de IPs. Use quando aparelhos não recebem endereço.' },
  { id: 'fail2ban_unlock', icon: ShieldAlert, title: 'Liberar IPs bloqueados pelo Fail2ban', desc: 'Desbloqueia todos os IPs barrados por tentativas de acesso.' },
  { id: 'db_restart', icon: Database, title: 'Reiniciar o banco de dados', desc: 'Reinicia o PostgreSQL. O console fica alguns segundos sem resposta.' },
  { id: 'clear_cache', icon: Zap, title: 'Liberar cache de memória', desc: 'Descarta o cache de disco em memória do servidor.' },
];

const TABS = [
  { key: 'servicos', label: 'Serviços', icon: Server },
  { key: 'emergencia', label: 'Emergência por VLAN', icon: Siren },
  { key: 'antivirus', label: 'Antivírus', icon: Bug },
  { key: 'servidor', label: 'Servidor', icon: Power },
];

const DURATIONS = [
  { value: '15', label: '15 minutos' },
  { value: '30', label: '30 minutos' },
  { value: '60', label: '1 hora' },
  { value: '120', label: '2 horas' },
  { value: 'manual', label: 'Até eu desligar' },
];

const statusBadge = (status) => (status === 'active'
  ? <Badge tone="success" dot>Ativo</Badge>
  : status === 'activating' ? <Badge tone="warning" dot>Iniciando</Badge>
    : <Badge tone="danger" dot>{status === 'inactive' ? 'Parado' : status || 'Desconhecido'}</Badge>);

export default function Operations({ user }) {
  const [tab, setTab] = useUrlTab(TABS, 'servicos');
  const [services, setServices] = useState([]);
  const [clamav, setClamav] = useState(null);
  const [bypasses, setBypasses] = useState([]);
  const [totalBlocks, setTotalBlocks] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [duration, setDuration] = useState('30');
  const canPower = ['admin', 'god'].includes(String(user?.role || '').trim().toLowerCase());

  const load = useCallback(async () => {
    const [svc, av, bp, tb] = await Promise.allSettled([
      api.get('/api/control/services'),
      api.get('/api/control/clamav'),
      api.get('/api/bloqueios-liberacoes/emergency-vlan-bypass'),
      api.get('/api/bloqueios-liberacoes/total-vlan-blocks'),
    ]);
    if (svc.status === 'fulfilled') setServices(Array.isArray(svc.value.data) ? svc.value.data : []);
    if (av.status === 'fulfilled') setClamav(av.value.data || null);
    if (bp.status === 'fulfilled') setBypasses(Array.isArray(bp.value.data) ? bp.value.data : []);
    if (tb.status === 'fulfilled') setTotalBlocks(Array.isArray(tb.value.data) ? tb.value.data : []);
    const failed = [svc, av, bp, tb].filter((r) => r.status === 'rejected').length;
    setLoadError(failed ? `${failed} fonte(s) de dados não responderam. Os valores podem estar desatualizados.` : '');
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const bypassBy = useMemo(() => Object.fromEntries(bypasses.map((b) => [String(b.vlan_id), b])), [bypasses]);
  const blockBy = useMemo(() => Object.fromEntries(totalBlocks.map((b) => [String(b.vlan_id), b])), [totalBlocks]);
  const stopped = services.filter((s) => s.status !== 'active');
  const findings = clamav?.findings || [];
  const pending = findings.filter((f) => f.decision_status === 'pending');

  const open = (config) => { setDialogError(''); setDialog(config); };
  const close = () => { if (!busy) setDialog(null); };
  const run = async (fn, okMessage, reason) => {
    setBusy(true);
    setDialogError('');
    try {
      const result = await fn(reason);
      toast(typeof okMessage === 'function' ? okMessage(result) : okMessage);
      setDialog(null);
      load();
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // ---------- ações ----------
  const serviceAction = (svc, action) => open({
    title: `${action === 'restart' ? 'Reiniciar' : action === 'stop' ? 'Parar' : 'Iniciar'} ${svc.label || svc.name}`,
    description: action === 'stop' ? 'O serviço deixa de funcionar até ser iniciado de novo. Pode afetar a rede inteira.' : `O comando será enviado ao serviço ${svc.name}.`,
    tone: action === 'stop' ? 'danger' : 'primary',
    confirmLabel: action === 'restart' ? 'Reiniciar' : action === 'stop' ? 'Parar serviço' : 'Iniciar',
    onConfirm: () => run(() => api.post('/api/control/service-action', { service: svc.name, action }), `Comando enviado para ${svc.label || svc.name}.`),
  });

  const quickCommand = (cmd) => open({
    title: cmd.title,
    description: cmd.desc,
    confirmLabel: 'Executar',
    onConfirm: () => run(() => api.post('/api/control/tactical', { action: cmd.id }), `${cmd.title}: concluído.`),
  });

  const bypassOn = (vlan) => open({
    title: `Liberar tudo na VLAN ${vlan.vlan_id} · ${vlan.label}`,
    description: 'A VLAN fica sem bloqueios de sites, DNS e interceptação pelo tempo escolhido. Use só em emergência, quando a navegação parou.',
    tone: 'danger',
    minReason: 10,
    confirmLabel: 'Liberar a VLAN',
    withDuration: true,
    onConfirm: (reason) => run(() => api.post('/api/bloqueios-liberacoes/emergency-vlan-bypass/activate', {
      vlan_id: vlan.vlan_id,
      duration_minutes: duration === 'manual' ? 'manual' : Number(duration),
      reason,
    }), `VLAN ${vlan.vlan_id} liberada.`, reason),
  });

  const bypassOff = (vlan) => open({
    title: `Encerrar liberação da VLAN ${vlan.vlan_id}`,
    description: 'Os bloqueios voltam a valer na hora.',
    confirmLabel: 'Encerrar liberação',
    onConfirm: () => run(() => api.post(`/api/bloqueios-liberacoes/emergency-vlan-bypass/${vlan.vlan_id}/deactivate`, { reason: 'Retorno manual às regras de bloqueio' }), `Liberação da VLAN ${vlan.vlan_id} encerrada.`),
  });

  const blockOn = (vlan) => open({
    title: `Cortar a internet da VLAN ${vlan.vlan_id} · ${vlan.label}`,
    description: 'Nenhum dispositivo da VLAN navega até você desfazer. A rede interna continua funcionando.',
    tone: 'danger',
    minReason: 10,
    confirmLabel: 'Cortar internet',
    onConfirm: (reason) => run(() => api.post('/api/bloqueios-liberacoes/total-vlan-blocks/activate', { vlan_id: vlan.vlan_id, reason }), `Internet da VLAN ${vlan.vlan_id} cortada.`, reason),
  });

  const blockOff = (vlan) => open({
    title: `Devolver a internet da VLAN ${vlan.vlan_id}`,
    description: 'A VLAN volta a navegar com as regras normais.',
    confirmLabel: 'Devolver internet',
    onConfirm: () => run(() => api.post(`/api/bloqueios-liberacoes/total-vlan-blocks/${vlan.vlan_id}/deactivate`, { reason: 'Retorno manual da VLAN às regras normais' }), `Internet da VLAN ${vlan.vlan_id} devolvida.`),
  });

  const clamUpdate = () => open({
    title: 'Atualizar assinaturas do antivírus',
    description: 'Baixa as definições mais recentes do ClamAV.',
    confirmLabel: 'Atualizar',
    onConfirm: () => run(() => api.post('/api/control/tactical', { action: 'clamav_update' }), 'Assinaturas do ClamAV atualizadas.'),
  });

  const clamScan = () => open({
    title: 'Verificar vírus agora',
    description: 'A varredura roda em segundo plano nas pastas monitoradas. O resultado aparece em Últimas verificações.',
    confirmLabel: 'Iniciar verificação',
    onConfirm: () => run(async () => {
      try {
        const res = await api.post('/api/control/tactical', { action: 'clamav_scan' });
        return res.data;
      } catch (error) {
        if (error?.response?.status === 409) throw new Error('Já existe uma verificação em andamento. Aguarde ela terminar.');
        throw error;
      }
    }, (data) => (data?.queued ? 'Verificação iniciada em segundo plano.' : Number(data?.infected_files || 0) > 0 ? `Verificação concluída com ${data.infected_files} achado(s).` : 'Verificação concluída sem achados.')),
  });

  const decide = (finding, action) => open({
    title: action === 'quarantine' ? 'Mover arquivo para quarentena' : 'Excluir arquivo definitivamente',
    description: finding.file_path,
    tone: action === 'delete' ? 'danger' : 'primary',
    confirmLabel: action === 'quarantine' ? 'Quarentena' : 'Excluir',
    onConfirm: () => run(() => api.post(`/api/control/clamav/findings/${finding.id}/decision`, { action, decided_by: user?.username || 'operador' }), action === 'quarantine' ? 'Arquivo em quarentena.' : 'Arquivo excluído.'),
  });

  const clearRuns = () => open({
    title: 'Limpar histórico do antivírus',
    description: 'Apaga as verificações registradas e os achados ligados a elas.',
    tone: 'danger',
    confirmLabel: 'Limpar histórico',
    onConfirm: () => run(() => api.delete('/api/control/clamav/runs'), 'Histórico do antivírus limpo.'),
  });

  const power = (action) => open({
    title: action === 'reboot' ? 'Reiniciar o servidor' : 'Desligar o servidor',
    description: action === 'reboot'
      ? 'Internet, DNS, DHCP, Hotspot e este console param por alguns minutos para todas as VLANs.'
      : 'Toda a rede fica sem internet até alguém ligar o servidor fisicamente.',
    tone: 'danger',
    minReason: 10,
    reasonLabel: 'Motivo',
    confirmLabel: action === 'reboot' ? 'Reiniciar agora' : 'Desligar agora',
    onConfirm: () => run(async () => (await api.post('/api/control/server-power', { action })).data, (data) => data?.message || 'Comando aceito. O console vai perder a conexão em instantes.'),
  });

  // ---------- telas ----------
  const servicesTab = (
    <div className="space-y-4">
      <Panel title="Serviços do servidor" description="Estado dos serviços que mantêm a rede funcionando." padded={false}>
        <DataTable
          rowKey="name"
          rows={services}
          empty="Carregando serviços..."
          columns={[
            { key: 'label', label: 'Serviço', render: (s) => <div><div className="font-medium text-on-surface">{s.label || s.name}</div><div className="text-[11.5px] text-on-surface/50">{s.name}</div></div> },
            { key: 'status', label: 'Estado', render: (s) => statusBadge(s.status) },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (s) => (
                <div className="flex justify-end gap-1.5">
                  {s.status === 'active' ? null : <Button icon={Play} onClick={() => serviceAction(s, 'start')}>Iniciar</Button>}
                  <Button icon={RotateCcw} onClick={() => serviceAction(s, 'restart')}>Reiniciar</Button>
                  {s.status === 'active' ? <Button variant="ghost" icon={Square} onClick={() => serviceAction(s, 'stop')}>Parar</Button> : null}
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Panel title="Comandos de manutenção" description="Correções rápidas para problemas comuns.">
        <div className="grid gap-3 md:grid-cols-2">
          {QUICK_COMMANDS.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <div key={cmd.id} className="flex items-start gap-3 rounded-lg border border-outline p-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-on-surface">{cmd.title}</div>
                  <div className="text-[12.5px] leading-5 text-on-surface/60">{cmd.desc}</div>
                </div>
                <Button onClick={() => quickCommand(cmd)}>Executar</Button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );

  const emergencyTab = (
    <div className="space-y-4">
      <Notice tone="warning" title="Use só em emergência">
        <b>Liberar tudo</b> tira todos os bloqueios de uma VLAN, para quando a navegação parou por causa de uma regra. <b>Cortar internet</b> desliga a internet da VLAN inteira. As duas ações pedem justificativa e ficam na auditoria.
      </Notice>
      <Panel title="VLANs com regras de bloqueio" padded={false}>
        <DataTable
          rowKey="vlan_id"
          rows={EMERGENCY_VLANS}
          columns={[
            { key: 'vlan', label: 'VLAN', render: (v) => <span className="font-medium text-on-surface">{v.vlan_id} · {v.label}</span> },
            {
              key: 'state',
              label: 'Situação',
              render: (v) => {
                const bp = bypassBy[String(v.vlan_id)];
                const tb = blockBy[String(v.vlan_id)];
                if (tb) return <div><Badge tone="danger" dot>Internet cortada</Badge><div className="mt-0.5 text-[11.5px] text-on-surface/55">desde {fmtDateTime(tb.activated_at)} · {tb.reason}</div></div>;
                if (bp) return <div><Badge tone="warning" dot>Sem bloqueios</Badge><div className="mt-0.5 text-[11.5px] text-on-surface/55">{bp.expires_at ? `até ${fmtDateTime(bp.expires_at)}` : 'até desligar'} · {bp.reason}</div></div>;
                return <Badge tone="success" dot>Normal</Badge>;
              },
            },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (v) => {
                const bp = bypassBy[String(v.vlan_id)];
                const tb = blockBy[String(v.vlan_id)];
                return (
                  <div className="flex justify-end gap-1.5">
                    {bp ? <Button onClick={() => bypassOff(v)}>Encerrar liberação</Button> : <Button variant="danger-soft" onClick={() => bypassOn(v)} disabled={Boolean(tb)}>Liberar tudo</Button>}
                    {tb ? <Button onClick={() => blockOff(v)}>Devolver internet</Button> : <Button variant="danger-soft" onClick={() => blockOn(v)} disabled={Boolean(bp)}>Cortar internet</Button>}
                  </div>
                );
              },
            },
          ]}
        />
      </Panel>
    </div>
  );

  const svcState = (state) => (state === 'active' ? 'success' : 'warning');
  const antivirusTab = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={svcState(clamav?.services?.daemon)} dot>Antivírus {clamav?.services?.daemon === 'active' ? 'ativo' : clamav?.services?.daemon || '—'}</Badge>
        <Badge tone={svcState(clamav?.services?.freshclam)} dot>Assinaturas {clamav?.services?.freshclam === 'active' ? 'atualizando' : clamav?.services?.freshclam || '—'}</Badge>
        <Badge tone={svcState(clamav?.services?.clamonacc)} dot>Monitor em tempo real {clamav?.services?.clamonacc === 'active' ? 'ativo' : clamav?.services?.clamonacc || '—'}</Badge>
        {clamav?.running_scan ? <Badge tone="warning" dot>Verificação em andamento</Badge> : null}
        <div className="ml-auto flex gap-2">
          <Button icon={RefreshCw} onClick={clamUpdate}>Atualizar assinaturas</Button>
          <Button variant="primary" icon={ShieldCheck} onClick={clamScan} disabled={Boolean(clamav?.running_scan)}>Verificar agora</Button>
        </div>
      </div>
      <Panel title="Arquivos suspeitos" description={pending.length ? `${pending.length} aguardando decisão.` : 'Nenhum arquivo aguardando decisão.'} padded={false}>
        <DataTable
          rows={findings}
          empty="Nenhum arquivo suspeito encontrado."
          columns={[
            { key: 'file', label: 'Arquivo', render: (f) => <div className="min-w-0"><div className="break-all font-medium text-on-surface">{f.file_path}</div><div className="text-[11.5px] text-on-surface/50">{f.signature || 'Assinatura não informada'} · {fmtDateTime(f.created_at)}</div></div> },
            { key: 'state', label: 'Situação', render: (f) => (f.decision_status === 'pending' ? <Badge tone="warning">Aguardando</Badge> : f.decision_status === 'quarantined' ? <Badge tone="primary">Quarentena</Badge> : f.decision_status === 'deleted' ? <Badge tone="danger">Excluído</Badge> : <Badge>{f.decision_status}</Badge>) },
            { key: 'actions', label: '', align: 'right', render: (f) => (f.decision_status === 'pending' ? <div className="flex justify-end gap-1.5"><Button onClick={() => decide(f, 'quarantine')}>Quarentena</Button><Button variant="danger-soft" onClick={() => decide(f, 'delete')}>Excluir</Button></div> : null) },
          ]}
        />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Últimas verificações" actions={(clamav?.recent_runs || []).length ? <Button variant="ghost" icon={Eraser} onClick={clearRuns}>Limpar histórico</Button> : null} padded={false}>
          <DataTable
            rows={clamav?.recent_runs || []}
            empty="Nenhuma verificação registrada."
            columns={[
              { key: 'action', label: 'Tipo', render: (r) => (r.action === 'clamav_update' ? 'Atualização de assinaturas' : 'Verificação de vírus') },
              { key: 'when', label: 'Quando', mono: true, render: (r) => fmtDateTime(r.created_at) },
              { key: 'res', label: 'Resultado', render: (r) => (r.status === 'running' ? <Badge tone="warning">Em andamento</Badge> : !r.success ? <Badge tone="danger">Falhou</Badge> : Number(r.infected_files || 0) > 0 ? <Badge tone="warning">{r.infected_files} achado(s)</Badge> : <Badge tone="success">Limpo</Badge>) },
            ]}
          />
        </Panel>
        <Panel title="O que é verificado">
          <div className="space-y-3 text-[13px]">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">Pastas</div>
              <div className="flex flex-wrap gap-1.5">{(clamav?.scan_paths || []).map((p) => <span key={p} className="tabular rounded-md border border-outline px-2 py-0.5 text-[12px]">{p}</span>)}</div>
            </div>
            {(clamav?.coverage || []).length ? (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">Redes cobertas</div>
                <div className="flex flex-wrap gap-1.5">{clamav.coverage.map((c) => <span key={c.subnet || c.label} className="rounded-md border border-outline px-2 py-0.5 text-[12px]">{c.label || c.scope} {c.subnet ? <span className="text-on-surface/50">{c.subnet}</span> : null}</span>)}</div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );

  const serverTab = canPower ? (
    <RiskZone description="Ações que derrubam a rede inteira. Exigem motivo e ficam registradas na auditoria.">
      <RiskItem title="Reiniciar o servidor" description="Internet, DNS, DHCP, Hotspot e o console param por alguns minutos." action={<Button variant="danger-soft" icon={RotateCcw} onClick={() => power('reboot')}>Reiniciar</Button>} />
      <RiskItem title="Desligar o servidor" description="A rede fica sem internet até alguém ligar o servidor fisicamente." action={<Button variant="danger-soft" icon={Power} onClick={() => power('poweroff')}>Desligar</Button>} />
    </RiskZone>
  ) : (
    <Notice tone="primary" title="Acesso restrito">Reiniciar ou desligar o servidor é permitido só para administradores.</Notice>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Operações" description="Serviços do servidor, ações de emergência por VLAN, antivírus e energia do servidor." />
      {loadError ? <Notice tone="warning">{loadError}</Notice> : null}
      <KpiRow>
        <Kpi icon={Server} label="Serviços" value={services.length ? `${services.length - stopped.length}/${services.length}` : '—'} sub={stopped.length ? `${stopped.length} parado(s): ${stopped.map((s) => s.label || s.name).slice(0, 2).join(', ')}` : 'Todos ativos'} tone={stopped.length ? 'danger' : 'success'} />
        <Kpi icon={Siren} label="Emergências ativas" value={bypasses.length + totalBlocks.length} sub={bypasses.length + totalBlocks.length ? `${bypasses.length} liberação(ões), ${totalBlocks.length} corte(s)` : 'Nenhuma VLAN em emergência'} tone={bypasses.length + totalBlocks.length ? 'warning' : 'success'} />
        <Kpi icon={Bug} label="Arquivos suspeitos" value={pending.length} sub={pending.length ? 'Aguardando decisão' : 'Nada pendente'} tone={pending.length ? 'warning' : 'success'} />
        <Kpi icon={ShieldCheck} label="Antivírus" value={clamav?.services?.daemon === 'active' ? 'Ativo' : clamav ? 'Verificar' : '—'} sub={clamav?.running_scan ? 'Verificação em andamento' : 'Sem verificação em andamento'} tone={clamav?.services?.daemon === 'active' ? 'success' : 'warning'} />
      </KpiRow>
      <Tabs tabs={TABS.map((t) => ({ ...t, count: t.key === 'emergencia' ? (bypasses.length + totalBlocks.length) || null : t.key === 'antivirus' ? pending.length || null : t.key === 'servicos' ? stopped.length || null : null }))} value={tab} onChange={setTab} />
      {tab === 'servicos' ? servicesTab : null}
      {tab === 'emergencia' ? emergencyTab : null}
      {tab === 'antivirus' ? antivirusTab : null}
      {tab === 'servidor' ? serverTab : null}

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
        onClose={close}
        onConfirm={(reason) => dialog?.onConfirm?.(reason)}
      >
        {dialog?.withDuration ? (
          <Field id="op-duration" label="Por quanto tempo">
            <select id="op-duration" className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)}>
              {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
