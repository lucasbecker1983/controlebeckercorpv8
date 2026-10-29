import { useEffect, useState } from 'react';
import { Clock, Gauge, Globe, Monitor, Network as NetworkIcon } from 'lucide-react';
import { api } from '../services/api';
import { Kpi, KpiRow, PageHeader, Panel, Tabs, useUrlTab } from '../components/ui/kit';
import VlanTable from '../components/network/VlanTable';
import QosPanel from '../components/network/QosPanel';
import SchedulesPanel from '../components/network/SchedulesPanel';
import DevicesPanel from '../components/network/DevicesPanel';
import RemoteAccessPanel from '../components/network/RemoteAccessPanel';
import DowntimeLog from '../components/DowntimeLog';

const TABS = [
  { key: 'vlans', label: 'VLANs', icon: NetworkIcon },
  { key: 'qos', label: 'Banda (QoS)', icon: Gauge },
  { key: 'scheduler', label: 'Horários', icon: Clock },
  { key: 'access', label: 'Dispositivos', icon: Monitor },
  { key: 'link', label: 'Link e acesso remoto', icon: Globe },
];

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default function Network() {
  const [tab, setTab] = useUrlTab(TABS.concat([{ key: 'connect' }, { key: 'dns' }]), 'vlans');
  const current = tab === 'connect' ? 'link' : tab === 'dns' ? 'vlans' : tab;
  const [live, setLive] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/api/monitor/live').then((r) => { if (alive) setLive(r.data); }).catch(() => null);
    load();
    const t = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const vlans = live?.vlans || [];
  const devices = vlans.reduce((s, v) => s + (v.neighbors || 0), 0);
  const atLimit = vlans.filter((v) => v.drops_5m > 200);
  const internet = live?.internet;

  return (
    <div className="space-y-4">
      <PageHeader title="Rede & VLANs" description="VLANs, limites de banda, horários de liberação, dispositivos e acesso remoto." />
      <KpiRow>
        <Kpi label="Internet" value={!internet ? '—' : internet.external ? 'Funcionando' : internet.gateway ? 'Sem internet externa' : 'Provedor fora'} tone={!internet ? 'neutral' : internet.external ? 'success' : 'danger'} sub={live ? `↓ ${fmt(live.wan.down)} · ↑ ${fmt(live.wan.up)} Mbps de ${live.link_mbps}` : null} />
        <Kpi label="Dispositivos conectados" value={live ? devices : '—'} sub={live ? `${vlans.filter((v) => v.neighbors > 0).length} de ${vlans.length} VLANs com atividade` : null} />
        <Kpi label="VLANs no limite" value={live ? atLimit.length : '—'} tone={atLimit.length ? 'danger' : 'success'} sub={atLimit.length ? atLimit.map((v) => `${v.id} · ${v.name}`).join(', ') : 'Nenhuma descartando pacotes'} />
        <Kpi label="Tráfego interno" value={live ? `${fmt(vlans.reduce((s, v) => s + (v.internal_down || 0), 0))} Mbps` : '—'} sub="Entre VLANs, fora do link de internet" />
      </KpiRow>
      <Tabs tabs={TABS} value={current} onChange={setTab} />
      {current === 'vlans' ? <VlanTable live={live} /> : null}
      {current === 'qos' ? <QosPanel /> : null}
      {current === 'scheduler' ? <SchedulesPanel /> : null}
      {current === 'access' ? <DevicesPanel /> : null}
      {current === 'link' ? (
        <div className="space-y-4">
          <Panel title="Link do provedor" description="Disponibilidade do gateway do provedor e da internet externa, com histórico de quedas.">
            <DowntimeLog />
          </Panel>
          <RemoteAccessPanel />
        </div>
      ) : null}
    </div>
  );
}
