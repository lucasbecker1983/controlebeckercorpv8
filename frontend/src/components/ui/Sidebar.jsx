import { ChevronsLeft, ChevronsRight, LogOut, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

/*
 * Menu lateral. No computador pode ser recolhido (só ícones, com o nome ao passar o mouse); a escolha é do App
 * e fica guardada no navegador. No celular continua sendo a gaveta de sempre (as classes lg: só valem no computador).
 */
export default function Sidebar({ user, items = [], onLogout, isOpen, onClose, collapsed = false, onToggleCollapse }) {
  const location = useLocation();
  const userLabel = user?.name || user?.username || 'Operador';
  const userRole = user?.role || user?.perfil || 'Operador';
  const userInitial = String(userLabel).trim().charAt(0).toUpperCase() || 'U';

  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname === path || location.pathname.startsWith(`${path}/`));

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-scrim transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        id="menu-principal"
        className={`fixed left-0 top-0 z-50 flex h-full w-[var(--sidebar-width)] flex-col border-r border-outline bg-container transition-[transform,width] duration-200 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Menu principal"
      >
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="absolute -right-3 top-[68px] z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-outline bg-container text-on-surface/60 shadow-sm transition-colors hover:border-primary/40 hover:text-primary lg:flex"
            aria-label={collapsed ? 'Expandir o menu' : 'Recolher o menu'}
            aria-expanded={!collapsed}
            aria-controls="menu-principal"
            title={collapsed ? 'Expandir o menu' : 'Recolher o menu'}
          >
            {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        ) : null}

        <div className={`flex h-14 shrink-0 items-center justify-between gap-2 border-b border-outline px-4 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <Link to="/" onClick={onClose} className="flex min-w-0 items-center gap-2.5" title="Visão Geral" aria-label="SGCG, Visão Geral">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold tracking-wide text-on-primary">SG</span>
            <span className={`min-w-0 leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="block text-sm font-bold text-on-surface">SGCG</span>
              <span className="block truncate text-[11px] text-on-surface/55">Governança e Controle</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-on-surface/60 hover:bg-on-surface/5 lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 ${collapsed ? 'lg:px-2' : ''}`}>
          {items.map((group) => (
            <div key={group.section} className={`mb-4 last:mb-0 ${collapsed ? 'lg:mb-2 lg:border-t lg:border-outline lg:pt-2 lg:first:border-t-0 lg:first:pt-0' : ''}`}>
              <div className={`px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-on-surface/45 ${collapsed ? 'lg:hidden' : ''}`}>{group.section}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        aria-label={item.label}
                        title={collapsed ? item.label : undefined}
                        className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
                          active
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'font-medium text-on-surface/75 hover:bg-on-surface/5 hover:text-on-surface'
                        }`}
                      >
                        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} className={`shrink-0 ${item.highlight && !active ? 'text-warning' : ''}`} />
                        <span className={`min-w-0 flex-1 truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`flex shrink-0 items-center gap-2.5 border-t border-outline p-3 ${collapsed ? 'lg:flex-col lg:gap-1.5 lg:px-2' : ''}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary" title={collapsed ? `${userLabel} · ${userRole}` : undefined}>
            {userInitial}
          </div>
          <div className={`min-w-0 flex-1 leading-tight ${collapsed ? 'lg:hidden' : ''}`}>
            <div className="truncate text-sm font-semibold text-on-surface">{userLabel}</div>
            <div className="truncate text-[11.5px] text-on-surface/55">{userRole}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface/55 transition-colors hover:bg-danger/10 hover:text-danger"
            aria-label="Sair do sistema"
            title="Sair do sistema"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
