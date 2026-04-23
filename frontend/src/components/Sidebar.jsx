import { Database, Eye, LayoutDashboard, LockKeyhole, Network, Server, Settings2, Shield, ShieldAlert, Users } from 'lucide-react';
import Sidebar from './ui/Sidebar';

const menu = [
  { label: 'Visão Geral', icon: LayoutDashboard, path: '/' },
  { label: 'Servidor', icon: Server, path: '/server' },
  { label: 'Rede & IP', icon: Network, path: '/network' },
  { label: 'Gestão de Usuários', icon: Users, path: '/users' },
  { label: 'Proxy & Logs', icon: Eye, path: '/proxy' },
  { label: 'Bloqueios & Liberações', icon: LockKeyhole, path: '/bloqueios-liberacoes' },
  { label: 'Controle', icon: ShieldAlert, path: '/control' },
  { label: 'Cofre de Backup', icon: Database, path: '/backups' },
  { label: 'Segurança (SOC)', icon: Shield, path: '/security' },
  { label: 'Configurações', icon: Settings2, path: '/settings' },
];

export default function AppSidebar(props) {
  return <Sidebar items={menu} {...props} />;
}
