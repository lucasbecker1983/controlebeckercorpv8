import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Database,
  FileBarChart,
  Globe,
  HardDrive,
  LayoutDashboard,
  LifeBuoy,
  Network,
  Radar,
  Scale,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Users,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import Sidebar from './ui/Sidebar';

// Menu organizado pelo que se faz no dia a dia. Toda tela do sistema fica a um clique.
export const MENU = [
  {
    section: 'Monitorar',
    items: [
      { label: 'Visão Geral', icon: LayoutDashboard, path: '/' },
      { label: 'Mapa de Tráfego', icon: Activity, path: '/mapa-trafego' },
      { label: 'Radar DNS', icon: Radar, path: '/radar-dns' },
      { label: 'Servidor', icon: Server, path: '/servidor' },
    ],
  },
  {
    section: 'Controlar',
    items: [
      { label: 'Ações Rápidas', icon: Zap, path: '/acoes-rapidas', highlight: true },
      { label: 'Rede & VLANs', icon: Network, path: '/rede' },
      { label: 'Políticas de Acesso', icon: ShieldCheck, path: '/politicas' },
      { label: 'DNS & Proxy', icon: Globe, path: '/dns-proxy' },
      { label: 'Segurança', icon: Shield, path: '/seguranca' },
    ],
  },
  {
    section: 'Atender',
    items: [
      { label: 'Chamados', icon: LifeBuoy, path: '/chamados' },
      { label: 'Hotspot Visitantes', icon: Wifi, path: '/hotspot' },
      { label: 'Colaboradores', icon: Smartphone, path: '/colaboradores' },
    ],
  },
  {
    section: 'Governar',
    items: [
      { label: 'Auditoria', icon: ScrollText, path: '/auditoria' },
      { label: 'Relatórios', icon: FileBarChart, path: '/relatorios' },
      { label: 'Indicadores', icon: BarChart3, path: '/indicadores' },
      { label: 'Aprovações & Exceções', icon: CheckCircle2, path: '/aprovacoes' },
      { label: 'LGPD', icon: Scale, path: '/lgpd' },
      { label: 'Governança de Dados', icon: Database, path: '/dados' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { label: 'Operações', icon: Wrench, path: '/operacoes' },
      { label: 'Backups', icon: HardDrive, path: '/backups' },
      { label: 'Assistente IA', icon: Bot, path: '/assistente-ia' },
      { label: 'Usuários', icon: Users, path: '/usuarios' },
      { label: 'Configurações', icon: Settings, path: '/configuracoes' },
    ],
  },
];

export default function AppSidebar(props) {
  return <Sidebar items={MENU} {...props} />;
}
