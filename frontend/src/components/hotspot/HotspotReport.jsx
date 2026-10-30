import { useState } from 'react';
import { FileSearch, Printer, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Field, Kpi, KpiRow, Notice, Panel, errorMessage, inputCls, toast } from '../ui/kit';
import { formatBytes, formatDuration } from './format';

/*
 * Relatório oficial de acessos ao Hotspot (VLAN 70): filtros, conferência do log, tabela e impressão em PDF
 * com cabeçalho e rodapé da Prefeitura. O documento impresso é o mesmo de antes.
 */

function openPrintWindow({ rows, summary, filters }) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const fromLabel = filters.from ? new Date(`${filters.from}T12:00:00`).toLocaleDateString('pt-BR') : 'Início dos registros';
  const toLabel = filters.to ? new Date(`${filters.to}T12:00:00`).toLocaleDateString('pt-BR') : 'Data atual';
  const docId = `SGCG-HS-${Date.now().toString(36).toUpperCase()}`;
  const logoUrl = `${window.location.origin}/LOGO-JACAREZINHO.png`;
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtDur = (s) => {
    if (!s || s <= 0) return '-';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
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
  if (!win) { toast('Permita janelas pop-up para gerar o PDF.', 'warning'); return; }
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Hotspot — ${docId}</title>
<style>
@page{size:A4 landscape;margin:1.2cm 1.5cm 2.2cm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;background:#fff}
.header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #003087;padding-bottom:10px;margin-bottom:10px}
.logo{width:58px;height:64px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.logo img{width:54px;height:60px;object-fit:contain}
.logo-fb{width:54px;height:60px;border:2.5px solid #003087;border-radius:8px;display:none;align-items:center;justify-content:center;font-size:7pt;color:#003087;font-weight:bold;text-align:center;line-height:1.3;padding:6px}
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
</style>
</head><body>
<div class="header">
  <div class="logo">
    <img src="${logoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
    <div class="logo-fb">PMJ<br>PARANÁ</div>
  </div>
  <div class="ht">
    <h1>Prefeitura Municipal de Jacarezinho</h1>
    <h2>Estado do Paraná</h2>
    <h3>Secretaria Municipal de Comércio, Indústria, Serviços e Inovação</h3>
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
  <td>${i + 1}</td><td>${esc(r.date_fmt ?? '-')}</td><td>${esc(r.hour_fmt ?? '-')}</td><td>${esc(r.visitor_name ?? 'N/I')}</td>
  <td>${esc(r.cpf_masked ?? '-')}</td><td>${esc(r.client_ip ?? '-')}</td><td>${esc(r.mac_address ?? '-')}</td><td>${esc(r.vlan_id ?? '-')}</td>
  <td>${esc(r.auth_method ?? '-')}</td><td>${fmtDur(r.duration_seconds)}</td><td>${esc(r.top_domain ?? '-')}</td><td>${fmtBanda(r.bytes_up, r.bytes_down)}</td>
</tr>`).join('')}
</tbody>
</table>
<div class="footer">
  <div>
    <strong>Sistema de Governança e Controle Governamental (SGCG) — Prefeitura Municipal de Jacarezinho/PR</strong><br>
    Documento gerado automaticamente em ${now}. Este relatório possui validade institucional, gerado com base nos registros do SGCG.<br>
    <em>Vedada a alteração do conteúdo. Em caso de dúvidas, consulte a Secretaria Municipal de Comércio, Indústria, Serviços e Inovação.</em>
  </div>
  <div style="text-align:right">
    <span class="docid">Nº ${docId}</span><br>
    <em>Relatório oficial validado.</em>
  </div>
</div>
<script>setTimeout(function(){window.print();},500);<\/script>
</body></html>`);
  win.document.close();
}

export default function HotspotReport({ visitors }) {
  const [filters, setFilters] = useState({ from: '', to: '', visitor_id: '', vlan_id: '' });
  const [report, setReport] = useState(null);
  const [validation, setValidation] = useState(null);
  const [working, setWorking] = useState('');
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const params = (extra = {}) => {
    const p = { ...extra };
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  };
  const run = async (key, fn) => {
    setWorking(key);
    try { await fn(); } catch (e) { toast(errorMessage(e), 'danger'); } finally { setWorking(''); }
  };
  const load = () => run('load', async () => { setReport((await api.get('/api/hotspot/report', { params: params({ page: 1, limit: 200 }) })).data); });
  const sync = () => run('sync', async () => {
    const res = await api.post('/api/hotspot/access-log/sync');
    toast(`Registro atualizado: ${res.data.inserted} acesso(s) novo(s) no log oficial.`, 'success');
    setValidation(null);
    if (report) await load();
  });
  const validate = () => run('validate', async () => { setValidation((await api.get('/api/hotspot/report/validate', { params: params() })).data); });
  const print = () => run('print', async () => {
    const res = await api.get('/api/hotspot/report', { params: params({ page: 1, limit: 1000 }) });
    openPrintWindow({ rows: res.data.rows || [], summary: res.data.summary, filters });
  });
  const vTone = validation?.status === 'valid' ? 'success' : validation?.status === 'warning' ? 'warning' : 'danger';
  const vLabel = validation?.status === 'valid' ? 'Consistente' : validation?.status === 'warning' ? 'Com avisos' : 'Inconsistente';

  return (
    <div className="space-y-4">
      <Panel title="Relatório oficial de acessos" description="Escolha o período, o visitante e a VLAN. O PDF sai com cabeçalho e rodapé da Prefeitura.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="hr-from" label="De"><input id="hr-from" type="date" className={inputCls} value={filters.from} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field id="hr-to" label="Até"><input id="hr-to" type="date" className={inputCls} value={filters.to} onChange={(e) => set({ to: e.target.value })} /></Field>
          <Field id="hr-visitor" label="Visitante">
            <select id="hr-visitor" className={inputCls} value={filters.visitor_id} onChange={(e) => set({ visitor_id: e.target.value })}>
              <option value="">Todos os visitantes</option>
              {visitors.map((v) => <option key={v.id} value={v.id}>{v.full_name} ({v.cpf})</option>)}
            </select>
          </Field>
          <Field id="hr-vlan" label="VLAN">
            <select id="hr-vlan" className={inputCls} value={filters.vlan_id} onChange={(e) => set({ vlan_id: e.target.value })}>
              <option value="">Todas as VLANs</option>
              <option value="70">VLAN 70 · Visitantes</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" icon={FileSearch} onClick={load} disabled={Boolean(working)}>{working === 'load' ? 'Consultando...' : 'Gerar relatório'}</Button>
          <Button icon={RefreshCw} onClick={sync} disabled={Boolean(working)} title="Copia para o log oficial os acessos que ainda não estão nele">{working === 'sync' ? 'Atualizando...' : 'Atualizar registro'}</Button>
          <Button icon={ShieldCheck} onClick={validate} disabled={Boolean(working)} title="Confere se o relatório tem lacunas ou dados inconsistentes">{working === 'validate' ? 'Conferindo...' : 'Conferir relatório'}</Button>
          {report ? <Button variant="ghost" icon={Printer} onClick={print} disabled={Boolean(working)}>{working === 'print' ? 'Gerando PDF...' : 'Imprimir / salvar PDF'}</Button> : null}
        </div>
      </Panel>

      {validation ? (
        <Panel title="Conferência do relatório" actions={<Badge tone={vTone}>{vLabel}</Badge>}>
          <p className="text-[13px] leading-6 text-on-surface/70">{validation.recommendation}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:max-w-sm">
            <div className="rounded-lg border border-outline p-2"><div className="text-[11px] text-on-surface/55">Sessões</div><div className="tabular text-lg font-bold">{validation.summary?.total_sessions ?? 0}</div></div>
            <div className="rounded-lg border border-danger/25 bg-danger/5 p-2"><div className="text-[11px] text-danger">Críticos</div><div className="tabular text-lg font-bold text-danger">{validation.summary?.critical ?? 0}</div></div>
            <div className="rounded-lg border border-warning/25 bg-warning/5 p-2"><div className="text-[11px] text-warning">Avisos</div><div className="tabular text-lg font-bold text-warning">{validation.summary?.warning ?? 0}</div></div>
          </div>
          <ul className="mt-3 grid gap-2 lg:grid-cols-2">
            {(validation.checks || []).map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 rounded-lg border border-outline px-3 py-2 text-[13px]">
                <span><span className="font-semibold">{c.label}</span><span className="block text-[11.5px] text-on-surface/50">{c.severity === 'critical' ? 'Impede o relatório auditável' : 'Revisão recomendada'}</span></span>
                <Badge tone={c.count ? (c.severity === 'critical' ? 'danger' : 'warning') : 'success'}>{c.count || 0}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {report ? (
        <>
          <KpiRow>
            <Kpi label="Sessões no período" value={Number(report.total || 0).toLocaleString('pt-BR')} />
            <Kpi label="Visitantes diferentes" value={report.summary?.unique_visitors || 0} />
            <Kpi label="Tempo total" value={formatDuration(Number(report.summary?.total_seconds) || 0)} />
            <Kpi label="Na tela" value={`${report.rows?.length || 0} de ${report.total || 0}`} sub="o PDF inclui todos" />
          </KpiRow>
          <Panel title="Registros de acesso" description="Log oficial do hotspot; os registros não podem ser alterados." padded={false}>
            <DataTable
              rows={report.rows || []}
              empty="Nenhum acesso para os filtros escolhidos."
              columns={[
                { key: 'd', label: 'Data', render: (r) => <span className="tabular">{r.date_fmt} {r.hour_fmt}</span> },
                { key: 'v', label: 'Visitante', render: (r) => <div><div className="font-semibold">{r.visitor_name}</div><div className="tabular text-[11.5px] text-on-surface/50">{r.cpf_masked}</div></div> },
                { key: 'ip', label: 'IP', mono: true, render: (r) => r.client_ip || '—' },
                { key: 'a', label: 'Entrada', render: (r) => r.auth_method || '—' },
                { key: 't', label: 'Duração', render: (r) => formatDuration(r.duration_seconds) },
                { key: 's', label: 'Site principal', render: (r) => <span className="text-on-surface/60">{r.top_domain || '—'}</span> },
                { key: 'b', label: 'Dados', align: 'right', render: (r) => formatBytes((Number(r.bytes_up) || 0) + (Number(r.bytes_down) || 0)) },
              ]}
            />
          </Panel>
        </>
      ) : (
        <Notice tone="primary">Escolha os filtros e clique em "Gerar relatório". Use "Atualizar registro" antes, se quiser incluir os acessos de agora.</Notice>
      )}
    </div>
  );
}
