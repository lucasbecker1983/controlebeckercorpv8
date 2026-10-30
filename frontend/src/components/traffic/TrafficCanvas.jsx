import { useEffect, useRef } from 'react';
import { F_BODY, F_DISPLAY, F_MONO, fmt, pct, readTheme, rgba } from './trafficModel';

/*
 * Desenho do mapa em camadas no <canvas> (curvas de Bézier, partículas, nós e anéis de uso).
 * Usado pela página normal (interativa) e pelo Modo TV (sem cliques, com escala e limite de quadros).
 *
 * Props: model/geo (de buildModel/layoutModel), LW (largura lógica), scale (ampliação, TV), mode, sel, LINK,
 * paused, interactive + onSelect (página normal), fps (limite de quadros), dprMax (nitidez máxima).
 */
export default function TrafficCanvas({
  model, geo, LW, scale = 1, mode, sel, LINK, paused = false,
  interactive = false, onSelect, fps = 60, dprMax = 2, label,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  const nodesRef = useRef({ devices: [], vlans: [], sites: [] });
  const siteYRef = useRef(new Map());
  const hoverRef = useRef(null);
  const themeRef = useRef(null);
  const drawNowRef = useRef(() => {});

  stateRef.current = { model, geo, LW, scale, mode, sel, LINK, paused, fps, dprMax };

  // Tema: lê as cores do sistema e relê quando o usuário troca entre claro e escuro.
  useEffect(() => {
    themeRef.current = readTheme();
    const obs = new MutationObserver(() => { themeRef.current = readTheme(); drawNowRef.current(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'data-ui-style', 'class', 'style'] });
    return () => obs.disconnect();
  }, []);

  // Desenho: animação contínua; com "reduzir movimento" redesenha só quando algo muda.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let phase = 0;
    let prevTs = 0;
    let lastDraw = 0;
    let pending = false;

    const curve = (a, b) => {
      const mx = (a.x + b.x) / 2;
      return [a.x, a.y, mx, a.y, mx, b.y, b.x, b.y];
    };
    const bez = (c, t) => {
      const u = 1 - t;
      return [u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7]];
    };
    const fitText = (text, maxW) => {
      if (ctx.measureText(text).width <= maxW) return text;
      let s = text;
      while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
      return s.length > 1 ? `${s}…` : '';
    };

    const draw = (ts) => {
      const st = stateRef.current;
      const T = themeRef.current || readTheme();
      const m = st.model;
      const { HH, wan: wanPos, xs } = st.geo;
      const LWd = st.LW;
      const k = st.scale;
      const dpr = Math.max(1, Math.min(st.dprMax, window.devicePixelRatio || 1));
      const pw = Math.round(LWd * k * dpr);
      const ph = Math.round(HH * k * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
      ctx.clearRect(0, 0, LWd, HH);
      ctx.fillStyle = rgba(T.bg);
      ctx.fillRect(0, 0, LWd, HH);
      const muted = (a = 1) => rgba(T.ink, 0.62 * a);
      const vcol = (id) => T.vlan[id] || T.accent;

      ctx.font = `600 10.5px ${F_MONO}`;
      ctx.fillStyle = muted();
      ctx.textAlign = 'center';
      [['DISPOSITIVOS', xs.dev], ['VLANs', xs.vlan], ['LINK', xs.wan], ['SITES', xs.site]].forEach(([t, x]) => ctx.fillText(t, x, 18));
      if (!m) {
        ctx.font = `13px ${F_BODY}`;
        ctx.fillText('Carregando o tráfego...', LWd / 2, HH / 2);
        return;
      }

      const { devices, vlans, sites } = m;
      // Sites deslizam até a nova posição quando a ordem muda; quem aparece já nasce no lugar.
      sites.forEach((s) => {
        const prev = siteYRef.current.get(s.key);
        s.y = prev == null ? s.ty : prev + (s.ty - prev) * 0.25;
        siteYRef.current.set(s.key, s.y);
      });
      const wan = wanPos;
      nodesRef.current = { devices, vlans, sites };
      // Posição dos nós, só para diagnóstico e testes automáticos (não é usada pela tela).
      canvas.__map = { nodes: nodesRef.current, LW: LWd, scale: k };
      const s = st.sel;
      const selDev = s?.t === 'dev' ? devices.find((d) => d.ip === s.ip) : null;
      const usesSite = (d, key) => d.flows.some((f) => f.site === key);

      const related = (e) => {
        if (!s) return true;
        if (s.t === 'dev') {
          if (!selDev) return true;
          if (e.dev) return e.dev === selDev;
          if (e.site != null) return usesSite(selDev, e.site) && (e.vlan == null || e.vlan === selDev.vlan);
          return e.vlan === selDev.vlan;
        }
        if (s.t === 'site') {
          if (e.site != null) return e.site === s.key;
          if (e.dev) return usesSite(e.dev, s.key);
          return devices.some((d) => d.vlan === e.vlan && usesSite(d, s.key));
        }
        if (s.t === 'vlan') return e.vlan === s.id || (e.site != null && e.vlan == null && devices.some((d) => d.vlan === s.id && usesSite(d, e.site)));
        return true;
      };

      const edges = [];
      devices.forEach((dv) => {
        const v = vlans.find((x) => x.id === dv.vlan);
        if (v) edges.push({ a: dv, b: v, w: dv.val, col: vcol(dv.vlan), kind: 'd', dev: dv, vlan: dv.vlan });
      });
      vlans.forEach((v) => { if (v.inet > 0.01) edges.push({ a: v, b: wan, w: v.inet, col: vcol(v.id), kind: 'v', vlan: v.id }); });
      sites.forEach((t) => {
        if (!t.internal) {
          if (t.val > 0.005 || t.down + t.up > 0.005) edges.push({ a: wan, b: t, w: t.val, col: T.accent, kind: 's', site: t.key });
          return;
        }
        // Interno: da VLAN de origem direto ao destino, sem passar pelo link.
        vlans.forEach((v) => {
          const w = devices.filter((d) => d.vlan === v.id).reduce((acc, d) => acc + d.flows.filter((f) => f.site === t.key).reduce((a2, f) => a2 + f.v, 0), 0);
          if (w > 0.005) edges.push({ a: v, b: t, w, col: vcol(v.id), kind: 'i', site: t.key, vlan: v.id });
        });
      });

      edges.forEach((e) => {
        const on = related(e);
        const c = curve(e.a, e.b);
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
        ctx.strokeStyle = rgba(e.col, on ? 0.42 : 0.07);
        ctx.lineWidth = Math.max(1, Math.min(18, e.w / (e.kind === 'd' ? 2.2 : 5)));
        ctx.stroke();
        if (!reduce && on && e.w > 0.3) {
          const n = Math.min(6, 1 + Math.floor(e.w / 12));
          for (let i = 0; i < n; i += 1) {
            let t = ((phase * (0.15 + Math.min(e.w, 60) / 160)) + i / n) % 1;
            if (st.mode === 'd' && e.kind !== 'i') t = 1 - t;
            const p = bez(c, t);
            ctx.beginPath();
            ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2);
            ctx.fillStyle = rgba(e.col, 0.95);
            ctx.fill();
          }
        }
      });

      // IP selecionado: linhas tracejadas até os destinos dele.
      if (selDev) {
        selDev.flows.forEach((f) => {
          const t = sites.find((x) => x.key === f.site);
          if (!t) return;
          ctx.beginPath();
          ctx.moveTo(selDev.x, selDev.y);
          ctx.bezierCurveTo(selDev.x + 220, selDev.y - 60, t.x - 200, t.y + 60, t.x, t.y);
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = rgba(vcol(selDev.vlan));
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      const circle = (x, y, r, col, on, hov) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = on ? rgba(col) : rgba(col, 0.2);
        ctx.fill();
        if (hov) { ctx.lineWidth = 2; ctx.strokeStyle = rgba(T.ink); ctx.stroke(); }
      };
      const hv = hoverRef.current;
      const blink = reduce ? 1 : 0.5 + 0.5 * Math.sin(((ts || 0) / 1000) * Math.PI * 2 * 1.1);
      const compact = st.geo.compact;

      devices.forEach((dv) => {
        const on = !s || (s.t === 'dev' && s.ip === dv.ip) || (s.t === 'vlan' && s.id === dv.vlan) || (s.t === 'site' && usesSite(dv, s.key));
        const isTop = dv.ip === m.topIp;
        if (isTop) {
          // Maior consumo agora: nó vermelho piscando, com anel pulsante.
          ctx.beginPath();
          ctx.arc(dv.x, dv.y, dv.r + 4 + blink * 6, 0, Math.PI * 2);
          ctx.strokeStyle = rgba(T.crit, 0.25 + blink * 0.6);
          ctx.lineWidth = 2.5;
          ctx.stroke();
          circle(dv.x, dv.y, Math.max(dv.r, 5), { ...T.crit, a: 0.45 + blink * 0.55 }, true, hv === `dev:${dv.ip}`);
        } else {
          circle(dv.x, dv.y, dv.r, vcol(dv.vlan), on, hv === `dev:${dv.ip}`);
        }
        const edge = dv.x - Math.max(dv.r, isTop ? 5 : 0) - 8;
        const room = edge - 6;
        const ipFont = `${isTop ? 700 : 500} 11px ${F_MONO}`;
        const ipColor = isTop ? rgba(T.crit) : on ? rgba(T.ink) : muted(0.5);
        ctx.textAlign = 'right';
        if (compact) {
          // Uma linha só: IP e velocidades (poucas linhas por IP, como no Modo TV com muitos aparelhos).
          const speeds = `↓${fmt(dv.down)} ↑${fmt(dv.up)}`;
          ctx.font = `10px ${F_MONO}`;
          ctx.fillStyle = on ? muted() : muted(0.5);
          ctx.fillText(speeds, edge, dv.y + 3.5);
          const sw = ctx.measureText(speeds).width;
          ctx.font = ipFont;
          ctx.fillStyle = ipColor;
          ctx.fillText(fitText(dv.ip, room - sw - 8), edge - sw - 8, dv.y + 3.5);
        } else {
          ctx.font = ipFont;
          ctx.fillStyle = ipColor;
          ctx.fillText(fitText(dv.ip, room), edge, dv.y - 1);
          // Download e upload sempre aparecem; o tipo do aparelho é encurtado para caber.
          ctx.font = `10px ${F_BODY}`;
          ctx.fillStyle = on ? muted() : muted(0.5);
          const speeds = `↓${fmt(dv.down)} ↑${fmt(dv.up)} Mbps`;
          const kindRoom = room - ctx.measureText(` · ${speeds}`).width;
          const kind = kindRoom > 18 ? fitText(dv.kind, kindRoom) : '';
          ctx.fillText(kind ? `${kind} · ${speeds}` : speeds, edge, dv.y + 11);
        }
      });

      vlans.forEach((v) => {
        const idle = v.val <= 0.005;
        const on = !s || (s.t === 'vlan' && s.id === v.id) || (s.t === 'dev' && selDev?.vlan === v.id) || (s.t === 'site' && devices.some((d) => d.vlan === v.id && usesSite(d, s.key)));
        circle(v.x, v.y, v.r, vcol(v.id), on && !idle, hv === `vlan:${v.id}`);
        if (v.limit && !idle) {
          const use = v.inet / v.limit;
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, use));
          ctx.strokeStyle = rgba(use > 0.9 ? T.crit : use > 0.7 ? T.warn : T.ok);
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        const inner = v.internal > 0.05 ? ` · ${fmt(v.internal)} interno` : '';
        if (compact) {
          // Uma linha só embaixo do nó (faixas curtas): nome e números lado a lado, sem invadir a faixa vizinha.
          const nameTxt = `${v.id} · ${v.name}`;
          const vals = idle ? (v.neighbors ? `sem tráfego · ${v.neighbors} disp.` : 'sem tráfego') : `${fmt(v.inet)}${v.limit ? `/${v.limit}` : ''}${inner}`;
          ctx.font = `700 11px ${F_BODY}`;
          const w1 = ctx.measureText(nameTxt).width;
          ctx.font = `10px ${F_MONO}`;
          const w2 = ctx.measureText(vals).width;
          // VLAN parada não tem ligações saindo: o rótulo vai ao lado do nó e não encosta na faixa de baixo.
          const x0 = idle ? v.x + v.r + 10 : v.x - (w1 + 8 + w2) / 2;
          const ly = idle ? v.y + 3.5 : v.y + v.r + 14;
          ctx.textAlign = 'left';
          ctx.font = `700 11px ${F_BODY}`;
          ctx.fillStyle = on && !idle ? rgba(T.ink) : muted(0.75);
          ctx.fillText(nameTxt, x0, ly);
          ctx.font = `10px ${F_MONO}`;
          ctx.fillStyle = on ? muted() : muted(0.5);
          ctx.fillText(vals, x0 + w1 + 8, ly);
        } else {
          ctx.textAlign = 'center';
          ctx.font = `700 11px ${F_BODY}`;
          ctx.fillStyle = on && !idle ? rgba(T.ink) : muted(0.75);
          ctx.fillText(`${v.id} · ${v.name}`, v.x, v.y + v.r + 17);
          ctx.font = `10px ${F_MONO}`;
          ctx.fillStyle = on ? muted() : muted(0.5);
          ctx.fillText(idle ? `sem tráfego · ${v.neighbors} disp.` : `${fmt(v.inet)}${v.limit ? `/${v.limit}` : ''}${inner}`, v.x, v.y + v.r + 29);
        }
      });

      // Link de internet no centro.
      const u = m.wan / st.LINK;
      ctx.beginPath();
      ctx.arc(wan.x, wan.y, wan.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(T.surface);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(T.line);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wan.x, wan.y, wan.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u));
      ctx.strokeStyle = rgba(u > 0.85 ? T.crit : u > 0.65 ? T.warn : T.accent);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.textAlign = 'center';
      ctx.fillStyle = rgba(T.ink);
      ctx.font = `800 17px ${F_DISPLAY}`;
      ctx.fillText(`${Math.round(u * 100)}%`, wan.x, wan.y + 2);
      ctx.font = `10px ${F_MONO}`;
      ctx.fillStyle = muted();
      ctx.fillText(`de ${st.LINK} Mbps`, wan.x, wan.y + 16);
      ctx.font = `700 11px ${F_BODY}`;
      ctx.fillStyle = rgba(T.ink);
      ctx.fillText('Link WAN', wan.x, wan.y + wan.r + 18);
      ctx.font = `10px ${F_MONO}`;
      ctx.fillStyle = muted();
      ctx.fillText(`↓${fmt(m.wanDown)} ↑${fmt(m.wanUp)} Mbps`, wan.x, wan.y + wan.r + 31);

      sites.forEach((t) => {
        const on = !s || (s.t === 'site' && s.key === t.key) || (s.t === 'dev' && selDev && usesSite(selDev, t.key)) || (s.t === 'vlan' && devices.some((d) => d.vlan === s.id && usesSite(d, t.key)));
        const col = t.internal ? vcol(t.remoteVlan) : T.accent;
        circle(t.x, t.y, t.r, col, on, hv === `site:${t.key}`);
        const room = LWd - (t.x + t.r + 8) - 8;
        ctx.textAlign = 'left';
        ctx.font = `600 11.5px ${F_BODY}`;
        ctx.fillStyle = on ? rgba(T.ink) : muted(0.5);
        ctx.fillText(fitText(t.name, room), t.x + t.r + 8, t.y - 1);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = on ? muted() : muted(0.5);
        const sub = t.internal ? `${fmt(t.val)} Mbps · interno` : `${fmt(t.val)} Mbps · ${pct(t.val, st.LINK)}%`;
        ctx.fillText(fitText(sub, room), t.x + t.r + 8, t.y + 11);
      });

      if (!devices.length) {
        ctx.textAlign = 'center';
        ctx.font = `13px ${F_BODY}`;
        ctx.fillStyle = muted();
        ctx.fillText('Nenhum dispositivo com tráfego agora.', LWd / 2, HH - 30);
      }
    };

    const safeDraw = (ts) => {
      try {
        draw(ts);
      } catch (err) {
        // um quadro com erro não pode derrubar o mapa
        console.error('[mapa]', err);
      }
    };
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      const minDt = 1000 / Math.max(5, stateRef.current.fps || 60);
      if (ts - lastDraw < minDt - 2) return;
      lastDraw = ts;
      if (!stateRef.current.paused) phase += prevTs ? (ts - prevTs) / 1000 : 0;
      prevTs = ts;
      safeDraw(ts);
    };
    // Com "reduzir movimento": um quadro por mudança (dados, tema, seleção, tamanho).
    drawNowRef.current = () => {
      if (!reduce || pending) return;
      pending = true;
      raf = requestAnimationFrame((ts) => { pending = false; safeDraw(ts); });
    };
    if (reduce) drawNowRef.current();
    else raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Com "reduzir movimento" o quadro é refeito a cada mudança de estado.
  useEffect(() => { drawNowRef.current(); }, [model, sel, mode, LW, geo, scale]);

  const keyOf = (x) => (x.t === 'site' ? `site:${x.key}` : x.key);
  const hit = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) * LW) / r.width;
    const my = ((ev.clientY - r.top) * geo.HH) / r.height;
    const near = (n) => n.x != null && (mx - n.x) ** 2 + (my - n.y) ** 2 <= (Math.max(n.r, 5) + 7) ** 2;
    const { devices, vlans, sites } = nodesRef.current;
    const d = devices.find(near);
    if (d) return { t: 'dev', ip: d.ip, key: `dev:${d.ip}` };
    const v = vlans.find(near);
    if (v) return { t: 'vlan', id: v.id, key: `vlan:${v.id}` };
    const s = sites.find(near);
    if (s) return { t: 'site', key: s.key };
    return null;
  };

  const handlers = interactive ? {
    onMouseMove: (e) => { const n = hit(e); hoverRef.current = n ? keyOf(n) : null; e.currentTarget.style.cursor = n ? 'pointer' : 'crosshair'; drawNowRef.current(); },
    onMouseLeave: () => { hoverRef.current = null; drawNowRef.current(); },
    onClick: (e) => onSelect?.(hit(e)),
  } : {};

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: Math.round(LW * scale), height: Math.round(geo.HH * scale), cursor: interactive ? 'crosshair' : 'default' }}
      role="img"
      aria-label={label}
      {...handlers}
    />
  );
}
