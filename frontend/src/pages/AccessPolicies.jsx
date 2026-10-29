import { Layers3, Network, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice, PageHeader, Tabs, useUrlTab } from '../components/ui/kit';
import BlockingReleases from './BlockingReleases';

const TABS = [
  { key: 'policies', label: 'Regras de sites', icon: Layers3 },
  { key: 'vlans', label: 'Regras por VLAN', icon: Network },
  { key: 'vips', label: 'Exceções VIP', icon: ShieldAlert },
  { key: 'sporadic', label: 'Liberações temporárias', icon: Zap },
  { key: 'overview', label: 'Resumo', icon: ShieldCheck },
];

export default function AccessPolicies() {
  const [tab, setTab] = useUrlTab(TABS, 'policies');
  return (
    <div className="space-y-4">
      <PageHeader title="Políticas de Acesso" description="O que cada VLAN pode acessar, exceções VIP e liberações com prazo." />
      <Notice tone="primary">Para liberar ou bloquear um site, ou dar prioridade de banda a alguém, o caminho mais curto é <Link to="/acoes-rapidas" className="font-semibold text-primary">Ações Rápidas</Link>.</Notice>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <BlockingReleases key={tab} allowedTabs={[tab]} initialTab={tab} hideHeader showQuickPanels={tab === 'policies'} />
    </div>
  );
}
