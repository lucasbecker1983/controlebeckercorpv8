import { Activity, Cpu, EyeOff, FileBarChart2, Flame, Globe, Server, Wifi } from 'lucide-react';
import { PageHeader, Tabs, useUrlTab } from '../components/ui/kit';
import EnginePanel from '../components/dns/EnginePanel';
import ContingencyPanel from '../components/dns/ContingencyPanel';
import DnsIgnored from '../components/dns/DnsIgnored';
import DnsMetrics from '../components/dns/DnsMetrics';
import LiveQueries from '../components/dns/LiveQueries';
import DnsInstitutional from '../components/network/DnsInstitutional';
import { ProxyReports, SquidPanel } from '../components/proxy/ProxyPanels';

const TABS = [
  { key: 'dns', label: 'DNS institucional', icon: Globe },
  { key: 'engine', label: 'Motor de filtragem', icon: Cpu },
  { key: 'contingency', label: 'Contingência', icon: Flame },
  { key: 'ignored', label: 'Domínios ignorados', icon: EyeOff },
  { key: 'observability', label: 'Consultas ao vivo', icon: Wifi },
  { key: 'metrics', label: 'Estatísticas', icon: Activity },
  { key: 'squid', label: 'Proxy Squid', icon: Server },
  { key: 'proxy-reports', label: 'Relatórios do proxy', icon: FileBarChart2 },
];

export default function DnsProxy() {
  const [tab, setTab] = useUrlTab(TABS, 'dns');
  return (
    <div className="space-y-4">
      <PageHeader title="DNS & Proxy" description="Resolvedor DNS da rede, motor que aplica os bloqueios, contingência quando o DNS falha e estatísticas." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'dns' ? <DnsInstitutional /> : null}
      {tab === 'squid' ? <SquidPanel /> : null}
      {tab === 'proxy-reports' ? <ProxyReports /> : null}
      {tab === 'engine' ? <EnginePanel /> : null}
      {tab === 'contingency' ? <ContingencyPanel /> : null}
      {tab === 'ignored' ? <DnsIgnored /> : null}
      {tab === 'metrics' ? <DnsMetrics /> : null}
      {tab === 'observability' ? <LiveQueries /> : null}
    </div>
  );
}
