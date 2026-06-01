import { useEffect, useRef, useState } from 'react';
import { Bell, Inbox, MessageSquareText, X } from 'lucide-react';
import { api } from '../services/api';

export default function SupportBell({ publicToken = '', onClick, onTicketClick, compact = false }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [latestAlert, setLatestAlert] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const rootRef = useRef(null);
  const previousCountRef = useRef(0);
  const loadedRef = useRef(false);
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : 'SGCG');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const config = publicToken ? { headers: { 'X-SGCG-Support-Token': publicToken } } : {};
        const url = publicToken ? '/api/support/public/notifications' : '/api/support/notifications';
        const res = await api.get(url, config);
        if (alive) {
          const nextCount = Number(res.data?.unread || 0);
          const nextItems = res.data?.notifications || [];
          setCount(nextCount);
          setItems(nextItems);
          if (!publicToken && nextCount > 0 && nextItems[0] && (!loadedRef.current || nextCount > previousCountRef.current)) {
            setLatestAlert(nextItems[0]);
            setShowAlert(true);
          }
          previousCountRef.current = nextCount;
          loadedRef.current = true;
        }
      } catch {
        if (alive) {
          setCount(0);
          setItems([]);
          previousCountRef.current = 0;
          loadedRef.current = true;
        }
      }
    };
    load();
    window.addEventListener('focus', load);
    const timer = window.setInterval(load, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [publicToken]);

  useEffect(() => {
    if (publicToken || typeof document === 'undefined') return undefined;
    if (!originalTitleRef.current) originalTitleRef.current = document.title || 'SGCG';
    if (count <= 0) {
      document.title = originalTitleRef.current;
      return undefined;
    }

    let visible = false;
    const updateTitle = () => {
      visible = !visible;
      document.title = visible
        ? `(${count}) Chamado novo - SGCG`
        : originalTitleRef.current;
    };
    updateTitle();
    const timer = window.setInterval(updateTitle, 900);
    return () => {
      window.clearInterval(timer);
      document.title = originalTitleRef.current;
    };
  }, [count, publicToken]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const openTicket = (item) => {
    setOpen(false);
    setShowAlert(false);
    if (onTicketClick) {
      onTicketClick(item);
      return;
    }
    if (onClick) onClick(item);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
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

      {open ? (
        <div className={`absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(92vw,360px)] overflow-hidden rounded-lg border shadow-2xl ${
          compact
            ? 'border-slate-200 bg-white text-slate-950'
            : 'border-outline/14 bg-surface-high text-on-surface'
        }`}>
          <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${compact ? 'border-slate-200' : 'border-outline/10'}`}>
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquareText size={17} className={compact ? 'text-sky-900' : 'text-primary'} />
              <span className="truncate text-sm font-black">Chamados</span>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${count ? 'bg-red-600 text-white' : compact ? 'bg-slate-100 text-slate-600' : 'bg-surface-low text-on-surface/55'}`}>
              {count ? `${count} novo${count > 1 ? 's' : ''}` : 'sem novos'}
            </span>
          </div>

          {items.length ? (
            <div className="max-h-[360px] overflow-y-auto py-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTicket(item)}
                  className={`block w-full px-4 py-3 text-left transition ${compact ? 'hover:bg-sky-50' : 'hover:bg-primary/6'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`truncate text-[11px] font-black ${compact ? 'text-slate-500' : 'text-on-surface/50'}`}>{item.protocol}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${item.priority === 'critical' || item.priority === 'high' ? 'bg-red-600 text-white' : compact ? 'bg-sky-50 text-sky-900' : 'bg-primary/10 text-primary'}`}>{item.priority_label}</span>
                  </div>
                  <div className="mt-1 line-clamp-1 text-sm font-black">{item.title}</div>
                  <div className={`mt-1 line-clamp-2 text-xs font-semibold leading-5 ${compact ? 'text-slate-600' : 'text-on-surface/62'}`}>{item.snippet}</div>
                  {item.requester_name ? <div className={`mt-1 text-[11px] font-bold ${compact ? 'text-slate-500' : 'text-on-surface/45'}`}>{item.requester_name}</div> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className={`flex items-center gap-3 px-4 py-5 text-sm font-bold ${compact ? 'text-slate-500' : 'text-on-surface/55'}`}>
              <Inbox size={18} />
              Nenhuma mensagem nova.
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (onClick) onClick();
            }}
            className={`block w-full border-t px-4 py-3 text-left text-xs font-black uppercase ${compact ? 'border-slate-200 text-sky-900 hover:bg-sky-50' : 'border-outline/10 text-primary hover:bg-primary/6'}`}
          >
            Ver central de chamados
          </button>
        </div>
      ) : null}

      {!publicToken && showAlert && latestAlert ? (
        <div className="fixed right-5 top-20 z-[70] w-[min(92vw,390px)] overflow-hidden rounded-lg border border-red-200 bg-white text-slate-950 shadow-2xl">
          <div className="flex items-start gap-3 bg-red-600 px-4 py-3 text-white">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/18">
              <Bell size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black uppercase text-white/80">Novo chamado recebido</div>
              <div className="mt-0.5 truncate text-sm font-black">{latestAlert.protocol}</div>
            </div>
            <button type="button" onClick={() => setShowAlert(false)} className="rounded-full p-1 text-white/80 hover:bg-white/14 hover:text-white" aria-label="Fechar alerta de chamado">
              <X size={17} />
            </button>
          </div>
          <button type="button" onClick={() => openTicket(latestAlert)} className="block w-full px-4 py-3 text-left transition hover:bg-red-50">
            <div className="line-clamp-1 text-sm font-black">{latestAlert.title}</div>
            <div className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">{latestAlert.snippet}</div>
            {latestAlert.requester_name ? <div className="mt-2 text-[11px] font-black uppercase text-slate-500">{latestAlert.requester_name}</div> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
