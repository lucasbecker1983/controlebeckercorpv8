import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

/*
 * Mapa de Tráfego: cópia fiel do protótipo da auditoria UI/UX (área 860 × 560, colunas a
 * 170/350/500/660 px, mesmas cores, fontes, espessuras e partículas), alimentado com os
 * dados reais do coletor (/api/monitor/traffic). Até 16 dispositivos, os que mais consomem.
 */

const W = 860;
const H = 560;
const MAX_DEVICES = 16;
const MAX_SITES = 12;
const XS = { dev: 170, vlan: 350, wan: 500, site: 660 };

const C = {
  bg: '#eef2f4',
  surface: '#ffffff',
  sunken: '#e4eaed',
  ink: '#0f1d24',
  muted: '#566a73',
  line: '#d3dde2',
  accent: '#0a737c',
  crit: '#bf3226',
  warn: '#a8690f',
  ok: '#1d7f47',
  canvas: '#f7fafb',
};
const VLAN_COLORS = { 10: '#2c66a8', 30: '#8152c2', 40: '#a8690f', 50: '#1d7f47', 70: '#bf3226', 80: '#0a737c', 99: '#566a73' };
const vcol = (id) => VLAN_COLORS[id] || C.accent;

const F_DISPLAY = '"Archivo", "Arial Narrow", system-ui, sans-serif';
const F_BODY = '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const F_MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

const fmt = (v) => {
  const n = Number(v || 0);
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace('.', ',');
};
const alpha = (hex, a) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const kindOf = (d) => (d.hostname ? d.hostname.split(' · ')[0] : 'Dispositivo');

const CSS = `
.tm { max-width: 1162px; background:${C.surface}; color:${C.ink}; border:1px solid ${C.line}; border-radius:12px; overflow:hidden; font-family:${F_BODY}; font-size:15px; line-height:1.6; color-scheme: light; }
.tm-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; padding:12px 16px; border-bottom:1px solid ${C.line}; }
.tm-title { font-family:${F_DISPLAY}; font-stretch:85%; font-weight:750; font-size:16px; }
.tm-tag { font-family:${F_MONO}; font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid ${C.line}; color:${C.muted}; white-space:nowrap; }
.tm-tag.live { border-color:${C.ok}; color:${C.ok}; }
.tm-tag.paused { border-color:${C.warn}; color:${C.warn}; }
.tm-seg { display:inline-flex; border:1px solid ${C.line}; border-radius:8px; overflow:hidden; margin-left:auto; }
.tm-seg button, .tm-btn { font:inherit; font-size:13px; font-weight:600; background:transparent; color:${C.muted}; border:0; padding:6px 12px; cursor:pointer; }
.tm-seg button[aria-pressed="true"] { background:${C.accent}; color:${C.surface}; }
.tm-btn { border:1px solid ${C.line}; border-radius:8px; }
.tm-btn:hover, .tm-seg button:hover { color:${C.ink}; }
.tm-seg button[aria-pressed="true"]:hover { color:${C.surface}; }
.tm button:focus-visible, .tm a:focus-visible { outline:2px solid ${C.accent}; outline-offset:2px; }
.tm-body { display:grid; grid-template-columns:minmax(0,1fr) 300px; }
.tm-canvas { overflow-x:auto; background:${C.canvas}; border-right:1px solid ${C.line}; min-width:0; }
.tm-side { padding:16px; display:flex; flex-direction:column; gap:18px; min-width:0; }
.tm-gauge { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.tm-gauge > div { background:${C.sunken}; border-radius:8px; padding:10px 12px; }
.tm-lbl { font-size:11.5px; color:${C.muted}; font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.06em; }
.tm-val { font-family:${F_DISPLAY}; font-stretch:80%; font-size:26px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.1; }
.tm-pct { font-size:12px; color:${C.muted}; font-variant-numeric:tabular-nums; }
.tm-rank h3 { font-size:13px; font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.07em; color:${C.muted}; font-weight:600; margin:0 0 8px; }
.tm-rank ol { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.tm-rank li { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 8px; font-size:13px; cursor:pointer; padding:3px 4px; border-radius:6px; }
.tm-rank li:hover, .tm-rank li.sel { background:rgba(10,115,124,.10); }
.tm-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tm-mono { font-family:${F_MONO}; }
.tm-mb { font-family:${F_MONO}; font-size:12px; font-variant-numeric:tabular-nums; }
.tm-barline { grid-column:1/-1; height:4px; border-radius:2px; background:${C.sunken}; overflow:hidden; }
.tm-barline i { display:block; height:100%; border-radius:2px; }
.tm-detail { border-top:1px solid ${C.line}; padding-top:14px; font-size:13px; display:flex; flex-direction:column; gap:8px; }
.tm-detail h3 { margin:0; font-family:${F_DISPLAY}; font-stretch:90%; font-size:17px; font-weight:700; line-height:1.15; }
.tm-muted { color:${C.muted}; }
.tm-acts { display:flex; flex-wrap:wrap; gap:6px; }
.tm-acts a { font-size:12px; border:1px dashed ${C.line}; border-radius:6px; padding:3px 8px; color:${C.muted}; }
.tm-acts a:hover { color:${C.accent}; border-color:${C.accent}; }
.tm-legend { display:flex; flex-wrap:wrap; gap:6px 14px; padding:10px 16px; border-top:1px solid ${C.line}; font-size:12px; color:${C.muted}; }
.tm-legend span { display:inline-flex; align-items:center; gap:6px; }
.tm-legend i { width:10px; height:10px; border-radius:50%; display:inline-block; }
@media (max-width: 900px) { .tm-body { grid-template-columns:minmax(0,1fr); } .tm-canvas { border-right:0; border-bottom:1px solid ${C.line}; } .tm-seg { margin-left:0; } }
`;

function useFonts() {
  useEffect(() => {
    if (document.getElementById('tm-fonts')) return;
    const link = document.createElement('link');
    link.id = 'tm-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';
    document.head.appendChild(link);
  }, []);
}

// Mesmo modelo do protótipo: dispositivos (com fluxos por site), VLANs e sites.
function buildModel(data, mode) {
  if (!data) return null;
  const pick = (f) => (mode === 'd' ? f.down : f.up);
  const vlanInfo = new Map((data.vlans || []).map((v) => [v.id, v]));
  const active = (data.devices || [])
    .map((d) => {
      const flows = d.flows.filter((f) => f.kind === 'internet');
      return { ...d, flows, val: flows.reduce((s, f) => s + pick(f), 0) };
    })
    .filter((d) => d.val > 0.01)
    .sort((a, b) => b.val - a.val)
    .slice(0, MAX_DEVICES);
  const siteMap = new Map();
  for (const d of active) {
    for (const f of d.flows) {
      const s = siteMap.get(f.label) || { name: f.label, dom: f.domain || '', val: 0 };
      s.val += pick(f);
      if (!s.dom && f.domain) s.dom = f.domain;
      siteMap.set(f.label, s);
    }
  }
  const sites = Array.from(siteMap.values()).sort((a, b) => b.val - a.val).slice(0, MAX_SITES).map((s, i) => ({ ...s, i }));
  const siteIdx = new Map(sites.map((s) => [s.name, s.i]));
  const devices = active
    .sort((a, b) => a.vlan - b.vlan || b.val - a.val)
    .map((d, i) => ({
      i,
      ip: d.ip,
      vlan: d.vlan,
      kind: kindOf(d),
      qosVip: d.qosVip,
      val: d.val,
      flows: d.flows.filter((f) => siteIdx.has(f.label)).map((f) => ({ site: siteIdx.get(f.label), d: f.down, u: f.up })),
    }));
  // Todas as VLANs aparecem; as sem tráfego ficam apagadas, com a contagem de aparelhos ligados.
  const vlanIds = Array.from(new Set([...(data.vlans || []).map((v) => v.id), ...devices.map((d) => d.vlan)])).sort((a, b) => a - b);
  const vlans = vlanIds.map((id) => {
    const info = vlanInfo.get(id) || {};
    return { id, name: info.name || `VLAN ${id}`, limit: mode === 'd' ? info.limit_down : info.limit_up, neighbors: info.neighbors || 0, val: devices.filter((d) => d.vlan === id).reduce((s, d) => s + d.val, 0) };
  });
  return { devices, vlans, sites, wan: mode === 'd' ? data.wan.down : data.wan.up };
}

export default function TrafficMap() {
  useFonts();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState('d');
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  const nodesRef = useRef({ devices: [], vlans: [], sites: [] });
  const siteYRef = useRef(new Map());
  const hoverRef = useRef(null);

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

  const model = useMemo(() => buildModel(data, mode), [data, mode]);
  const LINK = data?.link_mbps || 300;
  stateRef.current = { model, sel, mode, paused, LINK };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let phase = 0;
    let prevTs = 0;

    const curve = (a, b) => {
      const mx = (a.x + b.x) / 2;
      return [a.x, a.y, mx, a.y, mx, b.y, b.x, b.y];
    };
    const bez = (c, t) => {
      const u = 1 - t;
      return [u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7]];
    };

    const frame = (ts) => {
      const st = stateRef.current;
      if (!st.paused) phase += prevTs ? (ts - prevTs) / 1000 : 0;
      prevTs = ts;
      try {
        draw(st);
      } catch (err) {
        // um quadro com erro não pode derrubar a animação
        console.error('[mapa]', err);
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    const draw = ({ model: m, sel: s, mode: md, LINK: L }) => {
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.canvas;
      ctx.fillRect(0, 0, W, H);
      ctx.font = `600 10.5px ${F_MONO}`;
      ctx.fillStyle = C.muted;
      ctx.textAlign = 'center';
      [['DISPOSITIVOS', XS.dev], ['VLANs', XS.vlan], ['LINK', XS.wan], ['SITES', XS.site]].forEach(([t, x]) => ctx.fillText(t, x, 18));
      if (!m) return;

      const top = 34;
      const bottom = H - 22;
      const devices = m.devices;
      const vlans = m.vlans;
      const sites = m.sites;
      devices.forEach((d, i) => {
        d.x = XS.dev;
        d.y = top + (i + 0.5) * (bottom - top) / devices.length;
        d.r = 3 + Math.sqrt(d.val) * 1.6;
      });
      // VLANs com tráfego no meio dos seus aparelhos; as demais ocupam os espaços livres, sem sobrepor.
      const vGap = Math.min(66, (bottom - top - 40) / Math.max(1, vlans.length - 1));
      const vFirst = top + 14;
      const vEnd = bottom - 34;
      const vSlot = (vEnd - vFirst) / Math.max(1, vlans.length - 1);
      vlans.forEach((v, i) => {
        const mine = devices.filter((d) => d.vlan === v.id);
        v.x = XS.vlan;
        v.y = mine.length ? mine.reduce((acc, d) => acc + d.y, 0) / mine.length : vFirst + i * vSlot;
        v.r = 8 + Math.sqrt(v.val) * 1.3;
      });
      for (let i = 1; i < vlans.length; i += 1) vlans[i].y = Math.max(vlans[i].y, vlans[i - 1].y + vGap);
      if (vlans.length) vlans[vlans.length - 1].y = Math.min(vlans[vlans.length - 1].y, vEnd);
      for (let i = vlans.length - 2; i >= 0; i -= 1) vlans[i].y = Math.min(vlans[i].y, vlans[i + 1].y - vGap);
      if (vlans.length && vlans[0].y < vFirst) {
        const shift = vFirst - vlans[0].y;
        vlans.forEach((v) => { v.y += shift; });
      }
      const wan = { x: XS.wan, y: (top + bottom) / 2, r: 40 };
      sites.forEach((t, i) => {
        const ty = top + (i + 0.5) * (bottom - top) / sites.length;
        const prev = siteYRef.current.get(t.name);
        t.y = prev ? prev + (ty - prev) * 0.25 : ty;
        siteYRef.current.set(t.name, t.y);
        t.x = XS.site;
        t.r = 3 + Math.sqrt(t.val) * 1.5;
      });
      nodesRef.current = { devices, vlans, sites };

      const related = (e) => {
        if (!s) return true;
        if (s.t === 'dev') {
          const dv = devices.find((d) => d.ip === s.ip);
          if (!dv) return true;
          if (e.dev) return e.dev === dv;
          if (e.site != null) return dv.flows.some((f) => f.site === e.site);
          return e.vlan === dv.vlan;
        }
        if (s.t === 'site') {
          if (e.site != null) return e.site === s.i;
          if (e.dev) return e.dev.flows.some((f) => f.site === s.i);
          return devices.some((d) => d.vlan === e.vlan && d.flows.some((f) => f.site === s.i));
        }
        if (s.t === 'vlan') return e.vlan === s.id || (e.site != null && devices.some((d) => d.vlan === s.id && d.flows.some((f) => f.site === e.site)));
        return true;
      };

      // Rede neural: todas as camadas ligadas por sinapses finas (fundo); as ligações reais vêm por cima.
      const layers = [devices, vlans, [wan], sites];
      ctx.lineWidth = 0.9;
      for (let li = 0; li < layers.length - 1; li += 1) {
        for (const a of layers[li]) {
          for (const b of layers[li + 1]) {
            const c = curve(a, b);
            ctx.beginPath();
            ctx.moveTo(c[0], c[1]);
            ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
            ctx.strokeStyle = alpha(C.muted, s ? 0.05 : 0.16);
            ctx.stroke();
          }
        }
      }
      // Sinais elétricos discretos correndo pelas sinapses de fundo.
      if (!reduce && !s) {
        let sig = 0;
        for (let li = 0; li < layers.length - 1; li += 1) {
          layers[li].forEach((a, ai) => {
            layers[li + 1].forEach((b, bi) => {
              sig += 1;
              const seedv = ((ai * 73 + bi * 151 + li * 37) % 97) / 97;
              const t = (phase * 0.22 + seedv) % 1;
              if (((ai + bi + li) % 2) !== 0) return;
              const p = bez(curve(a, b), t);
              ctx.beginPath();
              ctx.arc(p[0], p[1], 1.5, 0, Math.PI * 2);
              ctx.fillStyle = alpha(C.accent, 0.55 * Math.sin(Math.PI * t));
              ctx.fill();
            });
          });
        }
      }

      const edges = [];
      devices.forEach((dv) => {
        const v = vlans.find((x) => x.id === dv.vlan);
        if (v) edges.push({ a: dv, b: v, w: dv.val, col: vcol(dv.vlan), key: 'd', dev: dv, vlan: dv.vlan });
      });
      vlans.forEach((v) => { if (v.val > 0.01) edges.push({ a: v, b: wan, w: v.val, col: vcol(v.id), key: 'v', vlan: v.id }); });
      sites.forEach((t) => edges.push({ a: wan, b: t, w: t.val, col: C.accent, key: 's', site: t.i }));
      edges.forEach((e) => {
        const on = related(e);
        const c = curve(e.a, e.b);
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
        ctx.strokeStyle = alpha(e.col, on ? 0.42 : 0.07);
        ctx.lineWidth = Math.max(1, Math.min(18, e.w / (e.key === 'd' ? 2.2 : 5)));
        ctx.stroke();
        if (!reduce && on && e.w > 0.3) {
          const n = Math.min(6, 1 + Math.floor(e.w / 12));
          for (let k = 0; k < n; k += 1) {
            let t = ((phase * (0.15 + Math.min(e.w, 60) / 160)) + k / n) % 1;
            if (md === 'd') t = 1 - t;
            const p = bez(c, t);
            ctx.beginPath();
            ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2);
            ctx.fillStyle = alpha(e.col, 0.95);
            ctx.fill();
          }
        }
      });

      if (s && s.t === 'dev') {
        const dv = devices.find((d) => d.ip === s.ip);
        if (dv) {
          dv.flows.forEach((f) => {
            const t = sites[f.site];
            if (!t) return;
            ctx.beginPath();
            ctx.moveTo(dv.x, dv.y);
            ctx.bezierCurveTo(dv.x + 220, dv.y - 60, t.x - 200, t.y + 60, t.x, t.y);
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = vcol(dv.vlan);
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.setLineDash([]);
          });
        }
      }

      const circle = (x, y, r, col, on, hov) => {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
        ctx.fillStyle = alpha(col, on ? 0.12 : 0.04);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = alpha(col, on ? 0.35 : 0.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = on ? col : alpha(col, 0.2);
        ctx.fill();
        if (hov) { ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke(); }
      };
      const hv = hoverRef.current;

      devices.forEach((dv) => {
        const on = !s || (s.t === 'dev' && s.ip === dv.ip) || (s.t === 'vlan' && s.id === dv.vlan) || (s.t === 'site' && dv.flows.some((f) => f.site === s.i));
        circle(dv.x, dv.y, dv.r, vcol(dv.vlan), on, hv === `dev:${dv.ip}`);
        // consumo alto pisca em vermelho
        const lim = vlans.find((v) => v.id === dv.vlan)?.limit || 100;
        if (dv.val >= Math.max(15, lim * 0.15)) {
          const pulse = 0.5 + 0.5 * Math.sin(phase * 6);
          ctx.beginPath();
          ctx.arc(dv.x, dv.y, dv.r + 3 + pulse * 5, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(C.crit, 0.35 + pulse * 0.6);
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(dv.x, dv.y, dv.r, 0, Math.PI * 2);
          ctx.fillStyle = alpha(C.crit, 0.45 + pulse * 0.55);
          ctx.fill();
        }
        ctx.textAlign = 'right';
        ctx.font = `500 11px ${F_MONO}`;
        ctx.fillStyle = on ? C.ink : alpha(C.muted, 0.5);
        ctx.fillText(dv.ip, dv.x - dv.r - 8, dv.y - 1);
        ctx.font = `10px ${F_BODY}`;
        ctx.fillStyle = on ? C.muted : alpha(C.muted, 0.4);
        const kind = dv.kind.length > 22 ? `${dv.kind.slice(0, 21)}…` : dv.kind;
        ctx.fillText(`${kind} · ${fmt(dv.val)} Mbps`, dv.x - dv.r - 8, dv.y + 11);
      });

      vlans.forEach((v) => {
        const on = !s || (s.t === 'vlan' && s.id === v.id) || (s.t === 'dev' && devices.find((d) => d.ip === s.ip)?.vlan === v.id) || (s.t === 'site' && devices.some((d) => d.vlan === v.id && d.flows.some((f) => f.site === s.i)));
        const idleV = v.val <= 0.01;
        circle(v.x, v.y, v.r, vcol(v.id), on && !idleV, hv === `vlan:${v.id}`);
        if (v.limit && !idleV) {
          const use = v.val / v.limit;
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, use));
          ctx.strokeStyle = use > 0.9 ? C.crit : use > 0.7 ? C.warn : C.ok;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.font = `700 11px ${F_BODY}`;
        ctx.fillStyle = on && !idleV ? C.ink : alpha(C.muted, 0.7);
        ctx.fillText(`${v.id} · ${v.name}`, v.x, v.y + v.r + 17);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = on ? C.muted : alpha(C.muted, 0.4);
        ctx.fillText(idleV ? `sem tráfego · ${v.neighbors} disp.` : `${fmt(v.val)}${v.limit ? `/${v.limit}` : ''}`, v.x, v.y + v.r + 29);
      });

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
      ctx.font = `800 17px ${F_DISPLAY}`;
      ctx.fillText(`${Math.round(u * 100)}%`, wan.x, wan.y + 2);
      ctx.font = `10px ${F_MONO}`;
      ctx.fillStyle = C.muted;
      ctx.fillText(`de ${L} Mbps`, wan.x, wan.y + 16);
      ctx.font = `700 11px ${F_BODY}`;
      ctx.fillStyle = C.ink;
      ctx.fillText('Link WAN', wan.x, wan.y + wan.r + 18);

      sites.forEach((t) => {
        const on = !s || (s.t === 'site' && s.i === t.i) || (s.t === 'dev' && devices.find((d) => d.ip === s.ip)?.flows.some((f) => f.site === t.i)) || (s.t === 'vlan' && devices.some((d) => d.vlan === s.id && d.flows.some((f) => f.site === t.i)));
        circle(t.x, t.y, t.r, C.accent, on, hv === `site:${t.i}`);
        ctx.textAlign = 'left';
        ctx.font = `600 11.5px ${F_BODY}`;
        ctx.fillStyle = on ? C.ink : alpha(C.muted, 0.5);
        ctx.fillText(t.name.length > 26 ? `${t.name.slice(0, 25)}…` : t.name, t.x + t.r + 8, t.y - 1);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = on ? C.muted : alpha(C.muted, 0.4);
        ctx.fillText(`${fmt(t.val)} Mbps · ${Math.round((t.val / L) * 100)}%`, t.x + t.r + 8, t.y + 11);
      });

      if (!devices.length) {
        ctx.textAlign = 'center';
        ctx.font = `13px ${F_BODY}`;
        ctx.fillStyle = C.muted;
        ctx.fillText('Nenhum dispositivo com tráfego de internet agora.', W / 2, H - 60);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hit = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) * W) / r.width;
    const my = ((ev.clientY - r.top) * H) / r.height;
    const near = (n) => (mx - n.x) ** 2 + (my - n.y) ** 2 <= (n.r + 7) ** 2;
    const { devices, vlans, sites } = nodesRef.current;
    const d = devices.find(near);
    if (d) return { t: 'dev', ip: d.ip, key: `dev:${d.ip}` };
    const v = vlans.find(near);
    if (v) return { t: 'vlan', id: v.id, key: `vlan:${v.id}` };
    const s = sites.find(near);
    if (s) return { t: 'site', i: s.i, key: `site:${s.i}` };
    return null;
  };
  const select = (next) => setSel((cur) => (cur && next && cur.key === next.key ? null : next));

  const topIps = model ? [...model.devices].sort((a, b) => b.val - a.val).slice(0, 5) : [];
  const topSites = model ? model.sites.slice(0, 5) : [];
  const selDev = sel?.t === 'dev' ? model?.devices.find((d) => d.ip === sel.ip) : null;
  const selSite = sel?.t === 'site' ? model?.sites[sel.i] : null;
  const selVlan = sel?.t === 'vlan' ? (data?.vlans || []).find((v) => v.id === sel.id) : null;
  const vName = (id) => (data?.vlans || []).find((v) => v.id === id)?.name || '';

  return (
    <div className="space-y-4">
      <style>{CSS}</style>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Mapa de Tráfego</h1>
        <p className="max-w-3xl text-sm text-on-surface/60">Dispositivos à esquerda, VLANs, o link de {LINK} Mbps no centro e os sites à direita. A espessura de cada ligação é a banda em uso. Clique num IP para ver os sites dele, ou num site para ver quem está puxando.</p>
      </div>

      <div className="tm">
        <div className="tm-bar">
          <span className="tm-title">Mapa de Tráfego</span>
          <span className={`tm-tag ${paused ? 'paused' : 'live'}`}>{paused ? 'pausado' : 'ao vivo'}</span>
          {data?.updated_at ? <span className="tm-tag">{new Date(data.updated_at).toLocaleTimeString('pt-BR')}</span> : null}
          <div className="tm-seg" role="group" aria-label="Sentido do tráfego">
            <button type="button" aria-pressed={mode === 'd'} onClick={() => setMode('d')}>Download</button>
            <button type="button" aria-pressed={mode === 'u'} onClick={() => setMode('u')}>Upload</button>
          </div>
          <button type="button" className="tm-btn" onClick={() => setPaused((p) => !p)}>{paused ? 'Retomar' : 'Pausar'}</button>
        </div>
        <div className="tm-body">
          <div className="tm-canvas">
            {error && !data ? <div style={{ padding: 16, color: C.crit, fontSize: 13 }}>Não foi possível ler o tráfego. Verifique se o backend está no ar.</div> : null}
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              style={{ display: 'block', width: W, height: H, cursor: 'crosshair' }}
              onMouseMove={(e) => { const n = hit(e); hoverRef.current = n?.key || null; e.currentTarget.style.cursor = n ? 'pointer' : 'crosshair'; }}
              onMouseLeave={() => { hoverRef.current = null; }}
              onClick={(e) => select(hit(e))}
              aria-label="Grafo de tráfego: dispositivos, VLANs, link e sites"
            />
          </div>
          <aside className="tm-side">
            <div className="tm-gauge">
              {[['Download', data?.wan?.down], ['Upload', data?.wan?.up]].map(([label, v]) => (
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
                {topIps.map((d) => (
                  <li key={d.ip} className={sel?.key === `dev:${d.ip}` ? 'sel' : ''} onClick={() => select({ t: 'dev', ip: d.ip, key: `dev:${d.ip}` })} title={d.kind}>
                    <span className="tm-name tm-mono">{d.ip}</span>
                    <span className="tm-mb">{fmt(d.val)} Mbps</span>
                    <span className="tm-barline"><i style={{ width: `${Math.min(100, (d.val / LINK) * 300).toFixed(1)}%`, background: vcol(d.vlan) }} /></span>
                  </li>
                ))}
                {!topIps.length ? <li className="tm-pct" style={{ cursor: 'default' }}>Sem tráfego agora.</li> : null}
              </ol>
            </div>
            <div className="tm-rank">
              <h3>Sites mais pesados</h3>
              <ol>
                {topSites.map((t) => (
                  <li key={t.name} className={sel?.key === `site:${t.i}` ? 'sel' : ''} onClick={() => select({ t: 'site', i: t.i, key: `site:${t.i}` })}>
                    <span className="tm-name">{t.name}</span>
                    <span className="tm-mb">{Math.round((t.val / LINK) * 100)}%</span>
                    <span className="tm-barline"><i style={{ width: `${Math.min(100, (t.val / LINK) * 300).toFixed(1)}%`, background: C.accent }} /></span>
                  </li>
                ))}
                {!topSites.length ? <li className="tm-pct" style={{ cursor: 'default' }}>Sem tráfego agora.</li> : null}
              </ol>
            </div>
            <div className="tm-detail">
              {selDev ? (
                <>
                  <h3 className="tm-mono">{selDev.ip}</h3>
                  <span className="tm-muted">{selDev.kind} · VLAN {selDev.vlan} {vName(selDev.vlan)}{selDev.qosVip ? ' · com prioridade' : ''}</span>
                  <div>{selDev.flows.map((f) => <div key={f.site}>{model.sites[f.site]?.name} <span className="tm-mono tm-muted">↓{fmt(f.d)} ↑{fmt(f.u)}</span></div>)}</div>
                  <div className="tm-acts">
                    <Link to={`/acoes-rapidas?acao=banda&ip=${selDev.ip}`}>Limitar banda</Link>
                    <Link to={`/politicas?tab=policies`}>Bloquear</Link>
                    <Link to={`/radar-dns?ip=${selDev.ip}`}>Ver no Radar DNS</Link>
                  </div>
                </>
              ) : selSite ? (
                <>
                  <h3>{selSite.name}</h3>
                  {selSite.dom ? <span className="tm-mono tm-muted">{selSite.dom}</span> : null}
                  <div>
                    {model.devices.filter((d) => d.flows.some((f) => f.site === selSite.i)).map((d) => {
                      const f = d.flows.find((x) => x.site === selSite.i);
                      return <div key={d.ip}><span className="tm-mono">{d.ip}</span> <span className="tm-muted">{fmt(mode === 'd' ? f.d : f.u)} Mbps</span></div>;
                    })}
                  </div>
                  {selSite.dom ? (
                    <div className="tm-acts">
                      <Link to={`/acoes-rapidas?acao=bloquear&dominio=${selSite.dom}`}>Bloquear site</Link>
                      <Link to="/rede?tab=scheduler">Limitar por horário</Link>
                    </div>
                  ) : null}
                </>
              ) : selVlan ? (
                <>
                  <h3>VLAN {selVlan.id} · {selVlan.name}</h3>
                  <span className="tm-muted">Usando {fmt(mode === 'd' ? selVlan.down : selVlan.up)} de {(mode === 'd' ? selVlan.limit_down : selVlan.limit_up) ?? '—'} Mbps do limite de QoS.</span>
                  <div className="tm-acts">
                    <Link to="/rede?tab=qos">Ajustar QoS</Link>
                    <Link to="/rede?tab=scheduler">Horários</Link>
                    <Link to="/operacoes?tab=emergencia">Bloqueio total</Link>
                  </div>
                </>
              ) : (
                <span className="tm-muted">Clique num nó do mapa ou num item da lista para ver detalhes.</span>
              )}
            </div>
          </aside>
        </div>
        <div className="tm-legend">
          {(data?.vlans || []).filter((v) => v.limit_down).map((v) => (
            <span key={v.id}><i style={{ background: vcol(v.id) }} />VLAN {v.id} {v.name} · QoS {v.limit_down} Mbps</span>
          ))}
          <span>Anel da VLAN: uso do limite (verde, âmbar acima de 70%, vermelho acima de 90%)</span>
        </div>
      </div>
    </div>
  );
}
