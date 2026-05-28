import { Bot, Boxes, Eye, FileSearch, Landmark, LayoutDashboard, Network, Scale, ServerCog, ShieldCheck, Smartphone, Waypoints, Wifi } from 'lucide-react';
import Sidebar from './ui/Sidebar';

const menu = [
  {
    section: 'Governança',
    tone: 'governance',
    items: [
      {
        label: 'Painel Executivo',
        icon: Landmark,
        path: '/',
        matchPaths: ['/governanca-visual'],
      },
      {
        label: 'Políticas e Exceções',
        icon: ShieldCheck,
        path: '/governanca-politicas',
        matchPaths: ['/bloqueios-liberacoes', '/aprovacoes-excecoes'],
      },
      {
        label: 'Conformidade e Dados',
        icon: Scale,
        path: '/governanca-conformidade',
        matchPaths: ['/lgpd', '/governanca-dados'],
      },
      {
        label: 'Auditoria e Evidências',
        icon: FileSearch,
        path: '/governanca-auditoria',
        matchPaths: ['/relatorios', '/chamados', '/users', '/settings'],
      },
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
      { label: 'Assistente IA', icon: Bot, path: '/assistente-ia' },
      { label: 'Operações Técnicas', icon: Boxes, path: '/control' },
      { label: 'Continuidade & Backup', icon: LayoutDashboard, path: '/backups' },
    ],
  },
];

export default function AppSidebar(props) {
  return <Sidebar items={menu} {...props} />;
}
