import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Globe2,
  Lock,
  Monitor,
  RefreshCcw,
  Search,
  Shield,
  ShieldAlert,
  User,
  Wifi,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';

const API_BASE = '';

const PERIOD_OPTIONS = [
  { value: '1h',  label: 'Última hora' },
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d',  label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'custom', label: 'Personalizado' },
];

const VLAN_OPTIONS = [
  { value: '', label: 'Todas as VLANs' },
  { value: '10', label: 'VLAN 10' },
  { value: '30', label: 'VLAN 30' },
  { value: '50', label: 'VLAN 50' },
  { value: '70', label: 'VLAN 70' },
];

const ACTION_OPTIONS = [
  { value: 'all',   label: 'Todas as ações' },
  { value: 'block', label: 'Somente bloqueados' },
  { value: 'allow', label: 'Somente liberados' },
];

const AUDIT_SOURCE_OPTIONS = [
  { value: 'all',         label: 'Todas as fontes' },
  { value: 'sistema',     label: 'Sistema (API)' },
  { value: 'autenticacao', label: 'Autenticação' },
  { value: 'lgpd',        label: 'LGPD' },
  { value: 'politicas',   label: 'Políticas' },
];

const SUCCESS_OPTIONS = [
  { value: '',      label: 'Todos' },
  { value: 'true',  label: 'Somente sucesso' },
  { value: 'false', label: 'Somente falhas' },
];

const LGPD_REFS = [
  { art: 'Art. 6º, I', desc: 'Finalidade legítima' },
  { art: 'Art. 37', desc: 'Registro das operações de tratamento' },
  { art: 'Art. 46', desc: 'Medidas de segurança e prevenção' },
  { art: 'Art. 48', desc: 'Comunicação de incidentes' },
];

const fmt = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
};

const fmtBytes = (b) => {
  const n = Number(b) || 0;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n > 0) return `${n} B`;
  return '—';
};

const SummaryCard = ({ label, value, color = 'primary', icon: Icon }) => (
  <div className="flex flex-col gap-1 rounded-xl border border-outline/10 bg-surface-high p-4 shadow-sm">
    <div className="flex items-center gap-2">
      {Icon && <Icon size={14} className={`text-${color}`} />}
      <span className="text-[11px] font-medium uppercase tracking-wider text-on-surface/50">{label}</span>
    </div>
    <span className="text-2xl font-bold text-on-surface">{value ?? '—'}</span>
  </div>
);

const Pill = ({ children, color = 'gray' }) => {
  const colors = {
    red:    'bg-red-600 text-white',
    green:  'bg-emerald-600 text-white',
    blue:   'bg-blue-600 text-white',
    purple: 'bg-violet-600 text-white',
    amber:  'bg-amber-500 text-white',
    teal:   'bg-teal-600 text-white',
    gray:   'bg-zinc-500 text-white',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

const srcColor = { sistema: 'blue', autenticacao: 'purple', lgpd: 'amber', politicas: 'teal' };
const srcLabel = { sistema: 'Sistema', autenticacao: 'Autenticação', lgpd: 'LGPD', politicas: 'Políticas' };

const ACTION_LABELS = {
  login: 'Acesso ao sistema',
  login_success: 'Acesso autenticado',
  login_failed: 'Tentativa de acesso mal-sucedida',
  logout: 'Encerramento de sessão',
  refresh: 'Renovação de sessão',
  block: 'Bloqueio aplicado',
  unblock: 'Desbloqueio aplicado',
  create: 'Criação de registro',
  update: 'Atualização de registro',
  delete: 'Exclusão de registro',
  create_policy: 'Criação de política',
  update_policy: 'Atualização de política',
  delete_policy: 'Exclusão de política',
  compile_policy: 'Compilação de políticas',
  compile: 'Compilação de políticas',
  restart: 'Reinicialização de serviço',
  emergency_bypass: 'Bypass emergencial ativado',
  bypass_activate: 'Bypass emergencial ativado',
  bypass_deactivate: 'Bypass emergencial encerrado',
  antimalware_scan: 'Varredura antimalware',
  antimalware_update: 'Atualização de assinaturas antimalware',
  sporadic_exception: 'Exceção esporádica concedida',
  vip_add: 'VIP adicionado',
  vip_remove: 'VIP revogado',
  dns_flush: 'Cache DNS limpo',
  dns_zone_add: 'Zona DNS adicionada',
  dns_zone_remove: 'Zona DNS removida',
  contingency_activate: 'Contingência DNS ativada',
  contingency_deactivate: 'Contingência DNS desativada',
  ufw_rule_add: 'Regra de firewall adicionada',
  ufw_rule_delete: 'Regra de firewall removida',
  f2b_ban: 'IP banido pelo Fail2Ban',
  f2b_unban: 'IP liberado pelo Fail2Ban',
  smtp_update: 'Configuração SMTP atualizada',
  hotspot_mac_not_found: 'Hotspot sem MAC identificado',
  hotspot_mac_unknown: 'Hotspot com dispositivo não cadastrado',
  hotspot_auto_login: 'Hotspot liberado por MAC',
  hotspot_register_failed: 'Cadastro de hotspot recusado',
  hotspot_register_success: 'Cadastro de hotspot concluído',
  hotspot_login_failed: 'Login de hotspot recusado',
  hotspot_login_success: 'Login de hotspot concluído',
  hotspot_session_revoked: 'Sessão de hotspot revogada',
  hotspot_enforcement_reconciled: 'Enforcement do hotspot reconciliado',
  hotspot_visitor_create_failed: 'Criação de visitante recusada',
  hotspot_visitor_created: 'Visitante de hotspot criado',
  hotspot_visitor_update_failed: 'Atualização de visitante recusada',
  hotspot_visitor_updated: 'Visitante de hotspot atualizado',
  hotspot_visitor_deleted: 'Visitante de hotspot excluído',
};

const humanizeAction = (action) => {
  if (!action) return '—';
  const key = String(action).toLowerCase().trim();
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  // Fallback: substituir _ por espaço e capitalizar palavras
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const identityLabel = (item) => item?.identity_display_user || item?.identity_user || item?.identity?.display_user || item?.identity?.user || '';
const identityComputer = (item) => item?.identity_computer || item?.identity?.computer || '';
const IdentityBlock = ({ item }) => {
  const user = identityLabel(item);
  const computer = identityComputer(item);
  if (!user && !computer) return <span className="text-xs text-on-surface/35">sem identidade</span>;
  return (
    <div className="min-w-[150px]">
      <div className="truncate text-xs font-bold text-on-surface" title={user || computer}>{user || computer}</div>
      {computer && user !== computer ? <div className="truncate font-mono text-[10px] text-on-surface/50" title={computer}>{computer}</div> : null}
    </div>
  );
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState('navigation');

  // Navigation tab state
  const [navFilters, setNavFilters] = useState({ period: '24h', ip: '', vlan: '', domain: '', action: 'all', date_from: '', date_to: '' });
  const [navView, setNavView] = useState('events'); // 'events' | 'by_ip'
  const [navData, setNavData] = useState(null);
  const [navPage, setNavPage] = useState(1);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState(null);
  const [navPdfLoading, setNavPdfLoading] = useState(false);

  // Audit tab state
  const [auditFilters, setAuditFilters] = useState({ period: '24h', actor: '', ip: '', source: 'all', action: '', success: '', date_from: '', date_to: '' });
  const [auditData, setAuditData] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditPdfLoading, setAuditPdfLoading] = useState(false);

  const loadNav = useCallback(async (page = 1) => {
    setNavLoading(true);
    setNavError(null);
    try {
      const endpoint = navView === 'by_ip' ? '/api/reports/navigation/by-ip' : '/api/reports/navigation';
      const params = new URLSearchParams();
      Object.entries(navFilters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
      if (navView === 'events') { params.set('page', String(page)); params.set('limit', '100'); }
      const res = await api.get(`${API_BASE}${endpoint}?${params}`);
      setNavData(res.data);
      setNavPage(page);
    } catch (e) {
      setNavError(e?.response?.data?.error || e?.message || 'Erro ao carregar dados de navegação');
    } finally {
      setNavLoading(false);
    }
  }, [navFilters, navView]);

  const loadAudit = useCallback(async (page = 1) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(auditFilters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
      params.set('page', String(page));
      params.set('limit', '100');
      const res = await api.get(`${API_BASE}/api/reports/audit?${params}`);
      setAuditData(res.data);
      setAuditPage(page);
    } catch (e) {
      setAuditError(e?.response?.data?.error || e?.message || 'Erro ao carregar auditoria');
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilters]);

  useEffect(() => { if (activeTab === 'navigation') loadNav(1); }, [activeTab]);
  useEffect(() => { if (activeTab === 'audit') loadAudit(1); }, [activeTab]);

  const exportNavPdf = async () => {
    setNavPdfLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(navFilters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
      const token = localStorage.getItem('becker_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/reports/navigation/export.pdf?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-navegacao-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Erro ao gerar PDF: ' + e.message);
    } finally {
      setNavPdfLoading(false);
    }
  };

  const exportAuditPdf = async () => {
    setAuditPdfLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(auditFilters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
      const token = localStorage.getItem('becker_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/reports/audit/export.pdf?${params}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-auditoria-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Erro ao gerar PDF: ' + e.message);
    } finally {
      setAuditPdfLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-on-surface">Relatórios Forenses</h1>
        <p className="text-sm text-on-surface/60">
          Navegação de rede, auditoria de sistema e evidências institucionais para tomada de decisão.
        </p>
      </div>

      {/* LGPD Legal Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-outline/20 bg-surface-high px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-on-surface">
          <Shield size={14} className="shrink-0 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider">Fundamento Legal — Lei nº 13.709/2018 (LGPD)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {LGPD_REFS.map((r) => (
            <span key={r.art} className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium text-on-surface">
              <span className="font-bold text-primary">{r.art}</span>: {r.desc}
            </span>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-on-surface/60">
          <Lock size={10} />
          Registros imutáveis por trigger de banco de dados
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-outline/10 bg-surface-high p-1">
        {[
          { key: 'navigation', label: 'Relatório de Navegação', icon: Globe2 },
          { key: 'audit', label: 'Auditoria do Sistema', icon: ShieldAlert },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface/60 hover:text-on-surface'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── NAVIGATION TAB ──────────────────────────────────── */}
      {activeTab === 'navigation' && (
        <div className="flex flex-col gap-4">
          {/* Filter Panel */}
          <div className="rounded-xl border border-outline/10 bg-surface-high p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface/70">
              <Filter size={14} />
              Filtros de Navegação
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Período</label>
                <select
                  value={navFilters.period}
                  onChange={(e) => setNavFilters((f) => ({ ...f, period: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {navFilters.period === 'custom' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-on-surface/50">De</label>
                    <input type="datetime-local" value={navFilters.date_from}
                      onChange={(e) => setNavFilters((f) => ({ ...f, date_from: e.target.value }))}
                      className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-on-surface/50">Até</label>
                    <input type="datetime-local" value={navFilters.date_to}
                      onChange={(e) => setNavFilters((f) => ({ ...f, date_to: e.target.value }))}
                      className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface" />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">IP de Origem</label>
                <input
                  type="text" placeholder="ex: 192.168.10.5"
                  value={navFilters.ip}
                  onChange={(e) => setNavFilters((f) => ({ ...f, ip: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">VLAN</label>
                <select
                  value={navFilters.vlan}
                  onChange={(e) => setNavFilters((f) => ({ ...f, vlan: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                >
                  {VLAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Domínio consultado</label>
                <input
                  type="text" placeholder="ex: instagram.com"
                  value={navFilters.domain}
                  onChange={(e) => setNavFilters((f) => ({ ...f, domain: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Ação</label>
                <select
                  value={navFilters.action}
                  onChange={(e) => setNavFilters((f) => ({ ...f, action: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                >
                  {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => loadNav(1)}
                disabled={navLoading}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Search size={14} />
                Aplicar filtros
              </button>
              <button
                onClick={() => { setNavFilters({ period: '24h', ip: '', vlan: '', domain: '', action: 'all', date_from: '', date_to: '' }); }}
                className="rounded-lg border border-outline/20 px-4 py-2 text-sm text-on-surface/60 hover:text-on-surface"
              >
                Limpar
              </button>

              {/* View toggle */}
              <div className="ml-auto flex gap-1 rounded-lg border border-outline/10 bg-surface p-1">
                <button
                  onClick={() => { setNavView('events'); loadNav(1); }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${navView === 'events' ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface'}`}
                >
                  Por evento
                </button>
                <button
                  onClick={() => { setNavView('by_ip'); loadNav(1); }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${navView === 'by_ip' ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface'}`}
                >
                  Agrupado por IP
                </button>
              </div>

              <button
                onClick={exportNavPdf}
                disabled={navPdfLoading}
                className="flex items-center gap-2 rounded-lg border border-outline/20 px-3 py-2 text-sm font-medium text-on-surface/70 hover:border-primary/30 hover:text-primary disabled:opacity-50"
              >
                <Download size={14} />
                {navPdfLoading ? 'Gerando PDF...' : 'Exportar PDF'}
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          {navData?.summary && navView === 'events' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SummaryCard label="Total" value={Number(navData.summary.total).toLocaleString('pt-BR')} icon={Activity} />
              <SummaryCard label="Bloqueados" value={Number(navData.summary.blocked).toLocaleString('pt-BR')} color="red-500" icon={XCircle} />
              <SummaryCard label="Liberados" value={Number(navData.summary.allowed).toLocaleString('pt-BR')} color="green-500" icon={CheckCircle2} />
              <SummaryCard label="IPs únicos" value={navData.summary.unique_ips} icon={Monitor} />
              <SummaryCard label="Domínios únicos" value={navData.summary.unique_domains} icon={Globe2} />
            </div>
          )}

          {navLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-on-surface/40">
              <RefreshCcw size={16} className="animate-spin" />
              Carregando dados de navegação...
            </div>
          )}

          {navError && (
            <div className="rounded-xl border border-red-800/30 bg-red-900/10 p-4 text-sm text-red-400">
              <AlertTriangle size={14} className="mr-2 inline" />
              {navError}
            </div>
          )}

          {/* Events table */}
          {!navLoading && navView === 'events' && navData?.rows && (
            <>
              <div className="overflow-x-auto rounded-xl border border-outline/10 bg-surface-high shadow-sm">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="border-b border-outline/10 bg-surface">
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Data / Hora</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">IP Origem</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Usuário / Estação</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">VLAN</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Domínio consultado</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Tipo</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Ação</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Resposta DNS</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {navData.rows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-sm text-on-surface/40">
                          Nenhum evento encontrado para os filtros aplicados.
                        </td>
                      </tr>
                    )}
                    {navData.rows.map((ev, i) => {
                      const isBlock = Boolean(ev.blocked);
                      const isBypass = ev.action === 'bypassed';
                      return (
                        <tr key={ev.id || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                          <td className="px-3 py-2 font-mono text-xs text-on-surface/70">{fmt(ev.occurred_at)}</td>
                          <td className="px-3 py-2 font-mono text-xs font-semibold text-on-surface">{ev.client_ip || '—'}</td>
                          <td className="px-3 py-2"><IdentityBlock item={ev} /></td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-on-surface/70 border border-outline/10">
                              {ev.vlan_id ? `V${ev.vlan_id}` : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[260px]">
                            <span className="block truncate text-xs text-on-surface" title={ev.domain}>
                              {ev.domain || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-on-surface/60">{ev.query_type || '—'}</td>
                          <td className="px-3 py-2">
                            <Pill color={isBlock ? 'red' : isBypass ? 'amber' : 'green'}>
                              {isBlock ? 'BLOQUEADO' : isBypass ? 'BYPASS' : 'LIBERADO'}
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-xs text-on-surface/60">{ev.response_code || '—'}</td>
                          <td className="px-3 py-2 text-xs text-on-surface/60">{ev.category || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {navData.total > 100 && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-on-surface/50">
                    {navData.total.toLocaleString('pt-BR')} eventos totais — página {navPage} de {Math.ceil(navData.total / 100)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={navPage <= 1 || navLoading}
                      onClick={() => loadNav(navPage - 1)}
                      className="flex items-center gap-1 rounded-lg border border-outline/20 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-surface"
                    >
                      <ChevronLeft size={12} /> Anterior
                    </button>
                    <button
                      disabled={navPage >= Math.ceil(navData.total / 100) || navLoading}
                      onClick={() => loadNav(navPage + 1)}
                      className="flex items-center gap-1 rounded-lg border border-outline/20 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-surface"
                    >
                      Próxima <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* By-IP table */}
          {!navLoading && navView === 'by_ip' && navData?.rows && (
            <div className="overflow-x-auto rounded-xl border border-outline/10 bg-surface-high shadow-sm">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b border-outline/10 bg-surface">
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">IP</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Usuário / Estação</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">VLAN</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Total</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Bloqueados</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Liberados</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Domínios únicos</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Primeiro acesso</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Último acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {navData.rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-on-surface/40">
                        Nenhum cliente encontrado para os filtros aplicados.
                      </td>
                    </tr>
                  )}
                  {navData.rows.map((row, i) => (
                    <tr key={row.client_ip || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                      <td className="px-3 py-2 font-mono text-xs font-bold text-on-surface">
                        <button
                          onClick={() => {
                            setNavFilters((f) => ({ ...f, ip: row.client_ip }));
                            setNavView('events');
                          }}
                          className="hover:text-primary hover:underline"
                        >
                          {row.client_ip}
                        </button>
                      </td>
                      <td className="px-3 py-2"><IdentityBlock item={row} /></td>
                      <td className="px-3 py-2">
                        <span className="rounded-full border border-outline/10 bg-surface px-2 py-0.5 text-[10px] font-bold text-on-surface/70">
                          {String(row.vlan_id || '—').replace('VLAN', 'V')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-on-surface">{Number(row.total).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2"><Pill color="red">{Number(row.blocked).toLocaleString('pt-BR')}</Pill></td>
                      <td className="px-3 py-2"><Pill color="green">{Number(row.allowed).toLocaleString('pt-BR')}</Pill></td>
                      <td className="px-3 py-2 text-xs text-on-surface/70">{Number(row.unique_domains).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 font-mono text-xs text-on-surface/60">{fmt(row.first_seen)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-on-surface/60">{fmt(row.last_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── AUDIT TAB ───────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="flex flex-col gap-4">
          {/* Filter Panel */}
          <div className="rounded-xl border border-outline/10 bg-surface-high p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-surface/70">
              <Filter size={14} />
              Filtros de Auditoria
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Período</label>
                <select
                  value={auditFilters.period}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, period: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                >
                  {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {auditFilters.period === 'custom' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-on-surface/50">De</label>
                    <input type="datetime-local" value={auditFilters.date_from}
                      onChange={(e) => setAuditFilters((f) => ({ ...f, date_from: e.target.value }))}
                      className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-on-surface/50">Até</label>
                    <input type="datetime-local" value={auditFilters.date_to}
                      onChange={(e) => setAuditFilters((f) => ({ ...f, date_to: e.target.value }))}
                      className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface" />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Operador</label>
                <input
                  type="text" placeholder="nome ou usuário"
                  value={auditFilters.actor}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, actor: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">IP</label>
                <input
                  type="text" placeholder="ex: 192.168.10.1"
                  value={auditFilters.ip}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, ip: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Fonte</label>
                <select
                  value={auditFilters.source}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, source: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                >
                  {AUDIT_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Ação / módulo</label>
                <input
                  type="text" placeholder="ex: login, POST /api/users"
                  value={auditFilters.action}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, action: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-on-surface/50">Resultado</label>
                <select
                  value={auditFilters.success}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, success: e.target.value }))}
                  className="rounded-lg border border-outline/20 bg-surface px-2 py-1.5 text-sm text-on-surface"
                >
                  {SUCCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => loadAudit(1)}
                disabled={auditLoading}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                <Search size={14} />
                Aplicar filtros
              </button>
              <button
                onClick={() => setAuditFilters({ period: '24h', actor: '', ip: '', source: 'all', action: '', success: '', date_from: '', date_to: '' })}
                className="rounded-lg border border-outline/20 px-4 py-2 text-sm text-on-surface/60 hover:text-on-surface"
              >
                Limpar
              </button>

              <button
                onClick={exportAuditPdf}
                disabled={auditPdfLoading}
                className="ml-auto flex items-center gap-2 rounded-lg border border-outline/20 px-3 py-2 text-sm font-medium text-on-surface/70 hover:border-primary/30 hover:text-primary disabled:opacity-50"
              >
                <Download size={14} />
                {auditPdfLoading ? 'Gerando PDF...' : 'Exportar PDF'}
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          {auditData?.summary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              <SummaryCard label="Total de eventos" value={Number(auditData.summary.total).toLocaleString('pt-BR')} icon={Activity} />
              <SummaryCard label="Logins" value={auditData.summary.logins} icon={User} />
              <SummaryCard label="Sucesso" value={Number(auditData.summary.succeeded).toLocaleString('pt-BR')} color="green-500" icon={CheckCircle2} />
              <SummaryCard label="Falhas" value={Number(auditData.summary.failed).toLocaleString('pt-BR')} color="red-500" icon={XCircle} />
              <SummaryCard label="Operadores" value={auditData.summary.unique_actors} icon={Wifi} />
            </div>
          )}

          {auditLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-on-surface/40">
              <RefreshCcw size={16} className="animate-spin" />
              Carregando registros de auditoria...
            </div>
          )}

          {auditError && (
            <div className="rounded-xl border border-red-800/30 bg-red-900/10 p-4 text-sm text-red-400">
              <AlertTriangle size={14} className="mr-2 inline" />
              {auditError}
            </div>
          )}

          {!auditLoading && auditData?.rows && (
            <>
              <div className="overflow-x-auto rounded-xl border border-outline/10 bg-surface-high shadow-sm">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="border-b border-outline/10 bg-surface">
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Data / Hora</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Fonte</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Operador</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">IP</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Identidade</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">User-Agent</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Módulo / Rota</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Ação</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">HTTP</th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-sm text-on-surface/40">
                          Nenhum evento de auditoria encontrado.
                        </td>
                      </tr>
                    )}
                    {auditData.rows.map((ev, i) => {
                      const ok = Boolean(ev.success);
                      const color = srcColor[ev.source] || 'gray';
                      return (
                        <tr key={`${ev.source}-${ev.id || i}`} className="border-b border-outline/5 hover:bg-surface transition-colors">
                          <td className="px-3 py-2 font-mono text-xs text-on-surface/70">{fmt(ev.created_at)}</td>
                          <td className="px-3 py-2">
                            <Pill color={color}>{srcLabel[ev.source] || ev.source}</Pill>
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-on-surface">{ev.actor || '—'}</td>
                          <td className="px-3 py-2 font-mono text-xs text-on-surface/70">{ev.ip || '—'}</td>
                          <td className="px-3 py-2"><IdentityBlock item={ev} /></td>
                          <td className="px-3 py-2 max-w-[160px]">
                            <span className="block truncate text-[10px] text-on-surface/50" title={ev.user_agent}>
                              {ev.user_agent ? ev.user_agent.substring(0, 40) : '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[180px]">
                            <span className="block truncate text-xs text-on-surface/70" title={ev.module}>
                              {ev.module || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 max-w-[220px]">
                            <span className="block truncate text-xs text-on-surface font-medium" title={ev.action}>
                              {humanizeAction(ev.action)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-on-surface/60">{ev.status_code || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                              {ok ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                              {ok ? 'OK' : 'FALHA'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {auditData.total > 100 && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-on-surface/50">
                    {auditData.total.toLocaleString('pt-BR')} eventos totais — página {auditPage} de {Math.ceil(auditData.total / 100)}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={auditPage <= 1 || auditLoading}
                      onClick={() => loadAudit(auditPage - 1)}
                      className="flex items-center gap-1 rounded-lg border border-outline/20 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-surface"
                    >
                      <ChevronLeft size={12} /> Anterior
                    </button>
                    <button
                      disabled={auditPage >= Math.ceil(auditData.total / 100) || auditLoading}
                      onClick={() => loadAudit(auditPage + 1)}
                      className="flex items-center gap-1 rounded-lg border border-outline/20 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-surface"
                    >
                      Próxima <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="rounded-xl border border-outline/8 bg-surface-high/50 px-4 py-3 text-[11px] text-on-surface/40">
        <Lock size={10} className="mr-1.5 inline" />
        Todos os registros de auditoria são protegidos por triggers de imutabilidade no banco de dados (PostgreSQL).
        Qualquer tentativa de UPDATE ou DELETE nos logs dispara exceção com fundamento na Lei nº 13.709/2018 (LGPD), Art. 46.
        Os relatórios são gerados em tempo real a partir das fontes primárias sem intermediação.
      </div>
    </div>
  );
}
