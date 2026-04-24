import { Database, Eye, LayoutDashboard, LockKeyhole, Network, Server, Settings2, Shield, ShieldAlert, Users } from 'lucide-react';
import Sidebar from './ui/Sidebar';

const menu = [
  {
    section: 'Governança',
    items: [
      { label: 'Centro de Governança', icon: LayoutDashboard, path: '/' },
      { label: 'Políticas & Exceções', icon: LockKeyhole, path: '/bloqueios-liberacoes' },
      { label: 'Identidades & Perfis', icon: Users, path: '/users' },
      { label: 'Configurações Institucionais', icon: Settings2, path: '/settings' },
    ],
  },
  {
    section: 'Controle',
    items: [
      { label: 'Controle de Rede', icon: Network, path: '/network' },
      { label: 'Infraestrutura', icon: Server, path: '/server' },
      { label: 'Observabilidade DNS/Proxy', icon: Eye, path: '/proxy' },
      { label: 'Segurança Operacional', icon: Shield, path: '/security' },
      { label: 'Operações Técnicas', icon: ShieldAlert, path: '/control' },
      { label: 'Continuidade & Backup', icon: Database, path: '/backups' },
    ],
  },
];

export default function AppSidebar(props) {
  return <Sidebar items={menu} {...props} />;
}
