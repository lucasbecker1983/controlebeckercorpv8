import React, { useEffect, useState } from 'react';
import {
  Activity, BarChart2, Clock, Edit3, FileText, Filter, Network, Plus,
  Printer, RefreshCw, ShieldCheck, Smartphone, Trash2, UserRound, Users, Wifi,
} from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, DialogShell, ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function dateValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ── shared UI ─────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', required = false, ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase text-on-surface/55">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="h-11 w-full rounded-2xl border border-outline/16 bg-surface-high/72 px-3 text-sm text-on-surface outline-none transition focus:border-primary/35 focus:ring-2 focus:ring-primary/20"
        {...props}
      />
    </label>
  );
}

function Metric({ label, value, icon: Icon, sub }) {
  return (
    <Surface className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase text-on-surface/55">{label}</p>
          <div className="mt-2 text-3xl font-black text-on-surface">{value}</div>
          {sub && <p className="mt-1 text-xs text-on-surface/45">{sub}</p>}
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon size={24} /></div>
      </div>
    </Surface>
  );
}

function TableShell({ title, rows, columns, empty }) {
  return (
    <Surface className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-black uppercase text-on-surface">{title}</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase text-primary">{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-outline/12 text-[10px] uppercase text-on-surface/50">
            <tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 font-black">{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-outline/10">
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className="group text-on-surface/78 transition-colors hover:bg-primary/5">
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-3">
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td className="px-3 py-8 text-center text-on-surface/45" colSpan={columns.length}>{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-2xl border border-outline/14 bg-surface-high/60 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={[
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase transition-all',
            active === tab.key
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface/60 hover:bg-primary/8 hover:text-on-surface',
          ].join(' ')}
        >
          {tab.icon && <tab.icon size={14} />}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase text-on-surface/55">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-2xl border border-outline/16 bg-surface-high/72 px-3 text-sm text-on-surface outline-none transition focus:border-primary/35 focus:ring-2 focus:ring-primary/20"
      >
        {children}
      </select>
    </label>
  );
}

// ── VisitorDialog ─────────────────────────────────────────────────────────────

function VisitorDialog({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState({ full_name: '', cpf: '', birth_date: '', password: '', active: true });

  useEffect(() => {
    if (!open) return;
    setForm(item ? {
      full_name: item.full_name || '',
      cpf: formatCpf(item.cpf_raw || item.cpf || ''),
      birth_date: dateValue(item.birth_date),
      password: '',
      active: item.active !== false,
    } : { full_name: '', cpf: '', birth_date: '', password: '', active: true });
  }, [open, item]);

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, cpf: form.cpf.replace(/\D/g, '') });
  };

  const set = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <DialogShell
      open={open}
      title={item ? 'Editar visitante' : 'Novo visitante'}
      subtitle="Cadastro institucional usado pelo portal cativo. A senha só é alterada quando preenchida na edição."
      onClose={onClose}
      size="max-w-3xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
          <ActionButton tone="primary" type="submit" form="hotspot-visitor-form" icon={item ? Edit3 : Plus} disabled={saving}>
            {saving ? 'Salvando...' : item ? 'Salvar visitante' : 'Criar visitante'}
          </ActionButton>
        </div>
      )}
    >
      <form id="hotspot-visitor-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="sm:col-span-2">
          <Field label="Nome completo" value={form.full_name} onChange={set('full_name')} required />
        </div>
        <Field label="CPF" value={form.cpf} onChange={(v) => setForm((f) => ({ ...f, cpf: formatCpf(v) }))} inputMode="numeric" required />
        <Field label="Data de nascimento" type="date" value={form.birth_date} onChange={set('birth_date')} required />
        <Field
          label={item ? 'Nova senha' : 'Senha'} type="password" value={form.password}
          onChange={set('password')} placeholder={item ? 'Deixe em branco para manter' : ''} required={!item}
        />
        <label className="flex h-11 items-center gap-3 rounded-2xl border border-outline/16 bg-surface-high/72 px-3 text-sm font-bold text-on-surface/72">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-4 w-4 rounded border-outline/30 text-primary" />
          Cadastro ativo
        </label>
      </form>
    </DialogShell>
  );
}

// ── MetricsTab ────────────────────────────────────────────────────────────────

function MetricsTab({ metrics, loading, onRefresh }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Activity className="mx-auto mb-3 animate-spin text-primary" size={28} />
          <p className="text-sm text-on-surface/55">Carregando métricas...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <Surface className="p-10 text-center">
        <BarChart2 className="mx-auto mb-3 text-on-surface/30" size={36} />
        <p className="text-sm text-on-surface/55">Clique abaixo para carregar as métricas de uso do hotspot.</p>
        <div className="mt-5">
          <ActionButton tone="primary" icon={RefreshCw} onClick={onRefresh}>Carregar Métricas</ActionButton>
        </div>
      </Surface>
    );
  }

  const { daily_users, monthly_summary, top_users, auth_methods, vlan_distribution, hourly_distribution, top_domains } = metrics;

  const last7 = (daily_users || []).slice(0, 7).reverse();
  const maxDaily = Math.max(...last7.map((d) => Number(d.unique_visitors) || 0)) || 1;

  const maxHourly = Math.max(...(hourly_distribution || []).map((d) => Number(d.count) || 0)) || 1;

  const maxUser = Number(top_users?.[0]?.sessions) || 1;

  const methodLabel = { first_register: 'Novo cadastro', cpf_password: 'CPF + Senha', mac_auto: 'Auto (MAC)', mac_confirm: 'Retorno confirmado' };
  const methodColor = ['bg-primary', 'bg-info', 'bg-orange-500'];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ActionButton tone="ghost" icon={RefreshCw} onClick={onRefresh}>Atualizar métricas</ActionButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Sessões este mês" value={monthly_summary?.total_sessions ?? 0} icon={Activity} />
        <Metric label="Usuários únicos mês" value={monthly_summary?.monthly_unique ?? 0} icon={Users} />
        <Metric label="Dias com acesso" value={monthly_summary?.active_days ?? 0} icon={Clock} />
        <Metric
          label="Top usuário" value={top_users?.[0]?.full_name?.split(' ')[0] || '-'} icon={UserRound}
          sub={top_users?.[0] ? `${top_users[0].sessions} sessões nos últimos 30 dias` : ''}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-5">
          <h3 className="mb-1 text-sm font-black uppercase text-on-surface">Usuários únicos por dia</h3>
          <p className="mb-4 text-xs text-on-surface/45">Últimos 7 dias</p>
          {last7.length ? (
            <div className="flex h-28 items-end gap-1.5">
              {last7.map((d, i) => {
                const val = Number(d.unique_visitors) || 0;
                const pct = Math.max(val > 0 ? 5 : 0, Math.round((val / maxDaily) * 100));
                const dateShort = String(d.date || '').slice(5);
                return (
                  <div key={i} className="group flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-col justify-end" style={{ height: 90 }}>
                      <div
                        className="w-full rounded-t-sm bg-primary/65 transition-all group-hover:bg-primary"
                        style={{ height: `${pct}%` }}
                        title={`${d.date}: ${val} usuário(s) único(s), ${d.sessions} sessão(ões)`}
                      />
                    </div>
                    <span className="text-[8px] text-on-surface/40">{dateShort}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-6 text-center text-xs text-on-surface/40">Sem dados nos últimos 7 dias</p>}
        </Surface>

        <Surface className="p-5">
          <h3 className="mb-1 text-sm font-black uppercase text-on-surface">Acessos por hora do dia</h3>
          <p className="mb-4 text-xs text-on-surface/45">Distribuição acumulada — últimos 30 dias</p>
          <div className="flex h-28 items-end gap-px">
            {(hourly_distribution || []).map((d, i) => {
              const val = Number(d.count) || 0;
              const pct = Math.max(val > 0 ? 4 : 0, Math.round((val / maxHourly) * 100));
              return (
                <div key={i} className="group flex flex-1 flex-col items-center">
                  <div className="flex w-full flex-col justify-end" style={{ height: 90 }}>
                    <div
                      className="w-full rounded-t-sm bg-info/60 transition-all group-hover:bg-info"
                      style={{ height: `${pct}%` }}
                      title={`${String(d.hour).padStart(2, '0')}h: ${val} sessão(ões)`}
                    />
                  </div>
                  {i % 4 === 0 && <span className="text-[7px] text-on-surface/35">{String(d.hour).padStart(2, '0')}</span>}
                </div>
              );
            })}
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="p-5">
          <h3 className="mb-4 text-sm font-black uppercase text-on-surface">Ranking de usuários — 30 dias</h3>
          {top_users?.length ? (
            <div className="space-y-3">
              {top_users.slice(0, 8).map((u, i) => {
                const pct = Math.round((Number(u.sessions) / maxUser) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-[10px] font-black text-on-surface/40">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-on-surface">{u.full_name}</span>
                        <span className="shrink-0 text-[10px] font-black text-primary">{u.sessions}x</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-primary/12">
                        <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-0.5 text-[9px] text-on-surface/40">
                        {u.cpf} · último: {u.last_seen ? new Date(u.last_seen).toLocaleDateString('pt-BR') : '-'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-6 text-center text-xs text-on-surface/40">Nenhum usuário registrado</p>}
        </Surface>

        <Surface className="p-5">
          <h3 className="mb-4 text-sm font-black uppercase text-on-surface">Métodos de autenticação</h3>
          <div className="space-y-3">
            {auth_methods?.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-on-surface">{methodLabel[m.auth_method] || m.auth_method}</span>
                    <span className="shrink-0 text-[10px] font-black text-on-surface/55">{m.count} ({m.pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-outline/15">
                    <div className={`h-full rounded-full ${methodColor[i] || 'bg-primary'}`} style={{ width: `${m.pct}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {!auth_methods?.length && <p className="py-4 text-center text-xs text-on-surface/40">Sem dados</p>}
          </div>

          <div className="mt-5 border-t border-outline/10 pt-4">
            <h4 className="mb-3 text-xs font-black uppercase text-on-surface/60">Distribuição por VLAN</h4>
            <div className="flex flex-wrap gap-2">
              {vlan_distribution?.map((v, i) => (
                <div key={i} className="rounded-xl border border-outline/14 bg-surface-variant px-3 py-2 text-xs">
                  <span className="font-black text-on-surface">VLAN {v.vlan_id}</span>
                  <span className="ml-2 text-on-surface/55">{v.count} sessões</span>
                </div>
              ))}
              {!vlan_distribution?.length && <p className="text-xs text-on-surface/40">Sem dados</p>}
            </div>
          </div>

          <div className="mt-5 border-t border-outline/10 pt-4">
            <h4 className="mb-3 text-xs font-black uppercase text-on-surface/60">Sites mais visitados (VLAN 70 — últimos 30 dias)</h4>
            {top_domains?.length ? (
              <div className="space-y-2">
                {top_domains.map((d, i) => {
                  const maxD = Number(top_domains[0]?.total) || 1;
                  const pct = Math.round((Number(d.total) / maxD) * 100);
                  return (
                    <div key={i}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-on-surface" title={d.domain}>{d.domain}</span>
                        <span className="shrink-0 text-[10px] font-black text-on-surface/55">{d.total} consultas · {d.unique_ips} IP(s)</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-outline/15">
                        <div className="h-full rounded-full bg-info/70" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-on-surface/40">Nenhuma consulta DNS registrada para a VLAN 70 no período. Verifique se o DnsRadarService está ativo.</p>
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}

// ── ReportTab ─────────────────────────────────────────────────────────────────

function ReportTab({ visitors }) {
  const [filters, setFilters] = useState({ from: '', to: '', visitor_id: '', vlan_id: '' });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [printing, setPrinting] = useState(false);

  const setFilter = (key) => (v) => setFilters((f) => ({ ...f, [key]: v }));

  const buildParams = (extra = {}) => {
    const p = { ...extra };
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (filters.visitor_id) p.visitor_id = filters.visitor_id;
    if (filters.vlan_id) p.vlan_id = filters.vlan_id;
    return p;
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/hotspot/report', { params: buildParams({ page: 1, limit: 200 }) });
      setReportData(res.data);
    } catch (err) {
      alert(err?.response?.data?.error || 'Falha ao carregar relatório.');
    } finally {
      setLoading(false);
    }
  };

  const syncLog = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/api/hotspot/access-log/sync');
      alert(`Sincronização concluída: ${res.data.inserted} registro(s) inserido(s) no log imutável.`);
      if (reportData) loadReport();
    } catch (err) {
      alert(err?.response?.data?.error || 'Falha na sincronização.');
    } finally {
      setSyncing(false);
    }
  };

  const printReport = async () => {
    setPrinting(true);
    try {
      const res = await api.get('/api/hotspot/report', { params: buildParams({ page: 1, limit: 1000 }) });
      const { rows, summary } = res.data;

      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const fromLabel = filters.from
        ? new Date(filters.from + 'T12:00:00').toLocaleDateString('pt-BR')
        : 'Início dos registros';
      const toLabel = filters.to
        ? new Date(filters.to + 'T12:00:00').toLocaleDateString('pt-BR')
        : 'Data atual';
      const docId = `SGCG-HS-${Date.now().toString(36).toUpperCase()}`;

      const fmtDur = (s) => {
        if (!s || s <= 0) return '-';
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
      };

      const fmtBanda = (up, down) => {
        const total = (Number(up) || 0) + (Number(down) || 0);
        if (total <= 0) return '-';
        if (total < 1024) return `${total} B`;
        if (total < 1048576) return `${(total / 1024).toFixed(1)} KB`;
        return `${(total / 1048576).toFixed(2)} MB`;
      };

      const win = window.open('', '_blank', 'width=1200,height=820');
      if (!win) { alert('Permita pop-ups para gerar o relatório em PDF.'); return; }

      win.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Hotspot — ${docId}</title>
<style>
@page{size:A4 landscape;margin:1.2cm 1.5cm 2.2cm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;background:#fff}
.header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #003087;padding-bottom:10px;margin-bottom:10px}
.logo{width:68px;height:68px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.logo img{max-width:68px;max-height:68px;object-fit:contain}
.logo-fb{width:66px;height:66px;border:2.5px solid #003087;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:7pt;color:#003087;font-weight:bold;text-align:center;line-height:1.3;padding:6px}
.ht h1{font-size:12.5pt;font-weight:bold;color:#003087;text-transform:uppercase;letter-spacing:.3px}
.ht h2{font-size:9pt;color:#555;margin-top:2px}
.ht h3{font-size:9pt;color:#777;margin-top:1px}
.ht h4{font-size:11pt;font-weight:bold;color:#1a1a1a;margin-top:6px;border-top:1px solid #d0d0d0;padding-top:5px;text-transform:uppercase;letter-spacing:.4px}
.meta{background:#f0f4fa;border-left:3px solid #003087;padding:6px 10px;margin-bottom:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:3px 16px}
.ml{font-size:7.5pt;color:#666;font-weight:bold;text-transform:uppercase;display:block}
.mv{font-size:9pt;font-weight:bold;color:#111}
table{width:100%;border-collapse:collapse;font-size:7.5pt}
thead th{background:#003087;color:#fff;padding:5px 5px;text-align:left;font-size:7pt;white-space:nowrap}
tbody td{padding:3px 5px;border-bottom:1px solid #e4e6ea;white-space:nowrap}
tbody tr:nth-child(even) td{background:#f7f8fa}
.footer{margin-top:14px;border-top:2px double #003087;padding-top:8px;display:flex;justify-content:space-between;align-items:flex-end;font-size:7.5pt;color:#444}
.docid{font-family:monospace;font-size:7pt;color:#888}
@media print{.noprint{display:none!important}}
</style>
</head><body>
<div class="header">
  <div class="logo">
    <img
      src="https://www.jacarezinho.pr.gov.br/uploads/siteDescricao/logoprincipal493_(107).png"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
    />
    <div class="logo-fb">PMJ<br>PARANÁ</div>
  </div>
  <div class="ht">
    <h1>Prefeitura Municipal de Jacarezinho</h1>
    <h2>Estado do Paraná</h2>
    <h3>Secretaria do Comércio, Indústria, Serviços e Inovação</h3>
    <h4>Relatório Oficial do Hotspot Institucional</h4>
    <p style="font-size:9pt;color:#555;margin:2px 0 0;">Relatório de Acesso ao Hotspot Municipal</p>
  </div>
</div>
<div class="meta">
  <div><span class="ml">Período</span><span class="mv">${fromLabel} a ${toLabel}</span></div>
  <div><span class="ml">Total de Sessões</span><span class="mv">${summary?.total_sessions ?? rows.length}</span></div>
  <div><span class="ml">Usuários Únicos</span><span class="mv">${summary?.unique_visitors ?? '-'}</span></div>
  <div><span class="ml">Emissão</span><span class="mv">${now}</span></div>
</div>
<table>
<thead><tr>
  <th>#</th><th>Data</th><th>Hora</th><th>Usuário</th><th>CPF</th>
  <th>Endereço IP</th><th>MAC</th><th>VLAN</th><th>Autenticação</th>
  <th>Duração</th><th>Site Principal</th><th>Banda</th>
</tr></thead>
<tbody>
${rows.map((r, i) => `<tr>
  <td>${i + 1}</td>
  <td>${r.date_fmt ?? '-'}</td>
  <td>${r.hour_fmt ?? '-'}</td>
  <td>${r.visitor_name ?? 'N/I'}</td>
  <td>${r.cpf_masked ?? '-'}</td>
  <td>${r.client_ip ?? '-'}</td>
  <td>${r.mac_address ?? '-'}</td>
  <td>${r.vlan_id ?? '-'}</td>
  <td>${r.auth_method ?? '-'}</td>
  <td>${fmtDur(r.duration_seconds)}</td>
  <td>${r.top_domain ?? '-'}</td>
  <td>${fmtBanda(r.bytes_up, r.bytes_down)}</td>
</tr>`).join('')}
</tbody>
</table>
<div class="footer">
  <div>
    <strong>Sistema de Governança e Controle Governamental (SGCG) — Prefeitura Municipal de Jacarezinho/PR</strong><br>
    Documento gerado automaticamente em ${now}. Este relatório possui validade institucional, gerado com base nos registros do SGCG.<br>
    <em>Vedada a alteração do conteúdo. Em caso de dúvidas, consulte a Secretaria do Comércio, Indústria, Serviços e Inovação.</em>
  </div>
  <div style="text-align:right">
    <span class="docid">Nº ${docId}</span><br>
    <em>Documento oficial sujeito à verificação.</em>
  </div>
</div>
<script>setTimeout(function(){window.print();},500);<\/script>
</body></html>`);
      win.document.close();
    } catch (err) {
      alert(err?.response?.data?.error || 'Falha ao gerar relatório para impressão.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Surface className="p-5">
        <div className="mb-5 flex items-start gap-3">
          <FileText className="mt-0.5 shrink-0 text-primary" size={20} />
          <div>
            <h2 className="text-sm font-black uppercase text-on-surface">Relatório Institucional de Acesso</h2>
            <p className="mt-1 text-xs text-on-surface/60">
              Prefeitura Municipal de Jacarezinho — Secretaria do Comércio, Indústria, Serviços e Inovação.<br />
              Selecione o período, usuário e VLAN para gerar o relatório e exportar em PDF com cabeçalho e rodapé governamental.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="De" type="date" value={filters.from} onChange={setFilter('from')} />
          <Field label="Até" type="date" value={filters.to} onChange={setFilter('to')} />
          <SelectField label="Usuário" value={filters.visitor_id} onChange={setFilter('visitor_id')}>
            <option value="">Todos os usuários</option>
            {visitors.map((v) => <option key={v.id} value={v.id}>{v.full_name} ({v.cpf})</option>)}
          </SelectField>
          <SelectField label="VLAN" value={filters.vlan_id} onChange={setFilter('vlan_id')}>
            <option value="">Todas as VLANs</option>
            <option value="70">VLAN 70 — Hotspot visitantes</option>
          </SelectField>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <ActionButton tone="primary" icon={loading ? Activity : Filter} onClick={loadReport} disabled={loading}>
            {loading ? 'Consultando...' : 'Gerar Relatório'}
          </ActionButton>
          <ActionButton tone="secondary" icon={syncing ? Activity : RefreshCw} onClick={syncLog} disabled={syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar Log'}
          </ActionButton>
          {reportData && (
            <ActionButton tone="ghost" icon={printing ? Activity : Printer} onClick={printReport} disabled={printing}>
              {printing ? 'Gerando PDF...' : 'Imprimir / Salvar PDF'}
            </ActionButton>
          )}
        </div>
      </Surface>

      {reportData && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Sessões no período" value={reportData.total} icon={Activity} />
            <Metric label="Usuários únicos" value={reportData.summary?.unique_visitors || 0} icon={Users} />
            <Metric label="Tempo total acumulado" value={formatDuration(Number(reportData.summary?.total_seconds) || 0)} icon={Clock} />
          </div>

          <Surface className="p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-black uppercase text-on-surface">Registros de Acesso</h2>
                <p className="mt-0.5 text-xs text-on-surface/50">Tabela imutável — log oficial do hotspot</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase text-primary">
                {reportData.rows?.length} / {reportData.total}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-outline/12 text-[10px] uppercase text-on-surface/50">
                  <tr>
                    {['Data', 'Hora', 'Usuário', 'CPF', 'IP', 'VLAN', 'Auth', 'Duração', 'Site', 'Banda'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-black">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline/10">
                  {reportData.rows?.length ? reportData.rows.map((row) => (
                    <tr key={row.id} className="text-on-surface/78 transition-colors hover:bg-primary/5">
                      <td className="whitespace-nowrap px-3 py-2.5">{row.date_fmt}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[10px]">{row.hour_fmt}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold">{row.visitor_name}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[10px]">{row.cpf_masked}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[10px]">{row.client_ip || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{row.vlan_id || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{row.auth_method}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{formatDuration(row.duration_seconds)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-on-surface/55">{row.top_domain || '-'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{formatBytes((Number(row.bytes_up) || 0) + (Number(row.bytes_down) || 0))}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-3 py-8 text-center text-on-surface/45" colSpan={10}>
                        Nenhum registro para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {reportData.total > (reportData.rows?.length || 0) && (
              <p className="mt-3 text-center text-xs text-on-surface/45">
                Exibindo {reportData.rows?.length} de {reportData.total} registros. O PDF incluirá todos os registros.
              </p>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Hotspot() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState({ totals: { visitors: 0, devices: 0, active_sessions: 0 }, enforcement: null, recent_sessions: [] });
  const [visitors, setVisitors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [visitorDialog, setVisitorDialog] = useState({ open: false, item: null });
  const [savingVisitor, setSavingVisitor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [overviewRes, visitorsRes, sessionsRes] = await Promise.all([
        api.get('/api/hotspot/overview'),
        api.get('/api/hotspot/visitors'),
        api.get('/api/hotspot/sessions'),
      ]);
      setOverview(overviewRes.data);
      setVisitors(visitorsRes.data?.visitors || []);
      setSessions(sessionsRes.data?.sessions || []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Falha ao carregar Hotspot.');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await api.get('/api/hotspot/metrics');
      setMetrics(res.data);
    } catch (err) {
      alert(err?.response?.data?.error || 'Falha ao carregar métricas.');
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'metrics' && !metrics) loadMetrics(); }, [tab]);

  const revoke = async (id) => {
    if (!confirm(`Revogar sessão ${id}?`)) return;
    await api.post(`/api/hotspot/sessions/${id}/revoke`);
    load();
  };

  const reconcile = async () => {
    await api.post('/api/hotspot/enforcement/reconcile');
    load();
  };

  const openVisitorEditor = async (visitor = null) => {
    if (!visitor) { setVisitorDialog({ open: true, item: null }); return; }
    const res = await api.get(`/api/hotspot/visitors/${visitor.id}`);
    setVisitorDialog({ open: true, item: res.data?.visitor || visitor });
  };

  const saveVisitor = async (payload) => {
    setSavingVisitor(true);
    try {
      if (visitorDialog.item?.id) await api.put(`/api/hotspot/visitors/${visitorDialog.item.id}`, payload);
      else await api.post('/api/hotspot/visitors', payload);
      setVisitorDialog({ open: false, item: null });
      await load();
    } catch (err) {
      alert(err?.response?.data?.error || 'Falha ao salvar visitante.');
    } finally {
      setSavingVisitor(false);
    }
  };

  const deleteVisitor = async (visitor) => {
    if (!confirm(`Excluir visitante ${visitor.full_name}? As sessões ativas serão revogadas.`)) return;
    await api.delete(`/api/hotspot/visitors/${visitor.id}`);
    load();
  };

  const TABS = [
    { key: 'overview', label: 'Visão Geral', icon: Wifi },
    { key: 'metrics', label: 'Métricas', icon: BarChart2 },
    { key: 'report', label: 'Relatório', icon: FileText },
  ];

  return (
    <div className="space-y-6 pb-12">
      <ModuleHeader
        eyebrow="Controle"
        title="Hotspot"
        description="Cadastro institucional de visitantes, métricas de uso e relatório governamental de acessos à VLAN 70."
        badges={(
          <>
            <StatusChip label="UFW principal preservado" tone="success" />
            <StatusChip label="ACL/RPZ continuam ativos" tone="primary" />
            <StatusChip label="VLAN 70 visitantes" tone="warning" />
          </>
        )}
        actions={<ActionButton tone="primary" icon={loading ? Activity : RefreshCw} onClick={load}>{loading ? 'Carregando...' : 'Recarregar'}</ActionButton>}
      />

      {error ? <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Metric label="Visitantes cadastrados" value={overview.totals.visitors} icon={UserRound} />
            <Metric label="Dispositivos associados" value={overview.totals.devices} icon={Smartphone} />
            <Metric label="Sessões ativas" value={overview.totals.active_sessions} icon={Wifi} />
          </div>

          <Surface className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <Network className="mt-0.5 shrink-0 text-primary" size={22} />
                <div>
                  <h2 className="text-sm font-black uppercase text-on-surface">Enforcement cativo VLAN 70</h2>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-on-surface/68">
                    Runtime complementar com ipset/iptables: não autenticados são mantidos no portal; autenticados seguem para as políticas UFW, DNS, ACL e RPZ existentes.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-on-surface/62">
                    <span className="rounded-lg bg-surface-variant px-2.5 py-1">Interface: {overview.enforcement?.interface || 'enp6s0.70'}</span>
                    <span className="rounded-lg bg-surface-variant px-2.5 py-1">Gateway: {overview.enforcement?.gateway_ip || '192.168.70.1'}</span>
                    <span className="rounded-lg bg-surface-variant px-2.5 py-1">IPs liberados: {overview.enforcement?.authorized_count ?? 0}</span>
                  </div>
                </div>
              </div>
              <ActionButton tone="secondary" icon={RefreshCw} onClick={reconcile}>Reconciliar</ActionButton>
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-primary" size={22} />
              <div>
                <h2 className="text-sm font-black uppercase text-on-surface">Regime operacional</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-on-surface/68">
                  O Hotspot identifica visitantes e registra sessões. Ele não remove bloqueios institucionais: a VLAN 70 permanece sujeita ao DNS interno, ACLs, RPZ e demais políticas de navegação.
                </p>
              </div>
            </div>
          </Surface>

          <TableShell
            title="Sessões recentes"
            rows={sessions}
            empty="Nenhuma sessão registrada."
            columns={[
              { key: 'full_name', label: 'Visitante', render: (row) => row.full_name || 'não identificado' },
              { key: 'cpf', label: 'CPF' },
              { key: 'mac_address', label: 'MAC', render: (row) => row.mac_address || 'não capturado' },
              { key: 'client_ip', label: 'IP' },
              { key: 'vlan_id', label: 'VLAN', render: (row) => row.vlan_id || '-' },
              { key: 'auth_method', label: 'Método' },
              { key: 'status', label: 'Estado' },
              { key: 'expires_at', label: 'Expira', render: (row) => row.expires_at ? new Date(row.expires_at).toLocaleString('pt-BR') : '-' },
              { key: 'action', label: 'Ação', render: (row) => row.status === 'active' ? <button onClick={() => revoke(row.id)} className="rounded-lg bg-danger/10 px-2 py-1 font-black uppercase text-danger">Revogar</button> : '-' },
            ]}
          />

          <TableShell
            title="Visitantes"
            rows={visitors}
            empty="Nenhum visitante cadastrado."
            columns={[
              { key: 'full_name', label: 'Nome', render: (row) => (
                <div className="flex min-w-[260px] items-center justify-between gap-3">
                  <span className="font-bold text-on-surface">{row.full_name}</span>
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button type="button" onClick={() => openVisitorEditor(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-outline/12 bg-surface-high/80 text-primary transition hover:bg-primary hover:text-on-primary">
                      <Edit3 size={14} />
                    </button>
                    <button type="button" onClick={() => deleteVisitor(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-danger/16 bg-danger/10 text-danger transition hover:bg-danger hover:text-white">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ) },
              { key: 'cpf', label: 'CPF' },
              { key: 'active', label: 'Estado', render: (row) => row.active ? 'ativo' : 'inativo' },
              { key: 'devices', label: 'Dispositivos' },
              { key: 'created_at', label: 'Cadastro', render: (row) => row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '-' },
            ]}
          />
          <div className="flex justify-end">
            <ActionButton tone="primary" icon={Plus} onClick={() => openVisitorEditor()}>Novo visitante</ActionButton>
          </div>
        </div>
      )}

      {tab === 'metrics' && (
        <MetricsTab metrics={metrics} loading={metricsLoading} onRefresh={loadMetrics} />
      )}

      {tab === 'report' && (
        <ReportTab visitors={visitors} />
      )}

      <VisitorDialog
        open={visitorDialog.open}
        item={visitorDialog.item}
        saving={savingVisitor}
        onClose={() => setVisitorDialog({ open: false, item: null })}
        onSubmit={saveVisitor}
      />
    </div>
  );
}
