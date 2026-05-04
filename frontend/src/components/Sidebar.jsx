import { Boxes, Eye, FileCheck2, FileText, Fingerprint, Landmark, LayoutDashboard, Network, ScrollText, ServerCog, Settings2, ShieldCheck, Smartphone, UserCog, Waypoints, Wifi } from 'lucide-react';
import Sidebar from './ui/Sidebar';

const menu = [
  {
    section: 'Governança',
    tone: 'governance',
    items: [
      { label: 'Centro de Governança', icon: Landmark, path: '/' },
      { label: 'Políticas Institucionais', icon: Fingerprint, path: '/bloqueios-liberacoes?tab=policies' },
      { label: 'LGPD & Proteção de Dados', icon: ShieldCheck, path: '/lgpd' },
      { label: 'Governança de Dados', icon: ScrollText, path: '/governanca-dados' },
      { label: 'Aprovações & Exceções', icon: FileCheck2, path: '/aprovacoes-excecoes' },
      { label: 'Relatórios Forenses', icon: FileText, path: '/relatorios' },
      { label: 'Identidades & Perfis', icon: UserCog, path: '/users' },
      { label: 'Configurações Institucionais', icon: Settings2, path: '/settings' },
    ],
  },
  {
    section: 'Controle',
    tone: 'control',
    items: [
      { label: 'Controle de Rede', icon: Waypoints, path: '/network' },
      { label: 'Infraestrutura', icon: ServerCog, path: '/server' },
      { label: 'Radar Operacional & Observabilidade', icon: Eye, path: '/proxy' },
      { label: 'Segurança Operacional', icon: Network, path: '/security' },
      { label: 'Hotspot', icon: Wifi, path: '/hotspot' },
      { label: 'Acesso Mobile', icon: Smartphone, path: '/colaboradores-mobile' },
      { label: 'Operações Técnicas', icon: Boxes, path: '/control' },
      { label: 'Continuidade & Backup', icon: LayoutDashboard, path: '/backups' },
    ],
  },
];

export default function AppSidebar(props) {
  return <Sidebar items={menu} {...props} />;
}
