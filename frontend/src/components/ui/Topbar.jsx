import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowDown, ArrowUp, Menu, Moon, Sun } from 'lucide-react';
import { api } from '../../services/api';
import SupportBell from '../SupportBell';
import { MENU } from '../Sidebar';

const fmt = (value = 0) => (value >= 100 ? value.toFixed(0) : value.toFixed(1)).replace('.', ',');

function currentTitle(pathname) {
  for (const group of MENU) {
    for (const item of group.items) {
      if (item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(`${item.path}/`)) {
        return { section: group.section, label: item.label };
      }
    }
  }
  return { section: '', label: '' };
}

export default function Topbar({ theme, onToggleTheme, onOpenMenu }) {
  const location = useLocation();
  const [live, setLive] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get('/api/monitor/live');
        if (!alive) return;
        setLive(res.data);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const title = currentTitle(location.pathname);
  const internet = live?.internet;
  const online = !failed && (internet ? internet.external : true);
  const statusLabel = failed
    ? 'Servidor sem resposta'
    : !internet || internet.external
      ? 'Internet OK'
      : internet.gateway
        ? 'Sem internet externa'
        : 'Provedor fora do ar';

  return (
    <header className="sticky top-0 z-30 border-b border-outline bg-container px-[var(--app-shell-gutter-x)]">
      <div className="mx-auto flex h-14 max-w-[var(--app-shell-content-max)] items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-on-surface/70 hover:bg-on-surface/5 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0 flex-1 leading-tight">
          {title.section ? <div className="text-[11px] font-medium text-on-surface/50">{title.section}</div> : null}
          <div className="truncate text-sm font-semibold text-on-surface">{title.label || 'SGCG'}</div>
        </div>

        <div
          className={`hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold sm:inline-flex ${online ? 'border-success/25 text-success' : 'border-danger/30 bg-danger/8 text-danger'}`}
          title={internet ? `Provedor ${internet.provider}: gateway ${internet.gateway ? 'responde' : 'não responde'}; internet externa ${internet.external ? 'responde' : 'não responde'}` : ''}
        >
          <span className={`h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-danger'}`} />
          {statusLabel}
        </div>

        {live?.wan ? (
          <div className="tabular hidden items-center gap-3 rounded-lg border border-outline px-2.5 py-1.5 text-[12.5px] text-on-surface/75 md:inline-flex" title={`Uso atual do link de ${live.link_mbps} Mbps`}>
            <span className="inline-flex items-center gap-1"><ArrowDown size={13} style={{ color: 'var(--chart-1)' }} />{fmt(live.wan.down)} Mbps</span>
            <span className="inline-flex items-center gap-1"><ArrowUp size={13} style={{ color: 'var(--chart-2)' }} />{fmt(live.wan.up)} Mbps</span>
          </div>
        ) : null}

        <SupportBell
          onClick={() => { window.location.href = '/chamados'; }}
          onTicketClick={(ticket) => { window.location.href = `/chamados?ticket=${ticket.id}`; }}
        />
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-on-surface/65 hover:bg-on-surface/5 hover:text-on-surface"
          aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
