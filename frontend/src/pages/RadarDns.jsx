import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pause, Play, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Kpi, KpiRow, Notice, PageHeader, Panel, inputCls } from '../components/ui/kit';

/*
 * Radar DNS: o que cada dispositivo está consultando agora.
 * Com ?ip= mostra só aquele dispositivo (vindo do Mapa de Tráfego).
 */

const VLANS = [
  { key: 'todas', label: 'Todas as VLANs' },
  { key: 'VLAN10', label: 'VLAN 10 · Secretaria' },
  { key: 'VLAN30', label: 'VLAN 30 · Celulares' },
  { key: 'VLAN40', label: 'VLAN 40 · Câmeras' },
  { key: 'VLAN50', label: 'VLAN 50 · SINE' },
  { key: 'VLAN70', label: 'VLAN 70 · Visitantes' },
  { key: 'VLAN80', label: 'VLAN 80 · VoIP' },
];

const time = (v) => (v ? new Date(v).toLocaleTimeString('pt-BR') : '—');
const actionBadge = (action, blocked) => {
  if (blocked || action === 'blocked') return <Badge tone="danger">Bloqueada</Badge>;
  if (action === 'bypassed') return <Badge tone="warning">Sem filtro (VIP)</Badge>;
  return <Badge tone="success">Permitida</Badge>;
};

export default function RadarDns() {
  const [params, setParams] = useSearchParams();
  const ip = params.get('ip') || '';
  const [vlan, setVlan] = useState('todas');
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [ipInput, setIpInput] = useState(ip);
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState(null);
  const [entries, setEntries] = useState([]);
  const [device, setDevice] = useState(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      const statsReq = api.get('/api/dns/stats').then((r) => setStats(r.data || null)).catch(() => null);
      if (ip) {
        const r = await api.get(`/api/monitor/dns-device?ip=${encodeURIComponent(ip)}&minutes=180`);
        setDevice(r.data);
        setEntries([]);
      } else {
        const q = new URLSearchParams({ limit: '300' });
        if (vlan !== 'todas') q.set('vlan', vlan);
        if (blockedOnly) q.set('blocked', 'true');
        const r = await api.get(`/api/dns/radar?${q.toString()}`);
        setEntries(Array.isArray(r.data?.entries) ? r.data.entries : []);
        setDevice(null);
      }
      await statsReq;
      setError('');
      setUpdated(new Date());
    } catch (e) {
      setError(e?.response?.data?.error || 'Não foi possível ler as consultas DNS.');
    }
  }, [ip, vlan, blockedOnly]);

  useEffect(() => {
    load();
    if (paused) return undefined;
    const t = window.setInterval(load, 10000);
    return () => window.clearInterval(t);
  }, [load, paused]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = ip
      ? (device?.events || []).map((e) => ({ ...e, timestamp: e.occurred_at, client_ip: ip, blocked: e.action === 'blocked', identity_display_user: e.identity_user }))
      : entries;
    return list.filter((e) => (!blockedOnly || e.blocked || e.action === 'blocked') && (!term || [e.client_ip, e.domain, e.identity_display_user, e.identity_user, e.identity_computer, e.hostname].some((v) => String(v || '').toLowerCase().includes(term))));
  }, [entries, device, search, ip, blockedOnly]);

  const applyIp = (value) => {
    const next = new URLSearchParams(params);
    if (value) next.set('ip', value); else next.delete('ip');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Radar DNS"
        description="Os sites que cada dispositivo está consultando, com o que foi bloqueado."
        meta={updated ? `Atualizado às ${updated.toLocaleTimeString('pt-BR')}${paused ? ' · pausado' : ' · a cada 10 segundos'}` : null}
        actions={(
          <>
            <Button icon={paused ? Play : Pause} onClick={() => setPaused((p) => !p)}>{paused ? 'Retomar' : 'Pausar'}</Button>
            <Button icon={RefreshCw} onClick={load}>Atualizar</Button>
          </>
        )}
      />
      <KpiRow>
        <Kpi label="Consultas hoje" value={stats?.total_hoje != null ? Number(stats.total_hoje).toLocaleString('pt-BR') : '—'} />
        <Kpi label="Bloqueadas hoje" value={stats?.bloqueados_hoje != null ? Number(stats.bloqueados_hoje).toLocaleString('pt-BR') : '—'} tone="danger" />
        <Kpi label="Dispositivos ativos" value={stats?.ips_ativos ?? '—'} />
        <Kpi label="Últimos 5 minutos" value={stats?.queries_5min != null ? Number(stats.queries_5min).toLocaleString('pt-BR') : '—'} sub="consultas" />
      </KpiRow>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="sgcg-card flex flex-wrap items-end gap-3 p-3">
        <form onSubmit={(e) => { e.preventDefault(); applyIp(ipInput.trim()); }} className="flex items-end gap-2">
          <div>
            <label htmlFor="radar-ip" className="mb-1 block text-[12px] font-semibold text-on-surface/70">Dispositivo</label>
            <input id="radar-ip" className={`${inputCls} tabular w-44`} value={ipInput} onChange={(e) => setIpInput(e.target.value)} placeholder="IP, ex.: 192.168.10.45" />
          </div>
          <Button type="submit">Ver</Button>
          {ip ? <Button variant="ghost" icon={X} onClick={() => { setIpInput(''); applyIp(''); }}>Toda a rede</Button> : null}
        </form>
        {!ip ? (
          <div>
            <label htmlFor="radar-vlan" className="mb-1 block text-[12px] font-semibold text-on-surface/70">VLAN</label>
            <select id="radar-vlan" className={`${inputCls} w-52`} value={vlan} onChange={(e) => setVlan(e.target.value)}>
              {VLANS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
        ) : null}
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="radar-search" className="mb-1 block text-[12px] font-semibold text-on-surface/70">Buscar</label>
          <input id="radar-search" className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Site, usuário ou computador" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-[13px] text-on-surface/75">
          <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} /> Só bloqueadas
        </label>
      </div>

      {ip && device ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title={`${device.name || ip} · últimas 3 horas`} description={`${device.events.length} consultas de ${ip}`} padded={false}>
            <DataTable
              rowKey={(e) => `${e.timestamp}-${e.domain}`}
              rows={rows}
              empty="Nenhuma consulta deste dispositivo nas últimas 3 horas."
              columns={[
                { key: 't', label: 'Hora', mono: true, render: (e) => time(e.timestamp) },
                { key: 'd', label: 'Site', render: (e) => <span className="break-all">{e.domain}</span> },
                { key: 'c', label: 'Categoria', render: (e) => e.category || '—' },
                { key: 's', label: 'Situação', render: (e) => actionBadge(e.action, e.blocked) },
              ]}
            />
          </Panel>
          <Panel title="Sites mais consultados" padded={false}>
            <DataTable
              rowKey="domain"
              rows={device.top_domains}
              empty="Sem consultas."
              columns={[
                { key: 'd', label: 'Site', render: (r) => <span className="break-all">{r.domain}</span> },
                { key: 't', label: 'Vezes', mono: true, align: 'right', render: (r) => <span>{r.total}{r.blocked ? <span className="ml-1 text-danger">({r.blocked} bloq.)</span> : null}</span> },
              ]}
            />
          </Panel>
        </div>
      ) : (
        <Panel title="Consultas recentes" description={`${rows.length} consultas no recorte`} padded={false}>
          <DataTable
            rowKey={(e) => `${e.timestamp}-${e.client_ip}-${e.domain}`}
            rows={rows}
            empty="Nenhuma consulta no recorte atual."
            columns={[
              { key: 't', label: 'Hora', mono: true, render: (e) => time(e.timestamp) },
              { key: 'ip', label: 'Dispositivo', render: (e) => <button type="button" onClick={() => { setIpInput(e.client_ip); applyIp(e.client_ip); }} className="text-left hover:text-primary"><div className="tabular font-medium">{e.client_ip}</div><div className="text-[11.5px] text-on-surface/50">{e.identity_display_user || e.identity_user || e.identity_computer || e.hostname || '—'}</div></button> },
              { key: 'd', label: 'Site', render: (e) => <span className="break-all">{e.domain}</span> },
              { key: 'q', label: 'Tipo', render: (e) => e.query_type || '—' },
              { key: 's', label: 'Situação', render: (e) => actionBadge(e.action, e.blocked) },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}
