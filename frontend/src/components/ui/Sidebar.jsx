import { LogOut, ShieldCheck, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar({ user, items = [], onLogout, isOpen, onClose }) {
  const location = useLocation();
  const userLabel = user?.name || user?.username || 'Operador';
  const userRole = user?.role || user?.perfil || 'Operador institucional';
  const userInitial = String(userLabel).trim().charAt(0).toUpperCase() || 'U';

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-scrim/100 backdrop-blur-sm transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside className={`fixed left-0 top-0 z-50 flex h-full w-[var(--sidebar-width)] flex-col border-r border-outline/12 bg-surface-low/92 shadow-[var(--shadow-medium)] backdrop-blur-[18px] transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-outline/10 px-[var(--sidebar-padding)] py-[var(--sidebar-padding)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <img src="/jmb-logo.png" alt="JMB Tecnologia" className="h-12 w-auto" />
              <div className="mt-3 inline-flex rounded-full border border-primary/16 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                SGCG
              </div>
              <h2 className="mt-2.5 text-base font-black leading-tight tracking-tight text-on-surface xl:text-lg">
                Sistema de Governança e Controle Governamental
              </h2>
              <p className="mt-1 text-xs text-on-surface/54 xl:text-sm">Plataforma institucional da JMB Tecnologia</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-[var(--control-height)] w-[var(--control-height)] items-center justify-center rounded-full border border-outline/15 bg-surface-high/70 text-on-surface/70 transition-colors hover:border-primary/18 hover:text-primary lg:hidden"
              aria-label="Fechar menu"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-[var(--sidebar-section-padding)] py-[var(--sidebar-section-padding)]">
          <div className="px-2.5 pb-2.5 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface/38">
            Módulos
          </div>
          <div className="space-y-1">
            {items.map((item) => {
              const active = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={`group flex items-center gap-2.5 rounded-[calc(var(--surface-radius)-4px)] px-3 py-2.5 text-[13px] transition-all xl:px-3.5 xl:py-3 xl:text-sm ${
                    active
                      ? 'border border-primary/16 bg-primary/12 text-on-surface shadow-[var(--shadow-soft)]'
                      : 'border border-transparent text-on-surface/68 hover:border-outline/12 hover:bg-surface-high/60 hover:text-on-surface'
                  }`}
                >
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors xl:h-9 xl:w-9 ${
                    active
                      ? 'border-primary/18 bg-primary text-on-primary'
                      : 'border-outline/12 bg-surface-high/72 text-on-surface/64 group-hover:border-primary/18 group-hover:text-primary'
                  }`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1 font-semibold tracking-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-outline/10 p-[var(--sidebar-section-padding)]">
          <div className="flex items-center gap-3 rounded-[calc(var(--surface-radius)-4px)] border border-outline/12 bg-surface-high/64 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/18 bg-primary text-sm font-black text-on-primary shadow-[var(--shadow-soft)]">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-on-surface truncate">{userLabel}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-on-surface/48">
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
