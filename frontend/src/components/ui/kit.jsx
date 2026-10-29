import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/*
 * Kit padrão de módulos do SGCG.
 * Toda tela segue a mesma ordem: PageHeader → KpiRow → Tabs → Panels (tabelas, formulários)
 * → RiskZone para ações perigosas. Confirmações e avisos nunca usam alert/confirm do navegador.
 */

export const inputCls = 'w-full rounded-lg border border-outline bg-container px-3 py-2 text-sm text-on-surface outline-none placeholder:text-on-surface/35 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

const TONES = {
  neutral: { text: 'text-on-surface/70', bg: 'bg-on-surface/[0.06]', border: 'border-outline', dot: 'bg-on-surface/40' },
  primary: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/25', dot: 'bg-primary' },
  success: { text: 'text-success', bg: 'bg-success/10', border: 'border-success/25', dot: 'bg-success' },
  warning: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/25', dot: 'bg-warning' },
  danger: { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/25', dot: 'bg-danger' },
};
export const tone = (name) => TONES[name] || TONES.neutral;

export function PageHeader({ title, description, actions, meta }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface/60">{description}</p> : null}
        {meta ? <div className="mt-1 text-[12px] text-on-surface/45">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Kpi({ label, value, sub, tone: t = 'neutral', icon: Icon }) {
  const c = tone(t);
  return (
    <div className="sgcg-card flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-on-surface/55">
        {Icon ? <Icon size={14} /> : null}{label}
      </div>
      <div className={`tabular text-2xl font-bold tracking-tight ${t === 'neutral' ? 'text-on-surface' : c.text}`}>{value}</div>
      {sub ? <div className="text-[12.5px] text-on-surface/55">{sub}</div> : null}
    </div>
  );
}

export function KpiRow({ children }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function Badge({ tone: t = 'neutral', children, dot = false }) {
  const c = tone(t);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11.5px] font-semibold ${c.text} ${c.bg} ${c.border}`}>
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} /> : null}
      {children}
    </span>
  );
}

export function Button({ variant = 'secondary', icon: Icon, children, className = '', type = 'button', ...props }) {
  const styles = {
    primary: 'border-primary bg-primary text-on-primary hover:brightness-110',
    secondary: 'border-outline bg-container text-on-surface/80 hover:border-primary/40 hover:text-primary',
    danger: 'border-danger bg-danger text-white hover:brightness-110',
    'danger-soft': 'border-danger/30 bg-danger/8 text-danger hover:bg-danger hover:text-white',
    ghost: 'border-transparent text-on-surface/65 hover:bg-on-surface/5 hover:text-on-surface',
  };
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant] || styles.secondary} ${className}`}
    >
      {Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

// Abas ligadas ao endereço (?tab=), para dá para mandar o link de uma aba específica.
export function useUrlTab(tabs, fallback) {
  const [params, setParams] = useSearchParams();
  const keys = tabs.map((t) => t.key);
  const current = keys.includes(params.get('tab')) ? params.get('tab') : (fallback || keys[0]);
  const setTab = useCallback((key) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  }, [params, setParams]);
  return [current, setTab];
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-outline" role="tablist">
      {tabs.map((t) => {
        const on = t.key === value;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${on ? 'border-primary text-primary' : 'border-transparent text-on-surface/60 hover:text-on-surface'}`}
          >
            {Icon ? <Icon size={15} /> : null}
            {t.label}
            {t.count != null ? <span className={`tabular rounded-full px-1.5 text-[11px] ${on ? 'bg-primary/12' : 'bg-on-surface/8'}`}>{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({ title, description, actions, children, className = '', padded = true }) {
  return (
    <section className={`sgcg-card min-w-0 ${className}`}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-on-surface">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[12.5px] leading-5 text-on-surface/55">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function DataTable({ columns, rows, rowKey = 'id', empty = 'Nada para mostrar.', onRowClick }) {
  if (!rows?.length) return <p className="px-4 py-6 text-center text-sm text-on-surface/55">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="border-b border-outline text-left text-[11px] uppercase tracking-wide text-on-surface/45">
            {columns.map((c) => <th key={c.key} className={`px-4 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline">
          {rows.map((row, i) => (
            <tr key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey] ?? i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-on-surface/[0.03]' : ''}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 align-middle ${c.align === 'right' ? 'text-right' : ''} ${c.mono ? 'tabular' : ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ tone: t = 'primary', title, children, action }) {
  const c = tone(t);
  const Icon = t === 'danger' ? XCircle : t === 'warning' ? AlertTriangle : t === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${c.border} ${c.bg}`}>
      <Icon size={17} className={`mt-0.5 shrink-0 ${c.text}`} />
      <div className="min-w-0 flex-1 text-[13px] leading-5 text-on-surface/80">
        {title ? <div className={`font-semibold ${c.text}`}>{title}</div> : null}
        {children}
      </div>
      {action}
    </div>
  );
}

export function RiskZone({ title = 'Zona de risco', description, children }) {
  return (
    <section className="rounded-[var(--surface-radius)] border border-danger/30 bg-container">
      <div className="border-b border-danger/20 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-danger"><AlertTriangle size={16} />{title}</h2>
        {description ? <p className="mt-0.5 text-[12.5px] text-on-surface/60">{description}</p> : null}
      </div>
      <div className="divide-y divide-outline">{children}</div>
    </section>
  );
}

export function RiskItem({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-on-surface">{title}</div>
        <div className="text-[12.5px] leading-5 text-on-surface/60">{description}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export function Field({ id, label, hint, error, children }) {
  return (
    <div>
      {label ? <label htmlFor={id} className="mb-1 block text-[12.5px] font-semibold text-on-surface/75">{label}</label> : null}
      {children}
      {error ? <p className="mt-1 text-[11.5px] text-danger">{error}</p> : hint ? <p className="mt-1 text-[11.5px] text-on-surface/50">{hint}</p> : null}
    </div>
  );
}

/*
 * Confirmação dentro da página. Com minReason, exige justificativa registrada na auditoria.
 */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', tone: t = 'primary', minReason = 0, reasonLabel = 'Justificativa', busy = false, error, onConfirm, onClose, children }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);
  if (!open) return null;
  const valid = reason.trim().length >= minReason;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-scrim p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="w-full max-w-md rounded-xl border border-outline bg-container shadow-[var(--shadow-medium)]">
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <h2 id="confirm-title" className="text-base font-semibold text-on-surface">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1 text-on-surface/50 hover:bg-on-surface/5" aria-label="Fechar"><X size={17} /></button>
        </div>
        <div className="space-y-3 px-5 py-3 text-[13.5px] leading-6 text-on-surface/70">
          {description ? <p>{description}</p> : null}
          {children}
          {minReason > 0 ? (
            <Field id="confirm-reason" label={reasonLabel} hint={`Mínimo de ${minReason} caracteres. Fica registrado na auditoria.`}>
              <textarea id="confirm-reason" className={`${inputCls} min-h-[72px]`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-outline px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant={t === 'danger' ? 'danger' : 'primary'} disabled={busy || !valid} onClick={() => onConfirm?.(reason.trim())}>{busy ? 'Aguarde...' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// Avisos curtos no canto da tela, disparados de qualquer módulo com toast('...').
export function toast(message, t = 'success') {
  window.dispatchEvent(new CustomEvent('sgcg:toast', { detail: { message, tone: t, id: Date.now() + Math.random() } }));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const item = e.detail;
      setItems((list) => [...list.slice(-3), item]);
      window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== item.id)), item.tone === 'danger' ? 8000 : 4500);
    };
    window.addEventListener('sgcg:toast', onToast);
    return () => window.removeEventListener('sgcg:toast', onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <Notice tone={item.tone}>{item.message}</Notice>
        </div>
      ))}
    </div>
  );
}

export const errorMessage = (error, fallback = 'Não foi possível concluir a ação.') => error?.response?.data?.error || error?.message || fallback;
export const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};
