import { F_BODY, F_DISPLAY, F_MONO } from './trafficModel';

// Estilo do "quadrado" do Mapa de Tráfego (barra, mapa, painel lateral e legenda). Cores vêm dos tokens do tema.
export const TM_CSS = `
.tm { background:var(--md-container); color:var(--md-on-surface); border:1px solid var(--md-outline); border-radius:12px; overflow:hidden; font-family:${F_BODY}; font-size:15px; line-height:1.6; }
.tm-bar { display:flex; flex-wrap:wrap; align-items:center; gap:10px 16px; padding:12px 16px; border-bottom:1px solid var(--md-outline); }
.tm-title { font-family:${F_DISPLAY}; font-stretch:85%; font-weight:750; font-size:16px; }
.tm-tag { font-family:${F_MONO}; font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid var(--md-outline); color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); white-space:nowrap; }
.tm-tag.live { border-color:var(--md-success); color:var(--md-success); }
.tm-tag.paused, .tm-tag.late { border-color:var(--md-warning); color:var(--md-warning); }
.tm-tag.down { border-color:var(--md-danger); color:var(--md-danger); }
.tm-tag.top { border-color:var(--md-danger); color:var(--md-danger); }
.tm-seg { display:inline-flex; border:1px solid var(--md-outline); border-radius:8px; overflow:hidden; margin-left:auto; }
.tm-seg button, .tm-btn { font:inherit; font-size:13px; font-weight:600; background:transparent; color:color-mix(in srgb, var(--md-on-surface) 62%, transparent); border:0; padding:6px 12px; cursor:pointer; text-decoration:none; display:inline-flex; align-items:center; }
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
