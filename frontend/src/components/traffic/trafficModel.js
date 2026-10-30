import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';

/*
 * Núcleo do Mapa de Tráfego em camadas (usado pela página normal e pelo Modo TV):
 * leitura dos dados ao vivo, modelo (dispositivos → VLANs → link → sites), posições e cores do tema.
 */

// Proporções do protótipo: área lógica de 860 px com as colunas nestas posições.
export const BASE_W = 860;
export const BASE_H = 560;
export const COLS = { dev: 170, vlan: 350, wan: 500, site: 660 };
// Com poucas linhas por IP (TV), as colunas se afastam um pouco para caber o rótulo numa linha só.
const COMPACT_COLS = { dev: 0.25, vlan: 0.43, wan: 0.58, site: 0.74 };
export const MIN_W = 760; // abaixo disso o mapa rola na horizontal (celular)
export const ROW = 30;
export const MAX_SITES = 12; // os demais destinos viram "Outros"
export const POLL_MS = 2500;
// O NVR recebe as câmeras o tempo todo; ele nunca é marcado como "maior consumo".
export const TOP_IGNORE = new Set(['192.168.10.50']);
// Abaixo disso a rede está parada: ninguém pisca.
export const TOP_MIN_MBPS = 0.5;

export const F_DISPLAY = '"Archivo", "Arial Narrow", system-ui, sans-serif';
export const F_BODY = '"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
export const F_MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

export const fmt = (v) => {
  const n = Number(v || 0);
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace('.', ',');
};
export const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);
const kindOf = (d) => (d.hostname ? String(d.hostname).split(' · ')[0] : 'Dispositivo');

// Cores do tema: aceita #hex e rgb()/rgba() (os tokens de contorno do sistema são rgba).
export const parseColor = (value, fallback) => {
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
export const rgba = (c, a = 1) => `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, (c.a ?? 1) * a))})`;

const VLAN_IDS = [10, 30, 40, 50, 70, 80, 99];
export function readTheme() {
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

export function useFonts() {
  useEffect(() => {
    if (document.getElementById('tm-fonts')) return;
    const link = document.createElement('link');
    link.id = 'tm-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,500..800&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';
    document.head.appendChild(link);
  }, []);
}

// Dados ao vivo: primeira leitura imediata e depois a cada `pollMs`. Guarda a hora da última leitura boa.
export function useTrafficData(paused = false, pollMs = POLL_MS) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [lastOkAt, setLastOkAt] = useState(0);
  const failing = useRef(false);
  useEffect(() => {
    if (paused) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get('/api/monitor/traffic', { timeout: Math.max(5000, pollMs * 2) });
        if (!alive) return;
        setData(res.data);
        setError(false);
        failing.current = false;
        setLastOkAt(Date.now());
      } catch {
        if (alive) { setError(true); failing.current = true; }
      }
    };
    load();
    const timer = window.setInterval(load, pollMs);
    return () => { alive = false; window.clearInterval(timer); };
  }, [paused, pollMs]);
  return { data, error, lastOkAt };
}

/*
 * Modelo do mapa a partir de /api/monitor/traffic.
 * device.down/up já incluem o tráfego interno; a parte de internet é o total menos o interno.
 * Todo IP com algum tráfego (em qualquer sentido) entra; o sentido escolhido só muda espessuras e partículas.
 */
export function buildModel(data, mode) {
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

export const slotsOf = (m) => (m ? m.vlans.reduce((acc, v) => acc + Math.max(2, v.count), 0) : 0);

/*
 * Para a TV: se houver mais IPs do que cabem legíveis, os de menor consumo de cada VLAN viram uma linha só
 * ("+N IPs menores", com a soma de download e upload). O tráfego continua todo representado nas ligações e
 * nos números; a lista completa fica na página normal. Os rankings usam o modelo completo.
 */
export function limitDevices(m, max) {
  if (!m || m.devices.length <= max) return m;
  const vlansWithDevices = new Set(m.devices.map((d) => d.vlan)).size;
  const keepN = Math.max(8, max - vlansWithDevices);
  const sorted = [...m.devices].sort((a, b) => b.total - a.total);
  const keep = sorted.slice(0, keepN);
  const hiddenByVlan = new Map();
  sorted.slice(keepN).forEach((d) => {
    if (!hiddenByVlan.has(d.vlan)) hiddenByVlan.set(d.vlan, []);
    hiddenByVlan.get(d.vlan).push(d);
  });
  const aggregates = [];
  hiddenByVlan.forEach((list, vlan) => {
    const sum = (key) => list.reduce((s, d) => s + d[key], 0);
    const merged = new Map();
    list.forEach((d) => d.flows.forEach((f) => {
      const cur = merged.get(f.site) || { site: f.site, d: 0, u: 0, v: 0, labels: [] };
      cur.d += f.d;
      cur.u += f.u;
      cur.v += f.v;
      merged.set(f.site, cur);
    }));
    aggregates.push({
      ip: `+${list.length} IP${list.length === 1 ? '' : 's'} menor${list.length === 1 ? '' : 'es'}`,
      vlan,
      kind: 'agrupado',
      hostname: '',
      qosVip: false,
      agg: true,
      // quem foi agrupado (para o detalhe ao clicar na linha "+N IPs menores")
      members: list.map((d) => ({ ip: d.ip, down: d.down, up: d.up, total: d.total })).sort((a, b) => b.total - a.total),
      down: sum('down'),
      up: sum('up'),
      intDown: sum('intDown'),
      intUp: sum('intUp'),
      inetDown: sum('inetDown'),
      inetUp: sum('inetUp'),
      total: sum('total'),
      inet: sum('inet'),
      val: sum('val'),
      rawFlows: [],
      flows: Array.from(merged.values()),
    });
  });
  const devices = [...keep, ...aggregates];
  const vlans = m.vlans.map((v) => ({ ...v, count: devices.filter((d) => d.vlan === v.id).length }));
  return { ...m, devices, vlans };
}

/*
 * Posições: uma faixa por VLAN (mínimo 2 linhas), aparelhos dentro dela e a VLAN no centro.
 * opts.fixedH: altura lógica fixa (Modo TV). Com poucas linhas por IP o rótulo vira uma linha só (compact).
 */
export function layoutModel(m, LW, opts = {}) {
  const slots = slotsOf(m);
  const HH = opts.fixedH ? Math.round(opts.fixedH) : Math.max(BASE_H, Math.round(slots * ROW + 60));
  const top = 36;
  const bottom = HH - 24;
  const step = slots ? (bottom - top) / slots : ROW;
  const compact = Boolean(opts.fixedH) && step < 26;
  const sx = LW / BASE_W;
  const xs = compact
    ? { dev: LW * COMPACT_COLS.dev, vlan: LW * COMPACT_COLS.vlan, wan: LW * COMPACT_COLS.wan, site: LW * COMPACT_COLS.site }
    : { dev: COLS.dev * sx, vlan: COLS.vlan * sx, wan: COLS.wan * sx, site: COLS.site * sx };
  if (!m) return { HH, xs, wan: null, step, compact };
  let cursor = 0;
  m.vlans.forEach((v) => {
    const mine = m.devices.filter((d) => d.vlan === v.id).sort((a, b) => b.total - a.total);
    const band = Math.max(2, mine.length);
    const offset = (band - mine.length) / 2;
    mine.forEach((d, k) => {
      d.x = xs.dev;
      d.y = top + (cursor + offset + k + 0.5) * step;
      // o círculo nunca passa da altura da linha, para não encostar no vizinho
      d.r = Math.max(2.5, Math.min(3 + Math.sqrt(d.val) * 1.6, step * 0.46));
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
  return { HH, xs, wan, step, compact };
}
