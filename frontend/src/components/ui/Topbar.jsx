import { useEffect, useState } from 'react';
import { Activity, Clock3, Menu, Moon, Network as NetworkIcon, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../../services/api';

function HeaderChip({ icon: Icon, label, value, tone = 'default' }) {
  const toneClass = tone === 'success'
    ? 'border-emerald-500/18 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : tone === 'danger'
      ? 'border-danger/18 bg-danger/10 text-danger'
      : 'border-outline/15 bg-surface-high/75 text-on-surface/72';

  return (
    <div className={`inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-full border px-[var(--chip-padding-x)] py-1.5 text-[10px] xl:text-[11px] ${toneClass}`}>
      <Icon size={14} className="shrink-0" />
      <span className="font-black uppercase tracking-[0.16em] opacity-70">{label}</span>
      <span className="font-semibold tracking-tight text-on-surface">{value}</span>
    </div>
  );
}

export default function Topbar({
  user,
  theme,
  onToggleTheme,
  onOpenMenu,
}) {
  const [gatewayOnline, setGatewayOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
  const [uptimeStr, setUptimeStr] = useState('0 dias, 0 horas');

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
    };

    const updateStatus = async () => {
      updateClock();
      try {
        const res = await api.get('/api/dashboard/metrics');
        if (!res.data) return;
        setGatewayOnline(Boolean(res.data.internet?.online));
        const uptimeSeconds = Number(res.data.system?.uptime || 0);
        const days = Math.floor(uptimeSeconds / 86400);
        const hours = Math.floor((uptimeSeconds % 86400) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        setUptimeStr(`${days} dias, ${hours} horas e ${minutes} min`);
      } catch {
        setGatewayOnline(false);
      }
    };

    updateStatus();
    const statusInterval = window.setInterval(updateStatus, 5000);
    const clockInterval = window.setInterval(updateClock, 1000);
    return () => {
      window.clearInterval(statusInterval);
      window.clearInterval(clockInterval);
    };
  }, []);

  const headerTone = gatewayOnline ? 'success' : 'danger';

  return (
    <header className="sticky top-0 z-30 border-b border-outline/10 bg-surface-low/78 px-[var(--app-shell-gutter-x)] py-2.5 backdrop-blur-[18px]">
      <div className="mx-auto flex max-w-[var(--app-shell-content-max)] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            className="inline-flex h-[var(--control-height)] w-[var(--control-height)] items-center justify-center rounded-full border border-outline/15 bg-surface-high/70 text-on-surface/78 transition-colors hover:border-primary/22 hover:text-primary lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="hidden min-w-0 xl:block">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface/38">SGCG</div>
            <div className="mt-1 truncate text-sm font-semibold text-on-surface">Sistema institucional de governança e controle</div>
          </div>
          <div className="hidden min-w-0 items-center gap-2 xl:flex">
            <HeaderChip icon={NetworkIcon} label="Gateway" value="186.251.14.25" tone={headerTone} />
            <HeaderChip icon={ShieldCheck} label="Status" value={gatewayOnline ? 'Online' : 'Offline'} tone={headerTone} />
            <HeaderChip icon={Clock3} label="Hora" value={currentTime} />
            <HeaderChip icon={Activity} label="Uptime" value={uptimeStr} />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/42">Operador</div>
            <div className="mt-1 text-sm font-semibold text-on-surface">{user?.username || 'Usuário'}</div>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-[calc(var(--control-height)+0.25rem)] w-[calc(var(--control-height)+0.25rem)] items-center justify-center rounded-full border border-outline/18 bg-surface-high/72 text-on-surface/72 shadow-[var(--shadow-soft)] transition-all hover:border-primary/22 hover:text-primary"
            aria-label={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          >
            {theme === 'dark' ? <Sun size={18} className="text-yellow-500" /> : <Moon size={18} className="text-primary" />}
          </button>
          <div className="flex h-[calc(var(--control-height)+0.25rem)] w-[calc(var(--control-height)+0.25rem)] items-center justify-center rounded-full border border-primary/18 bg-primary text-sm font-black text-on-primary shadow-[var(--shadow-soft)]">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
