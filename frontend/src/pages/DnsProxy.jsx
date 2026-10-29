import { Activity, Cpu, EyeOff, Flame, Globe, Wifi } from 'lucide-react';
import { PageHeader, Tabs, useUrlTab } from '../components/ui/kit';
import BlockingReleases from './BlockingReleases';
import DnsInstitutional from '../components/network/DnsInstitutional';

const TABS = [
  { key: 'dns', label: 'DNS institucional', icon: Globe },
  { key: 'engine', label: 'Motor de filtragem', icon: Cpu },
  { key: 'contingency', label: 'Contingência', icon: Flame },
  { key: 'ignored', label: 'Domínios ignorados', icon: EyeOff },
  { key: 'observability', label: 'Consultas ao vivo', icon: Wifi },
  { key: 'metrics', label: 'Estatísticas', icon: Activity },
];

export default function DnsProxy() {
  const [tab, setTab] = useUrlTab(TABS, 'dns');
  return (
    <div className="space-y-4">
      <PageHeader title="DNS & Proxy" description="Resolvedor DNS da rede, motor que aplica os bloqueios, contingência quando o DNS falha e estatísticas." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'dns' ? <DnsInstitutional /> : <BlockingReleases key={tab} allowedTabs={[tab]} initialTab={tab} hideHeader showQuickPanels={false} />}
    </div>
  );
}
