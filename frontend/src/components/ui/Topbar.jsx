import { useEffect, useState } from 'react';
import { Activity, Clock3, Menu, Moon, Network as NetworkIcon, ShieldCheck, Sun } from 'lucide-react';
import { api } from '../../services/api';

function HeaderChip({ icon: Icon, label, value, tone = 'default' }) {
  const toneClass = tone === 'success'
    ? 'border-info/18 bg-info/10 text-info'
    : tone === 'danger'
      ? 'border-danger/18 bg-danger/10 text-danger'
      : 'border-outline/15 bg-surface-high/88 text-on-surface/88';

  return (
    <div className={`inline-flex min-h-[var(--control-height)] min-w-[11rem] items-center gap-3 rounded-[20px] border px-[var(--chip-padding-x)] py-2 text-[11px] xl:text-[12px] ${toneClass}`}>
      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/55 text-current dark:bg-white/8">
        <Icon size={15} className="shrink-0" />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[10px] font-semibold tracking-tight opacity-72">{label}</div>
        <div className="truncate text-sm font-semibold tracking-tight text-current">{value}</div>
      </div>
    </div>
  );
}

export default function Topbar({
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
      <div className="mx-auto flex max-w-[var(--app-shell-content-max)] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            className="inline-flex h-[var(--control-height)] w-[var(--control-height)] items-center justify-center rounded-full border border-outline/15 bg-surface-high/70 text-on-surface/78 transition-colors hover:border-primary/22 hover:text-primary lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="hidden min-w-0 lg:block">
            <div className="text-[11px] font-semibold tracking-tight text-primary">SGCG</div>
            <div className="mt-1 truncate text-sm font-semibold text-on-surface">Sistema de governança e controle governamental</div>
          </div>
          <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex">
            <HeaderChip icon={NetworkIcon} label="Gateway" value="186.251.14.25" tone={headerTone} />
            <HeaderChip icon={ShieldCheck} label="Status" value={gatewayOnline ? 'Online' : 'Offline'} tone={headerTone} />
            <HeaderChip icon={Clock3} label="Hora" value={currentTime} />
            <HeaderChip icon={Activity} label="Uptime" value={uptimeStr} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex h-[calc(var(--control-height)+0.25rem)] w-[calc(var(--control-height)+0.25rem)] items-center justify-center rounded-full border border-outline/18 bg-surface-high/72 text-on-surface/72 shadow-[var(--shadow-soft)] transition-all hover:border-primary/22 hover:text-primary"
            aria-label={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          >
            {theme === 'dark' ? <Sun size={18} className="text-yellow-500" /> : <Moon size={18} className="text-primary" />}
          </button>
        </div>
      </div>
    </header>
  );
}
