import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

/*
 * Mapa de Tráfego no formato do protótipo da auditoria (painel escuro, estilo NOC):
 * dispositivos → VLANs → link WAN → sites. A espessura é a banda; as partículas correm
 * pelas ligações como sangue nas veias, mais densas e rápidas onde há mais tráfego.
 */

const MAX_SITES = 12;
const P = {
  bg: '#eef2f4',
  canvas: '#f7fafb',
  surface: '#ffffff',
  sunken: '#e4eaed',
  ink: '#0f1d24',
  muted: '#566a73',
  line: '#d3dde2',
  accent: '#0a737c',
  crit: '#bf3226',
  warn: '#a8690f',
  ok: '#1d7f47',
  vlan: { 10: '#2c66a8', 30: '#8152c2', 40: '#a8690f', 50: '#1d7f47', 70: '#bf3226', 80: '#0a737c', 99: '#566a73' },
};
const vcol = (id) => P.vlan[id] || P.muted;
const F_DISPLAY = '"Archivo", "Arial Narrow", system-ui, sans-serif';
const F_BODY = '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const F_MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

const fmt = (v) => {
  const n = Number(v || 0);
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace('.', ',');
};
const alpha = (hex, a) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const shortName = (d) => (d.hostname ? d.hostname.split(' · ')[0] : 'Dispositivo');

const CSS = `
.tm { --bg:${P.bg}; --surface:${P.surface}; --sunken:${P.sunken}; --ink:${P.ink}; --muted:${P.muted}; --line:${P.line}; --accent:${P.accent}; --warn:${P.warn}; --ok:${P.ok}; --crit:${P.crit};
  background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-family: ${F_BODY}; color-scheme: light; }
.tm-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; padding:12px 16px; border-bottom:1px solid var(--line); }
.tm-title { font-family:${F_DISPLAY}; font-stretch:85%; font-weight:750; font-size:16px; }
.tm-tag { font-family:${F_MONO}; font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); white-space:nowrap; display:inline-flex; align-items:center; gap:6px; }
.tm-tag.live { border-color: rgba(29,127,71,.45); color: var(--ok); }
.tm-tag.live i { width:6px; height:6px; border-radius:50%; background: var(--ok); animation: tmPulse 1.6s ease-in-out infinite; }
.tm-tag.paused { border-color: var(--warn); color: var(--warn); }
@keyframes tmPulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
.tm-seg { display:inline-flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.tm-seg button, .tm-btn { font:inherit; font-size:13px; font-weight:600; background:transparent; color:var(--muted); border:0; padding:6px 12px; cursor:pointer; }
.tm-seg button[aria-pressed="true"] { background:var(--accent); color:var(--surface); }
.tm-btn { border:1px solid var(--line); border-radius:8px; }
.tm-btn:hover, .tm-seg button:hover { color:var(--ink); }
.tm-seg button[aria-pressed="true"]:hover { color:var(--surface); }
.tm button:focus-visible, .tm a:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.tm-body { display:grid; grid-template-columns:minmax(0,1fr) 300px; }
.tm-canvas { overflow-x:auto; background:${P.canvas}; border-right:1px solid var(--line); min-width:0; }
.tm-side { padding:16px; display:flex; flex-direction:column; gap:18px; min-width:0; }
.tm-gauge { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.tm-gauge > div { background:var(--sunken); border-radius:8px; padding:10px 12px; }
.tm-lbl { font-size:11.5px; color:var(--muted); font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.06em; }
.tm-val { font-family:${F_DISPLAY}; font-stretch:80%; font-size:26px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.1; }
.tm-pct { font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.tm-rank h3 { font-size:13px; font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); font-weight:600; margin:0 0 8px; }
.tm-rank ol { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.tm-rank li button { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 8px; width:100%; font:inherit; font-size:13px; text-align:left; color:var(--ink); background:transparent; border:0; cursor:pointer; padding:3px 4px; border-radius:6px; }
.tm-rank li button:hover, .tm-rank li button.sel { background: rgba(10,115,124,.10); }
.tm-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tm-mb { font-family:${F_MONO}; font-size:12px; font-variant-numeric:tabular-nums; }
.tm-barline { grid-column:1/-1; height:4px; border-radius:2px; background:var(--sunken); overflow:hidden; }
.tm-barline i { display:block; height:100%; border-radius:2px; }
.tm-detail { border-top:1px solid var(--line); padding-top:14px; font-size:13px; display:flex; flex-direction:column; gap:8px; }
.tm-detail h3 { margin:0; font-family:${F_DISPLAY}; font-stretch:90%; font-size:17px; font-weight:700; }
.tm-detail .mono { font-family:${F_MONO}; font-size:.86em; }
.tm-detail .muted { color:var(--muted); }
.tm-acts { display:flex; flex-wrap:wrap; gap:6px; }
.tm-acts a { font-size:12px; border:1px dashed var(--line); border-radius:6px; padding:3px 8px; color:var(--muted); }
.tm-acts a:hover { color:var(--accent); border-color:var(--accent); }
.tm-legend { display:flex; flex-wrap:wrap; gap:6px 14px; padding:10px 16px; border-top:1px solid var(--line); font-size:12px; color:var(--muted); }
.tm-legend span { display:inline-flex; align-items:center; gap:6px; }
.tm-legend i { width:10px; height:10px; border-radius:50%; display:inline-block; }
.tm-note { padding:10px 16px; font-size:12.5px; color:var(--muted); }
@media (max-width: 1100px) { .tm-body { grid-template-columns:minmax(0,1fr); } .tm-canvas { border-right:0; border-bottom:1px solid var(--line); } }
`;

function useFonts() {
  useEffect(() => {
    if (document.getElementById('tm-fonts')) return;
    const link = document.createElement('link');
    link.id = 'tm-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }, []);
}

// Converte a coleta do backend nas camadas do mapa.
function buildModel(data, view, mode) {
  if (!data) return null;
  const pick = (f) => (mode === 'd' ? f.down : f.up);
  const vlanInfo = new Map((data.vlans || []).map((v) => [v.id, v]));
  const keyOf = (f) => (view === 'internet'
    ? f.label
    : f.remoteVlan ? `VLAN ${f.remoteVlan} · ${vlanInfo.get(f.remoteVlan)?.name || ''}`.trim() : f.label.startsWith('Servidor') ? 'Servidor SGCG' : f.label);
  // Como no protótipo: só quem está trafegando, agrupado por VLAN e ordenado pela banda.
  const devices = (data.devices || []).map((d) => {
    const flows = d.flows.filter((f) => (view === 'internet' ? f.kind === 'internet' : f.kind === 'internal'));
    return { ...d, flows, val: flows.reduce((s, f) => s + pick(f), 0) };
  }).filter((d) => d.val > 0.01).sort((a, b) => a.vlan - b.vlan || b.val - a.val);
  const siteMap = new Map();
  for (const d of devices) {
    for (const f of d.flows) {
      const key = keyOf(f);
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
    d.links = d.flows.filter((f) => siteIndex.has(keyOf(f))).map((f) => ({ site: siteIndex.get(keyOf(f)), val: pick(f), down: f.down, up: f.up }));
  });
  const vlanIds = Array.from(new Set([...(data.vlans || []).map((v) => v.id), ...devices.map((d) => d.vlan)])).sort((a, b) => a - b);
  const vlans = vlanIds.map((id) => {
    const info = vlanInfo.get(id) || {};
    return { id, name: info.name || `VLAN ${id}`, limit: mode === 'd' ? info.limit_down : info.limit_up, neighbors: info.neighbors || 0, val: devices.filter((d) => d.vlan === id).reduce((s, d) => s + d.val, 0) };
  });
  return { devices, sites, vlans, wan: mode === 'd' ? data.wan.down : data.wan.up, online: (data.devices || []).length };
}

export default function TrafficMap() {
  useFonts();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState('d');
  const [view, setView] = useState('internet');
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(null);
  const [width, setWidth] = useState(860);
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const nodesRef = useRef({ devices: [], vlans: [], sites: [] });
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
  const internet = view === 'internet';
  const deviceCount = model?.devices.length || 0;
  // Mesmo espaçamento do protótipo (rótulo em duas linhas por dispositivo).
  const rowH = 31.5;
  const vlanCount = model?.vlans.length || 0;
  const height = Math.max(560, Math.round(deviceCount * rowH + 56), (model?.sites.length || 0) * 42 + 56, vlanCount * 72 + 70);

  stateRef.current = { model, sel, mode, paused, width, height, LINK, internet };

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
      const { model: m, sel: s, mode: md, width: W, height: H, LINK: L, internet: inet } = st;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      if (!st.paused) phase += dt;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = P.canvas;
      ctx.fillRect(0, 0, W, H);
      if (!m) { frame = requestAnimationFrame(draw); return; }

      const top = 34;
      const bottom = H - 22;
      const X = inet
        ? { dev: Math.max(190, W * 0.198), vlan: W * 0.407, wan: W * 0.581, site: W * 0.767 }
        : { dev: Math.max(190, W * 0.22), vlan: W * 0.47, site: W * 0.72 };

      m.devices.forEach((d, i) => {
        d.x = X.dev;
        d.y = top + (i + 0.5) * (bottom - top) / Math.max(1, m.devices.length);
        d.r = d.val > 0.01 ? 3 + Math.sqrt(d.val) * 1.6 : 2.5;
      });
      // Cada VLAN na altura média dos seus dispositivos (leque de rede neural).
      // As sem tráfego ocupam os espaços livres, sempre com distância mínima entre elas.
      const GAP = 66;
      const first = top + 14;
      const last = bottom - 34;
      const slot = (last - first) / Math.max(1, m.vlans.length - 1);
      m.vlans.forEach((v, i) => {
        const mine = m.devices.filter((d) => d.vlan === v.id);
        v.x = X.vlan;
        v.y = mine.length ? mine.reduce((acc, d) => acc + d.y, 0) / mine.length : first + i * slot;
        v.r = 8 + Math.sqrt(v.val) * 1.3;
      });
      for (let i = 1; i < m.vlans.length; i += 1) m.vlans[i].y = Math.max(m.vlans[i].y, m.vlans[i - 1].y + GAP);
      if (m.vlans.length) m.vlans[m.vlans.length - 1].y = Math.min(m.vlans[m.vlans.length - 1].y, last);
      for (let i = m.vlans.length - 2; i >= 0; i -= 1) m.vlans[i].y = Math.min(m.vlans[i].y, m.vlans[i + 1].y - GAP);
      if (m.vlans.length && m.vlans[0].y < first) {
        const shift = first - m.vlans[0].y;
        m.vlans.forEach((v) => { v.y += shift; });
      }
      const wan = inet ? { x: X.wan, y: (top + bottom) / 2, r: 40 } : null;
      m.sites.forEach((t, i) => {
        t.x = X.site;
        t.y = top + (i + 0.5) * (bottom - top) / Math.max(1, m.sites.length);
        t.r = 3 + Math.sqrt(t.val) * 1.5;
      });
      nodesRef.current = { devices: m.devices, vlans: m.vlans, sites: m.sites };

      ctx.font = `600 10.5px ${F_MONO}`;
      ctx.fillStyle = P.muted;
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
      let seed = 0;
      // Veia: linha com brilho que pulsa, e um fluxo contínuo de partículas proporcional à banda.
      const edge = (a, b, w, col, on, div) => {
        seed += 1;
        const c = curve(a, b);
        const lw = Math.max(1, Math.min(18, w / div));
        const beat = 0.5 + 0.5 * Math.sin(phase * 3.2 - seed * 0.7);
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = on && w > 0.3 ? alpha(col, 0.34 + beat * 0.14) : alpha(col, on ? 0.42 : 0.07);
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (reduce || !on || w <= 0.2) return;
        const n = Math.min(12, 2 + Math.floor(w / 5));
        const speed = 0.15 + Math.min(w, 60) / 160;
        const size = 1.6 + Math.min(1.6, lw / 8);
        for (let k = 0; k < n; k += 1) {
          let t = ((phase * speed) + k / n + seed * 0.137) % 1;
          if (md === 'd') t = 1 - t;
          const p = bez(c, t);
          ctx.beginPath();
          ctx.arc(p[0], p[1], size + 3, 0, Math.PI * 2);
          ctx.fillStyle = alpha(col, 0.14);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p[0], p[1], size + 0.8, 0, Math.PI * 2);
          ctx.fillStyle = alpha(col, 0.95);
          ctx.fill();
        }
      };

      m.devices.forEach((d) => {
        const v = m.vlans.find((x) => x.id === d.vlan);
        if (v) edge(d, v, d.val, vcol(d.vlan), devOn(d) && d.val > 0.01, 2.2);
      });
      if (inet) {
        m.vlans.forEach((v) => { if (v.val > 0.01) edge(v, wan, v.val, vcol(v.id), vlanOn(v), 5); });
        m.sites.forEach((t) => edge(wan, t, t.val, P.accent, siteOn(t), 5));
      } else {
        m.vlans.forEach((v) => {
          m.sites.forEach((t) => {
            const w = m.devices.filter((d) => d.vlan === v.id).reduce((acc, d) => acc + d.links.filter((l) => l.site === t.i).reduce((a2, l) => a2 + l.val, 0), 0);
            if (w > 0.01) edge(v, t, w, vcol(v.id), vlanOn(v) && siteOn(t), 4);
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
            ctx.strokeStyle = vcol(d.vlan);
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.setLineDash([]);
          });
        }
      }

      const circle = (n, col, on, key, glow) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (on && glow && false) { ctx.shadowColor = col; ctx.shadowBlur = 14; }
        ctx.fillStyle = on ? col : alpha(col, 0.2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (hoverRef.current === key) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = P.ink;
          ctx.stroke();
        }
      };

      m.devices.forEach((d) => {
        const idle = d.val <= 0.01;
        const on = devOn(d);
        circle(d, vcol(d.vlan), on && !idle, `dev:${d.ip}`, !idle);
        const lim = m.vlans.find((x) => x.id === d.vlan)?.limit || 100;
        if (d.val >= Math.max(15, lim * 0.15)) {
          const pulse = 0.5 + 0.5 * Math.sin(phase * 6);
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r + 4 + pulse * 5, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(P.crit, 0.35 + pulse * 0.6);
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = alpha(P.crit, 0.45 + pulse * 0.55);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        const name = shortName(d);
        const nm = name.length > 20 ? `${name.slice(0, 19)}…` : name;
        const rate = idle ? 'sem tráfego' : `${fmt(d.val)} Mbps`;
        ctx.textAlign = 'right';
        ctx.font = `500 11px ${F_MONO}`;
        ctx.fillStyle = on ? (idle ? alpha(P.ink, 0.6) : P.ink) : alpha(P.muted, 0.5);
        ctx.fillText(d.ip, d.x - d.r - 8, d.y - 1);
        ctx.font = `10px ${F_BODY}`;
        ctx.fillStyle = on ? P.muted : alpha(P.muted, 0.4);
        ctx.fillText(`${nm} · ${rate}${d.qosVip ? ' · prioridade' : ''}`, d.x - d.r - 8, d.y + 11);
      });

      m.vlans.forEach((v) => {
        const on = vlanOn(v);
        const use = v.limit ? v.val / v.limit : 0;
        circle(v, vcol(v.id), on && v.val > 0.01, `vlan:${v.id}`, true);
        if (v.limit && v.val > 0.01) {
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, use));
          ctx.strokeStyle = use > 0.9 ? P.crit : use > 0.7 ? P.warn : P.ok;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.font = `700 11px ${F_BODY}`;
        ctx.fillStyle = on ? P.ink : alpha(P.muted, 0.5);
        ctx.fillText(`${v.id} · ${v.name}`, v.x, v.y + v.r + 17);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = on ? P.muted : alpha(P.muted, 0.4);
        ctx.fillText(v.val > 0.01 ? `${fmt(v.val)}${v.limit ? `/${v.limit}` : ''}` : `sem tráfego · ${v.neighbors} disp.`, v.x, v.y + v.r + 29);
      });

      if (wan) {
        const u = m.wan / L;
        const ringCol = u > 0.85 ? P.crit : u > 0.65 ? P.warn : P.accent;
        ctx.beginPath();
        ctx.arc(wan.x, wan.y, wan.r, 0, Math.PI * 2);
        ctx.fillStyle = P.surface;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = P.line;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(wan.x, wan.y, wan.r - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u));
        ctx.strokeStyle = ringCol;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.fillStyle = P.ink;
        ctx.font = `800 17px ${F_DISPLAY}`;
        ctx.fillText(`${Math.round(u * 100)}%`, wan.x, wan.y + 2);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = P.muted;
        ctx.fillText(`de ${L} Mbps`, wan.x, wan.y + 16);
        ctx.font = `700 11px ${F_BODY}`;
        ctx.fillStyle = P.ink;
        ctx.fillText('Link WAN', wan.x, wan.y + wan.r + 18);
      }

      m.sites.forEach((t) => {
        const on = siteOn(t);
        circle(t, inet ? P.accent : P.warn, on, `site:${t.i}`, true);
        ctx.textAlign = 'left';
        ctx.font = `600 11.5px ${F_BODY}`;
        ctx.fillStyle = on ? P.ink : alpha(P.muted, 0.5);
        ctx.fillText(t.name.length > 28 ? `${t.name.slice(0, 27)}…` : t.name, t.x + t.r + 8, t.y - 1);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = on ? P.muted : alpha(P.muted, 0.4);
        ctx.fillText(`${fmt(t.val)} Mbps${inet ? ` · ${Math.round((t.val / L) * 100)}%` : ''}`, t.x + t.r + 8, t.y + 11);
      });

      if (!reduce) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [model, sel, mode, width, height, view]);

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

  const topIps = model ? [...model.devices].filter((d) => d.val > 0.01).sort((a, b) => b.val - a.val).slice(0, 5) : [];
  const topSites = model ? model.sites.slice(0, 5) : [];
  const selDev = sel?.t === 'dev' ? model?.devices.find((d) => d.ip === sel.ip) : null;
  const selSite = sel?.t === 'site' ? model?.sites[sel.i] : null;
  const selVlan = sel?.t === 'vlan' ? (data?.vlans || []).find((v) => v.id === sel.id) : null;
  const updated = data?.updated_at ? new Date(data.updated_at).toLocaleTimeString('pt-BR') : null;
  const vName = (id) => (data?.vlans || []).find((v) => v.id === id)?.name || '';

  return (
    <div className="space-y-4">
      <style>{CSS}</style>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Mapa de Tráfego</h1>
        <p className="max-w-3xl text-sm text-on-surface/60">Dispositivos à esquerda, VLANs, o link de {LINK} Mbps no centro e os sites à direita. A espessura de cada ligação é a banda em uso. Clique num IP para ver os sites dele, ou num site para ver quem está puxando.</p>
      </div>

      <section className="tm">
        <div className="tm-bar">
          <span className="tm-title">Mapa de Tráfego</span>
          <span className={`tm-tag ${paused ? 'paused' : 'live'}`}>{paused ? 'pausado' : <><i />ao vivo</>}</span>
          {updated ? <span className="tm-tag">{updated}</span> : null}
          <span className="tm-tag">{model?.online ?? 0} ligados · {deviceCount} com tráfego</span>
          <div className="tm-seg" role="group" aria-label="Tipo de tráfego" style={{ marginLeft: 'auto' }}>
            <button type="button" aria-pressed={internet} onClick={() => { setView('internet'); setSel(null); }}>Internet</button>
            <button type="button" aria-pressed={!internet} onClick={() => { setView('internal'); setSel(null); }}>Rede interna</button>
          </div>
          <div className="tm-seg" role="group" aria-label="Sentido do tráfego">
            <button type="button" aria-pressed={mode === 'd'} onClick={() => setMode('d')}>Download</button>
            <button type="button" aria-pressed={mode === 'u'} onClick={() => setMode('u')}>Upload</button>
          </div>
          <button type="button" className="tm-btn" onClick={() => setPaused((p) => !p)}>{paused ? 'Retomar' : 'Pausar'}</button>
        </div>

        <div className="tm-body">
          <div ref={scrollRef} className="tm-canvas">
            {error && !data ? <div className="tm-note" style={{ color: P.crit }}>Não foi possível ler o tráfego. Verifique se o backend está no ar.</div> : null}
            <canvas
              ref={canvasRef}
              style={{ width, height, display: 'block', cursor: 'crosshair' }}
              onMouseMove={(e) => { const n = hit(e); hoverRef.current = n?.key || null; e.currentTarget.style.cursor = n ? 'pointer' : 'crosshair'; }}
              onMouseLeave={() => { hoverRef.current = null; }}
              onClick={(e) => select(hit(e))}
              aria-label="Grafo de tráfego: dispositivos, VLANs, link e sites"
            />
          </div>

          <aside className="tm-side">
            <div className="tm-gauge">
              {[['Download', data?.wan.down], ['Upload', data?.wan.up]].map(([label, v]) => (
                <div key={label}>
                  <div className="tm-lbl">{label}</div>
                  <div className="tm-val">{data ? `${fmt(v)} Mbps` : '—'}</div>
                  <div className="tm-pct">{data ? `${Math.round(((v || 0) / LINK) * 100)}% de ${LINK} Mbps` : ''}</div>
                </div>
              ))}
            </div>

            <div className="tm-rank">
              <h3>Quem mais consome</h3>
              <ol>
                {topIps.map((d) => {
                  const p = (d.val / LINK) * 100;
                  return (
                    <li key={d.ip}>
                      <button type="button" className={sel?.key === `dev:${d.ip}` ? 'sel' : ''} onClick={() => select({ t: 'dev', ip: d.ip, vlan: d.vlan, key: `dev:${d.ip}` })} title={shortName(d)}>
                        <span className="tm-name" style={{ fontFamily: F_MONO }}>{d.ip}</span>
                        <span className="tm-mb">{fmt(d.val)} Mbps</span>
                        <span className="tm-barline"><i style={{ width: `${Math.min(100, p * 3).toFixed(1)}%`, background: vcol(d.vlan) }} /></span>
                      </button>
                    </li>
                  );
                })}
                {!topIps.length ? <li className="tm-pct">Sem tráfego agora.</li> : null}
              </ol>
            </div>

            <div className="tm-rank">
              <h3>{internet ? 'Sites mais pesados' : 'Destinos internos'}</h3>
              <ol>
                {topSites.map((t) => {
                  const p = (t.val / LINK) * 100;
                  return (
                    <li key={t.name}>
                      <button type="button" className={sel?.key === `site:${t.i}` ? 'sel' : ''} onClick={() => select({ t: 'site', i: t.i, key: `site:${t.i}` })}>
                        <span className="tm-name">{t.name}</span>
                        <span className="tm-mb">{internet ? `${Math.round(p)}%` : `${fmt(t.val)} Mbps`}</span>
                        <span className="tm-barline"><i style={{ width: `${Math.min(100, p * 3).toFixed(1)}%`, background: internet ? P.accent : P.warn }} /></span>
                      </button>
                    </li>
                  );
                })}
                {!topSites.length ? <li className="tm-pct">Sem tráfego agora.</li> : null}
              </ol>
            </div>

            <div className="tm-detail">
              {selDev ? (
                <>
                  <h3 className="mono">{selDev.ip}</h3>
                  <span className="muted">{shortName(selDev)} · VLAN {selDev.vlan} {vName(selDev.vlan)}{selDev.qosVip ? ' · com prioridade' : ''}</span>
                  <div>
                    {selDev.links.length ? selDev.links.map((l) => (
                      <div key={l.site}>{model.sites[l.site]?.name} <span className="mono muted">↓{fmt(l.down)} ↑{fmt(l.up)}</span></div>
                    )) : <span className="muted">Sem tráfego agora.</span>}
                  </div>
                  <div className="tm-acts">
                    <Link to={`/acoes-rapidas?acao=banda&ip=${selDev.ip}`}>Prioridade de banda</Link>
                    <Link to={`/acoes-rapidas?acao=temporaria&ip=${selDev.ip}`}>Liberar sites</Link>
                    <Link to={`/radar-dns?ip=${selDev.ip}`}>Ver no Radar DNS</Link>
                  </div>
                </>
              ) : selSite ? (
                <>
                  <h3>{selSite.name}</h3>
                  {selSite.dom.length ? <span className="mono muted">{selSite.dom.slice(0, 3).join(', ')}</span> : null}
                  <div>
                    {Array.from(selSite.users.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, v]) => {
                      const d = model.devices.find((x) => x.ip === ip);
                      return <div key={ip}><span className="mono">{ip}</span> <span className="muted">{d ? shortName(d) : ''} · {fmt(v)} Mbps</span></div>;
                    })}
                  </div>
                  {internet && selSite.dom.length ? (
                    <div className="tm-acts">
                      <Link to={`/acoes-rapidas?acao=bloquear&dominio=${selSite.dom[0]}`}>Bloquear site</Link>
                      <Link to={`/acoes-rapidas?acao=liberar&dominio=${selSite.dom[0]}`}>Liberar site</Link>
                    </div>
                  ) : null}
                </>
              ) : selVlan ? (
                <>
                  <h3>VLAN {selVlan.id} · {selVlan.name}</h3>
                  <span className="muted">Usando {fmt(mode === 'd' ? selVlan.down : selVlan.up)} de {(mode === 'd' ? selVlan.limit_down : selVlan.limit_up) ?? '—'} Mbps do limite de QoS. {selVlan.neighbors} dispositivos ligados.</span>
                  {selVlan.internal_down > 0.5 ? <span className="muted">Tráfego interno: {fmt(selVlan.internal_down)} Mbps{selVlan.internal_exempt ? ', fora do limite.' : ', contando no limite.'}</span> : null}
                  <div className="tm-acts">
                    <Link to="/rede?tab=qos">Ajustar QoS</Link>
                    <Link to="/rede?tab=scheduler">Horários</Link>
                    <Link to="/operacoes?tab=emergencia">Bloqueio total</Link>
                  </div>
                </>
              ) : (
                <span className="muted">Clique num nó do mapa ou num item da lista para ver detalhes.</span>
              )}
            </div>
          </aside>
        </div>

        <div className="tm-legend">
          {(data?.vlans || []).map((v) => (
            <span key={v.id}><i style={{ background: vcol(v.id) }} />VLAN {v.id} {v.name}{v.limit_down ? ` · QoS ${v.limit_down} Mbps` : ''}</span>
          ))}
          <span>Anel da VLAN: uso do limite (verde, âmbar acima de 70%, vermelho acima de 90%)</span>
          <span><i style={{ background: P.crit }} />Pisca em vermelho: consumo alto</span>
        </div>
      </section>
    </div>
  );
}
