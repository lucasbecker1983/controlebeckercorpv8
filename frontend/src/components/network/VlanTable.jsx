import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Badge, DataTable, Panel } from '../ui/kit';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function VlanDot({ id }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(--vlan-${id}, var(--vlan-99))` }} />;
}

export function UseBar({ value }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const color = v > 0.9 ? 'var(--md-danger)' : v > 0.7 ? 'var(--md-warning)' : 'var(--md-success)';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-on-surface/8"><div className="h-full rounded-full" style={{ width: `${v * 100}%`, background: color }} /></div>
      <span className="tabular text-[12px] text-on-surface/60">{Math.round(v * 100)}%</span>
    </div>
  );
}

export default function VlanTable({ live }) {
  const [detail, setDetail] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/api/network/vlans-detail').then((res) => { if (alive) setDetail(Array.isArray(res.data) ? res.data : []); }).catch(() => null);
    load();
    const timer = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const rows = (live?.vlans || []).map((v) => {
    const d = detail.find((x) => x.iface === v.interface);
    return { ...v, ip: d?.ip ? `${d.ip}/24` : `192.168.${v.id}.1/24`, up_state: d ? d.operstate !== 'down' : true };
  });

  return (
    <Panel title="VLANs" description="Estado de cada rede agora. Atualiza a cada 5 segundos." padded={false}>
      <DataTable
        rows={rows}
        empty="Carregando VLANs..."
        columns={[
          { key: 'vlan', label: 'VLAN', render: (v) => <div className="flex items-center gap-2"><VlanDot id={v.id} /><div><div className="font-medium text-on-surface">{v.id} · {v.name}</div><div className="tabular text-[11.5px] text-on-surface/50">{v.interface} · {v.ip}</div></div></div> },
          { key: 'state', label: 'Situação', render: (v) => (!v.up_state ? <Badge tone="danger" dot>Interface desligada</Badge> : v.neighbors === 0 ? <Badge tone="warning" dot>Sem dispositivos</Badge> : v.drops_5m > 200 ? <Badge tone="danger" dot>No limite</Badge> : v.exempt ? <Badge dot>Fora dos filtros</Badge> : <Badge tone="success" dot>Normal</Badge>) },
          { key: 'neighbors', label: 'Dispositivos', mono: true, render: (v) => v.neighbors },
          { key: 'traffic', label: '↓ / ↑ Mbps', mono: true, render: (v) => `${fmt(v.down)} / ${fmt(v.up)}` },
          { key: 'limit', label: 'Limite ↓ / ↑', mono: true, render: (v) => (v.limit_down ? `${v.limit_down} / ${v.limit_up ?? '—'}` : 'Sem limite') },
          { key: 'use', label: 'Uso do limite', render: (v) => (v.limit_down ? <UseBar value={v.use_down} /> : <span className="text-on-surface/40">—</span>) },
          { key: 'internal', label: 'Interno ↓', mono: true, render: (v) => (v.internal_down > 0.05 ? <span>{fmt(v.internal_down)} <span className="text-[11px] text-on-surface/45">{v.internal_exempt ? 'fora do limite' : 'no limite'}</span></span> : '—') },
        ]}
      />
    </Panel>
  );
}
