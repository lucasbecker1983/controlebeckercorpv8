import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  Database,
  FileCheck2,
  Scale,
  ScrollText,
  ShieldCheck,
  UserRoundSearch,
} from 'lucide-react';
import { ModuleHeader, StatusChip, Surface, cx } from '../components/ui/primitives';

const primaryBlocks = [
  {
    title: 'LGPD & Proteção de Dados',
    description: 'Programa institucional, inventário legal, direitos do titular, incidentes, auditoria e fundamentos da Lei nº 13.709/2018.',
    icon: Scale,
    to: '/lgpd',
    tone: 'primary',
  },
  {
    title: 'Governança de Dados',
    description: 'Qualidade, rastreabilidade, postura dos serviços, evidências administrativas e leitura consolidada das bases observáveis.',
    icon: Database,
    to: '/governanca-dados',
    tone: 'success',
  },
];

const quickActions = [
  { title: 'Inventário Art. 37', icon: ClipboardList, to: '/lgpd' },
  { title: 'Direitos do Titular', icon: UserRoundSearch, to: '/lgpd' },
  { title: 'Incidentes LGPD', icon: AlertTriangle, to: '/lgpd' },
  { title: 'Auditoria LGPD', icon: ScrollText, to: '/lgpd' },
  { title: 'Trilha de Dados', icon: FileCheck2, to: '/governanca-dados' },
  { title: 'Postura Operacional', icon: ShieldCheck, to: '/governanca-dados' },
];

const toneClass = {
  primary: 'border-primary/16 bg-primary/10 text-primary',
  success: 'border-info/18 bg-info/10 text-info',
};

function PrimaryCard({ item }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className="group block h-full">
      <Surface stripe={false} className="flex h-full flex-col p-5 transition group-hover:border-primary/22 group-hover:shadow-md sm:p-6">
        <div className={cx('inline-flex h-12 w-12 items-center justify-center rounded-2xl border', toneClass[item.tone])}>
          <Icon size={21} />
        </div>
        <h2 className="mt-5 text-xl font-black tracking-tight text-on-surface">{item.title}</h2>
        <p className="mt-2 flex-1 text-sm leading-6 text-on-surface/62">{item.description}</p>
      </Surface>
    </Link>
  );
}

function QuickAction({ item }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-full border border-outline/12 bg-surface-high/72 px-3.5 py-2 text-sm font-semibold tracking-tight text-on-surface/72 shadow-[var(--shadow-soft)] transition hover:border-primary/18 hover:text-primary"
    >
      <Icon size={15} />
      {item.title}
    </Link>
  );
}

export default function GovernanceCompliance() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ModuleHeader
        eyebrow="Governança"
        title="Conformidade e Dados"
        description="Superfície enxuta para responsabilidade pública, proteção de dados, qualidade de evidência e rastreabilidade. LGPD e dados continuam completos, mas deixam de disputar espaço com operação técnica."
        badges={(
          <>
            <StatusChip label="LGPD" tone="primary" />
            <StatusChip label="Dados auditáveis" tone="success" />
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {primaryBlocks.map((item) => <PrimaryCard key={item.title} item={item} />)}
      </div>

      <Surface stripe={false} className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">Atalhos de conformidade</div>
            <h2 className="mt-2 text-lg font-black tracking-tight text-on-surface">Ações comuns sem abrir outro módulo no menu</h2>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {quickActions.map((item) => <QuickAction key={item.title} item={item} />)}
        </div>
      </Surface>
    </div>
  );
}
