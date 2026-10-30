import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { DataTable, PageHeader } from '../components/ui/kit';
import { VlanChip } from '../components/policies/shared';

/*
 * Mapa de Tráfego em camadas, fiel ao protótipo da auditoria UI/UX:
 * DISPOSITIVOS → VLANs → LINK → SITES, ligações com espessura = banda e partículas no sentido escolhido.
 *
 * - Cores lidas do tema do sistema (claro ou escuro) e relidas quando o tema muda.
 * - Todos os IPs com tráfego aparecem (sem limite), com download e upload no rótulo.
 * - O nó com a maior banda agora fica vermelho e piscando, exceto o NVR (ver TOP_IGNORE).
 * - Tráfego interno (ex.: câmeras ↔ NVR) vai da VLAN direto a "Rede interna", sem passar pelo link.
 */

// Proporções do protótipo: área lógica de 860 px com as colunas nestas posições.
const BASE_W = 860;
const BASE_H = 560;
const COLS = { dev: 170, vlan: 350, wan: 500, site: 660 };
const MIN_W = 760; // abaixo disso o mapa rola na horizontal (celular)
const ROW = 30;
const MAX_SITES = 12; // os demais destinos viram "Outros"
const POLL_MS = 2500;
// O NVR recebe as câmeras o tempo todo; ele nunca é marcado como "maior consumo".
const TOP_IGNORE = new Set(['192.168.10.50']);
// Abaixo disso a rede está parada: ninguém pisca.
const TOP_MIN_MBPS = 0.5;

const F_DISPLAY = '"Archivo", "Arial Narrow", system-ui, sans-serif';
const F_BODY = '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const F_MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

const fmt = (v) => {
  const n = Number(v || 0);
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace('.', ',');
};
const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);
const kindOf = (d) => (d.hostname ? String(d.hostname).split(' · ')[0] : 'Dispositivo');

// Cores do tema: aceita #hex e rgb()/rgba() (os tokens de contorno do sistema são rgba).
const parseColor = (value, fallback) => {
  const s = String(value || '').trim() || fallback;
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: Number.isFinite(p[3]) ? p[3] : 1 };
  }
  return fallback && s !== fallback ? parseColor(fallback) : { r: 128, g: 128, b: 128, a: 1 };
};
const rgba = (c, a = 1) => `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, (c.a ?? 1) * a))})`;

const VLAN_IDS = [10, 30, 40, 50, 70, 80, 99];
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => parseColor(cs.getPropertyValue(name), fb);
  const vlan = {};
  VLAN_IDS.forEach((id) => { vlan[id] = v(`--vlan-${id}`, '#5a6b74'); });
  return {
    bg: v('--map-bg', '#f7fafb'),
    surface: v('--md-container', '#ffffff'),
    ink: v('--md-on-surface', '#0f172a'),
    line: v('--md-outline', 'rgba(15,23,42,0.12)'),
    crit: v('--md-danger', '#c62828'),
    warn: v('--md-warning', '#b45309'),
    ok: v('--md-success', '#1b7f4b'),
    accent: v('--vlan-80', '#0a737c'),
    vlan,
  };
}

const CSS = `
.tm { background:var(--md-container); color:var(--md-on-surface); border:1px solid var(--md-outline); border-radius:12px; overflow:hidden; font-family:${F_BODY}; font-size:15px; line-height:1.6; }
.tm-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; padding:12px 16px; border-bottom:1px solid var(--md-outline); }
.tm-title { font-family:${F_DISPLAY}; font-stretch:85%; font-weight:750; font-size:16px; }
.tm-tag { font-family:${F_MONO}; font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid var(--md-outline); color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); white-space:nowrap; }
.tm-tag.live { border-color:var(--md-success); color:var(--md-success); }
.tm-tag.paused, .tm-tag.late { border-color:var(--md-warning); color:var(--md-warning); }
.tm-tag.top { border-color:var(--md-danger); color:var(--md-danger); }
.tm-seg { display:inline-flex; border:1px solid var(--md-outline); border-radius:8px; overflow:hidden; margin-left:auto; }
.tm-seg button, .tm-btn { font:inherit; font-size:13px; font-weight:600; background:transparent; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); border:0; padding:6px 12px; cursor:pointer; }
.tm-seg button[aria-pressed="true"] { background:var(--vlan-80); color:var(--md-container); }
.tm-btn { border:1px solid var(--md-outline); border-radius:8px; }
.tm-btn:hover, .tm-seg button:hover { color:var(--md-on-surface); }
.tm-seg button[aria-pressed="true"]:hover { color:var(--md-container); }
.tm button:focus-visible, .tm a:focus-visible, .tm canvas:focus-visible { outline:2px solid var(--vlan-80); outline-offset:2px; }
.tm-body { display:grid; grid-template-columns:minmax(0,1fr) 300px; }
.tm-canvas { overflow-x:auto; background:var(--map-bg); border-right:1px solid var(--md-outline); min-width:0; }
.tm-hint { font-size:12px; padding:6px 12px; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tm-side { padding:16px; display:flex; flex-direction:column; gap:18px; min-width:0; }
.tm-gauge { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.tm-gauge > div { background:var(--md-surface); border-radius:8px; padding:10px 12px; }
.tm-lbl { font-size:11.5px; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.06em; }
.tm-val { font-family:${F_DISPLAY}; font-stretch:80%; font-size:26px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.1; }
.tm-pct { font-size:12px; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); font-variant-numeric:tabular-nums; }
.tm-rank h3 { font-size:13px; font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.07em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); font-weight:600; margin:0 0 8px; }
.tm-rank ol { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.tm-rank li { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 8px; font-size:13px; cursor:pointer; padding:3px 4px; border-radius:6px; }
.tm-rank li:hover, .tm-rank li.sel { background:color-mix(in srgb, var(--vlan-80) 12%, transparent); }
.tm-rank li.empty { cursor:default; }
.tm-rank li.empty:hover { background:transparent; }
.tm-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tm-mono { font-family:${F_MONO}; }
.tm-mb { font-family:${F_MONO}; font-size:12px; font-variant-numeric:tabular-nums; }
.tm-barline { grid-column:1/-1; height:4px; border-radius:2px; background:var(--md-surface); overflow:hidden; }
.tm-barline i { display:block; height:100%; border-radius:2px; }
.tm-detail { border-top:1px solid var(--md-outline); padding-top:14px; font-size:13px; display:flex; flex-direction:column; gap:8px; }
.tm-detail h3 { margin:0; font-family:${F_DISPLAY}; font-stretch:90%; font-size:17px; font-weight:700; line-height:1.15; overflow-wrap:anywhere; }
.tm-muted { color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tm-crit { color:var(--md-danger); font-weight:600; }
.tm-acts { display:flex; flex-wrap:wrap; gap:6px; }
.tm-acts a { font-size:12px; border:1px dashed var(--md-outline); border-radius:6px; padding:3px 8px; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tm-acts a:hover { color:var(--vlan-80); border-color:var(--vlan-80); }
.tm-legend { display:flex; flex-wrap:wrap; gap:6px 14px; padding:10px 16px; border-top:1px solid var(--md-outline); font-size:12px; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tm-legend span { display:inline-flex; align-items:center; gap:6px; }
.tm-legend i { width:10px; height:10px; border-radius:50%; display:inline-block; }
.tm-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--md-danger); animation:tm-blink 1s ease-in-out infinite; }
@keyframes tm-blink { 50% { opacity:.25; } }
@media (prefers-reduced-motion: reduce) { .tm-dot { animation:none; } }
@media (max-width: 900px) { .tm-body { grid-template-columns:minmax(0,1fr); } .tm-canvas { border-right:0; border-bottom:1px solid var(--md-outline); } .tm-seg { margin-left:0; } }
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

/*
 * Modelo do mapa a partir de /api/monitor/traffic.
 * device.down/up já incluem o tráfego interno; a parte de internet é o total menos o interno.
 * Todo IP com algum tráfego (em qualquer sentido) entra; o sentido escolhido só muda espessuras e partículas.
 */
function buildModel(data, mode) {
  if (!data) return null;
  const vlanInfo = new Map((data.vlans || []).map((v) => [Number(v.id), v]));
  const vName = (id) => vlanInfo.get(Number(id))?.name || `VLAN ${id}`;
  const dirOf = (f) => (mode === 'd' ? f.down : f.up);
  // Valor de um fluxo no sentido escolhido; interno conta os dois sentidos (não passa pelo link).
  const flowVal = (f) => (f.kind === 'internal' ? (f.down || 0) + (f.up || 0) : dirOf(f) || 0);
  const siteKey = (f) => {
    if (f.kind !== 'internal') return f.label || f.domain || f.remote || 'Desconhecido';
    if (String(f.label || '').startsWith('Servidor')) return 'Rede interna · Servidor SGCG';
    return f.remoteVlan ? `Rede interna · ${vName(f.remoteVlan)}` : 'Rede interna';
  };

  const devices = (data.devices || [])
    .map((d) => {
      const down = Number(d.down || 0);
      const up = Number(d.up || 0);
      const intDown = Number(d.internalDown || 0);
      const intUp = Number(d.internalUp || 0);
      const inetDown = Math.max(0, down - intDown);
      const inetUp = Math.max(0, up - intUp);
      const inet = mode === 'd' ? inetDown : inetUp;
      return {
        ip: d.ip,
        vlan: Number(d.vlan),
        kind: kindOf(d),
        hostname: d.hostname || '',
        qosVip: Boolean(d.qosVip),
        down,
        up,
        intDown,
        intUp,
        inetDown,
        inetUp,
        total: down + up,
        inet,
        val: inet + intDown + intUp,
        rawFlows: (d.flows || []).filter((f) => (f.down || 0) + (f.up || 0) > 0.001),
      };
    })
    .filter((d) => d.total > 0.005);

  // Destinos: soma por site; os maiores ficam, o resto vira "Outros".
  const siteMap = new Map();
  devices.forEach((d) => d.rawFlows.forEach((f) => {
    const key = siteKey(f);
    const internal = f.kind === 'internal';
    const s = siteMap.get(key) || { key, name: key, dom: '', internal, remoteVlan: internal ? Number(f.remoteVlan) || 99 : null, val: 0, down: 0, up: 0 };
    s.val += flowVal(f);
    s.down += f.down || 0;
    s.up += f.up || 0;
    if (!s.dom && f.domain && !internal) s.dom = f.domain;
    siteMap.set(key, s);
  }));
  // Quem fica no mapa é escolhido pelo total (download + upload), para um destino só de upload não sumir
  // no modo Download; a ordem na coluna segue o sentido escolhido, como no protótipo.
  const ranked = Array.from(siteMap.values()).sort((a, b) => (b.down + b.up) - (a.down + a.up));
  const kept = ranked.slice(0, MAX_SITES).sort((a, b) => b.val - a.val || (b.down + b.up) - (a.down + a.up));
  const rest = ranked.slice(MAX_SITES);
  const keptKeys = new Set(kept.map((s) => s.key));
  const sites = [...kept];
  if (rest.length) {
    sites.push(rest.reduce((acc, s) => ({ ...acc, val: acc.val + s.val, down: acc.down + s.down, up: acc.up + s.up }), { key: '__outros__', name: `Outros (${rest.length})`, dom: '', internal: false, remoteVlan: null, val: 0, down: 0, up: 0 }));
  }
  devices.forEach((d) => {
    const agg = new Map();
    d.rawFlows.forEach((f) => {
      const k = siteKey(f);
      const key = keptKeys.has(k) ? k : '__outros__';
      const cur = agg.get(key) || { site: key, d: 0, u: 0, v: 0, labels: [] };
      cur.d += f.down || 0;
      cur.u += f.up || 0;
      cur.v += flowVal(f);
      if (cur.labels.length < 6) cur.labels.push({ label: f.label || f.domain || f.remote, d: f.down || 0, u: f.up || 0 });
      agg.set(key, cur);
    });
    d.flows = Array.from(agg.values());
  });

  // Todas as VLANs aparecem, em faixas; as sem tráfego ficam apagadas.
  const vlanIds = Array.from(new Set([...(data.vlans || []).map((v) => Number(v.id)), ...devices.map((d) => d.vlan)])).sort((a, b) => a - b);
  const vlans = vlanIds.map((id) => {
    const info = vlanInfo.get(id) || {};
    const mine = devices.filter((d) => d.vlan === id);
    return {
      id,
      name: info.name || `VLAN ${id}`,
      limit: mode === 'd' ? info.limit_down : info.limit_up,
      neighbors: info.neighbors || 0,
      val: mine.reduce((s, d) => s + d.val, 0),
      inet: mine.reduce((s, d) => s + d.inet, 0),
      internal: mine.reduce((s, d) => s + d.intDown + d.intUp, 0),
      down: mine.reduce((s, d) => s + d.down, 0),
      up: mine.reduce((s, d) => s + d.up, 0),
      count: mine.length,
    };
  });

  // Maior consumo agora (download + upload, interno incluído), fora o NVR.
  const top = devices
    .filter((d) => !TOP_IGNORE.has(d.ip) && d.total >= TOP_MIN_MBPS)
    .sort((a, b) => b.total - a.total)[0] || null;

  return {
    devices,
    vlans,
    sites,
    wan: Number((mode === 'd' ? data.wan?.down : data.wan?.up) || 0),
    wanDown: Number(data.wan?.down || 0),
    wanUp: Number(data.wan?.up || 0),
    topIp: top?.ip || null,
  };
}

// Posições: uma faixa por VLAN (mínimo 2 linhas), aparelhos dentro dela e a VLAN no centro.
function layoutModel(m, LW) {
  const sx = LW / BASE_W;
  const xs = { dev: COLS.dev * sx, vlan: COLS.vlan * sx, wan: COLS.wan * sx, site: COLS.site * sx };
  const slots = m ? m.vlans.reduce((acc, v) => acc + Math.max(2, v.count), 0) : 0;
  const HH = Math.max(BASE_H, Math.round(slots * ROW + 60));
  if (!m) return { HH, xs, wan: null };
  const top = 36;
  const bottom = HH - 24;
  const step = (bottom - top) / Math.max(1, slots);
  let cursor = 0;
  m.vlans.forEach((v) => {
    const mine = m.devices.filter((d) => d.vlan === v.id).sort((a, b) => b.total - a.total);
    const band = Math.max(2, mine.length);
    const offset = (band - mine.length) / 2;
    mine.forEach((d, k) => {
      d.x = xs.dev;
      d.y = top + (cursor + offset + k + 0.5) * step;
      d.r = 3 + Math.sqrt(d.val) * 1.6;
    });
    v.x = xs.vlan;
    v.y = top + (cursor + band / 2) * step;
    v.r = 8 + Math.sqrt(v.val) * 1.3;
    cursor += band;
  });
  const wan = { x: xs.wan, y: (top + bottom) / 2, r: 40 };
  const n = m.sites.length;
  const gap = n ? Math.min((bottom - top) / n, 46) : 0;
  const start = (top + bottom) / 2 - (gap * n) / 2;
  m.sites.forEach((s, i) => {
    s.x = xs.site;
    s.ty = start + (i + 0.5) * gap;
    s.r = 3 + Math.sqrt(s.val) * 1.5;
  });
  return { HH, xs, wan };
}

export default function TrafficMap() {
  useFonts();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState('d');
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(null);
  const [boxW, setBoxW] = useState(BASE_W);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  const nodesRef = useRef({ devices: [], vlans: [], sites: [] });
  const siteYRef = useRef(new Map());
  const hoverRef = useRef(null);
  const themeRef = useRef(null);
  const drawNowRef = useRef(() => {});

  // Dados ao vivo: primeira leitura imediata e depois a cada 2,5 s.
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
    const timer = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [paused]);

  // Largura disponível: o mapa ocupa o espaço todo; abaixo de MIN_W rola na horizontal.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setBoxW(Math.floor(el.clientWidth || BASE_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Tema: lê as cores do sistema e relê quando o usuário troca entre claro e escuro.
  useEffect(() => {
    themeRef.current = readTheme();
    const obs = new MutationObserver(() => { themeRef.current = readTheme(); drawNowRef.current(); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'data-ui-style', 'class', 'style'] });
    return () => obs.disconnect();
  }, []);

  const model = useMemo(() => buildModel(data, mode), [data, mode]);
  const LINK = Number(data?.link_mbps || 300);
  const LW = Math.max(MIN_W, boxW);
  const geo = useMemo(() => layoutModel(model, LW), [model, LW]);
  stateRef.current = { model, sel, mode, paused, LINK, LW, geo };

  // Desenho: animação contínua; com "reduzir movimento" redesenha só quando algo muda.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let phase = 0;
    let prevTs = 0;
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
      const { HH, wan: wanPos } = st.geo;
      const LWd = st.LW;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== Math.round(LWd * dpr) || canvas.height !== Math.round(HH * dpr)) {
        canvas.width = Math.round(LWd * dpr);
        canvas.height = Math.round(HH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, LWd, HH);
      ctx.fillStyle = rgba(T.bg);
      ctx.fillRect(0, 0, LWd, HH);
      const muted = (a = 1) => rgba(T.ink, 0.62 * a);
      const vcol = (id) => T.vlan[id] || T.accent;

      const xs = st.geo.xs;
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
          for (let k = 0; k < n; k += 1) {
            let t = ((phase * (0.15 + Math.min(e.w, 60) / 160)) + k / n) % 1;
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
        const room = dv.x - dv.r - 8 - 6;
        ctx.textAlign = 'right';
        ctx.font = `${isTop ? 700 : 500} 11px ${F_MONO}`;
        ctx.fillStyle = isTop ? rgba(T.crit) : on ? rgba(T.ink) : muted(0.5);
        ctx.fillText(fitText(dv.ip, room), dv.x - dv.r - 8, dv.y - 1);
        ctx.font = `10px ${F_BODY}`;
        ctx.fillStyle = on ? muted() : muted(0.5);
        // Download e upload sempre aparecem; o tipo do aparelho é encurtado para caber.
        const speeds = `↓${fmt(dv.down)} ↑${fmt(dv.up)} Mbps`;
        const kindRoom = room - ctx.measureText(` · ${speeds}`).width;
        const kind = kindRoom > 18 ? fitText(dv.kind, kindRoom) : '';
        ctx.fillText(kind ? `${kind} · ${speeds}` : speeds, dv.x - dv.r - 8, dv.y + 11);
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
        ctx.textAlign = 'center';
        ctx.font = `700 11px ${F_BODY}`;
        ctx.fillStyle = on && !idle ? rgba(T.ink) : muted(0.75);
        ctx.fillText(`${v.id} · ${v.name}`, v.x, v.y + v.r + 17);
        ctx.font = `10px ${F_MONO}`;
        ctx.fillStyle = on ? muted() : muted(0.5);
        const inner = v.internal > 0.05 ? ` · ${fmt(v.internal)} interno` : '';
        ctx.fillText(idle ? `sem tráfego · ${v.neighbors} disp.` : `${fmt(v.inet)}${v.limit ? `/${v.limit}` : ''}${inner}`, v.x, v.y + v.r + 29);
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
      if (!stateRef.current.paused) phase += prevTs ? (ts - prevTs) / 1000 : 0;
      prevTs = ts;
      safeDraw(ts);
      raf = requestAnimationFrame(frame);
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
  useEffect(() => { drawNowRef.current(); }, [model, sel, mode, LW, geo]);

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
    if (s) return { t: 'site', key: s.key, k: `site:${s.key}` };
    return null;
  };
  const keyOfSel = (x) => (x ? (x.t === 'site' ? `site:${x.key}` : x.key) : null);
  const select = useCallback((next) => setSel((cur) => (cur && next && keyOfSel(cur) === keyOfSel(next) ? null : next)), []);

  const devicesByTotal = useMemo(() => (model ? [...model.devices].sort((a, b) => b.total - a.total) : []), [model]);
  const topIps = devicesByTotal.slice(0, 5);
  const topSites = model ? model.sites.filter((t) => !t.internal && t.key !== '__outros__').slice(0, 5) : [];
  const selDev = sel?.t === 'dev' ? model?.devices.find((d) => d.ip === sel.ip) : null;
  const selSite = sel?.t === 'site' ? model?.sites.find((t) => t.key === sel.key) : null;
  const selVlan = sel?.t === 'vlan' ? model?.vlans.find((v) => v.id === sel.id) : null;
  const vName = (id) => model?.vlans.find((v) => v.id === id)?.name || '';
  const topDev = model?.topIp ? model.devices.find((d) => d.ip === model.topIp) : null;
  const stale = data?.updated_at && Date.now() - Number(data.updated_at) > 60000;
  const narrow = boxW < MIN_W;

  return (
    <div className="space-y-4">
      <style>{CSS}</style>
      <PageHeader
        title="Mapa de Tráfego"
        description={`Dispositivos à esquerda, VLANs, o link de ${LINK} Mbps no centro e os sites à direita. A espessura de cada ligação é a banda em uso. Clique num IP para ver os sites dele, ou num site para ver quem está puxando.`}
      />

      <div className="tm">
        <div className="tm-bar">
          <span className="tm-title">Mapa de Tráfego</span>
          <span className={`tm-tag ${paused ? 'paused' : 'live'}`}>{paused ? 'pausado' : 'ao vivo'}</span>
          {data?.updated_at ? <span className={`tm-tag ${stale ? 'late' : ''}`}>{stale ? 'coletor atrasado · ' : ''}{new Date(Number(data.updated_at)).toLocaleTimeString('pt-BR')}</span> : null}
          {model ? <span className="tm-tag">{model.devices.length} IP{model.devices.length === 1 ? '' : 's'} com tráfego</span> : null}
          {topDev ? <span className="tm-tag top"><span className="tm-dot" style={{ marginRight: 6, verticalAlign: 'middle' }} />maior consumo: {topDev.ip}</span> : null}
          <div className="tm-seg" role="group" aria-label="Sentido do tráfego">
            <button type="button" aria-pressed={mode === 'd'} onClick={() => setMode('d')}>Download</button>
            <button type="button" aria-pressed={mode === 'u'} onClick={() => setMode('u')}>Upload</button>
          </div>
          <button type="button" className="tm-btn" onClick={() => setPaused((p) => !p)}>{paused ? 'Retomar' : 'Pausar'}</button>
        </div>
        <div className="tm-body">
          <div className="tm-canvas" ref={wrapRef}>
            {error && !data ? <div className="tm-hint" style={{ color: 'var(--md-danger)' }}>Não foi possível ler o tráfego. Verifique se o backend está no ar.</div> : null}
            {narrow ? <div className="tm-hint">Arraste para os lados para ver o mapa inteiro.</div> : null}
            <canvas
              ref={canvasRef}
              style={{ display: 'block', width: LW, height: geo.HH, cursor: 'crosshair' }}
              onMouseMove={(e) => { const n = hit(e); hoverRef.current = n ? keyOfSel(n) : null; e.currentTarget.style.cursor = n ? 'pointer' : 'crosshair'; drawNowRef.current(); }}
              onMouseLeave={() => { hoverRef.current = null; drawNowRef.current(); }}
              onClick={(e) => select(hit(e))}
              role="img"
              aria-label={`Mapa de tráfego: ${model?.devices.length || 0} IPs com tráfego, link a ${fmt(model?.wanDown)} Mbps de download e ${fmt(model?.wanUp)} de upload${topDev ? `; maior consumo ${topDev.ip}` : ''}. A lista completa está na tabela abaixo.`}
            />
          </div>
          <aside className="tm-side">
            <div className="tm-gauge">
              {[['Download', model?.wanDown], ['Upload', model?.wanUp]].map(([label, v]) => (
                <div key={label}>
                  <div className="tm-lbl">{label}</div>
                  <div className="tm-val">{model ? `${fmt(v)} Mbps` : '—'}</div>
                  <div className="tm-pct">{model ? `${pct(v || 0, LINK)}% de ${LINK} Mbps` : ''}</div>
                </div>
              ))}
            </div>
            <div className="tm-rank">
              <h3>Quem mais consome</h3>
              <ol>
                {topIps.map((d) => (
                  <li key={d.ip} className={sel?.key === `dev:${d.ip}` ? 'sel' : ''} onClick={() => select({ t: 'dev', ip: d.ip, key: `dev:${d.ip}` })} title={d.kind}>
                    <span className="tm-name tm-mono">{d.ip === model.topIp ? <span className="tm-dot" style={{ marginRight: 6 }} /> : null}{d.ip}</span>
                    <span className="tm-mb">↓{fmt(d.down)} ↑{fmt(d.up)}</span>
                    <span className="tm-barline"><i style={{ width: `${Math.min(100, (d.total / LINK) * 300).toFixed(1)}%`, background: `var(--vlan-${d.vlan}, var(--vlan-80))` }} /></span>
                  </li>
                ))}
                {!topIps.length ? <li className="tm-pct empty">Sem tráfego agora.</li> : null}
              </ol>
            </div>
            <div className="tm-rank">
              <h3>Sites mais pesados</h3>
              <ol>
                {topSites.map((t) => (
                  <li key={t.key} className={sel?.t === 'site' && sel.key === t.key ? 'sel' : ''} onClick={() => select({ t: 'site', key: t.key })}>
                    <span className="tm-name">{t.name}</span>
                    <span className="tm-mb">{pct(t.val, LINK)}%</span>
                    <span className="tm-barline"><i style={{ width: `${Math.min(100, (t.val / LINK) * 300).toFixed(1)}%`, background: 'var(--vlan-80)' }} /></span>
                  </li>
                ))}
                {!topSites.length ? <li className="tm-pct empty">Nenhum site de internet agora.</li> : null}
              </ol>
            </div>
            <div className="tm-detail">
              {selDev ? (
                <>
                  <h3 className="tm-mono">{selDev.ip}</h3>
                  <span className="tm-muted">{selDev.kind} · VLAN {selDev.vlan} {vName(selDev.vlan)}{selDev.qosVip ? ' · faixa prioritária' : ''}</span>
                  {selDev.ip === model.topIp ? <span className="tm-crit">Maior consumo da rede agora</span> : null}
                  <span className="tm-mono">↓{fmt(selDev.down)} ↑{fmt(selDev.up)} Mbps <span className="tm-muted">(internet ↓{fmt(selDev.inetDown)} ↑{fmt(selDev.inetUp)} · interno ↓{fmt(selDev.intDown)} ↑{fmt(selDev.intUp)})</span></span>
                  <div>{selDev.flows.map((f) => <div key={f.site}>{model.sites.find((x) => x.key === f.site)?.name || f.site} <span className="tm-mono tm-muted">↓{fmt(f.d)} ↑{fmt(f.u)}</span></div>)}</div>
                  <div className="tm-acts">
                    <Link to={`/acoes-rapidas?acao=banda&ip=${selDev.ip}`}>Limitar banda</Link>
                    <Link to="/politicas?tab=regras">Bloquear</Link>
                    <Link to={`/radar-dns?ip=${selDev.ip}`}>Ver no Radar DNS</Link>
                  </div>
                </>
              ) : selSite ? (
                <>
                  <h3>{selSite.name}</h3>
                  {selSite.dom ? <span className="tm-mono tm-muted">{selSite.dom}</span> : null}
                  <span className="tm-mono">↓{fmt(selSite.down)} ↑{fmt(selSite.up)} Mbps{selSite.internal ? <span className="tm-muted"> · interno, não usa o link</span> : null}</span>
                  <div>
                    {model.devices.filter((d) => d.flows.some((f) => f.site === selSite.key)).sort((a, b) => b.total - a.total).map((d) => {
                      const f = d.flows.find((x) => x.site === selSite.key);
                      return <div key={d.ip}><span className="tm-mono">{d.ip}</span> <span className="tm-mono tm-muted">↓{fmt(f.d)} ↑{fmt(f.u)}</span></div>;
                    })}
                  </div>
                  {selSite.dom ? (
                    <div className="tm-acts">
                      <Link to={`/acoes-rapidas?acao=bloquear&dominio=${selSite.dom}`}>Bloquear site</Link>
                      <Link to="/politicas?tab=horarios">Limitar por horário</Link>
                    </div>
                  ) : null}
                </>
              ) : selVlan ? (
                <>
                  <h3>VLAN {selVlan.id} · {selVlan.name}</h3>
                  <span className="tm-muted">Internet: {fmt(selVlan.inet)} de {selVlan.limit ?? '—'} Mbps do limite de QoS ({mode === 'd' ? 'download' : 'upload'}){selVlan.internal > 0.05 ? ` · interno ${fmt(selVlan.internal)} Mbps` : ''}.</span>
                  <span className="tm-muted">{selVlan.count} IP{selVlan.count === 1 ? '' : 's'} com tráfego · {selVlan.neighbors} aparelhos ligados</span>
                  <div className="tm-acts">
                    <Link to="/rede?tab=qos">Ajustar QoS</Link>
                    <Link to="/politicas?tab=horarios">Horários</Link>
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
          {(model?.vlans || []).map((v) => (
            <span key={v.id}><i style={{ background: `var(--vlan-${v.id}, var(--vlan-99))` }} />VLAN {v.id} {v.name}{v.limit ? ` · QoS ${v.limit} Mbps` : ''}</span>
          ))}
          <span><span className="tm-dot" />Maior consumo agora (o NVR 192.168.10.50 não entra)</span>
          <span>Anel da VLAN: uso do limite (verde, âmbar acima de 70%, vermelho acima de 90%)</span>
          <span>Rede interna: tráfego entre VLANs, não passa pelo link</span>
        </div>
      </div>

      <section className="sgcg-card min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-on-surface">Todos os IPs com tráfego ({devicesByTotal.length})</h2>
            <p className="mt-0.5 text-[12.5px] leading-5 text-on-surface/55">Atualiza a cada {POLL_MS / 1000} s. Clique numa linha para destacá-la no mapa.</p>
          </div>
        </div>
        <DataTable
          rowKey="ip"
          rows={devicesByTotal}
          empty="Nenhum IP com tráfego agora."
          onRowClick={(d) => select({ t: 'dev', ip: d.ip, key: `dev:${d.ip}` })}
          columns={[
            {
              key: 'ip', label: 'IP', render: (d) => (
                <div className="min-w-0">
                  <div className="tabular flex items-center gap-1.5 font-medium">{d.ip === model.topIp ? <span className="tm-dot" title="Maior consumo agora" /> : null}{d.ip}</div>
                  <div className="truncate text-[11.5px] text-on-surface/50">{d.kind}</div>
                </div>
              ),
            },
            { key: 'vlan', label: 'VLAN', render: (d) => <VlanChip id={d.vlan} small /> },
            { key: 'down', label: 'Download', align: 'right', mono: true, render: (d) => `${fmt(d.down)} Mbps` },
            { key: 'up', label: 'Upload', align: 'right', mono: true, render: (d) => `${fmt(d.up)} Mbps` },
            { key: 'inet', label: 'Internet ↓/↑', align: 'right', mono: true, render: (d) => <span className="text-on-surface/70">{fmt(d.inetDown)} / {fmt(d.inetUp)}</span> },
            { key: 'int', label: 'Interno ↓/↑', align: 'right', mono: true, render: (d) => <span className="text-on-surface/70">{fmt(d.intDown)} / {fmt(d.intUp)}</span> },
            { key: 'dest', label: 'Principal destino', render: (d) => <span className="text-on-surface/70">{[...d.flows].sort((a, b) => (b.d + b.u) - (a.d + a.u))[0]?.labels?.[0]?.label || '—'}</span> },
          ]}
        />
      </section>
    </div>
  );
}
