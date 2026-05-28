import { Link } from 'react-router-dom';
import {
  Activity,
  Flame,
  Layers3,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ModuleHeader, StatusChip, Surface, cx } from '../components/ui/primitives';

const blocks = [
  {
    title: 'Políticas Institucionais',
    description: 'Bloqueios, liberações, escopos por VLAN, DNS interno e regras oficiais aplicadas pelo motor institucional.',
    icon: Layers3,
    to: '/bloqueios-liberacoes?tab=policies',
    tone: 'primary',
    meta: 'Decidir regras',
  },
  {
    title: 'Aprovações & Exceções',
    description: 'Leitura formal de vigência, autoria, exceções ativas e justificativas sem expor toda a mecânica operacional.',
    icon: ShieldCheck,
    to: '/aprovacoes-excecoes',
    tone: 'success',
    meta: 'Autorizar exceções',
  },
  {
    title: 'Exceções VIP',
    description: 'Bypass total, exceções por IP, duração, revisão e impacto real nas camadas DNS, ACL, RPZ e firewall.',
    icon: ShieldAlert,
    to: '/bloqueios-liberacoes?tab=vips',
    tone: 'warning',
    meta: 'Gerir VIPs',
  },
  {
    title: 'Contingência DNS',
    description: 'Ativação, renovação e encerramento de fallback público como ato rastreável, com escopo e prazo explícitos.',
    icon: Flame,
    to: '/bloqueios-liberacoes?tab=contingency',
    tone: 'danger',
    meta: 'Conter falhas',
  },
  {
    title: 'Exceções Temporárias',
    description: 'Liberações esporádicas, acesso pontual e ajustes de curta duração para demandas administrativas controladas.',
    icon: Zap,
    to: '/bloqueios-liberacoes?tab=sporadic',
    tone: 'info',
    meta: 'Liberar pontualmente',
  },
  {
    title: 'Telemetria de Política',
    description: 'Pressão de bloqueios, domínios recorrentes e leitura de efeito das políticas sem sair do eixo decisório.',
    icon: Activity,
    to: '/bloqueios-liberacoes?tab=metrics',
    tone: 'neutral',
    meta: 'Medir efeito',
  },
];

const toneClass = {
  primary: 'border-primary/16 bg-primary/10 text-primary',
  success: 'border-info/18 bg-info/10 text-info',
  warning: 'border-orange-500/22 bg-orange-500/12 text-orange-700 dark:text-orange-300',
  danger: 'border-danger/20 bg-danger/10 text-danger',
  info: 'border-sky-500/18 bg-sky-500/10 text-sky-600',
  neutral: 'border-outline/12 bg-surface-high/72 text-on-surface/62',
};

function EntryCard({ item }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className="group block h-full">
      <Surface stripe={false} className="flex h-full flex-col p-5 transition group-hover:border-primary/22 group-hover:shadow-md sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className={cx('inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border', toneClass[item.tone])}>
            <Icon size={21} />
          </div>
          <StatusChip label={item.meta} tone={item.tone === 'danger' ? 'danger' : item.tone === 'warning' ? 'warning' : 'primary'} />
        </div>
        <h2 className="mt-5 text-lg font-black tracking-tight text-on-surface">{item.title}</h2>
        <p className="mt-2 flex-1 text-sm leading-6 text-on-surface/62">{item.description}</p>
      </Surface>
    </Link>
  );
}

export default function GovernancePolicies() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ModuleHeader
        eyebrow="Governança"
        title="Políticas e Exceções"
        description="Entrada única para decisões institucionais de bloqueio, liberação, contingência e exceção. A operação completa permanece disponível, mas organizada por intenção."
        badges={(
          <>
            <StatusChip label="Decisão formal" tone="primary" />
            <StatusChip label="Enforcement rastreável" tone="success" />
          </>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {blocks.map((item) => <EntryCard key={item.title} item={item} />)}
      </div>
    </div>
  );
}
