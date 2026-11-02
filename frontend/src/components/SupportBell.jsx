import { useEffect, useRef, useState } from 'react';
import { Bell, Inbox, MessageSquareText, MonitorUp, X } from 'lucide-react';
import { api } from '../services/api';

export default function SupportBell({ publicToken = '', onClick, onTicketClick, compact = false }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [latestAlert, setLatestAlert] = useState(null);
  const [showAlert, setShowAlert] = useState(false);
  const [desktopPermission, setDesktopPermission] = useState(() => (
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  ));
  const rootRef = useRef(null);
  const previousCountRef = useRef(0);
  const loadedRef = useRef(false);
  const notifiedTicketRef = useRef('');
  const originalTitleRef = useRef(typeof document !== 'undefined' ? document.title : 'SGCG');

  const showDesktopNotification = (item) => {
    if (publicToken || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !item?.id) return;
    if (String(item.id) === notifiedTicketRef.current) return;
    notifiedTicketRef.current = String(item.id);
    const notification = new Notification('Novo chamado no SGCG', {
      body: `${item.protocol || 'Chamado'} - ${item.title || 'Solicitação recebida'}`,
      tag: `sgcg-support-${item.id}`,
      renotify: true,
      requireInteraction: true,
      icon: '/LOGO-JACAREZINHO.png',
    });
    notification.onclick = () => {
      window.focus();
      openTicket(item);
      notification.close();
    };
  };

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
            showDesktopNotification(nextItems[0]);
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

  const requestDesktopPermission = async () => {
    if (publicToken || typeof Notification === 'undefined') {
      setDesktopPermission('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setDesktopPermission(permission);
    if (permission === 'granted' && items[0]) showDesktopNotification(items[0]);
  };

  const priorityTone = (item) => (item.priority === 'critical' || item.priority === 'high' ? 'bg-danger/8 text-danger' : 'bg-primary/8 text-primary');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => { setShowAlert(false); setOpen((current) => !current); }}
        className={`relative inline-flex items-center justify-center rounded-full border transition-all ${
          compact
            ? 'h-11 w-11 border-white/20 bg-white/10 text-white hover:bg-white/18'
            : 'h-[calc(var(--control-height)+0.25rem)] w-[calc(var(--control-height)+0.25rem)] border-outline/18 bg-surface-high/72 text-on-surface/72 shadow-[var(--shadow-soft)] hover:border-primary/22 hover:text-primary'
        }`}
        aria-label="Notificações de chamados"
        aria-expanded={open}
        title="Notificações de chamados"
      >
        <Bell size={18} />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-on-danger ring-2 ring-container">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(92vw,380px)] overflow-hidden rounded-lg border border-outline bg-container text-on-surface shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-outline px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageSquareText size={17} className="text-primary" />
              <span className="truncate text-sm font-bold text-on-surface">Chamados</span>
            </div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${count ? 'bg-danger text-on-danger' : 'bg-on-surface/8 text-on-surface/70'}`}>
              {count ? `${count} novo${count > 1 ? 's' : ''}` : 'sem novos'}
            </span>
          </div>

          {!publicToken && desktopPermission !== 'unsupported' ? (
            <button
              type="button"
              onClick={requestDesktopPermission}
              disabled={desktopPermission === 'granted' || desktopPermission === 'denied'}
              className={`flex w-full items-center gap-2 border-b border-outline px-4 py-2.5 text-left text-xs font-bold ${
                desktopPermission === 'granted'
                  ? 'text-success'
                  : desktopPermission === 'denied'
                    ? 'text-warning'
                    : 'text-primary hover:bg-primary/10'
              } disabled:cursor-default`}
            >
              <MonitorUp size={15} />
              {desktopPermission === 'granted'
                ? 'Notificações do Windows ativas'
                : desktopPermission === 'denied'
                  ? 'Notificações bloqueadas no navegador'
                  : 'Ativar notificações no Windows'}
            </button>
          ) : null}

          {items.length ? (
            <div className="max-h-[360px] overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTicket(item)}
                  className="block w-full border-b border-outline/60 px-4 py-3 text-left transition last:border-b-0 hover:bg-on-surface/5 focus-visible:bg-on-surface/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[11px] font-bold text-on-surface/65">{item.protocol}</span>
                    {item.priority_label || item.priority ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityTone(item)}`}>{item.priority_label || item.priority}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 line-clamp-1 text-sm font-bold text-on-surface">{item.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface/75">{item.snippet}</div>
                  {item.requester_name ? <div className="mt-1 text-[11px] font-semibold text-on-surface/60">{item.requester_name}</div> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-5 text-sm font-semibold text-on-surface/70">
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
            className="block w-full border-t border-outline px-4 py-3 text-left text-xs font-bold uppercase text-primary hover:bg-primary/10"
          >
            Ver central de chamados
          </button>
        </div>
      ) : null}

      {!publicToken && showAlert && latestAlert && !open ? (
        <div className="fixed right-5 top-20 z-[70] w-[min(92vw,390px)] overflow-hidden rounded-lg border border-danger bg-container text-on-surface shadow-2xl" role="alert">
          <div className="flex items-start gap-3 bg-danger/12 px-4 py-3 text-danger">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/15">
              <Bell size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase">Novo chamado recebido</div>
              <div className="mt-0.5 truncate text-sm font-bold text-on-surface">{latestAlert.protocol}</div>
            </div>
            <button type="button" onClick={() => setShowAlert(false)} className="rounded-full p-1 text-on-surface/60 hover:bg-on-surface/8 hover:text-on-surface" aria-label="Fechar alerta de chamado">
              <X size={17} />
            </button>
          </div>
          <button type="button" onClick={() => openTicket(latestAlert)} className="block w-full px-4 py-3 text-left transition hover:bg-on-surface/5 focus-visible:bg-on-surface/5">
            <div className="line-clamp-1 text-sm font-bold text-on-surface">{latestAlert.title}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-on-surface/75">{latestAlert.snippet}</div>
            {latestAlert.requester_name ? <div className="mt-2 text-[11px] font-bold uppercase text-on-surface/60">{latestAlert.requester_name}</div> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
