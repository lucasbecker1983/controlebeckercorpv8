import {
  ActionButton,
  DataToolbar,
  DialogShell,
  EmptyState,
  ModuleHeader,
  Section,
  SegmentedTabs,
  StatusChip,
  Surface,
  TooltipHint,
  cx,
  toneMap,
} from '../ui/primitives';

export const ThemeAwareSurface = Surface;
export const HintTooltip = TooltipHint;
export const StateBadge = StatusChip;
export const SectionCard = Section;
export const EmptyStateBlock = EmptyState;
export const ModuleHero = ModuleHeader;
export { ActionButton, DataToolbar, DialogShell, SegmentedTabs, cx };

export function MetricCard({ icon: Icon, eyebrow, title, value, subtitle, tone = 'neutral', actionLabel, onAction }) {
  return (
    <Surface className="h-full p-[var(--spacing-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className={cx(
          'inline-flex h-9 w-9 items-center justify-center rounded-2xl border xl:h-10 xl:w-10',
          toneMap[tone] || toneMap.neutral,
        )}>
          <Icon size={17} />
        </div>
        {actionLabel && onAction ? (
          <ActionButton tone="ghost" className="px-3 py-1.5" onClick={onAction}>
            {actionLabel}
          </ActionButton>
        ) : null}
      </div>
      {eyebrow ? <div className="mt-3 text-[11px] font-semibold tracking-tight text-on-surface/62 xl:text-[12px]">{eyebrow}</div> : null}
      <div className="mt-1.5 text-[1.55rem] font-black tracking-tight text-on-surface xl:text-2xl">{value}</div>
      <div className="mt-1 text-sm font-semibold text-on-surface">{title}</div>
      {subtitle ? <div className="mt-2 text-sm leading-5 text-on-surface/62 xl:leading-6">{subtitle}</div> : null}
    </Surface>
  );
}

export function InlineStat({ label, value, tone = 'neutral' }) {
  return (
    <div className={cx('rounded-[calc(var(--surface-radius)-4px)] border px-3.5 py-3 xl:px-4 xl:py-3.5', toneMap[tone] || toneMap.neutral)}>
      <div className="text-[11px] font-semibold tracking-tight opacity-78">{label}</div>
      <div className="mt-1.5 text-base font-black tracking-tight xl:text-lg">{value}</div>
    </div>
  );
}

export function VipImpactBadge({ label, tone = 'primary' }) {
  return <StatusChip label={label} tone={tone} />;
}

export function QuickActionBar({ items = [] }) {
  return (
    <div className="blocking-compact-actions flex flex-wrap gap-2">
      {items.map((item) => (
        <ActionButton
          key={item.label}
          tone={item.tone}
          icon={item.icon}
          className="justify-center xl:justify-start"
          onClick={item.onClick}
        >
          {item.label}
        </ActionButton>
      ))}
    </div>
  );
}

export function ListRow({ className = '', children }) {
  return (
    <div className={cx('rounded-[calc(var(--surface-radius)-2px)] border border-outline/12 bg-surface-high/64 p-[var(--spacing-card)] shadow-[var(--shadow-soft)]', className)}>
      {children}
    </div>
  );
}

export function MiniTrendList({ items = [], labelKey = 'label', valueKey = 'value', empty = 'Sem dados suficientes.' }) {
  const max = Math.max(...items.map((item) => Number(item?.[valueKey]) || 0), 1);

  if (!items.length) {
    return <div className="text-sm text-on-surface/55">{empty}</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const label = item?.[labelKey] ?? '—';
        const value = Number(item?.[valueKey]) || 0;
        return (
          <div key={`${label}-${index}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate font-semibold text-on-surface">{label}</span>
              <span className="font-mono text-on-surface/62">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(10, (value / max) * 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
