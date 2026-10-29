import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

/*
 * Mapa de Tráfego em camadas: dispositivos → VLANs → link WAN → sites.
 * A espessura de cada ligação é a banda em uso. Cores fixas por VLAN.
 */

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS = 'Inter, "IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
const MAX_SITES = 12;
const fmt = (v) => {
  const n = Number(v || 0);
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace('.', ',');
};

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const g = (k) => cs.getPropertyValue(k).trim();
  return {
    ink: g('--md-on-surface'),
    surface: g('--md-container'),
    line: g('--md-outline'),
    accent: g('--chart-2') || g('--md-primary'),
    bg: g('--map-bg') || g('--md-surface'),
    crit: g('--md-danger'),
    warn: g('--md-warning'),
    ok: g('--md-success'),
    vlan: (id) => g(`--vlan-${id}`) || g('--vlan-99') || g('--md-primary'),
  };
}

function alpha(color, a) {
  const h = String(color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return color;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function useTheme() {
  const [theme, setTheme] = useState(() => readTheme());
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const shortName = (d) => (d.hostname ? d.hostname.split(' · ')[0] : `VLAN ${d.vlan}`);

// Converte a coleta do backend nas camadas do mapa.
function buildModel(data, view, mode) {
  if (!data) return null;
  const pick = (f) => (mode === 'd' ? f.down : f.up);
  const vlanInfo = new Map((data.vlans || []).map((v) => [v.id, v]));
  // Todos os dispositivos conectados, sempre na mesma ordem (VLAN e IP), com ou sem tráfego.
  const all = (data.devices || []).map((d) => {
    const flows = d.flows.filter((f) => (view === 'internet' ? f.kind === 'internet' : f.kind === 'internal'));
    return { ...d, flows, val: flows.reduce((s, f) => s + pick(f), 0) };
  });
  const devices = all;

  const siteMap = new Map();
  for (const d of all) {
    for (const f of d.flows) {
      const key = view === 'internet'
        ? f.label
        : f.remoteVlan ? `VLAN ${f.remoteVlan} · ${vlanInfo.get(f.remoteVlan)?.name || ''}`.trim() : f.label.startsWith('Servidor') ? 'Servidor SGCG' : f.label;
      const s = siteMap.get(key) || { name: key, dom: new Set(), val: 0, users: new Map() };
      s.val += pick(f);
      if (f.domain) s.dom.add(f.domain);
      s.users.set(d.ip, (s.users.get(d.ip) || 0) + pick(f));
      siteMap.set(key, s);
    }
  }
  const sites = Array.from(siteMap.values()).filter((s) => s.val > 0.01).sort((a, b) => b.val - a.val).slice(0, MAX_SITES)
    .map((s, i) => ({ ...s, i, dom: Array.from(s.dom) }));
  const siteIndex = new Map(sites.map((s) => [s.name, s.i]));
  devices.forEach((d) => {
    d.links = [];
    for (const f of d.flows) {
      const key = view === 'internet' ? f.label : f.remoteVlan ? `VLAN ${f.remoteVlan} · ${vlanInfo.get(f.remoteVlan)?.name || ''}`.trim() : f.label.startsWith('Servidor') ? 'Servidor SGCG' : f.label;
      if (siteIndex.has(key)) d.links.push({ site: siteIndex.get(key), val: pick(f), down: f.down, up: f.up });
    }
  });

  // Todas as VLANs aparecem, mesmo sem tráfego no momento.
  const vlanIds = Array.from(new Set([...(data.vlans || []).map((v) => v.id), ...devices.map((d) => d.vlan)])).sort((a, b) => a - b);
  const vlans = vlanIds.map((id) => {
    const info = vlanInfo.get(id) || {};
    return {
      id,
      name: info.name || `VLAN ${id}`,
      limit: mode === 'd' ? info.limit_down : info.limit_up,
      neighbors: info.neighbors || 0,
      val: all.filter((d) => d.vlan === id).reduce((s, d) => s + d.val, 0),
    };
  });
  return {
    devices,
    sites,
    vlans,
    hidden: 0,
    wan: mode === 'd' ? data.wan.down : data.wan.up,
  };
}

export default function TrafficMap() {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState('d');
  const [view, setView] = useState('internet');
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(null);
  const [width, setWidth] = useState(860);
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const nodesRef = useRef({ devices: [], vlans: [], sites: [], wan: null });
  const hoverRef = useRef(null);
  const stateRef = useRef({});

  useEffect(() => {
    if (paused) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get('/api/monitor/traffic');
        if (alive) { setData(res.data); setError(false); }
      } catch {
        if (alive) setError(true);
      }
    };
    load();
    const timer = window.setInterval(load, 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [paused]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setWidth(Math.max(860, Math.floor(el.clientWidth))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const model = useMemo(() => buildModel(data, view, mode), [data, view, mode]);
  const LINK = data?.link_mbps || 300;
  const deviceCount = model?.devices.length || 0;
  const rowH = deviceCount > 40 ? 20 : deviceCount > 24 ? 26 : 33;
  const height = Math.max(560, deviceCount * rowH + 60, (model?.sites.length || 0) * 33 + 60);
  const internet = view === 'internet';

  stateRef.current = { model, theme, sel, mode, paused, width, height, LINK, internet, compact: rowH < 26 };

  // Animação contínua: lê o estado atual pelo ref, sem recriar o loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let frame;
    let phase = 0;
    let last = 0;

    const draw = (ts) => {
      const st = stateRef.current;
      const { model: m, theme: C, sel: s, mode: md, width: W, height: H, LINK: L, internet: inet, compact } = st;
      if (!st.paused) phase += (ts - last) / 1000 || 0;
      last = ts;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      if (!m) { frame = requestAnimationFrame(draw); return; }

      const top = 34;
      const bottom = H - 22;
      const X = inet
        ? { dev: W * 0.198, vlan: W * 0.407, wan: W * 0.581, site: W * 0.767 }
        : { dev: W * 0.22, vlan: W * 0.47, site: W * 0.72 };

      // posições
      m.devices.forEach((d, i) => {
        d.x = X.dev;
        d.y = top + (i + 0.5) * (bottom - top) / Math.max(1, m.devices.length);
        d.r = d.val > 0.01 ? 3 + Math.sqrt(d.val) * 1.6 : 2.5;
      });
      m.vlans.forEach((v, i) => {
        v.x = X.vlan;
        v.y = top + (i + 0.5) * (bottom - top) / Math.max(1, m.vlans.length);
        v.r = 8 + Math.sqrt(v.val) * 1.3;
      });
      const wan = inet ? { x: X.wan, y: (top + bottom) / 2, r: 40 } : null;
      m.sites.forEach((t, i) => {
        t.x = X.site;
        t.y = top + (i + 0.5) * (bottom - top) / Math.max(1, m.sites.length);
        t.r = 3 + Math.sqrt(t.val) * 1.5;
      });
      nodesRef.current = { devices: m.devices, vlans: m.vlans, sites: m.sites, wan };

      // cabeçalhos
      ctx.font = `600 10.5px ${MONO}`;
      ctx.fillStyle = alpha(C.ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('DISPOSITIVOS', X.dev, 18);
      ctx.fillText('VLANs', X.vlan, 18);
      if (inet) ctx.fillText('LINK', X.wan, 18);
      ctx.fillText(inet ? 'SITES' : 'REDE INTERNA', X.site, 18);

      const devOn = (d) => !s || (s.t === 'dev' && s.ip === d.ip) || (s.t === 'vlan' && s.id === d.vlan) || (s.t === 'site' && d.links.some((l) => l.site === s.i));
      const vlanOn = (v) => !s || (s.t === 'vlan' && s.id === v.id) || (s.t === 'dev' && s.vlan === v.id) || (s.t === 'site' && m.devices.some((d) => d.vlan === v.id && d.links.some((l) => l.site === s.i)));
      const siteOn = (t) => !s || (s.t === 'site' && s.i === t.i) || (s.t === 'dev' && m.devices.find((d) => d.ip === s.ip)?.links.some((l) => l.site === t.i)) || (s.t === 'vlan' && m.devices.some((d) => d.vlan === s.id && d.links.some((l) => l.site === t.i)));

      const curve = (a, b) => [a.x, a.y, (a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y];
      const bez = (c, t) => {
        const u = 1 - t;
        return [u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6], u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7]];
      };
      const edge = (a, b, w, col, on, div) => {
        const c = curve(a, b);
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
        ctx.strokeStyle = alpha(col, on ? 0.42 : 0.07);
        ctx.lineWidth = Math.max(1, Math.min(18, w / div));
        ctx.stroke();
        if (!reduce && on && w > 0.3) {
          const n = Math.min(6, 1 + Math.floor(w / 12));
          for (let k = 0; k < n; k += 1) {
            let t = ((phase * (0.15 + Math.min(w, 60) / 160)) + k / n) % 1;
            if (md === 'd') t = 1 - t;
            const p = bez(c, t);
            ctx.beginPath();
            ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2);
            ctx.fillStyle = alpha(col, 0.95);
            ctx.fill();
          }
        }
      };

      m.devices.forEach((d) => {
        const v = m.vlans.find((x) => x.id === d.vlan);
        if (v) edge(d, v, d.val, C.vlan(d.vlan), devOn(d) && d.val > 0.01, 2.2);
      });
      if (inet) {
        m.vlans.forEach((v) => edge(v, wan, v.val, C.vlan(v.id), vlanOn(v), 5));
        m.sites.forEach((t) => edge(wan, t, t.val, C.accent, siteOn(t), 5));
      } else {
        m.vlans.forEach((v) => {
          m.sites.forEach((t) => {
            const w = m.devices.filter((d) => d.vlan === v.id).reduce((acc, d) => acc + d.links.filter((l) => l.site === t.i).reduce((a2, l) => a2 + l.val, 0), 0);
            if (w > 0.01) edge(v, t, w, C.vlan(v.id), vlanOn(v) && siteOn(t), 4);
          });
        });
      }

      if (s && s.t === 'dev') {
        const d = m.devices.find((x) => x.ip === s.ip);
        if (d) {
          d.links.forEach((l) => {
            const t = m.sites[l.site];
            if (!t) return;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.bezierCurveTo(d.x + 220, d.y - 60, t.x - 200, t.y + 60, t.x, t.y);
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = C.vlan(d.vlan);
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.setLineDash([]);
          });
        }
      }

      const circle = (n, col, on, key) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = on ? col : alpha(col, 0.2);
        ctx.fill();
        if (hoverRef.current === key) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = C.ink;
          ctx.stroke();
        }
      };

      m.devices.forEach((d) => {
        const idle = d.val <= 0.01;
        const on = devOn(d);
        circle(d, C.vlan(d.vlan), on && !idle, `dev:${d.ip}`);
        // Consumo alto pisca em vermelho: 15 Mbps ou 15% do limite da VLAN.
        const lim = m.vlans.find((x) => x.id === d.vlan)?.limit || 100;
        if (d.val >= Math.max(15, lim * 0.15)) {
          const pulse = 0.5 + 0.5 * Math.sin(phase * 6);
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r + 4 + pulse * 5, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(C.crit, 0.35 + pulse * 0.6);
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = alpha(C.crit, 0.4 + pulse * 0.6);
          ctx.fill();
        }
        const kind = shortName(d);
        const name = kind.length > 22 ? `${kind.slice(0, 21)}…` : kind;
        const rate = idle ? 'sem tráfego' : `${fmt(d.val)} Mbps`;
        ctx.textAlign = 'right';
        if (compact) {
          ctx.font = `500 10.5px ${MONO}`;
          ctx.fillStyle = on ? (idle ? alpha(C.ink, 0.5) : C.ink) : alpha(C.ink, 0.3);
          ctx.fillText(`${d.ip} · ${name} · ${rate}${d.qosVip ? ' · ★' : ''}`, d.x - d.r - 8, d.y + 3.5);
        } else {
          ctx.font = `500 11px ${MONO}`;
          ctx.fillStyle = on ? (idle ? alpha(C.ink, 0.55) : C.ink) : alpha(C.ink, 0.35);
          ctx.fillText(d.ip, d.x - d.r - 8, d.y - 1);
          ctx.font = `10px ${SANS}`;
          ctx.fillStyle = on ? alpha(C.ink, idle ? 0.45 : 0.6) : alpha(C.ink, 0.28);
          ctx.fillText(`${name} · ${rate}${d.qosVip ? ' · prioridade' : ''}`, d.x - d.r - 8, d.y + 11);
        }
      });

      m.vlans.forEach((v) => {
        const on = vlanOn(v);
        const use = v.limit ? v.val / v.limit : 0;
        circle(v, C.vlan(v.id), on, `vlan:${v.id}`);
        if (v.limit) {
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, use));
          ctx.strokeStyle = use > 0.9 ? C.crit : use > 0.7 ? C.warn : C.ok;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.font = `700 11px ${SANS}`;
        ctx.fillStyle = on ? C.ink : alpha(C.ink, 0.35);
        ctx.fillText(`${v.id} · ${v.name}`, v.x, v.y + v.r + 17);
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = on ? alpha(C.ink, 0.6) : alpha(C.ink, 0.28);
        ctx.fillText(v.val > 0.01 ? `${fmt(v.val)}${v.limit ? `/${v.limit}` : ''}` : `sem tráfego · ${v.neighbors} disp.`, v.x, v.y + v.r + 29);
      });

      if (wan) {
        const u = m.wan / L;
        ctx.beginPath();
        ctx.arc(wan.x, wan.y, wan.r, 0, Math.PI * 2);
        ctx.fillStyle = C.surface;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = C.line;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(wan.x, wan.y, wan.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u));
        ctx.strokeStyle = u > 0.85 ? C.crit : u > 0.65 ? C.warn : C.accent;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.textAlign = 'center';
        ctx.fillStyle = C.ink;
        ctx.font = `800 17px ${SANS}`;
        ctx.fillText(`${Math.round(u * 100)}%`, wan.x, wan.y + 2);
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = alpha(C.ink, 0.6);
        ctx.fillText(`de ${L} Mbps`, wan.x, wan.y + 16);
        ctx.font = `700 11px ${SANS}`;
        ctx.fillStyle = C.ink;
        ctx.fillText('Link WAN', wan.x, wan.y + wan.r + 18);
      }

      m.sites.forEach((t) => {
        const on = siteOn(t);
        circle(t, inet ? C.accent : C.warn, on, `site:${t.i}`);
        ctx.textAlign = 'left';
        ctx.font = `600 11.5px ${SANS}`;
        ctx.fillStyle = on ? C.ink : alpha(C.ink, 0.35);
        ctx.fillText(t.name.length > 28 ? `${t.name.slice(0, 27)}…` : t.name, t.x + t.r + 8, t.y - 1);
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = on ? alpha(C.ink, 0.6) : alpha(C.ink, 0.28);
        ctx.fillText(`${fmt(t.val)} Mbps${inet ? ` · ${Math.round((t.val / L) * 100)}%` : ''}`, t.x + t.r + 8, t.y + 11);
      });

      if (!reduce) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [model, theme, sel, mode, width, height, view]);

  const hit = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) * width) / r.width;
    const my = ((ev.clientY - r.top) * height) / r.height;
    const { devices, vlans, sites } = nodesRef.current;
    const near = (n) => (mx - n.x) ** 2 + (my - n.y) ** 2 <= (n.r + 7) ** 2;
    const d = devices.find(near);
    if (d) return { t: 'dev', ip: d.ip, vlan: d.vlan, key: `dev:${d.ip}` };
    const v = vlans.find(near);
    if (v) return { t: 'vlan', id: v.id, key: `vlan:${v.id}` };
    const s = sites.find(near);
    if (s) return { t: 'site', i: s.i, key: `site:${s.i}` };
    return null;
  };
  const select = (next) => setSel((cur) => (cur && next && cur.key === next.key ? null : next));

  const devAll = (data?.devices || []);
  const topIps = model ? [...model.devices].filter((d) => d.val > 0.01).sort((a, b) => b.val - a.val).slice(0, 5) : [];
  const topSites = model ? model.sites.slice(0, 5) : [];
  const vlanLegend = data?.vlans || [];
  const updated = data?.updated_at ? new Date(data.updated_at).toLocaleTimeString('pt-BR') : null;

  const selDev = sel?.t === 'dev' ? model?.devices.find((d) => d.ip === sel.ip) : null;
  const selSite = sel?.t === 'site' ? model?.sites[sel.i] : null;
  const selVlan = sel?.t === 'vlan' ? (data?.vlans || []).find((v) => v.id === sel.id) : null;

  const segBtn = (on) => `px-3 py-1.5 text-[13px] font-semibold ${on ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface'}`;
  const chip = 'inline-flex items-center rounded-md border border-dashed border-outline px-2 py-1 text-[12px] text-on-surface/70 hover:border-primary/50 hover:text-primary';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Mapa de Tráfego</h1>
        <p className="max-w-3xl text-sm text-on-surface/60">Dispositivos à esquerda, VLANs, o link de {LINK} Mbps no centro e os sites à direita. A espessura de cada ligação é a banda em uso. Clique num IP para ver os sites dele, ou num site para ver quem está puxando.</p>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline bg-container">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-outline px-4 py-3">
          <span className="text-base font-bold text-on-surface">Mapa de Tráfego</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${paused ? 'border-warning text-warning' : 'border-success/40 text-success'}`} style={{ fontFamily: MONO }}>
            <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-warning' : 'bg-success'}`} />{paused ? 'pausado' : 'ao vivo'}
          </span>
          {updated ? <span className="rounded-full border border-outline px-2 py-0.5 text-[11px] text-on-surface/55" style={{ fontFamily: MONO }}>{updated}</span> : null}
          <div className="inline-flex overflow-hidden rounded-lg border border-outline sm:ml-auto" role="group" aria-label="Tipo de tráfego">
            <button type="button" aria-pressed={internet} onClick={() => { setView('internet'); setSel(null); }} className={segBtn(internet)}>Internet</button>
            <button type="button" aria-pressed={!internet} onClick={() => { setView('internal'); setSel(null); }} className={segBtn(!internet)}>Rede interna</button>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-outline" role="group" aria-label="Sentido do tráfego">
            <button type="button" aria-pressed={mode === 'd'} onClick={() => setMode('d')} className={segBtn(mode === 'd')}>Download</button>
            <button type="button" aria-pressed={mode === 'u'} onClick={() => setMode('u')} className={segBtn(mode === 'u')}>Upload</button>
          </div>
          <button type="button" onClick={() => setPaused((p) => !p)} className="rounded-lg border border-outline px-3 py-1.5 text-[13px] font-semibold text-on-surface/65 hover:text-on-surface">{paused ? 'Retomar' : 'Pausar'}</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div ref={scrollRef} className="min-w-0 overflow-x-auto border-b border-outline lg:border-b-0 lg:border-r" style={{ background: 'var(--map-bg)' }}>
            {error && !data ? <div className="p-8 text-sm text-danger">Não foi possível ler o tráfego. Verifique se o backend está no ar.</div> : null}
            <canvas
              ref={canvasRef}
              style={{ width, height, display: 'block', cursor: 'crosshair' }}
              onMouseMove={(e) => { const n = hit(e); hoverRef.current = n?.key || null; e.currentTarget.style.cursor = n ? 'pointer' : 'crosshair'; }}
              onMouseLeave={() => { hoverRef.current = null; }}
              onClick={(e) => select(hit(e))}
              aria-label="Grafo de tráfego: dispositivos, VLANs, link e sites"
            />
            {model && !model.devices.length ? <div className="px-4 pb-4 text-sm text-on-surface/55">{internet ? 'Nenhum tráfego de internet medido agora.' : 'Nenhum tráfego entre VLANs agora.'}</div> : null}
            {model?.hidden ? <div className="px-4 pb-3 text-[12px] text-on-surface/55">Mais {model.hidden} dispositivos com pouco tráfego não aparecem no mapa.</div> : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-2.5">
              {[['Download', data?.wan.down], ['Upload', data?.wan.up]].map(([label, v]) => (
                <div key={label} className="rounded-lg bg-on-surface/[0.05] px-3 py-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-on-surface/55" style={{ fontFamily: MONO }}>{label}</div>
                  <div className="tabular text-[22px] font-extrabold leading-tight text-on-surface">{data ? `${fmt(v)} Mbps` : '—'}</div>
                  <div className="tabular text-[12px] text-on-surface/55">{data ? `${Math.round(((v || 0) / LINK) * 100)}% de ${LINK} Mbps` : ''}</div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface/55" style={{ fontFamily: MONO }}>Quem mais consome</h3>
              <ol className="flex flex-col gap-1.5">
                {topIps.map((d) => {
                  const p = (d.val / LINK) * 100;
                  return (
                    <li key={d.ip}>
                      <button type="button" onClick={() => select({ t: 'dev', ip: d.ip, vlan: d.vlan, key: `dev:${d.ip}` })} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-primary/8 ${sel?.key === `dev:${d.ip}` ? 'bg-primary/10' : ''}`}>
                        <span className="truncate" style={{ fontFamily: MONO }} title={shortName(d)}>{d.ip}</span>
                        <span className="tabular text-[12px]" style={{ fontFamily: MONO }}>{fmt(d.val)} Mbps</span>
                        <span className="col-span-2 h-1 overflow-hidden rounded bg-on-surface/[0.07]"><i className="block h-full rounded" style={{ width: `${Math.min(100, p * 3).toFixed(1)}%`, background: `var(--vlan-${d.vlan}, var(--vlan-99))` }} /></span>
                      </button>
                    </li>
                  );
                })}
                {!topIps.length ? <li className="text-[12.5px] text-on-surface/55">Coletando...</li> : null}
              </ol>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface/55" style={{ fontFamily: MONO }}>{internet ? 'Sites mais pesados' : 'Destinos internos'}</h3>
              <ol className="flex flex-col gap-1.5">
                {topSites.map((t) => {
                  const p = (t.val / LINK) * 100;
                  return (
                    <li key={t.name}>
                      <button type="button" onClick={() => select({ t: 'site', i: t.i, key: `site:${t.i}` })} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-primary/8 ${sel?.key === `site:${t.i}` ? 'bg-primary/10' : ''}`}>
                        <span className="truncate">{t.name}</span>
                        <span className="tabular text-[12px]" style={{ fontFamily: MONO }}>{internet ? `${Math.round(p)}%` : `${fmt(t.val)} Mbps`}</span>
                        <span className="col-span-2 h-1 overflow-hidden rounded bg-on-surface/[0.07]"><i className="block h-full rounded" style={{ width: `${Math.min(100, p * 3).toFixed(1)}%`, background: internet ? 'var(--chart-2)' : 'var(--md-warning)' }} /></span>
                      </button>
                    </li>
                  );
                })}
                {!topSites.length ? <li className="text-[12.5px] text-on-surface/55">Coletando...</li> : null}
              </ol>
            </div>

            <div className="flex flex-col gap-2 border-t border-outline pt-3.5 text-[13px]">
              {selDev ? (
                <>
                  <h3 className="text-[15px] font-bold text-on-surface" style={{ fontFamily: MONO }}>{selDev.ip}</h3>
                  <span className="text-on-surface/60">{shortName(selDev)} · VLAN {selDev.vlan} {(data?.vlans || []).find((v) => v.id === selDev.vlan)?.name || ''}{selDev.qosVip ? ' · com prioridade' : ''}</span>
                  <div className="space-y-0.5">
                    {selDev.links.map((l) => (
                      <div key={l.site}>{model.sites[l.site]?.name} <span className="text-on-surface/55" style={{ fontFamily: MONO }}>↓{fmt(l.down)} ↑{fmt(l.up)}</span></div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link className={chip} to={`/acoes-rapidas?acao=banda&ip=${selDev.ip}`}>Prioridade de banda</Link>
                    <Link className={chip} to={`/acoes-rapidas?acao=temporaria&ip=${selDev.ip}`}>Liberar sites</Link>
                    <Link className={chip} to={`/radar-dns?ip=${selDev.ip}`}>Ver no Radar DNS</Link>
                  </div>
                </>
              ) : selSite ? (
                <>
                  <h3 className="text-[15px] font-bold text-on-surface">{selSite.name}</h3>
                  {selSite.dom.length ? <span className="text-on-surface/55" style={{ fontFamily: MONO }}>{selSite.dom.slice(0, 3).join(', ')}</span> : null}
                  <div className="space-y-0.5">
                    {Array.from(selSite.users.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, v]) => {
                      const d = devAll.find((x) => x.ip === ip);
                      return <div key={ip}><span style={{ fontFamily: MONO }}>{ip}</span> <span className="text-on-surface/55">{d ? shortName(d) : ''} · {fmt(v)} Mbps</span></div>;
                    })}
                  </div>
                  {internet && selSite.dom.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      <Link className={chip} to={`/acoes-rapidas?acao=bloquear&dominio=${selSite.dom[0]}`}>Bloquear site</Link>
                      <Link className={chip} to={`/acoes-rapidas?acao=liberar&dominio=${selSite.dom[0]}`}>Liberar site</Link>
                    </div>
                  ) : null}
                </>
              ) : selVlan ? (
                <>
                  <h3 className="text-[15px] font-bold text-on-surface">VLAN {selVlan.id} · {selVlan.name}</h3>
                  <span className="text-on-surface/60">Usando {fmt(mode === 'd' ? selVlan.down : selVlan.up)} de {(mode === 'd' ? selVlan.limit_down : selVlan.limit_up) ?? '—'} Mbps do limite de QoS{(mode === 'd' ? selVlan.limit_down : selVlan.limit_up) ? ` (${Math.round(((mode === 'd' ? selVlan.down : selVlan.up) / (mode === 'd' ? selVlan.limit_down : selVlan.limit_up)) * 100)}%)` : ''}. {selVlan.neighbors} dispositivos conectados.</span>
                  {selVlan.internal_down > 0.5 ? <span className="text-on-surface/60">Tráfego interno: {fmt(selVlan.internal_down)} Mbps{selVlan.internal_exempt ? ', fora do limite.' : ', contando no limite.'}</span> : null}
                  <div className="flex flex-wrap gap-1.5">
                    <Link className={chip} to="/rede?tab=qos">Ajustar QoS</Link>
                    <Link className={chip} to="/rede?tab=scheduler">Horários</Link>
                    <Link className={chip} to="/operacoes">Bloqueio total</Link>
                  </div>
                </>
              ) : (
                <span className="text-on-surface/55">Clique num nó do mapa ou num item da lista para ver detalhes.</span>
              )}
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-outline px-4 py-2.5 text-[12px] text-on-surface/60">
          {vlanLegend.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `var(--vlan-${v.id}, var(--vlan-99))` }} />
              VLAN {v.id} {v.name}{v.limit_down ? ` · QoS ${v.limit_down} Mbps` : ''}
            </span>
          ))}
          <span>Anel da VLAN: uso do limite (verde, âmbar acima de 70%, vermelho acima de 90%)</span>
        </div>
      </section>
    </div>
  );
}
