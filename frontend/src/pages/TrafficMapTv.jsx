import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Maximize2, Minimize2, X } from 'lucide-react';
import TrafficCanvas from '../components/traffic/TrafficCanvas';
import { TM_CSS } from '../components/traffic/trafficStyles';
import { F_BODY, F_DISPLAY, F_MONO, MIN_W, buildModel, fmt, layoutModel, limitDevices, pct, slotsOf, useFonts, useTrafficData } from '../components/traffic/trafficModel';

/*
 * Modo TV do Mapa de Tráfego: só o "quadrado" do mapa em camadas, ocupando a tela inteira, para uma TV de 65" ou 75".
 *  - sem menu nem barra do sistema; a ampliação do desenho se ajusta ao tamanho da tela e à quantidade de IPs;
 *  - alterna sozinho entre download e upload (a lateral mostra os dois o tempo todo);
 *  - esconde o cursor e os botões quando ninguém mexe; tela cheia (botão ou tecla F) e tela sempre acesa;
 *  - a sessão se renova sozinha; todo dia às 04:00 a página recarrega para pegar atualizações do sistema.
 * Endereço: /mapa-trafego/tv   (opcional: ?modo=download|upload|auto  &tema=claro|escuro)
 */

const POLL_TV_MS = 2000;
const ROTATE_MS = 20000;
const SELECT_TIMEOUT_MS = 45000; // sem mexer por este tempo, o detalhe fecha e a TV volta ao painel normal
const selKey = (x) => (x ? (x.t === 'site' ? `site:${x.key}` : x.key) : null);
const MIN_STEP = 16; // altura mínima, em px lógicos, de cada linha de IP
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const TV_CSS = `
.tv { position:fixed; inset:0; display:flex; flex-direction:column; background:var(--md-container); color:var(--md-on-surface); font-family:${F_BODY}; overflow:hidden; line-height:1.35; }
.tv.idle { cursor:none; }
.tv-bar { display:flex; align-items:center; gap:.7em 1em; padding:.55em 1em; border-bottom:1px solid var(--md-outline); flex-wrap:nowrap; min-width:0; }
.tv-title { font-family:${F_DISPLAY}; font-stretch:85%; font-weight:750; font-size:1.3em; white-space:nowrap; }
.tv-tag { font-family:${F_MONO}; font-size:.62em; padding:.25em .7em; border-radius:999px; border:1px solid var(--md-outline); color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); white-space:nowrap; }
.tv-tag.live { border-color:var(--md-success); color:var(--md-success); }
.tv-tag.warn { border-color:var(--md-warning); color:var(--md-warning); }
.tv-tag.down, .tv-tag.top { border-color:var(--md-danger); color:var(--md-danger); }
.tv-spacer { flex:1; }
.tv-seg { display:inline-flex; border:1px solid var(--md-outline); border-radius:.5em; overflow:hidden; }
.tv-seg button { font:inherit; font-size:.7em; font-weight:700; background:transparent; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); border:0; padding:.4em .9em; cursor:pointer; }
.tv-seg button[aria-pressed="true"] { background:var(--vlan-80); color:var(--md-container); }
.tv-clock { text-align:right; line-height:1.1; }
.tv-clock b { display:block; font-family:${F_MONO}; font-size:1.5em; font-weight:600; font-variant-numeric:tabular-nums; }
.tv-clock span { font-size:.62em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tv-body { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1fr) clamp(300px, 24vw, 640px); }
.tv-stage { position:relative; min-width:0; min-height:0; background:var(--map-bg); border-right:1px solid var(--md-outline); overflow:hidden; }
.tv-stage canvas { position:absolute; left:0; top:0; }
.tv-side { padding:.9em 1em; display:flex; flex-direction:column; gap:.9em; min-width:0; min-height:0; overflow:hidden; }
.tv-gauge { display:grid; grid-template-columns:1fr 1fr; gap:.6em; }
.tv-gauge > div { background:var(--md-surface); border-radius:.5em; padding:.55em .8em; }
.tv-lbl { font-size:.62em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.06em; }
.tv-val { font-family:${F_DISPLAY}; font-stretch:80%; font-size:2.1em; font-weight:800; font-variant-numeric:tabular-nums; line-height:1.05; white-space:nowrap; }
.tv-val small { font-size:.4em; font-weight:700; margin-left:.25em; }
.tv-pct { font-size:.62em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tv-rank h3 { font-size:.62em; font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.07em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); font-weight:600; margin:0 0 .45em; }
.tv-rank ol { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.3em; }
.tv-rank li { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.1em .6em; font-size:.8em; align-items:baseline; }
.tv-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tv-mono { font-family:${F_MONO}; }
.tv-mb { font-family:${F_MONO}; font-size:.85em; font-variant-numeric:tabular-nums; }
.tv-barline { grid-column:1/-1; height:.28em; border-radius:2px; background:var(--md-surface); overflow:hidden; }
.tv-barline i { display:block; height:100%; border-radius:2px; }
.tv-empty { font-size:.7em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tv.idle canvas { cursor:none !important; }
.tv-rank li.pick { cursor:pointer; border-radius:.35em; padding:.1em .3em; margin:0 -.3em; }
.tv-rank li.pick:hover, .tv-rank li.sel { background:color-mix(in srgb, var(--vlan-80) 14%, transparent); }
.tv-hint { font-size:.62em; color:color-mix(in srgb, var(--md-on-surface) 55%, transparent); margin-top:auto; }
.tv-detail { flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column; gap:.35em; border-top:1px solid var(--md-outline); padding-top:.7em; position:relative; }
.tv-detail h2 { margin:0; padding-right:2.2em; font-family:${F_DISPLAY}; font-stretch:90%; font-size:1.35em; font-weight:750; line-height:1.1; overflow-wrap:anywhere; }
.tv-detail h3 { margin:.5em 0 .1em; font-size:.62em; font-family:${F_MONO}; text-transform:uppercase; letter-spacing:.07em; font-weight:600; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tv-detail .tv-muted { font-size:.75em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tv-detail .tv-sum { font-family:${F_MONO}; font-size:.95em; font-variant-numeric:tabular-nums; }
.tv-crit { color:var(--md-danger); font-weight:700; font-size:.75em; }
.tv-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.8em; font-size:.78em; align-items:baseline; }
.tv-close { position:absolute; right:0; top:.5em; width:1.9em; height:1.9em; display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--md-outline); border-radius:.45em; background:var(--md-container); color:var(--md-on-surface); cursor:pointer; }
.tv-more { font-size:.65em; color:color-mix(in srgb, var(--md-on-surface) 55%, transparent); }
.tv-legend { display:flex; flex-wrap:wrap; gap:.25em 1.1em; padding:.5em 1em; border-top:1px solid var(--md-outline); font-size:.62em; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); }
.tv-legend span { display:inline-flex; align-items:center; gap:.45em; }
.tv-legend i { width:.8em; height:.8em; border-radius:50%; display:inline-block; }
.tv-dot { display:inline-block; width:.6em; height:.6em; border-radius:50%; background:var(--md-danger); animation:tm-blink 1s ease-in-out infinite; margin-right:.4em; }
.tv-ctl { position:absolute; right:1em; bottom:3.2em; z-index:5; display:flex; gap:.5em; opacity:0; pointer-events:none; transition:opacity .3s; }
.tv:not(.idle) .tv-ctl { opacity:1; pointer-events:auto; }
.tv-ctl button { font:inherit; font-size:.7em; font-weight:700; display:inline-flex; align-items:center; gap:.4em; background:var(--md-container); color:var(--md-on-surface); border:1px solid var(--md-outline); border-radius:.5em; padding:.5em .9em; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.25); }
@media (prefers-reduced-motion: reduce) { .tv-dot { animation:none; } }
`;

/*
 * Detalhe ao clicar num nó: o que o IP, a VLAN ou o site está trafegando agora (mesmos dados da página normal).
 * `n` é quantas linhas cabem na altura da TV; o excedente vira "e mais N".
 */
function TvDetail({ sel, model, view, n, onClose }) {
  const vName = (id) => model.vlans.find((v) => v.id === id)?.name || '';
  const siteName = (key) => (key === '__outros__' ? 'Outros destinos' : model.sites.find((t) => t.key === key)?.name || key);
  const rows = (list, render) => (
    <>
      {list.slice(0, n).map(render)}
      {list.length > n ? <div className="tv-more">e mais {list.length - n}</div> : null}
    </>
  );

  let body = null;
  if (sel.t === 'dev') {
    const d = model.devices.find((x) => x.ip === sel.ip) || view.devices.find((x) => x.ip === sel.ip);
    if (!d) return null;
    const dests = [...d.flows].sort((a, b) => (b.d + b.u) - (a.d + a.u));
    body = (
      <>
        <h2 className="tv-mono">{d.ip}</h2>
        <div className="tv-muted">
          {d.agg ? `${d.members.length} IPs agrupados` : d.kind} · VLAN {d.vlan} {vName(d.vlan)}{d.qosVip ? ' · faixa prioritária' : ''}
        </div>
        {d.ip === model.topIp ? <div className="tv-crit">Maior consumo da rede agora</div> : null}
        <div className="tv-sum">↓{fmt(d.down)} ↑{fmt(d.up)} Mbps</div>
        <div className="tv-muted">internet ↓{fmt(d.inetDown)} ↑{fmt(d.inetUp)} · interno ↓{fmt(d.intDown)} ↑{fmt(d.intUp)}</div>
        {d.agg ? (
          <>
            <h3>IPs agrupados</h3>
            {rows(d.members, (m) => (
              <div className="tv-row" key={m.ip}><span className="tv-name tv-mono">{m.ip}</span><span className="tv-mb">↓{fmt(m.down)} ↑{fmt(m.up)}</span></div>
            ))}
          </>
        ) : null}
        <h3>Está trafegando com</h3>
        {dests.length ? rows(dests, (f) => (
          <div className="tv-row" key={f.site}><span className="tv-name">{siteName(f.site)}</span><span className="tv-mb">↓{fmt(f.d)} ↑{fmt(f.u)}</span></div>
        )) : <div className="tv-muted">Sem destinos agora.</div>}
      </>
    );
  } else if (sel.t === 'site') {
    const s = model.sites.find((t) => t.key === sel.key);
    if (!s) return null;
    const who = model.devices.filter((d) => d.flows.some((f) => f.site === s.key)).sort((a, b) => b.total - a.total);
    body = (
      <>
        <h2>{s.name}</h2>
        {s.dom ? <div className="tv-muted tv-mono">{s.dom}</div> : null}
        <div className="tv-sum">↓{fmt(s.down)} ↑{fmt(s.up)} Mbps</div>
        {s.internal ? <div className="tv-muted">Interno: não passa pelo link de internet</div> : null}
        <h3>Quem está puxando</h3>
        {rows(who, (d) => {
          const f = d.flows.find((x) => x.site === s.key);
          return <div className="tv-row" key={d.ip}><span className="tv-name tv-mono">{d.ip}</span><span className="tv-mb">↓{fmt(f?.d)} ↑{fmt(f?.u)}</span></div>;
        })}
      </>
    );
  } else if (sel.t === 'vlan') {
    const v = model.vlans.find((x) => x.id === sel.id);
    if (!v) return null;
    const ips = model.devices.filter((d) => d.vlan === v.id).sort((a, b) => b.total - a.total);
    body = (
      <>
        <h2>VLAN {v.id} · {v.name}</h2>
        <div className="tv-sum">↓{fmt(v.down)} ↑{fmt(v.up)} Mbps</div>
        <div className="tv-muted">Internet: {fmt(v.inet)}{v.limit ? ` de ${v.limit} Mbps do limite de QoS` : ''}{v.internal > 0.05 ? ` · interno ${fmt(v.internal)} Mbps` : ''}</div>
        <div className="tv-muted">{v.count} IP{v.count === 1 ? '' : 's'} com tráfego · {v.neighbors} aparelhos ligados</div>
        <h3>IPs com tráfego</h3>
        {ips.length ? rows(ips, (d) => (
          <div className="tv-row" key={d.ip}><span className="tv-name tv-mono">{d.ip === model.topIp ? <span className="tv-dot" /> : null}{d.ip}</span><span className="tv-mb">↓{fmt(d.down)} ↑{fmt(d.up)}</span></div>
        )) : <div className="tv-muted">Sem tráfego agora.</div>}
      </>
    );
  }
  return (
    <div className="tv-detail" role="region" aria-label="Detalhe do item selecionado">
      <button type="button" className="tv-close" onClick={onClose} aria-label="Fechar o detalhe" title="Fechar (Esc)"><X size="1.1em" /></button>
      {body}
    </div>
  );
}

function useStageSize(ref) {
  const [size, setSize] = useState({ w: 1280, h: 720 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setSize({ w: Math.max(320, Math.floor(el.clientWidth)), h: Math.max(240, Math.floor(el.clientHeight)) });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Mantém a tela acesa (Wake Lock), quando o navegador da TV permite.
function useKeepAwake() {
  useEffect(() => {
    let lock = null;
    let alive = true;
    const request = async () => {
      try {
        if (!alive || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
        lock = await navigator.wakeLock.request('screen');
      } catch { /* sem permissão: segue sem */ }
    };
    request();
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('click', request, { once: true });
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => undefined); };
  }, []);
}

// Todo dia às 04:00 recarrega a página para pegar atualizações do sistema (só se o servidor responder).
function useDailyReload() {
  useEffect(() => {
    const dayKey = () => new Date().toISOString().slice(0, 10);
    const startedDay = dayKey();
    const timer = window.setInterval(() => {
      const now = new Date();
      if (now.getHours() !== 4 || now.getMinutes() > 5 || dayKey() === startedDay) return;
      fetch('/', { cache: 'no-store' }).then((r) => { if (r.ok) window.location.reload(); }).catch(() => undefined);
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);
}

export default function TrafficMapTv() {
  useFonts();
  useKeepAwake();
  useDailyReload();
  const [params] = useSearchParams();
  const startMode = params.get('modo');
  const [auto, setAuto] = useState(startMode !== 'download' && startMode !== 'upload');
  const [mode, setMode] = useState(startMode === 'upload' ? 'u' : 'd');
  const [idle, setIdle] = useState(false);
  const [sel, setSel] = useState(null);
  const lastActivity = useRef(Date.now());
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [now, setNow] = useState(Date.now());
  const stageRef = useRef(null);
  const size = useStageSize(stageRef);
  const { data, error, lastOkAt } = useTrafficData(false, POLL_TV_MS);

  useEffect(() => { document.title = 'Mapa de Tráfego · TV'; }, []);

  // ?tema=claro|escuro vale só para esta tela (não grava a preferência do usuário).
  useEffect(() => {
    const want = params.get('tema');
    if (want !== 'claro' && want !== 'escuro') return undefined;
    const value = want === 'claro' ? 'light' : 'dark';
    const apply = () => document.documentElement.setAttribute('data-theme', value);
    apply();
    const t = window.setTimeout(apply, 60);
    return () => window.clearTimeout(t);
  }, [params]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Alterna download e upload sozinho, a menos que alguém fixe um dos dois.
  useEffect(() => {
    if (!auto) return undefined;
    const t = window.setInterval(() => setMode((m) => (m === 'd' ? 'u' : 'd')), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [auto]);

  // Cursor e botões somem depois de 4 s sem mexer.
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      lastActivity.current = Date.now();
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 4000);
    };
    wake();
    ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    return () => { window.clearTimeout(timer); ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, wake)); };
  }, []);

  // Detalhe aberto e ninguém mexendo: fecha sozinho e a TV volta ao painel normal.
  useEffect(() => {
    if (!sel) return undefined;
    const t = window.setInterval(() => {
      if (Date.now() - lastActivity.current > SELECT_TIMEOUT_MS) setSel(null);
    }, 3000);
    return () => window.clearInterval(t);
  }, [sel]);

  const select = useCallback((next) => {
    lastActivity.current = Date.now();
    setSel((cur) => (cur && next && selKey(cur) === selKey(next) ? null : next));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') setSel(null);
      else if (k === 'f') toggleFullscreen();
      else if (k === 'm') { setAuto(false); setMode((m) => (m === 'd' ? 'u' : 'd')); }
      else if (k === 'a') setAuto((a) => !a);
    };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey); };
  }, [toggleFullscreen]);

  const model = useMemo(() => buildModel(data, mode), [data, mode]);
  const LINK = Number(data?.link_mbps || 300);

  // Quantas linhas de IP cabem com letra legível (ampliação mínima de 1,0). Se houver mais, os menores se agrupam.
  const maxRows = Math.max(14, Math.floor((size.h / Math.max(1, window.innerWidth / 1920) - 60) / MIN_STEP));
  const view = useMemo(() => limitDevices(model, maxRows), [model, maxRows]);
  // Ampliação: a maior que deixa todas as linhas dentro da altura da tela e o desenho com largura útil.
  const slots = Math.max(slotsOf(view), 14);
  // Em telas que informam mais de 1920 px (TV 4K sem escala), a ampliação cresce junto: a letra tem o mesmo tamanho visual.
  const screenScale = Math.max(1, window.innerWidth / 1920);
  const k = clamp(Math.min(size.w / MIN_W, size.h / (slots * MIN_STEP + 60), 2.1 * screenScale), 0.7 * screenScale, 2.1 * screenScale);
  const LW = size.w / k;
  const geo = useMemo(() => layoutModel(view, LW, { fixedH: size.h / k }), [view, LW, size.h, k]);
  const dprMax = clamp(2400 / size.w, 1, 2);

  const u = clamp(Math.min(window.innerWidth * 0.0105, window.innerHeight * 0.019), 13, 30 * screenScale);
  const listN = clamp(Math.floor((size.h - u * 11) / 2 / (u * 2.3)), 3, 9);
  const topIps = model ? [...model.devices].sort((a, b) => b.total - a.total).slice(0, listN) : [];
  const topSites = model ? model.sites.filter((t) => !t.internal && t.key !== '__outros__').slice(0, listN) : [];
  const topDev = model?.topIp ? model.devices.find((d) => d.ip === model.topIp) : null;

  // Item selecionado (clique no mapa ou nos rankings). Se ele sumiu dos dados, a seleção se desfaz.
  const found = sel && model && (
    (sel.t === 'dev' && (model.devices.some((d) => d.ip === sel.ip) || view?.devices.some((d) => d.ip === sel.ip)))
    || (sel.t === 'site' && model.sites.some((t) => t.key === sel.key))
    || (sel.t === 'vlan' && model.vlans.some((v) => v.id === sel.id))
  );
  useEffect(() => { if (sel && model && !found) setSel(null); }, [sel, model, found]);
  const hasDetail = Boolean(sel && found);
  const detailN = clamp(Math.floor((size.h - u * 14) / (u * 1.55)), 5, 16);

  const noConn = error && lastOkAt && now - lastOkAt > 15000;
  const dataAgeS = data?.updated_at ? Math.round((now - Number(data.updated_at)) / 1000) : 0;
  const lateCollector = !noConn && dataAgeS > 60;

  return (
    <div className={`tv${idle ? ' idle' : ''}`} style={{ fontSize: `${u}px` }}>
      <style>{`${TM_CSS}${TV_CSS}`}</style>
      <header className="tv-bar">
        <span className="tv-title">Mapa de Tráfego em Camadas</span>
        {noConn ? <span className="tv-tag down">sem conexão com o servidor há {Math.round((now - lastOkAt) / 1000)} s</span> : <span className="tv-tag live">ao vivo</span>}
        {lateCollector ? <span className="tv-tag warn">coletor atrasado há {Math.round(dataAgeS / 60)} min</span> : null}
        {model ? <span className="tv-tag">{model.devices.length} IP{model.devices.length === 1 ? '' : 's'} com tráfego</span> : null}
        {topDev ? <span className="tv-tag top"><span className="tv-dot" />maior consumo: {topDev.ip}</span> : null}
        <span className="tv-spacer" />
        <div className="tv-seg" role="group" aria-label="Sentido do mapa">
          <button type="button" aria-pressed={!auto && mode === 'd'} onClick={() => { setAuto(false); setMode('d'); }}>Download</button>
          <button type="button" aria-pressed={!auto && mode === 'u'} onClick={() => { setAuto(false); setMode('u'); }}>Upload</button>
          <button type="button" aria-pressed={auto} onClick={() => setAuto(true)} title="Alterna sozinho a cada 20 s">Auto · {mode === 'd' ? '↓' : '↑'}</button>
        </div>
        <div className="tv-clock"><b>{new Date(now).toLocaleTimeString('pt-BR')}</b><span>{new Date(now).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</span></div>
      </header>

      <div className="tv-body">
        <div className="tv-stage" ref={stageRef}>
          <TrafficCanvas
            model={view}
            geo={geo}
            LW={LW}
            scale={k}
            mode={mode}
            sel={hasDetail ? sel : null}
            interactive
            onSelect={select}
            LINK={LINK}
            fps={30}
            dprMax={dprMax}
            label={`Mapa de tráfego ao vivo: ${model?.devices.length || 0} IPs com tráfego, download ${fmt(model?.wanDown)} Mbps e upload ${fmt(model?.wanUp)} Mbps${topDev ? `; maior consumo ${topDev.ip}` : ''}.`}
          />
          <div className="tv-ctl">
            <button type="button" onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size="1.1em" /> : <Maximize2 size="1.1em" />}{fullscreen ? 'Sair da tela cheia' : 'Tela cheia (F)'}</button>
            <button type="button" onClick={() => { window.location.href = '/mapa-trafego'; }}><X size="1.1em" />Fechar o Modo TV</button>
          </div>
        </div>
        <aside className="tv-side">
          <div className="tv-gauge">
            {[['Download', model?.wanDown], ['Upload', model?.wanUp]].map(([label, v]) => (
              <div key={label}>
                <div className="tv-lbl">{label}</div>
                <div className="tv-val">{model ? fmt(v) : '—'}<small>Mbps</small></div>
                <div className="tv-pct">{model ? `${pct(v || 0, LINK)}% de ${LINK} Mbps` : ''}</div>
              </div>
            ))}
          </div>
          {hasDetail ? <TvDetail sel={sel} model={model} view={view} n={detailN} onClose={() => setSel(null)} /> : null}
          {!hasDetail ? (
            <>
          <div className="tv-rank">
            <h3>Quem mais consome</h3>
            <ol>
              {topIps.map((d) => (
                <li key={d.ip} className="pick" onClick={() => select({ t: 'dev', ip: d.ip, key: `dev:${d.ip}` })}>
                  <span className="tv-name tv-mono">{d.ip === model.topIp ? <span className="tv-dot" /> : null}{d.ip}</span>
                  <span className="tv-mb">↓{fmt(d.down)} ↑{fmt(d.up)}</span>
                  <span className="tv-barline"><i style={{ width: `${Math.min(100, (d.total / LINK) * 300).toFixed(1)}%`, background: `var(--vlan-${d.vlan}, var(--vlan-80))` }} /></span>
                </li>
              ))}
              {!topIps.length ? <li className="tv-empty">Sem tráfego agora.</li> : null}
            </ol>
          </div>
          <div className="tv-rank">
            <h3>Sites mais pesados</h3>
            <ol>
              {topSites.map((t) => (
                <li key={t.key} className="pick" onClick={() => select({ t: 'site', key: t.key })}>
                  <span className="tv-name">{t.name}</span>
                  <span className="tv-mb">{fmt(t.val)} Mbps · {pct(t.val, LINK)}%</span>
                  <span className="tv-barline"><i style={{ width: `${Math.min(100, (t.val / LINK) * 300).toFixed(1)}%`, background: 'var(--vlan-80)' }} /></span>
                </li>
              ))}
              {!topSites.length ? <li className="tv-empty">Nenhum site de internet agora.</li> : null}
            </ol>
          </div>
          <p className="tv-hint">Clique num IP, VLAN ou site do mapa para ver o que ele está trafegando.</p>
            </>
          ) : null}
        </aside>
      </div>

      <footer className="tv-legend">
        {(model?.vlans || []).map((v) => (
          <span key={v.id}><i style={{ background: `var(--vlan-${v.id}, var(--vlan-99))` }} />VLAN {v.id} {v.name}{v.limit ? ` · QoS ${v.limit} Mbps` : ''}</span>
        ))}
        <span><span className="tv-dot" />Maior consumo agora (o NVR não entra)</span>
        <span>Anel da VLAN: uso do limite (verde, âmbar acima de 70%, vermelho acima de 90%)</span>
        <span>Rede interna: não passa pelo link</span>
      </footer>
    </div>
  );
}
