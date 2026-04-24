import { useState, useEffect, useRef, useCallback } from "react";
import { authFetch } from "../services/authFetch";
import { ActionButton, ModuleHeader, SegmentedTabs, StatusChip } from "../components/ui/primitives";

// ─── Mapa de VLANs ────────────────────────────────────────────────────────────
const VLANS = [
  { id: "todas",  label: "TODAS",   color: "#60a5fa", subnet: null },
  { id: "VLAN10", label: "VLAN 10", color: "#34d399", subnet: "192.168.10" },
  { id: "VLAN30", label: "VLAN 30", color: "#a78bfa", subnet: "192.168.30" },
  { id: "VLAN40", label: "VLAN 40", color: "#f59e0b", subnet: "192.168.40" },
  { id: "VLAN50", label: "VLAN 50", color: "#f472b6", subnet: "192.168.50" },
  { id: "VLAN70", label: "VLAN 70", color: "#fb923c", subnet: "192.168.70" },
  { id: "VLAN80", label: "VLAN 80", color: "#22d3ee", subnet: "192.168.80" },
  { id: "VLAN99", label: "VLAN 99", color: "#e879f9", subnet: "192.168.99" },
];
const VLAN_COLOR = Object.fromEntries(VLANS.map(v => [v.id, v.color]));

function getVlan(ip) {
  for (const v of VLANS) {
    if (v.subnet && ip?.startsWith(v.subnet)) return v.id;
  }
  return "OUTROS";
}

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.toLocaleDateString("pt-BR")}, ${d.toLocaleTimeString("pt-BR")}`;
}

function getProxyPalette() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    pageBg: isDark ? "#030b18" : "transparent",
    panel: isDark ? "#07101a" : "rgba(255,255,255,0.92)",
    panelAlt: isDark ? "#0b1221" : "rgba(255,255,255,0.96)",
    panelAccent: isDark ? "#0b1628" : "#f1f7f5",
    shell: isDark ? "#020810" : "#f4f7f3",
    border: isDark ? "#1e293b" : "#d7e1db",
    text: isDark ? "#e2e8f0" : "#183029",
    muted: isDark ? "#475569" : "#5b6f65",
    dim: isDark ? "#334155" : "#7b8f86",
    faint: isDark ? "#1e293b" : "#e6eeea",
  };
}

// ─── Badge VLAN ────────────────────────────────────────────────────────────────
function VlanBadge({ vlan }) {
  const color = VLAN_COLOR[vlan] || "#94a3b8";
  return (
    <span style={{
      background: color + "20", color, border: `1px solid ${color}50`,
      borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.05em", whiteSpace: "nowrap",
    }}>{vlan}</span>
  );
}

// ─── Dot pulsante ──────────────────────────────────────────────────────────────
function Dot({ color = "#22c55e", pulse = true }) {
  return (
    <>
      <style>{`@keyframes bcPing{0%{transform:scale(1);opacity:.5}70%,100%{transform:scale(2.5);opacity:0}}`}</style>
      <span style={{ position:"relative", display:"inline-flex", width:8, height:8, flexShrink:0 }}>
        {pulse && <span style={{
          position:"absolute", inset:0, borderRadius:"50%", background:color,
          animation:"bcPing 1.4s ease-in-out infinite",
        }}/>}
        <span style={{ position:"absolute", inset:0, borderRadius:"50%", background:color }}/>
      </span>
    </>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, palette }) {
  return (
    <div style={{
      background: palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:8,
      padding:"14px 18px",
    }}>
      <div style={{ fontSize:10, color:palette.muted, letterSpacing:"0.08em", marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color }}>{value ?? "—"}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA RADAR
// ═══════════════════════════════════════════════════════════════════════════════
function TabRadar({ apiBase, palette, engineStatus }) {
  const [logs, setLogs]             = useState([]);
  const [vlanFilter, setVlanFilter] = useState("todas");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [search, setSearch]         = useState("");
  const [paused, setPaused]         = useState(false);
  const [stats, setStats]           = useState(null);
  const [vlanSummary, setVlanSummary] = useState([]);
  const [radarSummary, setRadarSummary] = useState(null);
  const [radarAction, setRadarAction] = useState(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const fetchLogs = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const p = new URLSearchParams({ limit: 200 });
      if (vlanFilter !== "todas") p.set("vlan", vlanFilter);
      if (onlyBlocked) p.set("blocked", "true");
      const r = await authFetch(`${apiBase}/api/dns/radar?${p}`);
      if (r.ok) {
        const payload = await r.json();
        setLogs(Array.isArray(payload?.entries) ? payload.entries : []);
        setRadarSummary(payload?.summary || null);
      }
    } catch {}
  }, [apiBase, vlanFilter, onlyBlocked]);

  const fetchMeta = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        authFetch(`${apiBase}/api/dns/stats`).then(r => r.json()),
        authFetch(`${apiBase}/api/dns/vlan-summary`).then(r => r.json()),
      ]);
      setStats(s);
      setVlanSummary(Array.isArray(v) ? v : []);
    } catch {}
  }, [apiBase]);

  const flashRadarAction = (text, ok = true) => {
    setRadarAction({ text, ok });
    window.clearTimeout(flashRadarAction.timer);
    flashRadarAction.timer = window.setTimeout(() => setRadarAction(null), 3500);
  };

  const clearRadar = async (scope) => {
    const confirmText = scope === "all"
      ? "Zerar todo o histórico do radar agora?"
      : "Remover apenas o ruído local antigo do radar?";
    if (!window.confirm(confirmText)) return;

    try {
      const r = await authFetch(`${apiBase}/api/dns/radar/clear`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ scope }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao limpar radar");
      flashRadarAction(`✓ ${j.message} (${j.deleted_rows ?? 0} registros)`);
      fetchLogs();
      fetchMeta();
    } catch (e) {
      flashRadarAction(`✗ ${e.message}`, false);
    }
  };

  useEffect(() => {
    fetchLogs(); fetchMeta();
    const t1 = setInterval(fetchLogs, 3000);
    const t2 = setInterval(fetchMeta, 15000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchLogs, fetchMeta]);

  const visible = logs.filter(l =>
    !search || l.domain?.includes(search) || l.client_ip?.includes(search)
  );

  return (
    <div>
      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        <StatCard label="QUERIES HOJE"     value={stats?.total_hoje}      color="#60a5fa" palette={palette} />
        <StatCard label="BLOQUEADAS HOJE"  value={stats?.bloqueados_hoje} color="#f87171" palette={palette} />
        <StatCard label="IPs ATIVOS"       value={stats?.ips_ativos}      color="#34d399" palette={palette} />
        <StatCard label="ÚLTIMOS 5 MIN"    value={stats?.queries_5min}    color="#a78bfa" palette={palette} />
      </div>

      <div style={{
        display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:12, marginBottom:20,
      }}>
        <div style={{
          background:palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:8, padding:"14px 18px",
        }}>
          <div style={{ fontSize:10, color:palette.muted, letterSpacing:"0.08em", marginBottom:8 }}>
            EVIDÊNCIA OPERACIONAL DO RADAR
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
            <span style={{
              background: radarSummary?.has_real_clients ? "#14532d" : "#3f3f46",
              color: radarSummary?.has_real_clients ? "#86efac" : "#cbd5e1",
              borderRadius:999, padding:"4px 10px", fontSize:11, fontWeight:700,
            }}>
              {radarSummary?.has_real_clients ? "CLIENTES REAIS OBSERVADOS" : "SEM CLIENTES REAIS DAS VLANs"}
            </span>
            <span style={{
              background:"#111827", color:"#93c5fd", border:"1px solid #1d4ed8",
              borderRadius:999, padding:"4px 10px", fontSize:11, fontWeight:700,
            }}>
              RUÍDO LOCAL: {radarSummary?.local_noise_count ?? 0}
            </span>
          </div>
          <div style={{ fontSize:11, color:palette.muted, lineHeight:1.6 }}>
            O radar agora distingue eventos locais do servidor como <strong style={{ color:"#f59e0b" }}>ruído</strong> e separa
            cliente real de ruído sem depender de um IP-alvo legado.
          </div>
          <div style={{ marginTop:8, fontSize:11, color:"#f59e0b", lineHeight:1.6 }}>
            Em <strong>{engineStatus?.mode === "test-http-only" ? "intercept-selective (HTTP)" : "proxy explícito / HTTP"}</strong>, o radar só enxerga o que realmente passa pela camada observada. Navegação HTTPS moderna fora do proxy explícito não aparece nessa trilha.
          </div>
        </div>

        <div style={{
          background:palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:8, padding:"14px 18px",
        }}>
          <div style={{ fontSize:10, color:palette.muted, letterSpacing:"0.08em", marginBottom:8 }}>
            CLIENTES REAIS OBSERVADOS
          </div>
          <div style={{ fontSize:11, color:palette.text, lineHeight:1.7, fontFamily:"monospace" }}>
            {(radarSummary?.real_clients_seen || []).length === 0
              ? "Nenhum cliente real observado ainda neste recorte."
              : radarSummary.real_clients_seen.slice(0, 8).join(", ")}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14 }}>
        {VLANS.map(v => (
          <button key={v.id} onClick={() => setVlanFilter(v.id)} style={{
            padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
            border:`1px solid ${vlanFilter===v.id ? v.color : palette.border}`,
            background: vlanFilter===v.id ? v.color+"22" : "transparent",
            color: vlanFilter===v.id ? v.color : palette.muted,
            cursor:"pointer", transition:"all .15s",
          }}>{v.label}</button>
        ))}
        <button onClick={() => setOnlyBlocked(b=>!b)} style={{
          padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
          border:`1px solid ${onlyBlocked?"#f87171":palette.border}`,
          background: onlyBlocked?"#f8717120":"transparent",
          color: onlyBlocked?"#f87171":palette.muted, cursor:"pointer",
        }}>🚫 SÓ BLOQUEADOS</button>
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Filtrar por IP..."
          style={{
            background:palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:6,
            padding:"4px 12px", color:palette.text, fontSize:12,
            width:180, outline:"none", marginLeft:"auto",
          }}
        />
        <button onClick={() => setPaused(p=>!p)} style={{
          padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
          border:`1px solid ${paused?"#f59e0b":palette.border}`,
          background: paused?"#f59e0b20":"transparent",
          color: paused?"#f59e0b":palette.muted, cursor:"pointer",
        }}>{paused?"▶ RETOMAR":"⏸ PAUSAR"}</button>
        <button onClick={() => clearRadar("noise")} style={{
          padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
          border:"1px solid #0f766e", background:"transparent",
          color:"#2dd4bf", cursor:"pointer",
        }}>LIMPAR RUÍDO LOCAL</button>
        <button onClick={() => clearRadar("all")} style={{
          padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
          border:"1px solid #7f1d1d", background:"transparent",
          color:"#f87171", cursor:"pointer",
        }}>ZERAR RADAR</button>
      </div>

      {radarAction && (
        <div style={{
          padding:"8px 12px", borderRadius:6, marginBottom:12, fontSize:12,
          background: radarAction.ok ? "#14532d" : "#7f1d1d",
          color: radarAction.ok ? "#86efac" : "#fca5a5",
          border:`1px solid ${radarAction.ok ? "#166534" : "#991b1b"}`,
        }}>{radarAction.text}</div>
      )}

      {/* Tabela */}
      <div style={{ background:palette.panel, border:`1px solid ${palette.border}`, borderRadius:8, overflow:"hidden", marginBottom:20 }}>
        {/* Cabeçalho da tabela */}
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"9px 16px", borderBottom:`1px solid ${palette.border}`, background:palette.panelAccent,
        }}>
          <Dot color={paused?"#f59e0b":"#22c55e"} pulse={!paused} />
          <span style={{ fontSize:11, color:palette.muted, fontFamily:"monospace" }}>
            {paused ? "PAUSADO" : "RADAR EM TEMPO REAL"} — {visible.length} registros
          </span>
          <span style={{ marginLeft:"auto", fontSize:10, color:palette.dim }}>
            Modo {engineStatus?.mode || "off"} · atualiza a cada 3s
          </span>
        </div>

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:palette.panelAccent }}>
                {["DATA/HORA","VLAN","IP CLIENTE","DOMÍNIO","TIPO","EVIDÊNCIA","STATUS"].map(h=>(
                  <th key={h} style={{
                    padding:"8px 14px", textAlign:"left",
                    color:palette.dim, fontWeight:700, fontSize:10,
                    letterSpacing:"0.09em", borderBottom:`1px solid ${palette.border}`,
                    whiteSpace:"nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} style={{ padding:36, textAlign:"center", color:palette.dim, fontSize:12 }}>
                  Aguardando eventos reais do radar...
                </td></tr>
              ) : visible.map((l, i) => {
                const vlan = l.vlan || getVlan(l.client_ip);
                const blocked = l.blocked;
                return (
                  <tr key={i} style={{
                    borderBottom:`1px solid ${palette.faint}`,
                    background: blocked
                      ? (i%2===0?"#140a0a":"#110808")
                      : (i%2===0?"transparent":palette.pageBg),
                  }}>
                    <td style={{ padding:"7px 14px", color:palette.dim, fontFamily:"monospace", fontSize:11, whiteSpace:"nowrap" }}>
                      {fmt(l.timestamp)}
                    </td>
                    <td style={{ padding:"7px 14px" }}>
                      <VlanBadge vlan={vlan} />
                    </td>
                    <td style={{ padding:"7px 14px", fontFamily:"monospace", color:"#60a5fa", fontSize:11 }}>
                      {l.client_ip}
                    </td>
                    <td style={{ padding:"7px 14px", maxWidth:320, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {blocked && <span style={{ marginRight:5, fontSize:11 }}>🚫</span>}
                      <span style={{ color: blocked?"#f87171":palette.text }}>{l.domain}</span>
                    </td>
                    <td style={{ padding:"7px 14px", color:palette.dim, fontFamily:"monospace", fontSize:11 }}>
                      {l.query_type}
                    </td>
                    <td style={{ padding:"7px 14px" }}>
                      <span style={{
                        background: l.local_noise ? "#7c2d12" : (l.real_client ? "#14532d" : "#1f2937"),
                        color: l.local_noise ? "#fdba74" : (l.real_client ? "#86efac" : "#cbd5e1"),
                        border:`1px solid ${l.local_noise ? "#ea580c55" : (l.real_client ? "#22c55e55" : "#47556955")}`,
                        borderRadius:4, padding:"2px 8px", fontSize:10, fontWeight:700,
                        whiteSpace:"nowrap",
                      }}>
                        {l.local_noise ? "RUÍDO LOCAL" : (l.real_client ? "CLIENTE REAL" : "SEM PROVA")}
                      </span>
                    </td>
                    <td style={{ padding:"7px 14px" }}>
                      {blocked ? (
                        <span style={{
                          background:"#f8717118", color:"#f87171",
                          border:"1px solid #f8717140", borderRadius:4,
                          padding:"2px 8px", fontSize:10, fontWeight:700,
                        }}>BLOQUEADO</span>
                      ) : (
                        <span style={{
                          background:"#22c55e18", color:"#22c55e",
                          border:"1px solid #22c55e40", borderRadius:4,
                          padding:"2px 8px", fontSize:10, fontWeight:700,
                        }}>AUDIT</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumo por VLAN */}
      {vlanSummary.length > 0 && (
        <>
          <div style={{ fontSize:10, color:"#334155", letterSpacing:"0.09em", marginBottom:10 }}>
            RESUMO POR VLAN — ÚLTIMAS 24H
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:10 }}>
            {vlanSummary.map(v => {
              const color = VLAN_COLOR[v.vlan] || "#94a3b8";
              const pct = parseFloat(v.block_pct) || 0;
              return (
                <div key={v.vlan} style={{
                  background:"#0b1221", border:`1px solid ${color}30`,
                  borderRadius:8, padding:"12px 14px",
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <VlanBadge vlan={v.vlan} />
                    <span style={{ fontSize:10, color:"#334155" }}>{v.unique_ips} IPs</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:"#475569" }}>Total</span>
                    <span style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{v.total_queries}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <span style={{ fontSize:11, color:"#475569" }}>Bloqueados</span>
                    <span style={{ fontSize:13, fontWeight:700, color:"#f87171" }}>{v.blocked_queries}</span>
                  </div>
                  <div style={{ background:"#1e293b", borderRadius:3, height:3, overflow:"hidden" }}>
                    <div style={{
                      height:"100%", width:`${pct}%`,
                      background: pct>15?"#f87171":"#34d399",
                      borderRadius:3, transition:"width .6s",
                    }}/>
                  </div>
                  <div style={{ fontSize:10, color:"#334155", marginTop:4, textAlign:"right" }}>
                    {pct}% bloqueado
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
// ABA MOTOR & CONTROLE
// ═══════════════════════════════════════════════════════════════════════════════
function TabMotor({ apiBase }) {
  const palette = getProxyPalette();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(null);
  const [actionLog, setActionLog] = useState([]);
  const [testMenuOpen, setTestMenuOpen] = useState(false);
  const [certMeta, setCertMeta] = useState(null);
  const [remoteLogs, setRemoteLogs] = useState([]);
  const [banner, setBanner] = useState(null);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString("pt-BR");
    setActionLog(l => [`[${ts}] ${msg}`, ...l].slice(0,60));
  };

  const flashBanner = (text, ok = true) => {
    setBanner({ text, ok });
    window.clearTimeout(flashBanner.timer);
    flashBanner.timer = window.setTimeout(() => setBanner(null), 5000);
  };

  const parseResponsePayload = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    const text = await response.text();
    return { error: text || `HTTP ${response.status}` };
  };

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, certRes, logsRes] = await Promise.all([
        authFetch(`${apiBase}/api/proxy/engine/status`),
        authFetch(`${apiBase}/api/proxy/certificate`),
        authFetch(`${apiBase}/api/proxy/action-logs?limit=30`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (certRes.ok) setCertMeta(await certRes.json());
      if (logsRes.ok) setRemoteLogs(await logsRes.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const act = async (url, label, body) => {
    setLoading(label);
    addLog(`→ ${label}`);
    setTestMenuOpen(false);
    try {
      const r = await authFetch(`${apiBase}${url}`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await parseResponsePayload(r);
      if (!r.ok) throw new Error(j.error || j.message || `Falha HTTP ${r.status}`);
      addLog(`✓ ${label}: ${j.message||"OK"}`);
      flashBanner(`✓ ${label}: ${j.message||"OK"}`, true);
      await fetchStatus();
    } catch(e){
      addLog(`✗ ${e.message}`);
      flashBanner(`✗ ${label}: ${e.message}`, false);
    }
    setLoading(null);
  };

  const downloadCertificate = async () => {
    const label = "BAIXAR CERTIFICADO";
    setLoading(label);
    addLog(`→ ${label}`);
    try {
      const response = await authFetch(`${apiBase}/api/cert/download`);
      if (!response.ok) {
        let message = "Falha ao baixar certificado";
        try {
          const payload = await response.json();
          message = payload.error || message;
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "certificado_becker_proxy.der";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      addLog("✓ BAIXAR CERTIFICADO: download iniciado");
    } catch (error) {
      addLog(`✗ BAIXAR CERTIFICADO: ${error.message}`);
    }
    setLoading(null);
  };

  const regenerateCertificate = async () => {
    const label = "GERAR NOVA CA";
    setLoading(label);
    addLog(`→ ${label}`);
    flashBanner("Gerando nova CA do proxy...", true);
    try {
      const r = await authFetch(`${apiBase}/api/proxy/certificate/regenerate`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
      });
      const j = await parseResponsePayload(r);
      if (!r.ok) throw new Error(j.error || "Falha ao gerar certificado");
      addLog(`✓ ${label}: ${j.fingerprint}`);
      flashBanner(`✓ Nova CA gerada: ${j.fingerprint || "OK"}`, true);
      await fetchStatus();
    } catch (error) {
      addLog(`✗ ${label}: ${error.message}`);
      flashBanner(`✗ ${label}: ${error.message}`, false);
    }
    setLoading(null);
  };

  const services = [
    { label:"Squid",             ok: status?.squid_active,   desc:"Processo do proxy HTTP/HTTPS" },
    { label:"Interceptação",     ok: status?.intercepting,   desc:"Redirect seletivo gerenciado pelo engine quando explicitamente ativado" },
    { label:"DNS Logger",        ok: status?.logger_active,  desc:"Ingestão do radar em PostgreSQL" },
    { label:"Bypass Global",     ok: status?.bypass_global,  desc:"Todo o tráfego segue direto sem redirecionamento" },
  ];

  const buttons = [
    { label:"LIGAR HTTP-ONLY",     url:"/api/proxy/mode/test-http-only",   color:"#2563eb" },
    { label:"LIGAR HTTP+HTTPS",    url:"/api/proxy/mode/test-http-https",   color:"#7c3aed" },
    { label:"PARAR INTERCEPTAÇÃO", url:"/api/proxy/mode/off",               color:"#ef4444" },
    { label:"EMERGÊNCIA / BYPASS", url:"/api/proxy/emergency-bypass",       color:"#f59e0b" },
    { label:"REINICIAR LOGGER",    url:"/api/proxy/logger/restart",         color:"#14b8a6" },
    { label:"LIMPAR LOGS ANTIGOS", url:"/api/dns/cleanup",                  color:"#475569" },
  ];

  const localAndRemoteLog = [
    ...actionLog,
    ...remoteLogs.map((log) => `[${fmt(log.created_at)}] ${log.success ? "✓" : "✗"} ${log.action}: ${log.message || "sem mensagem"}`),
  ].slice(0, 60);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
      <div>
        <div style={{ fontSize:10, color:palette.dim, letterSpacing:"0.09em", marginBottom:12 }}>STATUS DOS SERVIÇOS</div>
        {banner && (
          <div style={{
            padding:"10px 12px", borderRadius:8, marginBottom:12, fontSize:12,
            background: banner.ok ? "#14532d" : "#7f1d1d",
            color: banner.ok ? "#86efac" : "#fecaca",
            border:`1px solid ${banner.ok ? "#166534" : "#991b1b"}`,
          }}>
            {banner.text}
          </div>
        )}
        <div style={{ background:palette.panel, border:`1px solid ${palette.border}`, borderRadius:8, marginBottom:16, overflow:"hidden" }}>
          {services.map((s,i)=>(
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"12px 16px", borderBottom:"1px solid #080f18",
            }}>
              <Dot color={s.ok?"#22c55e":"#f87171"} pulse={s.ok} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:palette.text, fontWeight:600 }}>{s.label}</div>
                <div style={{ fontSize:11, color:palette.dim }}>{s.desc}</div>
              </div>
              <span style={{
                fontSize:10, fontWeight:700,
                color: s.ok?"#22c55e":"#f87171",
                background: s.ok?"#22c55e15":"#f8717115",
                border:`1px solid ${s.ok?"#22c55e30":"#f8717130"}`,
                borderRadius:4, padding:"2px 8px",
              }}>{s.ok?"ATIVO":"INATIVO"}</span>
            </div>
          ))}
        </div>

        <div style={{
          background:palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:8, padding:"12px 14px", marginBottom:16,
        }}>
          <div style={{ fontSize:10, color:palette.muted, letterSpacing:"0.08em", marginBottom:10 }}>
            ESTADO OFICIAL DO ENGINE
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:12 }}>
            <div><span style={{ color:palette.muted }}>Fonte:</span> <strong style={{ color:palette.text }}>{status?.source_of_truth || "—"}</strong></div>
            <div><span style={{ color:palette.muted }}>Modo:</span> <strong style={{ color:"#60a5fa" }}>{status?.enforcement_mode || status?.mode || status?.interception_mode || "off"}</strong></div>
            <div><span style={{ color:palette.muted }}>Portas ativas:</span> <strong style={{ color:palette.text }}>{(status?.active_ports || []).join(", ") || "nenhuma"}</strong></div>
            <div><span style={{ color:palette.muted }}>Escopo de interceptação:</span> <strong style={{ color:palette.text }}>{status?.interception_scope?.mode === "selective" ? "seletivo" : "nenhum"}</strong></div>
            <div><span style={{ color:palette.muted }}>Última ação:</span> <strong style={{ color:palette.text }}>{status?.last_action || "—"}</strong></div>
            <div><span style={{ color:palette.muted }}>Operador:</span> <strong style={{ color:palette.text }}>{status?.last_action_by || "—"}</strong></div>
          </div>
          <div style={{ marginTop:12, fontSize:11, color:palette.muted, lineHeight:1.6 }}>
            Squid ligado sem redirect seletivo não significa interceptação ativa. O estado operacional é definido por
            políticas compiladas, artefatos válidos, `squid.conf` alinhado e redirects seletivos reais quando existirem.
          </div>
        </div>

        <div style={{
          background:palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:8, padding:"12px 14px", marginBottom:16,
        }}>
          <div style={{ fontSize:10, color:palette.muted, letterSpacing:"0.08em", marginBottom:10 }}>
            ESCOPO OPERACIONAL
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))", gap:8 }}>
            {[
              { label:"Enforcement principal", value: status?.dns_policy_loaded ? "DNS ativo" : "DNS não carregado", color:"#60a5fa" },
              { label:"DNS oficial", value: status?.observed_dns_server || "192.168.10.1", color:"#22c55e" },
              { label:"Redirects ativos", value: status?.redirects_active ? "seletivos" : "nenhum", color:"#f59e0b" },
              { label:"Último erro", value: status?.last_error || "nenhum", color: status?.last_error ? "#f87171" : palette.text },
            ].map((item) => (
              <div key={item.label} style={{
                background:palette.panel, border:`1px solid ${palette.border}`, borderRadius:8, padding:"10px 12px",
              }}>
                <div style={{ color:palette.muted, fontSize:10, marginBottom:6, letterSpacing:"0.08em" }}>{item.label}</div>
                <div style={{ color:item.color, fontSize:12, fontWeight:700, fontFamily:"monospace" }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background:palette.panelAlt, border:`1px solid ${palette.border}`, borderRadius:8, padding:"12px 14px", marginBottom:16,
        }}>
          <div style={{ fontSize:10, color:palette.muted, letterSpacing:"0.08em", marginBottom:10 }}>
            CERTIFICADO DO PROXY HTTPS
          </div>
          <div style={{ fontSize:11, color:palette.muted, lineHeight:1.7, marginBottom:12 }}>
            Se você ligar <strong style={{ color:palette.text }}>HTTP+HTTPS</strong> sem instalar o certificado da autoridade do proxy
            nos clientes, a navegação HTTPS pode parar imediatamente.
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
            <button
              type="button"
              onClick={downloadCertificate}
              disabled={!!loading}
              style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                background:"#1d4ed8", color:"#fff", border:"none", textDecoration:"none",
                borderRadius:6, padding:"10px 14px", fontWeight:700, fontSize:11,
                cursor:"pointer",
              }}
            >
              {loading === "BAIXAR CERTIFICADO" ? "..." : "BAIXAR CERTIFICADO"}
            </button>
            <button
              type="button"
              onClick={regenerateCertificate}
              disabled={!!loading}
              style={{
                display:"inline-flex", alignItems:"center", justifyContent:"center",
                background:"transparent", color:"#22c55e", border:"1px solid #166534",
                borderRadius:6, padding:"10px 14px", fontWeight:700, fontSize:11,
                cursor:"pointer",
              }}
              title="Gerar uma nova autoridade certificadora do proxy HTTPS"
            >
              {loading === "GERAR NOVA CA" ? "..." : "GERAR NOVA CA"}
            </button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12, fontSize:11 }}>
            <div><span style={{ color:palette.muted }}>Criado em:</span> <strong style={{ color:palette.text }}>{fmt(certMeta?.created_at)}</strong></div>
            <div><span style={{ color:palette.muted }}>Válido até:</span> <strong style={{ color:palette.text }}>{fmt(certMeta?.valid_until)}</strong></div>
            <div style={{ gridColumn:"1 / -1" }}>
              <span style={{ color:palette.muted }}>Fingerprint:</span>{" "}
              <strong style={{ color:"#60a5fa", fontFamily:"monospace", fontSize:10 }}>{certMeta?.fingerprint || "—"}</strong>
            </div>
          </div>
          <div style={{ fontSize:11, color:palette.muted, lineHeight:1.7 }}>
            1. Baixe o certificado neste botão.
            <br />
            2. Instale como autoridade confiável no sistema ou navegador do cliente.
            <br />
            3. Só depois teste o modo <strong style={{ color:palette.text }}>HTTP+HTTPS</strong>.
          </div>
        </div>

        <div style={{ marginBottom:10, position:"relative" }}>
          <button
            disabled={!!loading}
            onClick={() => setTestMenuOpen((open) => !open)}
            style={{
              width:"100%", background:testMenuOpen ? "#1d4ed820" : "transparent",
              border:"1px solid #1d4ed860", color:"#2563eb",
              borderRadius:6, padding:"10px", fontSize:11, fontWeight:700, cursor:"pointer",
            }}
          >
            {loading === "MODO TESTE" ? "..." : "MODO TESTE"}
          </button>
          {testMenuOpen && (
            <div style={{
              position:"absolute", left:0, right:0, top:"calc(100% + 6px)", zIndex:20,
              background:palette.panel, border:`1px solid ${palette.border}`, borderRadius:8, padding:8,
              boxShadow:"0 12px 24px rgba(2,8,16,.18)",
            }}>
              {[
                { label:"Ativar Teste HTTP-only", url:"/api/proxy/mode/test-http-only", color:"#2563eb" },
                { label:"Ativar Teste HTTP+HTTPS", url:"/api/proxy/mode/test-http-https", color:"#7c3aed" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => act(item.url, item.label, null)}
                  style={{
                    width:"100%", textAlign:"left", background:"transparent", border:`1px solid ${item.color}30`,
                    color:item.color, borderRadius:6, padding:"10px 12px", fontSize:11, fontWeight:700,
                    cursor:"pointer", marginBottom:6,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {buttons.map(b=>(
            <button key={b.label} disabled={!!loading}
              onClick={()=>act(b.url,b.label,b.body)}
              style={{
                background: loading===b.label ? b.color+"25":"transparent",
                border:`1px solid ${b.color}45`, color:b.color,
                borderRadius:6, padding:"10px", fontSize:11,
                fontWeight:700, cursor:"pointer", transition:"all .15s",
              }}>
              {loading===b.label ? "..." : b.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize:10, color:palette.dim, letterSpacing:"0.09em", marginBottom:12 }}>LOG DE AÇÕES</div>
        <div style={{
          background:palette.shell, border:`1px solid ${palette.border}`, borderRadius:8,
          padding:14, height:300, overflowY:"auto", fontFamily:"monospace", fontSize:11,
        }}>
          {localAndRemoteLog.length===0
            ? <span style={{ color:palette.dim }}>Nenhuma ação executada ainda...</span>
            : localAndRemoteLog.map((l,i)=>(
              <div key={i} style={{
                color: l.includes("✓")?"#22c55e": l.includes("✗")?"#f87171":"#475569",
                marginBottom:3, lineHeight:1.5,
              }}>{l}</div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

function TabRelatorios({ apiBase }) {
  const palette = getProxyPalette();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch(`${apiBase}/api/proxy/reports`);
      if (r.ok) setReports(await r.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setLoading(true);
    try {
      await authFetch(`${apiBase}/api/proxy/reports/generate`, { method:"POST" });
      load();
    } catch {}
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
        <div>
          <div style={{ fontSize:13, color:palette.text, fontWeight:700, marginBottom:4 }}>Relatórios SARG</div>
          <div style={{ fontSize:11, color:palette.muted }}>
            Backend pronto para indexar relatórios gerados pelo SARG e publicar os diretórios encontrados em disco.
          </div>
        </div>
        <button onClick={generate} disabled={loading} style={{
          background:"#1d4ed8", color:"#fff", border:"none", borderRadius:6, padding:"10px 14px",
          fontWeight:700, fontSize:11, cursor:"pointer",
        }}>
          {loading ? "GERANDO..." : "GERAR SARG"}
        </button>
      </div>

      <div style={{ background:palette.panel, border:`1px solid ${palette.border}`, borderRadius:8, overflow:"hidden" }}>
        {reports.length === 0 ? (
          <div style={{ padding:32, textAlign:"center", color:palette.dim, fontSize:12 }}>
            Nenhum relatório indexado ainda.
          </div>
        ) : reports.map((report) => (
          <div key={report.id} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"12px 14px", borderBottom:`1px solid ${palette.faint}`,
          }}>
            <div>
              <div style={{ color:palette.text, fontWeight:700, fontSize:12 }}>{report.name}</div>
              <div style={{ color:palette.muted, fontSize:11 }}>{fmt(report.updated_at)}</div>
            </div>
            <a href={report.index_url} target="_blank" rel="noreferrer" style={{
              color:"#60a5fa", fontSize:11, fontWeight:700, textDecoration:"none",
            }}>ABRIR</a>
          </div>
        ))}
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function Proxy() {
  const palette = getProxyPalette();
  const [tab, setTab]             = useState("radar");
  const [engineStatus, setEngineStatus] = useState(null);
  const API = "";

  useEffect(() => {
    const check = async () => {
      try {
        const r = await authFetch(`${API}/api/proxy/engine/status`);
        if (r.ok) setEngineStatus(await r.json());
      } catch {}
    };
    check();
    const t = setInterval(check, 8000);
    return () => clearInterval(t);
  }, [API]);

  const tabs = [
    { id:"radar",      label:"Radar Técnico" },
    { id:"relatorios", label:"Relatórios" },
    { id:"motor",      label:"Motor de Controle", dot: true },
  ];

  const motorOk = engineStatus?.redirects_active || engineStatus?.squid_active;

  return (
    <div style={{
      background:palette.pageBg, minHeight:"100vh",
      color:palette.text, fontFamily:"'IBM Plex Sans','Inter',sans-serif",
    }}>
      <div className="space-y-6 p-[var(--spacing-section)]">
        <ModuleHeader
          eyebrow="Controle"
          title="Observabilidade DNS/Proxy"
          description="Radar técnico, relatórios operacionais, saúde do Squid e diagnóstico fino da camada observável. Decisão administrativa e política permanecem centralizadas em Bloqueios & Liberações."
          badges={(
            <>
              <StatusChip label={`Squid ${engineStatus?.squid_active ? 'ativo' : 'inativo'}`} tone={engineStatus?.squid_active ? 'success' : 'danger'} />
              <StatusChip label={`Interceptação ${engineStatus?.redirects_active ? 'seletiva' : 'desligada'}`} tone={engineStatus?.redirects_active ? 'primary' : 'neutral'} />
              <StatusChip label={`Modo ${engineStatus?.interception_mode || 'off'}`} tone="neutral" />
              <StatusChip label={`Logger ${engineStatus?.logger_active ? 'ativo' : 'inativo'}`} tone={engineStatus?.logger_active ? 'success' : 'warning'} />
            </>
          )}
        />

        <div style={{
          background:palette.panelAlt,
          border:`1px solid ${palette.border}`,
          borderRadius:24,
          padding:"14px 16px",
          display:"flex",
          justifyContent:"space-between",
          gap:14,
          alignItems:"center",
          flexWrap:"wrap",
          boxShadow:"var(--shadow-soft)",
        }}>
          <div>
            <div style={{ fontSize:11, color:"#0e6b62", fontWeight:800, letterSpacing:"0.08em", marginBottom:5 }}>
              MÓDULO DE CONTROLE TÉCNICO
            </div>
            <div style={{ fontSize:12, color:palette.muted, lineHeight:1.6 }}>
              Políticas, bloqueios, liberações e VIPs são operados em Bloqueios & Liberações.
              Esta tela permanece para radar técnico, relatórios SARG, saúde do Squid e diagnóstico fino de observabilidade.
            </div>
          </div>
          <ActionButton tone="primary" onClick={() => { window.location.href = "/bloqueios-liberacoes"; }}>
            Abrir Bloqueios & Liberações
          </ActionButton>
        </div>

        <SegmentedTabs
          tabs={tabs.map((t) => ({ key: t.id, label: t.label }))}
          value={tab}
          onChange={setTab}
        />

        {tab==="radar"      && <TabRadar     apiBase={API} palette={palette} engineStatus={engineStatus} />}
        {tab==="relatorios" && <TabRelatorios apiBase={API} />}
        {tab==="motor"      && <TabMotor apiBase={API} />}
      </div>
    </div>
  );
}
