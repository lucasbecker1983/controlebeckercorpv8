import { LogOut, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar({ user, items = [], onLogout, isOpen, onClose }) {
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
        className={`fixed left-0 top-0 z-50 flex h-full w-[var(--sidebar-width)] flex-col border-r border-outline bg-container transition-transform duration-200 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Menu principal"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-outline px-4">
          <Link to="/" onClick={onClose} className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold tracking-wide text-on-primary">SG</span>
            <span className="min-w-0 leading-tight">
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

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {items.map((group) => (
            <div key={group.section} className="mb-4 last:mb-0">
              <div className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-on-surface/45">{group.section}</div>
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
                        className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${
                          active
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'font-medium text-on-surface/75 hover:bg-on-surface/5 hover:text-on-surface'
                        }`}
                      >
                        <Icon size={17} strokeWidth={active ? 2.2 : 1.9} className={item.highlight && !active ? 'text-warning' : ''} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5 border-t border-outline p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
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
