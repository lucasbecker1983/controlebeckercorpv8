import { useEffect, useId, useRef } from 'react';
import clsx from 'clsx';
import { Info, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const cx = (...values) => twMerge(clsx(values));

export const toneMap = {
  neutral: 'border-outline/12 bg-surface-high/72 text-on-surface/70',
  primary: 'border-primary/16 bg-primary/12 text-primary',
  success: 'border-info/18 bg-info/10 text-info',
  warning: 'border-orange-500/22 bg-orange-500/12 text-orange-700 dark:text-orange-300',
  danger: 'border-danger/20 bg-danger/10 text-danger',
  info: 'border-info/18 bg-info/10 text-info',
};

const stripeMap = {
  neutral: 'bg-primary',
  primary: 'bg-primary',
  success: 'bg-info',
  warning: 'bg-orange-500',
  danger: 'bg-danger',
  info: 'bg-info',
};

export function Surface({ className = '', tone = 'neutral', stripe = true, children }) {
  return (
    <div className={cx(
      'relative min-w-0 overflow-hidden rounded-[24px] border shadow-sm backdrop-blur-[var(--blur-soft)] transition-all duration-200 hover:shadow-md',
      toneMap[tone] || toneMap.neutral,
      className,
    )}
    >
      {stripe ? <div className={cx('absolute left-0 top-0 h-1.5 w-full', stripeMap[tone] || stripeMap.neutral)} /> : null}
      {children}
    </div>
  );
}

export function TooltipHint({ label, hint, className = '' }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)} title={hint || ''}>
      <span>{label}</span>
      {hint ? (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-outline/14 bg-surface-high/72 text-on-surface/55">
          <Info size={10} />
        </span>
      ) : null}
    </span>
  );
}

export function StatusChip({ label, tone = 'neutral', className = '', title }) {
  return (
    <span
      title={title || ''}
      className={cx(
        'inline-flex min-h-[var(--chip-height)] items-center justify-center rounded-full border px-[var(--chip-padding-x)] py-1 text-center text-[11px] font-semibold tracking-tight',
        toneMap[tone] || toneMap.neutral,
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ActionButton({ children, icon: Icon, tone = 'neutral', className = '', type = 'button', ...props }) {
  const buttonTone = tone === 'primary'
    ? 'border-primary/18 bg-primary text-on-primary hover:brightness-105'
    : tone === 'success'
      ? 'border-info/18 bg-info/10 text-info hover:bg-info hover:text-white'
      : tone === 'danger'
        ? 'border-danger/18 bg-danger/10 text-danger hover:bg-danger hover:text-white'
        : tone === 'ghost'
          ? 'border-outline/12 bg-transparent text-on-surface/70 hover:border-primary/16 hover:bg-primary/8 hover:text-primary'
          : tone === 'warning'
            ? 'border-orange-500/20 bg-orange-500/12 text-orange-700 hover:bg-orange-500 hover:text-white dark:text-orange-300'
            : tone === 'info'
              ? 'border-info/18 bg-info/10 text-info hover:bg-info hover:text-white'
              : 'border-outline/14 bg-surface-high/72 text-on-surface/78 hover:border-primary/16 hover:text-primary';

  return (
    <button
      type={type}
      {...props}
      className={cx(
        'inline-flex min-h-[var(--control-height)] items-center justify-center gap-2 rounded-full border px-[var(--control-padding-x)] py-2 text-center text-[12px] font-semibold tracking-tight shadow-[var(--shadow-soft)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-container disabled:cursor-not-allowed disabled:opacity-50 xl:text-sm',
        buttonTone,
        className,
      )}
    >
      {Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

export function Section({ title, subtitle, actions, children, className = '' }) {
  return (
    <Surface className={cx('p-[var(--spacing-card)]', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-[var(--text-headline)] font-black tracking-tight text-on-surface">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm leading-6 text-on-surface/60 xl:leading-6">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-3.5 xl:mt-4">{children}</div>
    </Surface>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-7 text-center xl:py-8">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-outline/12 bg-surface-high/72 text-on-surface/50">
        <Icon size={20} />
      </div>
      <div className="mt-4 text-lg font-black text-on-surface">{title}</div>
      <div className="mt-2 text-sm leading-6 text-on-surface/60">{description}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function DialogShell({ open, title, subtitle, onClose, children, footer, size = 'max-w-4xl', align = 'center', panelClassName = '', bodyClassName = '', headerContent = null, bodyScrollable = true }) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.setTimeout(() => {
      const autoFocusable = panelRef.current?.querySelector('[data-autofocus="true"]');
      if (autoFocusable instanceof HTMLElement) {
        autoFocusable.focus();
        return;
      }
      const firstFocusable = panelRef.current?.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (firstFocusable instanceof HTMLElement) firstFocusable.focus();
    }, 0);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-scrim/100 backdrop-blur-[10px]">
      <div className={cx(
        'flex h-dvh min-h-dvh',
        align === 'end' ? 'p-0 sm:p-3 lg:p-4' : 'p-1.5 sm:p-4 lg:p-6',
        align === 'end' ? 'items-stretch justify-end' : 'items-center justify-center',
      )}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitle ? descriptionId : undefined}
          onClick={(event) => event.stopPropagation()}
          className={cx(
            'flex min-h-0 w-full flex-col overflow-hidden border border-outline/14 bg-surface-high/92 shadow-[var(--shadow-high)]',
            align === 'end'
              ? 'h-dvh max-h-dvh rounded-none sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)] sm:max-w-[min(96vw,1040px)] sm:rounded-[var(--dialog-radius)] lg:h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-2rem)]'
              : 'h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] rounded-[28px] sm:h-[min(88dvh,920px)] sm:max-h-[88dvh] sm:rounded-[var(--dialog-radius)]',
            size,
            panelClassName,
          )}
        >
          <div className="shrink-0 border-b border-outline/10 bg-surface-high/92 px-5 py-4 backdrop-blur-[var(--blur-soft)] sm:px-6 sm:py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 max-w-3xl">
                <h3 id={titleId} className="text-lg font-black tracking-tight text-on-surface sm:text-xl xl:text-2xl">{title}</h3>
                {subtitle ? <p id={descriptionId} className="mt-2 text-sm leading-6 text-on-surface/62">{subtitle}</p> : null}
                {headerContent ? <div className="mt-3">{headerContent}</div> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar modal"
                className="inline-flex h-[calc(var(--control-height)+0.25rem)] w-[calc(var(--control-height)+0.25rem)] shrink-0 items-center justify-center rounded-2xl border border-outline/12 bg-surface-high/75 text-on-surface/60 transition-colors hover:border-primary/18 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-container"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div className={cx(
            'min-h-0 flex-1',
            bodyScrollable ? 'overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6' : 'overflow-hidden',
            bodyClassName,
          )}>
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-outline/10 bg-surface-high/95 px-5 py-4 backdrop-blur-[var(--blur-soft)] sm:px-6">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SegmentedTabs({ tabs = [], value, onChange, className = '' }) {
  return (
    <div className={cx('flex gap-2 overflow-x-auto rounded-[var(--surface-radius)] border border-outline/12 bg-surface-high/72 p-2 shadow-[var(--shadow-soft)] lg:flex-wrap', className)}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={active}
            className={`inline-flex min-h-[var(--control-height)] shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-semibold tracking-tight transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-container xl:px-3.5 xl:text-sm ${
              active
                ? 'border-primary/16 bg-primary text-on-primary shadow-[var(--shadow-soft)]'
                : 'border-transparent text-on-surface/64 hover:border-outline/12 hover:bg-surface-highest/40 hover:text-on-surface'
            }`}
          >
            {Icon ? <Icon size={14} /> : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function DataToolbar({ children, className = '' }) {
  return (
    <div className={cx('rounded-[var(--surface-radius)] border border-outline/12 bg-surface-high/66 p-3 shadow-[var(--shadow-soft)]', className)}>
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">{children}</div>
    </div>
  );
}

export function ModuleHeader({ eyebrow, title, description, badges, actions, aside, className = '' }) {
  return (
    <Surface stripe={false} className={cx('overflow-hidden bg-gradient-to-br from-primary/12 via-surface-high/82 to-surface-high/92 p-[var(--spacing-section)]', className)}>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] 2xl:items-start">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="inline-flex items-center rounded-full border border-primary/16 bg-primary/10 px-[var(--chip-padding-x)] py-1 text-[11px] font-semibold tracking-tight text-primary xl:text-[12px]">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-4 text-[var(--text-display)] font-black tracking-tight text-on-surface">{title}</h1>
          {description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface/64 xl:leading-7">{description}</p> : null}
          {badges ? <div className="mt-4 flex flex-wrap gap-2">{badges}</div> : null}
          {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </Surface>
  );
}

export function FormField({ label, hint, error, children, className = '' }) {
  return (
    <label className={cx('flex flex-col gap-2.5', className)}>
      {label ? <span className="text-[12px] font-semibold tracking-tight text-on-surface/72">{label}</span> : null}
      {children}
      {error ? (
        <span className="text-xs leading-5 text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs leading-5 text-on-surface/58">{hint}</span>
      ) : null}
    </label>
  );
}
