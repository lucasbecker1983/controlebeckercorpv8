import { ConfirmHost, ToastHost } from './kit';

// `collapsed`: menu recolhido no computador (largura de só ícones). No celular a largura do menu não muda.
export default function AppShell({ sidebar, topbar, footer, children, collapsed = false }) {
  return (
    <div className={`flex h-screen w-full overflow-hidden bg-surface text-on-surface transition-colors duration-300 ${collapsed ? 'lg:[--sidebar-width:72px]' : ''}`}>
      {sidebar}
      <main className="relative flex h-full min-w-0 w-full flex-1 flex-col overflow-y-auto transition-[margin] duration-200 lg:ml-[var(--sidebar-width)]">
        {topbar}
        <div className="flex-1 px-[var(--app-shell-gutter-x)] py-[var(--app-shell-gutter-y)]">
          <div className="mx-auto max-w-[var(--app-shell-content-max)]">
            {children}
          </div>
        </div>
        {footer ? (
          <footer className="flex-shrink-0 px-[var(--app-shell-gutter-x)] pb-[var(--app-shell-gutter-y)] pt-1">
            <div className="mx-auto flex max-w-[var(--app-shell-content-max)] justify-end">
              {footer}
            </div>
          </footer>
        ) : null}
      </main>
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
