import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Field, Kpi, KpiRow, Notice, Panel, errorMessage, fmtDateTime, inputCls, toast } from '../ui/kit';
import EChart, { baseAxis, baseTooltip, useChartTheme } from '../charts/EChart';

/* DNS institucional: estado do resolvedor, serviços críticos, encaminhamento gov.br e regras de exceção. */

export default function DnsInstitutional() {
  const theme = useChartTheme();
  const [stats, setStats] = useState(null);
  const [vlans, setVlans] = useState([]);
  const [zones, setZones] = useState([]);
  const [critical, setCritical] = useState(null);
  const [forward, setForward] = useState(null);
  const [form, setForm] = useState({ domain: '', ip: '', type: 'FWD' });
  const [verify, setVerify] = useState({});
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const results = await Promise.allSettled([
      api.get('/api/dns/stats'),
      api.get('/api/dns/vlan-summary'),
      api.get('/api/dns/zones'),
      api.get('/api/dns/forward-metrics?domain=gov.br&hours=24'),
    ]);
    if (results[0].status === 'fulfilled') setStats(results[0].value.data || null);
    if (results[1].status === 'fulfilled' && Array.isArray(results[1].value.data)) setVlans(results[1].value.data);
    if (results[2].status === 'fulfilled' && Array.isArray(results[2].value.data)) setZones(results[2].value.data);
    if (results[3].status === 'fulfilled') setForward(results[3].value.data || null);
    const failed = results.filter((r) => r.status === 'rejected').length;
    setError(failed ? `${failed} leitura(s) do DNS falharam. Os dados podem estar incompletos.` : '');
  };
  const loadCritical = () => api.get('/api/bloqueios-liberacoes/critical-services').then((r) => setCritical(r.data || null)).catch(() => null);

  useEffect(() => {
    load();
    loadCritical();
    const a = window.setInterval(load, 15000);
    const b = window.setInterval(loadCritical, 60000);
    return () => { window.clearInterval(a); window.clearInterval(b); };
  }, []);

  const status = stats?.is_resolving === true ? { l: 'Resolvendo', t: 'success' } : stats?.is_running === true ? { l: 'Lento ou com falha', t: 'warning' } : stats?.is_running === false ? { l: 'Parado', t: 'danger' } : { l: 'Verificando', t: 'neutral' };
  const totalQueries = vlans.reduce((s, v) => s + (v.queries || 0), 0);
  const services = Array.isArray(critical?.services) ? critical.services : [];
  const okServices = services.filter((s) => s.status === 'ok').length;

  const fwdOption = useMemo(() => {
    const rows = Array.isArray(forward?.hourly) ? forward.hourly : [];
    return {
      color: [theme.series[1]],
      grid: { left: 40, right: 8, top: 10, bottom: 24 },
      tooltip: { ...baseTooltip(theme), axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: rows.map((r) => (r.bucket ? `${new Date(r.bucket).getHours()}h` : '')), ...baseAxis(theme), splitLine: { show: false } },
      yAxis: { type: 'value', ...baseAxis(theme) },
      series: [{ name: 'Consultas gov.br', type: 'bar', barWidth: '60%', data: rows.map((r) => ({ value: r.total_queries || 0, itemStyle: { color: (r.error_queries || 0) > 0 ? theme.warning : theme.series[1], borderRadius: [2, 2, 0, 0] } })) }],
    };
  }, [forward, theme]);

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
      setDialog(null);
      load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const addZone = (e) => {
    e.preventDefault();
    run(async () => { await api.post('/api/dns/zones/add', form); setForm({ domain: '', ip: '', type: 'FWD' }); }, 'Regra de DNS aplicada.');
  };

  const verifyZone = async (z) => {
    setVerify((v) => ({ ...v, [z.id]: 'loading' }));
    try {
      const r = await api.post('/api/dns/zones/verify', { domain: z.domain, target_ip: z.target_ip, type: z.type });
      setVerify((v) => ({ ...v, [z.id]: r.data?.match ? 'ok' : 'error' }));
    } catch {
      setVerify((v) => ({ ...v, [z.id]: 'error' }));
    }
  };

  return (
    <div className="space-y-4">
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <KpiRow>
        <Kpi label="Resolvedor DNS" value={status.l} tone={status.t} sub={stats?.stats?.avg_latency ? `Latência média ${stats.stats.avg_latency} ms` : null} />
        <Kpi label="Consultas recentes" value={totalQueries.toLocaleString('pt-BR')} sub="Somando todas as VLANs" />
        <Kpi label="Serviços essenciais" value={services.length ? `${okServices}/${services.length}` : '—'} tone={services.length && okServices === services.length ? 'success' : 'warning'} sub="WhatsApp, gov.br, Caixa" />
        <Kpi label="Encaminhamento gov.br" value={(forward?.inferred_forwarded_queries || 0).toLocaleString('pt-BR')} sub={forward?.last_seen_at ? `Último uso ${fmtDateTime(forward.last_seen_at)}` : 'Consultas em 24 h'} />
      </KpiRow>

      <Panel
        title="Serviços essenciais liberados"
        description="Verifica DNS, lista de IPs liberados e HTTPS em cada VLAN."
        actions={<Button icon={RefreshCw} onClick={loadCritical}>Verificar de novo</Button>}
        padded={false}
      >
        <DataTable
          rowKey="key"
          rows={services}
          empty="Carregando verificação..."
          columns={[
            { key: 'label', label: 'Serviço', render: (s) => <div><div className="font-medium text-on-surface">{s.label}</div><div className="tabular text-[11.5px] text-on-surface/50">{s.domain}</div></div> },
            { key: 'st', label: 'Situação', render: (s) => (s.status === 'ok' ? <Badge tone="success" dot>Funcionando</Badge> : <Badge tone="warning" dot>Atenção</Badge>) },
            { key: 'dns', label: 'DNS', render: (s) => (s.checks?.dns_ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Falha</Badge>) },
            { key: 'ipset', label: 'IPs liberados', render: (s) => (s.checks?.ipset_ok ? <Badge tone="success">OK</Badge> : <Badge tone="danger">Faltando</Badge>) },
            { key: 'https', label: 'HTTPS por VLAN', mono: true, render: (s) => { const l = s.https_by_vlan || []; return l.length ? `${l.filter((x) => x.ok).length}/${l.length}` : '—'; } },
            { key: 'a', label: '', align: 'right', render: (s) => (s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex rounded-md p-1.5 text-on-surface/50 hover:text-primary" aria-label={`Abrir ${s.label}`}><ExternalLink size={15} /></a> : null) },
          ]}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Consultas por VLAN" padded={false}>
          <DataTable
            rowKey="id"
            rows={vlans}
            columns={[
              { key: 'name', label: 'VLAN', render: (v) => <div><div className="font-medium text-on-surface">{v.name}</div><div className="tabular text-[11.5px] text-on-surface/50">{v.ip}</div></div> },
              { key: 'q', label: 'Consultas', mono: true, render: (v) => (v.queries || 0).toLocaleString('pt-BR') },
              { key: 'ips', label: 'IPs', mono: true, render: (v) => (v.unique_ips || 0).toLocaleString('pt-BR') },
              { key: 'b', label: 'Bloqueadas', mono: true, render: (v) => (v.blocked_queries || 0).toLocaleString('pt-BR') },
            ]}
          />
        </Panel>
        <Panel title="Encaminhamento gov.br nas últimas 24 h" description={(forward?.external_resolvers || []).length ? `Resolvedores: ${forward.external_resolvers.join(', ')}` : 'Nenhuma regra de encaminhamento ativa para gov.br.'}>
          <EChart option={fwdOption} height={200} />
        </Panel>
      </div>

      <Panel
        title={`Regras de exceção de DNS (${zones.length})`}
        description="Encaminhar um domínio para outro servidor DNS, ou apontar um nome para um IP fixo."
        actions={<Button icon={Trash2} variant="ghost" onClick={() => setDialog({ title: 'Limpar o cache do DNS', description: 'As próximas consultas vão ser resolvidas de novo. Pode deixar a navegação um pouco mais lenta por alguns segundos.', ok: 'Cache do DNS limpo.', run: () => api.post('/api/dns/cache/flush') })}>Limpar cache</Button>}
        padded={false}
      >
        <form onSubmit={addZone} className="grid gap-2 border-b border-outline p-4 md:grid-cols-[180px_minmax(0,1fr)_180px_auto]">
          <select aria-label="Tipo" className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="FWD">Encaminhar domínio</option>
            <option value="A">Apontar para IP</option>
          </select>
          <input aria-label="Domínio" className={inputCls} value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="gov.br" />
          <input aria-label="Destino" className={`${inputCls} tabular`} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder={form.type === 'FWD' ? 'DNS de destino' : 'IP'} />
          <Button type="submit" variant="primary" icon={Plus} disabled={!form.domain.trim() || !form.ip.trim() || busy}>Adicionar</Button>
        </form>
        <DataTable
          rows={zones}
          empty="Nenhuma regra de exceção."
          columns={[
            { key: 'domain', label: 'Domínio', render: (z) => <span className="font-medium text-on-surface">{z.domain}</span> },
            { key: 'type', label: 'Tipo', render: (z) => (z.type === 'A' ? <Badge tone="warning">Aponta para IP</Badge> : <Badge tone="primary">Encaminha</Badge>) },
            { key: 'target', label: 'Destino', mono: true, render: (z) => z.target_ip },
            { key: 'check', label: 'Teste', render: (z) => (verify[z.id] === 'ok' ? <Badge tone="success">Funcionando</Badge> : verify[z.id] === 'error' ? <Badge tone="danger">Não resolve</Badge> : verify[z.id] === 'loading' ? <Badge>Testando...</Badge> : <span className="text-on-surface/40">—</span>) },
            { key: 'a', label: '', align: 'right', render: (z) => <div className="flex justify-end gap-1"><Button variant="ghost" icon={RefreshCw} onClick={() => verifyZone(z)}>Testar</Button><Button variant="ghost" icon={Trash2} onClick={() => setDialog({ title: `Remover regra de ${z.domain}`, description: 'O domínio volta a ser resolvido normalmente.', ok: 'Regra removida.', run: () => api.post('/api/dns/zones/delete', { id: z.id }) })}>Remover</Button></div> },
          ]}
        />
      </Panel>

      <ConfirmDialog open={Boolean(dialog)} title={dialog?.title} description={dialog?.description} confirmLabel="Confirmar" busy={busy} onClose={() => !busy && setDialog(null)} onConfirm={() => run(dialog.run, dialog.ok)} />
    </div>
  );
}
