import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Gauge, Pause, Play, Radar, Unlock } from 'lucide-react';
import { api } from '../services/api';

const VLAN_TOKENS = ['--chart-1', '--chart-4', '--chart-3', '--chart-2', '--chart-5', '--chart-6'];
const fmt = (v = 0) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 ? 0 : 1, minimumFractionDigits: v >= 100 ? 0 : 1 });
const MAX_DEVICES = 18;
const MAX_TARGETS = 14;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (k) => cs.getPropertyValue(k).trim();
  return {
    text: get('--md-on-surface'),
    surface: get('--md-container'),
    bg: get('--md-surface'),
    outline: get('--md-outline'),
    primary: get('--chart-1'),
    internal: get('--chart-3'),
    danger: get('--md-danger'),
    warning: get('--md-warning'),
    success: get('--md-success'),
    vlan: VLAN_TOKENS.map(get),
  };
}

function rgba(color, alpha) {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Monta as camadas do grafo a partir do que o backend coletou.
function buildGraph(data, mode, dir) {
  if (!data) return null;
  const pick = (f) => (dir === 'down' ? f.down : f.up);
  const vlanMeta = new Map((data.vlans || []).map((v) => [v.id, v]));
  const devices = (data.devices || []).map((d) => {
    const flows = d.flows.filter((f) => (mode === 'internet' ? f.kind === 'internet' : f.kind === 'internal'));
    return { ...d, flows, value: flows.reduce((s, f) => s + pick(f), 0) };
  }).filter((d) => d.value > 0.02).sort((a, b) => b.value - a.value);

  const shown = devices.slice(0, MAX_DEVICES);
  const others = devices.slice(MAX_DEVICES);
  const targetMap = new Map();
  for (const d of devices) {
    for (const f of d.flows) {
      const key = mode === 'internet' ? f.label : (f.remoteVlan ? `vlan:${f.remoteVlan}` : f.label.startsWith('Servidor') ? 'server' : f.label);
      const label = mode === 'internet'
        ? f.label
        : f.remoteVlan && vlanMeta.get(f.remoteVlan) ? `VLAN ${f.remoteVlan} · ${vlanMeta.get(f.remoteVlan).name}` : f.label.startsWith('Servidor') ? 'Servidor SGCG' : f.label;
      const t = targetMap.get(key) || { key, label, value: 0, domains: new Set(), devices: new Set() };
      t.value += pick(f);
      if (f.domain) t.domains.add(f.domain);
      t.devices.add(d.ip);
      targetMap.set(key, t);
    }
  }
  const targets = Array.from(targetMap.values()).filter((t) => t.value > 0.01).sort((a, b) => b.value - a.value).slice(0, MAX_TARGETS);
  const vlanIds = Array.from(new Set(shown.map((d) => d.vlan))).sort((a, b) => a - b);
  const vlans = vlanIds.map((id, index) => {
    const meta = vlanMeta.get(id) || {};
    const value = devices.filter((d) => d.vlan === id).reduce((s, d) => s + d.value, 0);
    return { id, name: meta.name || `VLAN ${id}`, limit: dir === 'down' ? meta.limit_down : meta.limit_up, value, colorIndex: index % VLAN_TOKENS.length };
  });
  const total = devices.reduce((s, d) => s + d.value, 0);
  return { devices: shown, othersCount: others.length, othersValue: others.reduce((s, d) => s + d.value, 0), targets, vlans, total, targetMap };
}

export default function TrafficMap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('internet');
  const [dir, setDir] = useState('down');
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const layoutRef = useRef({ nodes: [] });
  const hoverRef = useRef(null);
  const [width, setWidth] = useState(960);

  useEffect(() => {
    if (paused) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await api.get('/api/monitor/traffic');
        if (alive) { setData(res.data); setError(null); }
      } catch (err) {
        if (alive) setError(err);
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [paused]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setWidth(Math.max(900, el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(() => buildGraph(data, mode, dir), [data, mode, dir]);
  const capacity = data?.link_mbps || 300;
  const rows = Math.max(graph?.devices.length || 0, graph?.targets.length || 0, 8);
  const height = Math.max(420, rows * 34 + 70);

  const draw = useCallback((phase = 0) => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;
    const C = readColors();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const top = 44;
    const bottom = height - 18;
    const isInternet = mode === 'internet';
    const X = isInternet
      ? { dev: width * 0.2, vlan: width * 0.4, link: width * 0.57, target: width * 0.74 }
      : { dev: width * 0.22, vlan: width * 0.45, target: width * 0.7 };
    const nodes = [];
    const place = (list, x, kind) => list.map((item, i) => {
      const y = top + (i + 0.5) * ((bottom - top) / list.length);
      const node = { ...item, kind, x, y, r: 4 + Math.sqrt(Math.max(0, item.value)) * 1.5 };
      nodes.push(node);
      return node;
    });
    const devN = place(graph.devices, X.dev, 'device');
    const vlanN = graph.vlans.map((v) => {
      const mine = devN.filter((d) => d.vlan === v.id);
      const y = mine.reduce((s, d) => s + d.y, 0) / Math.max(1, mine.length);
      const node = { ...v, kind: 'vlan', x: X.vlan, y, r: 9 + Math.sqrt(v.value) * 1.2 };
      nodes.push(node);
      return node;
    });
    const linkN = isInternet ? { kind: 'link', x: X.link, y: (top + bottom) / 2, r: 40, value: graph.total } : null;
    if (linkN) nodes.push(linkN);
    const tgtN = place(graph.targets, X.target, 'target');
    layoutRef.current = { nodes };

    const sel = selected;
    const relatedDevice = (d) => !sel
      || (sel.kind === 'device' && sel.ip === d.ip)
      || (sel.kind === 'vlan' && sel.id === d.vlan)
      || (sel.kind === 'target' && graph.targetMap.get(sel.key)?.devices.has(d.ip));
    const relatedTarget = (t) => !sel
      || (sel.kind === 'target' && sel.key === t.key)
      || (sel.kind === 'device' && t.devices.has(sel.ip))
      || (sel.kind === 'vlan' && graph.devices.some((d) => d.vlan === sel.id && t.devices.has(d.ip)));
    const relatedVlan = (v) => !sel
      || (sel.kind === 'vlan' && sel.id === v.id)
      || (sel.kind === 'device' && sel.vlan === v.id)
      || (sel.kind === 'target' && graph.devices.some((d) => d.vlan === v.id && graph.targetMap.get(sel.key)?.devices.has(d.ip)));

    const curve = (a, b) => [a.x, a.y, (a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y];
    const point = (c, t) => {
      const u = 1 - t;
      return [u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6], u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7]];
    };
    const edge = (a, b, value, color, on, scale) => {
      const c = curve(a, b);
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
      ctx.strokeStyle = rgba(color, on ? 0.38 : 0.06);
      ctx.lineWidth = Math.max(1, Math.min(18, value / scale));
      ctx.stroke();
      if (on && value > 0.2 && !paused) {
        const n = Math.min(5, 1 + Math.floor(value / 10));
        for (let k = 0; k < n; k += 1) {
          let t = (phase * (0.12 + Math.min(value, 60) / 200) + k / n) % 1;
          if (dir === 'down') t = 1 - t;
          const p = point(c, t);
          ctx.beginPath();
          ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2);
          ctx.fillStyle = rgba(color, 0.9);
          ctx.fill();
        }
      }
    };

    // cabeçalhos das colunas
    ctx.font = '600 10.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = rgba(C.text, 0.45);
    ctx.textAlign = 'center';
    ctx.fillText('DISPOSITIVOS', X.dev, 20);
    ctx.fillText('VLANs', X.vlan, 20);
    if (isInternet) ctx.fillText('LINK', X.link, 20);
    ctx.fillText(isInternet ? 'SITES E SERVIÇOS' : 'DESTINO NA REDE INTERNA', X.target, 20);

    const vlanColor = (id) => C.vlan[(graph.vlans.find((v) => v.id === id)?.colorIndex) ?? 0] || C.primary;
    devN.forEach((d) => {
      const v = vlanN.find((n) => n.id === d.vlan);
      if (v) edge(d, v, d.value, vlanColor(d.vlan), relatedDevice(d), 2.2);
    });
    if (isInternet) {
      vlanN.forEach((v) => edge(v, linkN, v.value, vlanColor(v.id), relatedVlan(v), 5));
      tgtN.forEach((t) => edge(linkN, t, t.value, C.primary, relatedTarget(t), 4));
    } else {
      vlanN.forEach((v) => {
        tgtN.forEach((t) => {
          const value = graph.devices.filter((d) => d.vlan === v.id).reduce((s, d) => s + d.flows.filter((f) => t.devices.has(d.ip) && (t.key === `vlan:${f.remoteVlan}` || (t.key === 'server' && f.label.startsWith('Servidor')))).reduce((a, f) => a + (dir === 'down' ? f.down : f.up), 0), 0);
          if (value > 0.01) edge(v, t, value, C.internal, relatedVlan(v) && relatedTarget(t), 3);
        });
      });
    }

    // conexões diretas do dispositivo selecionado com seus destinos
    if (sel?.kind === 'device') {
      const dev = devN.find((d) => d.ip === sel.ip);
      if (dev) {
        tgtN.filter((t) => t.devices.has(dev.ip)).forEach((t) => {
          ctx.beginPath();
          ctx.moveTo(dev.x, dev.y);
          ctx.bezierCurveTo(dev.x + 260, dev.y - 50, t.x - 240, t.y + 50, t.x, t.y);
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = vlanColor(dev.vlan);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }
    }

    const circle = (n, color, on) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = on ? color : rgba(color, 0.2);
      ctx.fill();
      if (hoverRef.current === n.kind + (n.ip || n.id || n.key)) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = C.text;
        ctx.stroke();
      }
    };

    devN.forEach((d) => {
      const on = relatedDevice(d);
      circle(d, vlanColor(d.vlan), on);
      ctx.textAlign = 'right';
      ctx.font = '600 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = on ? C.text : rgba(C.text, 0.35);
      const name = d.hostname ? d.hostname.split(' · ')[0] : d.ip;
      ctx.fillText(name.length > 26 ? `${name.slice(0, 25)}…` : name, d.x - d.r - 8, d.y - 1);
      ctx.font = '10.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = on ? rgba(C.text, 0.55) : rgba(C.text, 0.25);
      ctx.fillText(`${d.hostname ? `${d.ip} · ` : ''}${fmt(d.value)} Mbps${d.qosVip ? ' · banda total' : ''}`, d.x - d.r - 8, d.y + 12);
    });

    vlanN.forEach((v) => {
      const on = relatedVlan(v);
      circle(v, vlanColor(v.id), on);
      if (v.limit) {
        const use = v.value / v.limit;
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, use));
        ctx.strokeStyle = use > 0.9 ? C.danger : use > 0.7 ? C.warning : C.success;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.font = '600 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = on ? C.text : rgba(C.text, 0.35);
      ctx.fillText(`${v.id} · ${v.name}`, v.x, v.y + v.r + 17);
      ctx.font = '10.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = on ? rgba(C.text, 0.55) : rgba(C.text, 0.25);
      ctx.fillText(`${fmt(v.value)}${v.limit ? ` / ${v.limit}` : ''} Mbps`, v.x, v.y + v.r + 30);
    });

    if (linkN) {
      const use = (dir === 'down' ? data.wan.down : data.wan.up) / capacity;
      ctx.beginPath();
      ctx.arc(linkN.x, linkN.y, linkN.r, 0, Math.PI * 2);
      ctx.fillStyle = C.surface;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.outline;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(linkN.x, linkN.y, linkN.r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, use));
      ctx.strokeStyle = use > 0.85 ? C.danger : use > 0.65 ? C.warning : C.primary;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text;
      ctx.font = '700 17px Inter, system-ui, sans-serif';
      ctx.fillText(`${Math.round(use * 100)}%`, linkN.x, linkN.y + 2);
      ctx.font = '10.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = rgba(C.text, 0.55);
      ctx.fillText(`de ${capacity} Mbps`, linkN.x, linkN.y + 16);
      ctx.font = '600 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = C.text;
      ctx.fillText('Link WAN', linkN.x, linkN.y + linkN.r + 18);
    }

    tgtN.forEach((t) => {
      const on = relatedTarget(t);
      circle(t, isInternet ? C.primary : C.internal, on);
      ctx.textAlign = 'left';
      ctx.font = '600 11.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = on ? C.text : rgba(C.text, 0.35);
      ctx.fillText(t.label.length > 30 ? `${t.label.slice(0, 29)}…` : t.label, t.x + t.r + 8, t.y - 1);
      ctx.font = '10.5px Inter, system-ui, sans-serif';
      ctx.fillStyle = on ? rgba(C.text, 0.55) : rgba(C.text, 0.25);
      ctx.fillText(`${fmt(t.value)} Mbps${isInternet ? ` · ${Math.round((t.value / capacity) * 100)}% do link` : ''} · ${t.devices.size} disp.`, t.x + t.r + 8, t.y + 12);
    });
  }, [graph, width, height, selected, mode, dir, paused, data, capacity]);

  useEffect(() => {
    let frame;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const loop = (ts) => {
      draw(reduce ? 0 : ts / 1000);
      if (!reduce) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  const hit = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * width) / rect.width;
    const y = ((event.clientY - rect.top) * height) / rect.height;
    return layoutRef.current.nodes.find((n) => n.kind !== 'link' && (x - n.x) ** 2 + (y - n.y) ** 2 <= (n.r + 7) ** 2) || null;
  };

  const selectNode = (node) => {
    if (!node) { setSelected(null); return; }
    const same = selected && selected.kind === node.kind && (selected.ip || selected.id || selected.key) === (node.ip || node.id || node.key);
    setSelected(same ? null : { kind: node.kind, ip: node.ip, id: node.id, key: node.key, vlan: node.vlan });
  };

  const selectedDevice = selected?.kind === 'device' ? (data?.devices || []).find((d) => d.ip === selected.ip) : null;
  const selectedTarget = selected?.kind === 'target' ? graph?.targetMap.get(selected.key) : null;
  const selectedVlan = selected?.kind === 'vlan' ? (data?.vlans || []).find((v) => v.id === selected.id) : null;

  const internalTotal = (data?.vlans || []).reduce((s, v) => s + (dir === 'down' ? v.internal_down : v.internal_up), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Mapa de Tráfego</h1>
          <p className="text-sm text-on-surface/55">Quem está usando a banda agora e para onde. Atualiza a cada 5 segundos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-outline p-0.5" role="group" aria-label="Tipo de tráfego">
            {[['internet', 'Internet'], ['internal', 'Rede interna']].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setSelected(null); }} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${mode === key ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface'}`}>{label}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-outline p-0.5" role="group" aria-label="Sentido">
            {[['down', 'Download'], ['up', 'Upload']].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={dir === key} onClick={() => setDir(key)} className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${dir === key ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface'}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setPaused((p) => !p)} className="inline-flex items-center gap-1.5 rounded-lg border border-outline px-3 py-1.5 text-[12.5px] font-semibold text-on-surface/75 hover:text-on-surface">
            {paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Retomar' : 'Pausar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Internet ↓', data ? `${fmt(data.wan.down)} Mbps` : '—', data ? `${Math.round((data.wan.down / capacity) * 100)}% do link` : ''],
          ['Internet ↑', data ? `${fmt(data.wan.up)} Mbps` : '—', data ? `${Math.round((data.wan.up / capacity) * 100)}% do link` : ''],
          ['Dispositivos ativos', data ? data.devices.length : '—', 'com tráfego agora'],
          [`Tráfego interno ${dir === 'down' ? '↓' : '↑'}`, data ? `${fmt(internalTotal)} Mbps` : '—', 'entre VLANs, fora do link'],
        ].map(([label, value, sub]) => (
          <div key={label} className="sgcg-card p-3">
            <div className="text-[11.5px] font-medium text-on-surface/55">{label}</div>
            <div className="tabular text-xl font-bold text-on-surface">{value}</div>
            <div className="text-[11.5px] text-on-surface/45">{sub}</div>
          </div>
        ))}
      </div>

      {error && !data ? <div className="sgcg-card p-4 text-sm text-danger">Não foi possível ler o tráfego. Verifique se o backend está no ar.</div> : null}

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={wrapRef} className="sgcg-card min-w-0 overflow-x-auto">
          {graph && graph.devices.length ? (
            <canvas
              ref={canvasRef}
              style={{ width, height, display: 'block', cursor: 'pointer' }}
              onMouseMove={(e) => { const n = hit(e); hoverRef.current = n ? n.kind + (n.ip || n.id || n.key) : null; }}
              onMouseLeave={() => { hoverRef.current = null; }}
              onClick={(e) => selectNode(hit(e))}
              aria-label="Grafo de tráfego por dispositivo, VLAN e destino"
            />
          ) : (
            <div className="p-8 text-center text-sm text-on-surface/55">{data ? (mode === 'internal' ? 'Nenhum tráfego entre VLANs agora.' : 'Nenhum tráfego de internet medido agora.') : 'Coletando tráfego...'}</div>
          )}
          {graph?.othersCount ? <div className="border-t border-outline px-4 py-2 text-[12px] text-on-surface/55">Mais {graph.othersCount} dispositivos com {fmt(graph.othersValue)} Mbps somados não aparecem no mapa.</div> : null}
        </div>

        <aside className="sgcg-card space-y-3 p-4">
          {selectedDevice ? (
            <>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">Dispositivo · VLAN {selectedDevice.vlan}</div>
                <div className="text-base font-bold text-on-surface">{selectedDevice.hostname ? selectedDevice.hostname.split(' · ')[0] : selectedDevice.ip}</div>
                <div className="tabular text-[12.5px] text-on-surface/60">{selectedDevice.ip}{selectedDevice.hostname?.includes(' · ') ? ` · ${selectedDevice.hostname.split(' · ')[1]}` : ''}</div>
                <div className="tabular mt-1 text-[12.5px] text-on-surface/70">↓ {fmt(selectedDevice.down)} Mbps · ↑ {fmt(selectedDevice.up)} Mbps{selectedDevice.qosVip ? ' · com banda total' : ''}</div>
              </div>
              <ul className="divide-y divide-outline text-[12.5px]">
                {selectedDevice.flows.slice(0, 10).map((f) => (
                  <li key={f.remote} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate" title={`${f.label} (${f.remote})`}>{f.label}{f.kind === 'internal' ? <span className="ml-1 text-on-surface/45">interno</span> : null}</span>
                    <span className="tabular shrink-0 text-on-surface/60">↓{fmt(f.down)} ↑{fmt(f.up)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <Link to={`/acoes-rapidas?acao=banda&ip=${selectedDevice.ip}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline px-2 py-2 text-[12.5px] font-semibold hover:border-primary/40 hover:text-primary"><Gauge size={14} />Banda total</Link>
                <Link to={`/acoes-rapidas?acao=temporaria&ip=${selectedDevice.ip}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline px-2 py-2 text-[12.5px] font-semibold hover:border-primary/40 hover:text-primary"><Unlock size={14} />Liberar sites</Link>
                <Link to={`/radar-dns?ip=${selectedDevice.ip}`} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline px-2 py-2 text-[12.5px] font-semibold hover:border-primary/40 hover:text-primary"><Radar size={14} />Ver consultas no Radar DNS</Link>
              </div>
            </>
          ) : selectedTarget ? (
            <>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">{mode === 'internet' ? 'Site ou serviço' : 'Destino interno'}</div>
                <div className="text-base font-bold text-on-surface">{selectedTarget.label}</div>
                {selectedTarget.domains.size ? <div className="text-[12.5px] text-on-surface/60">{Array.from(selectedTarget.domains).slice(0, 4).join(', ')}</div> : null}
                <div className="tabular mt-1 text-[12.5px] text-on-surface/70">{fmt(selectedTarget.value)} Mbps de {selectedTarget.devices.size} dispositivo(s)</div>
              </div>
              <ul className="divide-y divide-outline text-[12.5px]">
                {Array.from(selectedTarget.devices).slice(0, 12).map((ip) => {
                  const d = (data?.devices || []).find((x) => x.ip === ip);
                  return <li key={ip} className="flex justify-between gap-2 py-1.5"><span className="truncate">{d?.hostname ? d.hostname.split(' · ')[0] : ip}</span><span className="tabular text-on-surface/55">{ip}</span></li>;
                })}
              </ul>
              {mode === 'internet' && selectedTarget.domains.size ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link to={`/acoes-rapidas?acao=bloquear&dominio=${Array.from(selectedTarget.domains)[0]}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline px-2 py-2 text-[12.5px] font-semibold hover:border-danger/40 hover:text-danger"><Ban size={14} />Bloquear</Link>
                  <Link to={`/acoes-rapidas?acao=liberar&dominio=${Array.from(selectedTarget.domains)[0]}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-outline px-2 py-2 text-[12.5px] font-semibold hover:border-primary/40 hover:text-primary"><Unlock size={14} />Liberar</Link>
                </div>
              ) : null}
            </>
          ) : selectedVlan ? (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-on-surface/45">VLAN</div>
              <div className="text-base font-bold text-on-surface">{selectedVlan.id} · {selectedVlan.name}</div>
              <dl className="tabular grid grid-cols-2 gap-2 text-[12.5px]">
                <div><dt className="text-on-surface/50">Download</dt><dd className="font-semibold">{fmt(selectedVlan.down)} / {selectedVlan.limit_down ?? '—'} Mbps</dd></div>
                <div><dt className="text-on-surface/50">Upload</dt><dd className="font-semibold">{fmt(selectedVlan.up)} / {selectedVlan.limit_up ?? '—'} Mbps</dd></div>
                <div><dt className="text-on-surface/50">Interno ↓</dt><dd className="font-semibold">{fmt(selectedVlan.internal_down)} Mbps</dd></div>
                <div><dt className="text-on-surface/50">Dispositivos</dt><dd className="font-semibold">{selectedVlan.neighbors}</dd></div>
              </dl>
              {selectedVlan.internal_down > 5 && selectedVlan.limit_down ? (
                <p className="rounded-lg bg-warning/8 p-2.5 text-[12.5px] text-warning">{fmt(selectedVlan.internal_down)} Mbps de tráfego interno contam no limite de {selectedVlan.limit_down} Mbps desta VLAN.</p>
              ) : null}
              <Link to="/rede?tab=qos" className="inline-flex text-[12.5px] font-semibold text-primary">Ajustar limites (QoS)</Link>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-on-surface">Como ler</div>
              <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-5 text-on-surface/65">
                <li>A espessura da linha é a banda em uso.</li>
                <li>O anel da VLAN mostra quanto do limite de QoS está sendo usado.</li>
                <li>Clique num dispositivo para ver os sites dele e dar banda total ou liberar sites.</li>
                <li>Clique num site para ver quem está usando e bloquear ou liberar.</li>
                <li>Em <b>Rede interna</b> aparece o tráfego entre VLANs, como as câmeras.</li>
              </ul>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
