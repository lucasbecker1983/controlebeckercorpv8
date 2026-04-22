export default function AppShell({ sidebar, topbar, footer, children }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface text-on-surface transition-colors duration-300">
      {sidebar}
      <main className="relative flex h-full w-full flex-1 flex-col overflow-y-auto lg:ml-[var(--sidebar-width)]">
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
    </div>
  );
}
