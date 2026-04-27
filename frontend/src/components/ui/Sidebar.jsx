import { LogOut, ShieldCheck, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar({ user, items = [], onLogout, isOpen, onClose }) {
  const location = useLocation();
  const userLabel = user?.name || user?.username || 'Operador';
  const userRole = user?.role || user?.perfil || 'Operador institucional';
  const userInitial = String(userLabel).trim().charAt(0).toUpperCase() || 'U';
  const currentUrl = `${location.pathname}${location.search}`;
  const sectionToneMap = {
    governance: {
      pill: 'border-primary/16 bg-primary/10 text-primary',
      rail: 'bg-primary/40',
      panel: 'border-primary/10 bg-primary/6',
    },
    control: {
      pill: 'border-info/16 bg-info/10 text-info',
      rail: 'bg-info/40',
      panel: 'border-info/10 bg-info/6',
    },
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-scrim/100 backdrop-blur-sm transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside className={`fixed left-0 top-0 z-50 flex h-full w-[var(--sidebar-width)] flex-col border-r border-outline/12 bg-surface-low/92 shadow-[var(--shadow-medium)] backdrop-blur-[18px] transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-outline/10 px-[var(--sidebar-padding)] py-[var(--sidebar-padding)]">
          <div className="relative">
            <div className="flex min-w-0 flex-col items-center text-center">
              <div className="inline-flex rounded-full border border-primary/16 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-primary">
                SGCG
              </div>
              <h2 className="mt-2 text-sm font-black leading-tight tracking-tight text-on-surface xl:text-base">
                Sistema de Governança e Controle Governamental
              </h2>
              <p className="mt-1 max-w-[16rem] text-xs text-on-surface/74">Plataforma institucional da JMB Tecnologia</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute right-0 top-0 inline-flex h-[var(--control-height)] w-[var(--control-height)] items-center justify-center rounded-full border border-outline/15 bg-surface-high/70 text-on-surface/70 transition-colors hover:border-primary/18 hover:text-primary lg:hidden"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-[var(--sidebar-section-padding)] py-[var(--sidebar-section-padding)]">
          <div className="space-y-6">
            {items.map((group) => (
              <div key={group.section} className={`rounded-[26px] border p-3 ${sectionToneMap[group.tone]?.panel || 'border-outline/10 bg-surface-high/52'}`}>
                <div className="mb-3 flex items-center gap-3 px-2">
                  <div className={`h-8 w-1.5 rounded-full ${sectionToneMap[group.tone]?.rail || 'bg-outline/30'}`} />
                  <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${sectionToneMap[group.tone]?.pill || 'border-outline/12 bg-surface-high/70 text-on-surface/62'}`}>
                    {group.section}
                  </div>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = item.path === '/'
                      ? location.pathname === '/'
                      : item.path.includes('?')
                        ? currentUrl === item.path || location.pathname === item.path.split('?')[0]
                        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={`group relative flex items-center gap-3 rounded-[calc(var(--surface-radius)-4px)] px-3 py-2.5 text-[13px] transition-all xl:px-3.5 xl:py-3 xl:text-sm ${
                          active
                            ? 'border border-primary/18 bg-primary/14 text-on-surface shadow-[var(--shadow-soft)]'
                            : 'border border-transparent text-on-surface/68 hover:border-outline/12 hover:bg-surface-high/60 hover:text-on-surface'
                        }`}
                      >
                        {active ? (
                          <span className="absolute left-1.5 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_1px_rgba(var(--color-primary),0.18)]" />
                        ) : null}
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors xl:h-9 xl:w-9 ${
                          active
                            ? 'border-primary/18 bg-primary text-on-primary shadow-[0_10px_22px_-14px_rgba(var(--color-primary),0.9)]'
                            : 'border-outline/12 bg-surface-high/72 text-on-surface/64 group-hover:border-primary/18 group-hover:text-primary'
                        }`}>
                          <Icon size={16.5} strokeWidth={2.1} />
                        </span>
                        <span className={`min-w-0 flex-1 font-semibold tracking-tight ${active ? 'text-on-surface' : ''}`}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-outline/10 p-[var(--sidebar-section-padding)]">
          <div className="flex items-center gap-3 rounded-[calc(var(--surface-radius)-4px)] border border-outline/12 bg-surface-high/64 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/18 bg-primary text-sm font-black text-on-primary shadow-[var(--shadow-soft)]">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-on-surface truncate">{userLabel}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium tracking-tight text-on-surface/62">
                <ShieldCheck size={13} className="text-primary" />
                <span className="truncate">{userRole}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-danger/18 bg-danger/10 text-danger transition-all hover:bg-danger hover:text-white"
              aria-label="Logout do sistema"
              title="Logout do sistema"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
