import { Link } from 'react-router-dom';
import {
  FileSearch,
  FileText,
  Headphones,
  LockKeyhole,
  Search,
  Settings2,
  ShieldAlert,
  UserCog,
} from 'lucide-react';
import { ModuleHeader, StatusChip, Surface, cx } from '../components/ui/primitives';

const blocks = [
  {
    title: 'Relatórios Forenses',
    description: 'Navegação, DNS/RPZ, Proxy/ACL, UFW, auditoria de sistema, exportação e prova técnica em uma trilha consultável.',
    icon: FileText,
    to: '/relatorios',
    tone: 'primary',
  },
  {
    title: 'Investigação de Navegação',
    description: 'Entrada direta na visão de eventos para buscar IP, VLAN, domínio, ação, fonte ou período com filtros já preparados.',
    icon: Search,
    to: '/relatorios?tab=navigation&view=events',
    tone: 'success',
  },
  {
    title: 'Central de Chamados',
    description: 'Ocorrências operacionais e solicitações que precisam virar evidência, decisão ou correção rastreável.',
    icon: Headphones,
    to: '/chamados',
    tone: 'info',
  },
  {
    title: 'Auditoria do Sistema',
    description: 'Eventos administrativos, autenticação, LGPD e políticas sob leitura de controle interno.',
    icon: ShieldAlert,
    to: '/relatorios?tab=audit',
    tone: 'warning',
  },
  {
    title: 'Identidades & Perfis',
    description: 'Usuários, papéis e responsabilidades que dão autoria às decisões e aos registros institucionais.',
    icon: UserCog,
    to: '/users',
    tone: 'neutral',
  },
  {
    title: 'Configurações Institucionais',
    description: 'Parâmetros globais do sistema, identidade visual, preferências e ajustes administrativos de base.',
    icon: Settings2,
    to: '/settings',
    tone: 'neutral',
  },
];

const toneClass = {
  primary: 'border-primary/16 bg-primary/10 text-primary',
  success: 'border-info/18 bg-info/10 text-info',
  warning: 'border-orange-500/22 bg-orange-500/12 text-orange-700 dark:text-orange-300',
  info: 'border-sky-500/18 bg-sky-500/10 text-sky-600',
  neutral: 'border-outline/12 bg-surface-high/72 text-on-surface/62',
};

function AuditCard({ item }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className="group block h-full">
      <Surface stripe={false} className="flex h-full flex-col p-5 transition group-hover:border-primary/22 group-hover:shadow-md sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className={cx('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border', toneClass[item.tone])}>
            <Icon size={21} />
          </div>
          <LockKeyhole size={16} className="text-on-surface/34" />
        </div>
        <h2 className="mt-5 text-lg font-black tracking-tight text-on-surface">{item.title}</h2>
        <p className="mt-2 flex-1 text-sm leading-6 text-on-surface/62">{item.description}</p>
      </Surface>
    </Link>
  );
}

export default function GovernanceAudit() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ModuleHeader
        eyebrow="Governança"
        title="Auditoria e Evidências"
        description="Investigação, prova, chamados e administração de autoria ficam agrupados em uma única frente. O usuário entra pela necessidade de comprovar, não pelo nome técnico da fonte."
        badges={(
          <>
            <StatusChip label="Investigação" tone="primary" />
            <StatusChip label="Prova institucional" tone="success" />
          </>
        )}
        actions={(
          <Link
            to="/relatorios?tab=navigation&view=events"
            className="inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-full border border-primary/18 bg-primary px-[var(--control-padding-x)] py-2 text-sm font-semibold tracking-tight text-on-primary shadow-[var(--shadow-soft)] transition hover:brightness-105"
          >
            <FileSearch size={15} />
            Investigar agora
          </Link>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {blocks.map((item) => <AuditCard key={item.title} item={item} />)}
      </div>
    </div>
  );
}
