import { useState, useEffect, useRef, useCallback } from "react";

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
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background:"#0b1221", border:"1px solid #1e293b", borderRadius:8,
      padding:"14px 18px",
    }}>
      <div style={{ fontSize:10, color:"#475569", letterSpacing:"0.08em", marginBottom:5 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color }}>{value ?? "—"}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA RADAR
// ═══════════════════════════════════════════════════════════════════════════════
function TabRadar({ apiBase }) {
  const [logs, setLogs]             = useState([]);
  const [vlanFilter, setVlanFilter] = useState("todas");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [search, setSearch]         = useState("");
  const [paused, setPaused]         = useState(false);
  const [stats, setStats]           = useState(null);
  const [vlanSummary, setVlanSummary] = useState([]);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const fetchLogs = useCallback(async () => {
    if (pausedRef.current) return;
    try {
      const p = new URLSearchParams({ limit: 200 });
      if (vlanFilter !== "todas") p.set("vlan", vlanFilter);
      if (onlyBlocked) p.set("blocked", "true");
      const r = await fetch(`${apiBase}/api/dns/radar?${p}`);
      if (r.ok) setLogs(await r.json());
    } catch {}
  }, [apiBase, vlanFilter, onlyBlocked]);

  const fetchMeta = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        fetch(`${apiBase}/api/dns/stats`).then(r => r.json()),
        fetch(`${apiBase}/api/dns/vlan-summary`).then(r => r.json()),
      ]);
      setStats(s);
      setVlanSummary(Array.isArray(v) ? v : []);
    } catch {}
  }, [apiBase]);

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
        <StatCard label="QUERIES HOJE"     value={stats?.total_hoje}      color="#60a5fa" />
        <StatCard label="BLOQUEADAS HOJE"  value={stats?.bloqueados_hoje} color="#f87171" />
        <StatCard label="IPs ATIVOS"       value={stats?.ips_ativos}      color="#34d399" />
        <StatCard label="ÚLTIMOS 5 MIN"    value={stats?.queries_5min}    color="#a78bfa" />
      </div>

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:14 }}>
        {VLANS.map(v => (
          <button key={v.id} onClick={() => setVlanFilter(v.id)} style={{
            padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
            border:`1px solid ${vlanFilter===v.id ? v.color : "#1e293b"}`,
            background: vlanFilter===v.id ? v.color+"22" : "transparent",
            color: vlanFilter===v.id ? v.color : "#475569",
            cursor:"pointer", transition:"all .15s",
          }}>{v.label}</button>
        ))}
        <button onClick={() => setOnlyBlocked(b=>!b)} style={{
          padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
          border:`1px solid ${onlyBlocked?"#f87171":"#1e293b"}`,
          background: onlyBlocked?"#f8717120":"transparent",
          color: onlyBlocked?"#f87171":"#475569", cursor:"pointer",
        }}>🚫 SÓ BLOQUEADOS</button>
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Filtrar por IP..."
          style={{
            background:"#0b1221", border:"1px solid #1e293b", borderRadius:6,
            padding:"4px 12px", color:"#e2e8f0", fontSize:12,
            width:180, outline:"none", marginLeft:"auto",
          }}
        />
        <button onClick={() => setPaused(p=>!p)} style={{
          padding:"4px 12px", borderRadius:6, fontSize:11, fontWeight:700,
          border:`1px solid ${paused?"#f59e0b":"#1e293b"}`,
          background: paused?"#f59e0b20":"transparent",
          color: paused?"#f59e0b":"#475569", cursor:"pointer",
        }}>{paused?"▶ RETOMAR":"⏸ PAUSAR"}</button>
      </div>

      {/* Tabela */}
      <div style={{ background:"#07101a", border:"1px solid #1e293b", borderRadius:8, overflow:"hidden", marginBottom:20 }}>
        {/* Cabeçalho da tabela */}
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          padding:"9px 16px", borderBottom:"1px solid #1e293b", background:"#0b1628",
        }}>
          <Dot color={paused?"#f59e0b":"#22c55e"} pulse={!paused} />
          <span style={{ fontSize:11, color:"#475569", fontFamily:"monospace" }}>
            {paused ? "PAUSADO" : "RADAR EM TEMPO REAL"} — {visible.length} registros
          </span>
          <span style={{ marginLeft:"auto", fontSize:10, color:"#1e293b" }}>
            Modo DNS Filter · atualiza a cada 3s
          </span>
        </div>

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:"#0b1628" }}>
                {["DATA/HORA","VLAN","IP CLIENTE","DOMÍNIO","TIPO","STATUS"].map(h=>(
                  <th key={h} style={{
                    padding:"8px 14px", textAlign:"left",
                    color:"#334155", fontWeight:700, fontSize:10,
                    letterSpacing:"0.09em", borderBottom:"1px solid #1e293b",
                    whiteSpace:"nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={6} style={{ padding:36, textAlign:"center", color:"#1e293b", fontSize:12 }}>
                  Aguardando queries DNS...
                </td></tr>
              ) : visible.map((l, i) => {
                const vlan = l.vlan || getVlan(l.client_ip);
                const blocked = l.blocked;
                return (
                  <tr key={i} style={{
                    borderBottom:"1px solid #080f18",
                    background: blocked
                      ? (i%2===0?"#140a0a":"#110808")
                      : (i%2===0?"transparent":"#070e18"),
                  }}>
                    <td style={{ padding:"7px 14px", color:"#334155", fontFamily:"monospace", fontSize:11, whiteSpace:"nowrap" }}>
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
                      <span style={{ color: blocked?"#f87171":"#cbd5e1" }}>{l.domain}</span>
                    </td>
                    <td style={{ padding:"7px 14px", color:"#334155", fontFamily:"monospace", fontSize:11 }}>
                      {l.query_type}
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
// ABA REGRAS
// ═══════════════════════════════════════════════════════════════════════════════
function TabRegras({ apiBase }) {
  const [domains, setDomains]     = useState([]);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState(null);
  const [topBlocked, setTopBlocked] = useState([]);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        fetch(`${apiBase}/api/dns/listas`).then(r=>r.json()),
        fetch(`${apiBase}/api/dns/top-blocked`).then(r=>r.json()),
      ]);
      setDomains(Array.isArray(d)?d:[]);
      setTopBlocked(Array.isArray(t)?t:[]);
    } catch {}
  }, [apiBase]);

  useEffect(()=>{ load(); },[load]);

  const flash = (text, ok=true) => { setMsg({text,ok}); setTimeout(()=>setMsg(null),3000); };

  const add = async () => {
    const d = newDomain.trim().toLowerCase()
      .replace(/^https?:\/\//,"").replace(/\/.*$/,"");
    if (!d) return;
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/dns/listas/add`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({domain:d}),
      });
      const j = await r.json();
      if (r.ok) { flash(`✓ ${d} adicionado`); setNewDomain(""); load(); }
      else flash(`✗ ${j.error}`,false);
    } catch(e){ flash(`✗ ${e.message}`,false); }
    setLoading(false);
  };

  const remove = async (domain) => {
    if (!confirm(`Remover ${domain} da lista de bloqueios?`)) return;
    try {
      await fetch(`${apiBase}/api/dns/listas/remove`,{
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({domain}),
      });
      flash(`✓ ${domain} removido`); load();
    } catch(e){ flash(`✗ ${e.message}`,false); }
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
      {/* Gerenciar */}
      <div>
        <div style={{ fontSize:10, color:"#334155", letterSpacing:"0.09em", marginBottom:12 }}>
          DOMÍNIOS BLOQUEADOS ({domains.length})
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <input
            value={newDomain} onChange={e=>setNewDomain(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&add()}
            placeholder="ex: facebook.com"
            style={{
              flex:1, background:"#0b1221", border:"1px solid #1e293b",
              borderRadius:6, padding:"8px 12px", color:"#e2e8f0",
              fontSize:12, outline:"none",
            }}
          />
          <button onClick={add} disabled={loading} style={{
            background:"#1d4ed8", color:"#fff", border:"none",
            borderRadius:6, padding:"8px 16px", fontWeight:700,
            fontSize:11, cursor:"pointer",
          }}>+ BLOQUEAR</button>
        </div>
        {msg && (
          <div style={{
            padding:"8px 12px", borderRadius:6, marginBottom:10, fontSize:12,
            background: msg.ok?"#14532d":"#7f1d1d",
            color: msg.ok?"#86efac":"#fca5a5",
            border:`1px solid ${msg.ok?"#166534":"#991b1b"}`,
          }}>{msg.text}</div>
        )}
        <div style={{ background:"#07101a", border:"1px solid #1e293b", borderRadius:8, maxHeight:380, overflowY:"auto" }}>
          {domains.length===0 ? (
            <div style={{ padding:28, textAlign:"center", color:"#1e293b", fontSize:12 }}>
              Nenhum domínio bloqueado
            </div>
          ) : domains.map((d,i)=>(
            <div key={i} style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"8px 14px", borderBottom:"1px solid #080f18",
            }}>
              <span style={{ fontFamily:"monospace", fontSize:12, color:"#cbd5e1" }}>{d}</span>
              <button onClick={()=>remove(d)} style={{
                background:"transparent", border:"1px solid #7f1d1d",
                color:"#f87171", borderRadius:4, padding:"2px 8px",
                fontSize:10, cursor:"pointer",
              }}>REMOVER</button>
            </div>
          ))}
        </div>
      </div>

      {/* Top bloqueados */}
      <div>
        <div style={{ fontSize:10, color:"#334155", letterSpacing:"0.09em", marginBottom:12 }}>
          TOP TENTATIVAS HOJE
        </div>
        <div style={{ background:"#07101a", border:"1px solid #1e293b", borderRadius:8, overflow:"hidden" }}>
          {topBlocked.length===0 ? (
            <div style={{ padding:28, textAlign:"center", color:"#1e293b", fontSize:12 }}>
              Nenhum bloqueio registrado hoje
            </div>
          ) : topBlocked.map((t,i)=>(
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"9px 14px", borderBottom:"1px solid #080f18",
            }}>
              <span style={{ fontSize:10, color:"#1e293b", width:16, textAlign:"right" }}>{i+1}</span>
              <span style={{ flex:1, fontFamily:"monospace", fontSize:12, color:"#f87171", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {t.domain}
              </span>
              <span style={{ fontSize:11, color:"#475569", whiteSpace:"nowrap" }}>{t.attempts}x</span>
              <span style={{ fontSize:10, color:"#334155", whiteSpace:"nowrap" }}>{t.unique_ips} IPs</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MOTOR & CONTROLE
// ═══════════════════════════════════════════════════════════════════════════════
function TabMotor({ apiBase }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(null);
  const [actionLog, setActionLog] = useState([]);

  const addLog = (msg) => {
    const ts = new Date().toLocaleTimeString("pt-BR");
    setActionLog(l => [`[${ts}] ${msg}`, ...l].slice(0,60));
  };

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/dns/status`);
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const act = async (url, label) => {
    setLoading(label);
    addLog(`→ ${label}`);
    try {
      const r = await fetch(`${apiBase}${url}`, { method:"POST" });
      const j = await r.json();
      addLog(r.ok ? `✓ ${label}: ${j.message||"OK"}` : `✗ ${label}: ${j.error}`);
      fetchStatus();
    } catch(e){ addLog(`✗ ${e.message}`); }
    setLoading(null);
  };

  const services = [
    { label:"Unbound DNS",  ok: status?.unbound_active, desc:"Servidor DNS recursivo" },
    { label:"DNS Logger",   ok: status?.logger_active,  desc:"Gravação PostgreSQL" },
    { label:"RPZ Filter",   ok: status?.unbound_active, desc:"Bloqueio por RPZ" },
  ];

  const buttons = [
    { label:"REINICIAR UNBOUND",   url:"/api/dns/restart-unbound",  color:"#3b82f6" },
    { label:"RECARREGAR REGRAS",   url:"/api/dns/reload-rules",      color:"#8b5cf6" },
    { label:"REINICIAR LOGGER",    url:"/api/dns/restart-logger",    color:"#f59e0b" },
    { label:"LIMPAR LOGS ANTIGOS", url:"/api/dns/cleanup",           color:"#475569" },
  ];

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
      <div>
        <div style={{ fontSize:10, color:"#334155", letterSpacing:"0.09em", marginBottom:12 }}>STATUS DOS SERVIÇOS</div>
        <div style={{ background:"#07101a", border:"1px solid #1e293b", borderRadius:8, marginBottom:16, overflow:"hidden" }}>
          {services.map((s,i)=>(
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:12,
              padding:"12px 16px", borderBottom:"1px solid #080f18",
            }}>
              <Dot color={s.ok?"#22c55e":"#f87171"} pulse={s.ok} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:"#e2e8f0", fontWeight:600 }}>{s.label}</div>
                <div style={{ fontSize:11, color:"#334155" }}>{s.desc}</div>
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

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {buttons.map(b=>(
            <button key={b.label} disabled={!!loading}
              onClick={()=>act(b.url,b.label)}
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
        <div style={{ fontSize:10, color:"#334155", letterSpacing:"0.09em", marginBottom:12 }}>LOG DE AÇÕES</div>
        <div style={{
          background:"#020810", border:"1px solid #1e293b", borderRadius:8,
          padding:14, height:300, overflowY:"auto", fontFamily:"monospace", fontSize:11,
        }}>
          {actionLog.length===0
            ? <span style={{ color:"#1e293b" }}>Nenhuma ação executada ainda...</span>
            : actionLog.map((l,i)=>(
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

// ═══════════════════════════════════════════════════════════════════════════════
// ABA VIP — IPs com bypass total do filtro DNS
// ═══════════════════════════════════════════════════════════════════════════════
function TabVip({ apiBase }) {
  const [vips, setVips]           = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [msg, setMsg]             = useState(null);
  const [form, setForm]           = useState({ cidr:"", descricao:"", responsavel:"", motivo:"" });

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/dns/vip`);
      if (r.ok) setVips(await r.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const flash = (text, ok=true) => { setMsg({text,ok}); setTimeout(()=>setMsg(null),4000); };

  const resetForm = () => {
    setForm({ cidr:"", descricao:"", responsavel:"", motivo:"" });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (v) => {
    setForm({ cidr: v.cidr, descricao: v.descricao, responsavel: v.responsavel, motivo: v.motivo||"" });
    setEditing(v.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.cidr || !form.descricao || !form.responsavel) {
      flash("✗ IP/Range, Descrição e Responsável são obrigatórios", false); return;
    }
    try {
      let r, j;
      if (editing) {
        r = await fetch(`${apiBase}/api/dns/vip/${editing}`, {
          method:"PATCH", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ descricao: form.descricao, responsavel: form.responsavel, motivo: form.motivo }),
        });
      } else {
        r = await fetch(`${apiBase}/api/dns/vip`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify(form),
        });
      }
      j = await r.json();
      if (r.ok) { flash(`✓ ${editing?"Atualizado":"Adicionado"}: ${form.cidr}`); resetForm(); load(); }
      else flash(`✗ ${j.error}`, false);
    } catch(e) { flash(`✗ ${e.message}`, false); }
  };

  const toggle = async (v) => {
    try {
      const r = await fetch(`${apiBase}/api/dns/vip/${v.id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ativo: !v.ativo }),
      });
      if (r.ok) { flash(`✓ ${v.cidr} ${v.ativo?"desativado":"ativado"}`); load(); }
    } catch(e) { flash(`✗ ${e.message}`, false); }
  };

  const remove = async (v) => {
    if (!confirm(`Remover ${v.cidr} — ${v.descricao}?`)) return;
    try {
      const r = await fetch(`${apiBase}/api/dns/vip/${v.id}`, { method:"DELETE" });
      if (r.ok) { flash(`✓ ${v.cidr} removido`); load(); }
    } catch(e) { flash(`✗ ${e.message}`, false); }
  };

  const ativos   = vips.filter(v => v.ativo);
  const inativos = vips.filter(v => !v.ativo);

  return (
    <div>
      {/* Header da seção */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:13, color:"#e2e8f0", fontWeight:700, marginBottom:4 }}>
            Lista VIP — Bypass DNS Total
          </div>
          <div style={{ fontSize:11, color:"#475569", maxWidth:520 }}>
            IPs e ranges nesta lista ignoram completamente o filtro DNS. Qualquer domínio é resolvido normalmente, incluindo redes sociais e apostas.
          </div>
        </div>
        <button onClick={() => { resetForm(); setShowForm(s => !s); }} style={{
          background: showForm?"transparent":"#1d4ed8",
          border: showForm?"1px solid #334155":"none",
          color: showForm?"#475569":"#fff",
          borderRadius:7, padding:"9px 18px", fontWeight:700,
          fontSize:12, cursor:"pointer", whiteSpace:"nowrap",
        }}>{showForm ? "✕ CANCELAR" : "+ NOVO VIP"}</button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div style={{
          background:"#0b1628", border:"1px solid #1e3a5f",
          borderRadius:10, padding:20, marginBottom:20,
        }}>
          <div style={{ fontSize:11, color:"#3b82f6", letterSpacing:"0.08em", marginBottom:16, fontWeight:700 }}>
            {editing ? "✏ EDITAR VIP" : "+ ADICIONAR VIP"}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {/* IP/Range */}
            <div>
              <label style={{ fontSize:10, color:"#475569", display:"block", marginBottom:5, letterSpacing:"0.08em" }}>
                IP OU RANGE (CIDR) *
              </label>
              <input
                value={form.cidr} onChange={e=>setForm(f=>({...f,cidr:e.target.value}))}
                disabled={!!editing}
                placeholder="192.168.10.40 ou 192.168.10.0/24"
                style={{
                  width:"100%", background: editing?"#0a0f1a":"#07101a",
                  border:`1px solid ${editing?"#1e293b":"#1e3a5f"}`,
                  borderRadius:6, padding:"9px 12px", color: editing?"#334155":"#e2e8f0",
                  fontSize:13, outline:"none", fontFamily:"monospace", boxSizing:"border-box",
                }}
              />
              <div style={{ fontSize:10, color:"#334155", marginTop:4 }}>
                Ex: 192.168.10.40 · 192.168.10.0/24 · 10.8.0.5
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label style={{ fontSize:10, color:"#475569", display:"block", marginBottom:5, letterSpacing:"0.08em" }}>
                DESCRIÇÃO *
              </label>
              <input
                value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}
                placeholder="Ex: PC Prefeito, Sala de Reuniões"
                style={{
                  width:"100%", background:"#07101a", border:"1px solid #1e3a5f",
                  borderRadius:6, padding:"9px 12px", color:"#e2e8f0",
                  fontSize:13, outline:"none", boxSizing:"border-box",
                }}
              />
            </div>

            {/* Responsável */}
            <div>
              <label style={{ fontSize:10, color:"#475569", display:"block", marginBottom:5, letterSpacing:"0.08em" }}>
                RESPONSÁVEL *
              </label>
              <input
                value={form.responsavel} onChange={e=>setForm(f=>({...f,responsavel:e.target.value}))}
                placeholder="Ex: Carlos T.I., João Administração"
                style={{
                  width:"100%", background:"#07101a", border:"1px solid #1e3a5f",
                  borderRadius:6, padding:"9px 12px", color:"#e2e8f0",
                  fontSize:13, outline:"none", boxSizing:"border-box",
                }}
              />
            </div>

            {/* Motivo */}
            <div>
              <label style={{ fontSize:10, color:"#475569", display:"block", marginBottom:5, letterSpacing:"0.08em" }}>
                MOTIVO / JUSTIFICATIVA
              </label>
              <input
                value={form.motivo} onChange={e=>setForm(f=>({...f,motivo:e.target.value}))}
                placeholder="Ex: Autorizado pelo gestor em 10/03/2026"
                style={{
                  width:"100%", background:"#07101a", border:"1px solid #1e3a5f",
                  borderRadius:6, padding:"9px 12px", color:"#e2e8f0",
                  fontSize:13, outline:"none", boxSizing:"border-box",
                }}
              />
            </div>
          </div>

          {msg && (
            <div style={{
              marginTop:12, padding:"8px 12px", borderRadius:6, fontSize:12,
              background: msg.ok?"#14532d":"#7f1d1d",
              color: msg.ok?"#86efac":"#fca5a5",
              border:`1px solid ${msg.ok?"#166534":"#991b1b"}`,
            }}>{msg.text}</div>
          )}

          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button onClick={save} style={{
              background:"#1d4ed8", color:"#fff", border:"none",
              borderRadius:6, padding:"10px 24px", fontWeight:700,
              fontSize:12, cursor:"pointer",
            }}>{editing ? "SALVAR ALTERAÇÕES" : "ADICIONAR AO BYPASS"}</button>
            <button onClick={resetForm} style={{
              background:"transparent", color:"#475569",
              border:"1px solid #1e293b", borderRadius:6,
              padding:"10px 18px", fontSize:12, cursor:"pointer",
            }}>CANCELAR</button>
          </div>
        </div>
      )}

      {!showForm && msg && (
        <div style={{
          marginBottom:14, padding:"8px 12px", borderRadius:6, fontSize:12,
          background: msg.ok?"#14532d":"#7f1d1d",
          color: msg.ok?"#86efac":"#fca5a5",
          border:`1px solid ${msg.ok?"#166534":"#991b1b"}`,
        }}>{msg.text}</div>
      )}

      {/* Cards ativos */}
      {ativos.length > 0 && (
        <>
          <div style={{ fontSize:10, color:"#22c55e", letterSpacing:"0.09em", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
            <Dot color="#22c55e" pulse={false} />
            ATIVOS ({ativos.length})
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:12, marginBottom:24 }}>
            {ativos.map(v => (
              <VipCard key={v.id} v={v} onEdit={()=>openEdit(v)} onToggle={()=>toggle(v)} onRemove={()=>remove(v)} />
            ))}
          </div>
        </>
      )}

      {/* Cards inativos */}
      {inativos.length > 0 && (
        <>
          <div style={{ fontSize:10, color:"#334155", letterSpacing:"0.09em", marginBottom:12, marginTop:8 }}>
            INATIVOS ({inativos.length})
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:12 }}>
            {inativos.map(v => (
              <VipCard key={v.id} v={v} onEdit={()=>openEdit(v)} onToggle={()=>toggle(v)} onRemove={()=>remove(v)} />
            ))}
          </div>
        </>
      )}

      {vips.length === 0 && !showForm && (
        <div style={{
          background:"#07101a", border:"1px dashed #1e293b", borderRadius:10,
          padding:"40px 24px", textAlign:"center",
        }}>
          <div style={{ fontSize:28, marginBottom:10 }}>🛡️</div>
          <div style={{ color:"#334155", fontSize:13 }}>Nenhum IP VIP cadastrado</div>
          <div style={{ color:"#1e293b", fontSize:11, marginTop:4 }}>
            Clique em "+ NOVO VIP" para adicionar um IP ou range com bypass total
          </div>
        </div>
      )}
    </div>
  );
}

function VipCard({ v, onEdit, onToggle, onRemove }) {
  const isRange = v.cidr.includes('/');
  const created = v.created_at ? new Date(v.created_at).toLocaleDateString("pt-BR") : "—";

  return (
    <div style={{
      background: v.ativo ? "#0b1628" : "#090e17",
      border: `1px solid ${v.ativo ? "#1e3a5f" : "#131b28"}`,
      borderRadius:10, padding:16, opacity: v.ativo ? 1 : 0.55,
      transition:"all .2s",
    }}>
      {/* Linha 1: IP + badges */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <span style={{
          fontFamily:"monospace", fontSize:15, fontWeight:700,
          color: v.ativo ? "#60a5fa" : "#334155",
        }}>{v.cidr}</span>
        {isRange && (
          <span style={{
            background:"#f59e0b20", color:"#f59e0b", border:"1px solid #f59e0b40",
            borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700,
          }}>RANGE</span>
        )}
        {v.ativo ? (
          <span style={{
            background:"#22c55e18", color:"#22c55e", border:"1px solid #22c55e35",
            borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700, marginLeft:"auto",
          }}>BYPASS ATIVO</span>
        ) : (
          <span style={{
            background:"#1e293b", color:"#475569", border:"1px solid #1e293b",
            borderRadius:4, padding:"1px 7px", fontSize:9, fontWeight:700, marginLeft:"auto",
          }}>INATIVO</span>
        )}
      </div>

      {/* Linha 2: Descrição */}
      <div style={{ fontSize:13, color:"#e2e8f0", fontWeight:600, marginBottom:6 }}>
        {v.descricao}
      </div>

      {/* Linha 3: Meta */}
      <div style={{ display:"flex", gap:16, marginBottom: v.motivo ? 8 : 12 }}>
        <div>
          <div style={{ fontSize:9, color:"#334155", letterSpacing:"0.08em" }}>RESPONSÁVEL</div>
          <div style={{ fontSize:11, color:"#64748b" }}>{v.responsavel}</div>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#334155", letterSpacing:"0.08em" }}>CADASTRADO</div>
          <div style={{ fontSize:11, color:"#64748b" }}>{created}</div>
        </div>
      </div>

      {/* Motivo */}
      {v.motivo && (
        <div style={{
          background:"#07101a", borderRadius:6, padding:"7px 10px",
          fontSize:11, color:"#475569", fontStyle:"italic", marginBottom:12,
          borderLeft:"2px solid #1e3a5f",
        }}>"{v.motivo}"</div>
      )}

      {/* Ações */}
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={onToggle} style={{
          flex:1, background:"transparent",
          border:`1px solid ${v.ativo?"#854d0e":"#166534"}`,
          color: v.ativo?"#f59e0b":"#22c55e",
          borderRadius:5, padding:"6px", fontSize:10,
          fontWeight:700, cursor:"pointer",
        }}>{v.ativo ? "⏸ DESATIVAR" : "▶ ATIVAR"}</button>
        <button onClick={onEdit} style={{
          flex:1, background:"transparent", border:"1px solid #1e3a5f",
          color:"#60a5fa", borderRadius:5, padding:"6px",
          fontSize:10, fontWeight:700, cursor:"pointer",
        }}>✏ EDITAR</button>
        <button onClick={onRemove} style={{
          background:"transparent", border:"1px solid #7f1d1d",
          color:"#f87171", borderRadius:5, padding:"6px 10px",
          fontSize:10, cursor:"pointer",
        }}>✕</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA WHITELIST — Domínios sempre permitidos (RPZ passthru)
// ═══════════════════════════════════════════════════════════════════════════════
const CATEGORY_ICONS = {
  "Bancos":               "🏦",
  "Conectividade Social": "🔗",
  "Gov.br / Federal":     "🏛️",
  "Gov.br / Paraná":      "📋",
  "Microsoft / Office 365": "🪟",
  "Google Workspace":     "🔵",
};

function TabWhitelist({ apiBase }) {
  const [data, setData]         = useState(null);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/dns/whitelist`);
      if (r.ok) setData(await r.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  const add = async () => {
    const d = newDomain.trim().toLowerCase()
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d) return;
    setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/dns/whitelist/add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const j = await r.json();
      if (r.ok) { flash(`✓ ${d} adicionado à whitelist`); setNewDomain(""); load(); }
      else flash(`✗ ${j.error}`, false);
    } catch (e) { flash(`✗ ${e.message}`, false); }
    setLoading(false);
  };

  const remove = async (domain) => {
    if (!confirm(`Remover ${domain} da whitelist?`)) return;
    try {
      const r = await fetch(`${apiBase}/api/dns/whitelist/remove`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const j = await r.json();
      if (r.ok) { flash(`✓ ${domain} removido`); load(); }
      else flash(`✗ ${j.error}`, false);
    } catch (e) { flash(`✗ ${e.message}`, false); }
  };

  const toggleExpand = (name) => setExpanded(e => ({ ...e, [name]: !e[name] }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 700, marginBottom: 4 }}>
            Whitelist — Domínios Sempre Permitidos
          </div>
          <div style={{ fontSize: 11, color: "#475569", maxWidth: 560 }}>
            Domínios nesta lista usam <span style={{ color: "#22c55e", fontFamily: "monospace" }}>rpz-passthru</span> —
            nunca são bloqueados, mesmo que apareçam na lista de bloqueios.
            Bancos, portais gov.br, Microsoft e Google são protegidos e não podem ser removidos.
          </div>
        </div>
        <div style={{
          background: "#0b1628", border: "1px solid #1e3a5f", borderRadius: 8,
          padding: "10px 18px", textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{data?.total ?? "—"}</div>
          <div style={{ fontSize: 9, color: "#334155", letterSpacing: "0.08em" }}>DOMÍNIOS</div>
        </div>
      </div>

      {/* Adicionar domínio custom */}
      <div style={{
        background: "#0b1628", border: "1px solid #1e3a5f",
        borderRadius: 10, padding: 16, marginBottom: 24,
      }}>
        <div style={{ fontSize: 10, color: "#3b82f6", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>
          + ADICIONAR DOMÍNIO CUSTOM
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newDomain} onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="ex: sistema.prefeitura.gov.br"
            style={{
              flex: 1, background: "#07101a", border: "1px solid #1e3a5f",
              borderRadius: 6, padding: "9px 12px", color: "#e2e8f0",
              fontSize: 13, outline: "none", fontFamily: "monospace",
            }}
          />
          <button onClick={add} disabled={loading} style={{
            background: "#166534", color: "#86efac", border: "1px solid #166534",
            borderRadius: 6, padding: "9px 20px", fontWeight: 700,
            fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {loading ? "..." : "✓ LIBERAR"}
          </button>
        </div>
        {msg && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: msg.ok ? "#14532d" : "#7f1d1d",
            color: msg.ok ? "#86efac" : "#fca5a5",
            border: `1px solid ${msg.ok ? "#166534" : "#991b1b"}`,
          }}>{msg.text}</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Categorias built-in */}
        <div>
          <div style={{ fontSize: 10, color: "#334155", letterSpacing: "0.09em", marginBottom: 12 }}>
            CATEGORIAS PROTEGIDAS ({data?.categories?.length ?? 0})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(data?.categories ?? []).map(cat => {
              const isOpen = expanded[cat.name];
              const icon = CATEGORY_ICONS[cat.name] || "🌐";
              return (
                <div key={cat.name} style={{
                  background: "#0b1221", border: "1px solid #1e293b",
                  borderRadius: 8, overflow: "hidden",
                }}>
                  <div
                    onClick={() => toggleExpand(cat.name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 14px", cursor: "pointer",
                      background: isOpen ? "#0d1a2e" : "transparent",
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <span style={{ flex: 1, fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>
                      {cat.name}
                    </span>
                    <span style={{
                      fontSize: 10, color: "#22c55e", background: "#22c55e18",
                      border: "1px solid #22c55e30", borderRadius: 4,
                      padding: "1px 8px", fontWeight: 700,
                    }}>{cat.count} domínios</span>
                    <span style={{ fontSize: 10, color: "#334155", marginLeft: 6 }}>
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid #0f1e2e", padding: "10px 14px" }}>
                      {cat.domains.map(d => (
                        <div key={d} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "4px 0", borderBottom: "1px solid #080f18",
                        }}>
                          <span style={{ fontSize: 9, color: "#166534" }}>✓</span>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>
                            {d}
                          </span>
                          <span style={{ fontSize: 9, color: "#1e293b", marginLeft: "auto" }}>
                            + *.{d}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Domínios custom */}
        <div>
          <div style={{ fontSize: 10, color: "#334155", letterSpacing: "0.09em", marginBottom: 12 }}>
            DOMÍNIOS CUSTOM ({data?.custom?.length ?? 0})
          </div>
          <div style={{
            background: "#07101a", border: "1px solid #1e293b",
            borderRadius: 8, minHeight: 120,
          }}>
            {!data?.custom?.length ? (
              <div style={{ padding: 28, textAlign: "center", color: "#1e293b", fontSize: 12 }}>
                Nenhum domínio custom adicionado ainda
              </div>
            ) : data.custom.map((d, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 14px", borderBottom: "1px solid #080f18",
              }}>
                <span style={{ fontSize: 10, color: "#22c55e" }}>✓</span>
                <span style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: "#cbd5e1" }}>{d}</span>
                <button onClick={() => remove(d)} style={{
                  background: "transparent", border: "1px solid #7f1d1d",
                  color: "#f87171", borderRadius: 4, padding: "2px 8px",
                  fontSize: 10, cursor: "pointer",
                }}>REMOVER</button>
              </div>
            ))}
          </div>

          {/* Info box */}
          <div style={{
            marginTop: 14, background: "#0b1221", border: "1px solid #1e3a5f",
            borderRadius: 8, padding: 14,
          }}>
            <div style={{ fontSize: 10, color: "#3b82f6", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 700 }}>
              ℹ️ COMO FUNCIONA
            </div>
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.7 }}>
              O Unbound processa a whitelist <strong style={{ color: "#60a5fa" }}>antes</strong> da blacklist.
              Um domínio whitelisted retorna o IP real mesmo que esteja na lista de bloqueios.<br /><br />
              Use para liberar sistemas específicos que possam ser
              bloqueados acidentalmente por subdomínio.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function Proxy() {
  const [tab, setTab]             = useState("radar");
  const [dnsStatus, setDnsStatus] = useState(null);
  const API = window.location.origin;

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/dns/status`);
        if (r.ok) setDnsStatus(await r.json());
      } catch {}
    };
    check();
    const t = setInterval(check, 8000);
    return () => clearInterval(t);
  }, [API]);

  const tabs = [
    { id:"radar",      label:"RADAR" },
    { id:"regras",     label:"REGRAS" },
    { id:"whitelist",  label:"WHITELIST" },
    { id:"vip",        label:"VIP" },
    { id:"relatorios", label:"RELATÓRIOS" },
    { id:"motor",      label:"MOTOR & CONTROLE", dot: true },
  ];

  const motorOk = dnsStatus?.unbound_active;

  return (
    <div style={{
      background:"#030b18", minHeight:"100vh",
      color:"#e2e8f0", fontFamily:"'Inter',sans-serif", padding:28,
    }}>
      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:32, fontWeight:900, letterSpacing:"-0.03em", margin:0 }}>
          <span style={{ color:"#e2e8f0" }}>PROXY & </span>
          <span style={{ color:"#3b82f6" }}>LOGS</span>
        </h1>
        <p style={{ color:"#334155", fontSize:11, margin:"5px 0 0", letterSpacing:"0.12em" }}>
          CONTROLE, AUDITORIA E EMERGÊNCIAS
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:2, borderBottom:"1px solid #0f1e2e", marginBottom:24 }}>
        {tabs.map(t => {
          const active = tab===t.id;
          return (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              display:"flex", alignItems:"center", gap:7,
              padding:"9px 18px", border:"none", background:"transparent",
              borderBottom: active?"2px solid #3b82f6":"2px solid transparent",
              color: active?"#e2e8f0":"#334155",
              fontWeight: active?700:500, fontSize:12,
              letterSpacing:"0.08em", cursor:"pointer",
              transition:"all .15s", marginBottom:-1,
            }}>
              {t.label}
              {t.dot && <Dot color={motorOk?"#22c55e":"#f87171"} pulse={motorOk} />}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {tab==="radar"      && <TabRadar     apiBase={API} />}
      {tab==="regras"     && <TabRegras    apiBase={API} />}
      {tab==="whitelist"  && <TabWhitelist apiBase={API} />}
      {tab==="vip"        && <TabVip       apiBase={API} />}
      {tab==="relatorios" && (
        <div style={{ padding:48, textAlign:"center", color:"#1e293b", fontSize:13 }}>
          Relatórios — em desenvolvimento
        </div>
      )}
      {tab==="motor"      && <TabMotor apiBase={API} />}
    </div>
  );
}
