import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../services/api';

export default function SupportBell({ publicToken = '', onClick, compact = false }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const config = publicToken ? { headers: { 'X-SGCG-Support-Token': publicToken } } : {};
        const url = publicToken ? '/api/support/public/notifications' : '/api/support/notifications';
        const res = await api.get(url, config);
        if (alive) setCount(Number(res.data?.unread || 0));
      } catch {
        if (alive) setCount(0);
      }
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [publicToken]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center justify-center rounded-full border transition-all ${
        compact
          ? 'h-11 w-11 border-white/20 bg-white/10 text-white hover:bg-white/18'
          : 'h-[calc(var(--control-height)+0.25rem)] w-[calc(var(--control-height)+0.25rem)] border-outline/18 bg-surface-high/72 text-on-surface/72 shadow-[var(--shadow-soft)] hover:border-primary/22 hover:text-primary'
      }`}
      aria-label="Notificações de chamados"
      title="Notificações de chamados"
    >
      <Bell size={18} />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-black leading-none text-white ring-2 ring-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  );
}
