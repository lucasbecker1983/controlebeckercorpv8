import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CheckCircle2, ClipboardList,
  Download, FileCheck2, KeyRound, LayoutDashboard, Lock,
  Plus, RefreshCcw, ScrollText, Search, Shield,
  ShieldAlert, UserRoundSearch, XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import {
  ActionButton, DialogShell, EmptyState, ModuleHeader,
  SegmentedTabs, StatusChip, Surface,
} from '../components/ui/primitives';

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'painel',     label: 'Painel Executivo',        icon: LayoutDashboard },
  { key: 'inventario', label: 'Inventário (Art. 37)',     icon: ClipboardList },
  { key: 'titulares',  label: 'Titulares (Art. 18)',      icon: UserRoundSearch },
  { key: 'incidentes', label: 'Incidentes (Art. 48)',     icon: AlertTriangle },
  { key: 'auditoria',  label: 'Auditoria LGPD',           icon: ScrollText },
];

const REQUEST_TYPE_OPTIONS = [
  { value: 'confirmacao',              label: 'Confirmação de tratamento' },
  { value: 'acesso',                   label: 'Acesso aos dados' },
  { value: 'correcao',                 label: 'Correção de dados' },
  { value: 'anonimizacao',             label: 'Anonimização ou bloqueio' },
  { value: 'eliminacao',               label: 'Eliminação de dados' },
  { value: 'portabilidade',            label: 'Portabilidade' },
  { value: 'informacao-compartilhamento', label: 'Informação sobre compartilhamento' },
  { value: 'revogacao-consentimento',  label: 'Revogação do consentimento' },
  { value: 'oposicao',                 label: 'Oposição' },
  { value: 'outro',                    label: 'Outro' },
];

const LGPD_REFS = [
  { art: 'Art. 18', desc: 'Direitos do titular' },
  { art: 'Art. 37', desc: 'Registro das operações de tratamento' },
  { art: 'Art. 41', desc: 'Encarregado (DPO)' },
  { art: 'Art. 48', desc: 'Comunicação de incidentes' },
];

const RISK_TONE = { baixo: 'success', medio: 'warning', alto: 'danger', critico: 'danger' };
const RISK_LABEL = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico' };
const STATUS_PA_TONE = { mapeado: 'primary', revisao: 'warning', aprovado: 'success', suspenso: 'danger' };
const STATUS_PA_LABEL = { mapeado: 'Mapeado', revisao: 'Em revisão', aprovado: 'Aprovado', suspenso: 'Suspenso' };
const STATUS_REQ_TONE = { recebido: 'neutral', 'em-analise': 'primary', atendido: 'success', indeferido: 'danger', encerrado: 'neutral' };
const STATUS_REQ_LABEL = { recebido: 'Recebido', 'em-analise': 'Em análise', atendido: 'Atendido', indeferido: 'Indeferido', encerrado: 'Encerrado' };
const STATUS_INC_TONE = { aberto: 'danger', investigacao: 'warning', contido: 'primary', comunicado: 'success', encerrado: 'neutral' };
const STATUS_INC_LABEL = { aberto: 'Aberto', investigacao: 'Em investigação', contido: 'Contido', comunicado: 'Comunicado', encerrado: 'Encerrado' };

const defaultProcessing = {
  process_name: '', purpose: '', legal_basis: '', controller_name: '',
  operator_name: '', data_categories: '', data_subject_categories: '',
  shared_with: '', storage_location: '', retention_period: '',
  security_measures: '', international_transfer: false, transfer_details: '',
  risk_level: 'medio', status: 'mapeado',
};
const defaultRequest = {
  requester_name: '', requester_email: '', requester_document: '',
  request_type: 'acesso', status: 'recebido', due_date: '',
  response_summary: '', notes: '',
};
const defaultIncident = {
  title: '', severity: 'medio', status: 'aberto', occurred_at: '',
  reported_at: '', affected_data: '', affected_subjects_estimate: 0,
  authority_notified: false, authority_notified_at: '', summary: '',
  containment_actions: '', notes: '',
};
const defaultProgram = {
  controller_name: '', controller_unit: '', controller_email: '',
  dpo_name: '', dpo_email: '', dpo_phone: '', data_subject_channel: '',
  privacy_notice_url: '', review_frequency_days: 180, last_review_at: '', notes: '',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const fmt = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
};
const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
};
const splitList = (v) => String(v || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
const joinList = (v) => (Array.isArray(v) ? v.join(', ') : '');
const rtLabel = (v) => REQUEST_TYPE_OPTIONS.find((o) => o.value === v)?.label || v || '—';

// ─── Form primitives ──────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15';

function TF({ label, value, onChange, multiline, type = 'text', placeholder = '' }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-on-surface/52">{label}</span>
      {multiline
        ? <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
        : <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />}
    </label>
  );
}
function SF({ label, value, onChange, options }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-on-surface/52">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Toggle({ label, checked, onChange, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${checked ? 'border-primary/22 bg-primary/10' : 'border-outline/16 bg-surface'}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-on-surface">{label}</div>
          {hint && <div className="mt-1 text-xs text-on-surface/58">{hint}</div>}
        </div>
        <StatusChip label={checked ? 'Sim' : 'Não'} tone={checked ? 'success' : 'neutral'} />
      </div>
    </button>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────

function ProgramDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultProgram);
  useEffect(() => {
    if (!open) return;
    setF(item ? { ...defaultProgram, ...item, last_review_at: item.last_review_at ? String(item.last_review_at).slice(0, 10) : '' } : defaultProgram);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <DialogShell open title="Estrutura institucional LGPD" subtitle="Controlador, encarregado, canal do titular e ciclo de revisão." onClose={onClose} size="max-w-5xl">
      <div className="grid gap-4 md:grid-cols-2">
        <TF label="Controlador" value={f.controller_name} onChange={set('controller_name')} />
        <TF label="Unidade responsável" value={f.controller_unit} onChange={set('controller_unit')} />
        <TF label="E-mail do controlador" value={f.controller_email} onChange={set('controller_email')} type="email" />
        <TF label="Encarregado (DPO)" value={f.dpo_name} onChange={set('dpo_name')} />
        <TF label="E-mail do DPO" value={f.dpo_email} onChange={set('dpo_email')} type="email" />
        <TF label="Telefone do DPO" value={f.dpo_phone} onChange={set('dpo_phone')} />
        <TF label="Canal do titular" value={f.data_subject_channel} onChange={set('data_subject_channel')} placeholder="Fala.BR, ouvidoria, e-mail..." />
        <TF label="Aviso de privacidade (URL)" value={f.privacy_notice_url} onChange={set('privacy_notice_url')} placeholder="https://..." />
        <TF label="Frequência de revisão (dias)" value={String(f.review_frequency_days)} onChange={(v) => set('review_frequency_days')(Number(v || 180))} type="number" />
        <TF label="Última revisão" value={f.last_review_at} onChange={set('last_review_at')} type="date" />
        <div className="md:col-span-2"><TF label="Notas institucionais" value={f.notes} onChange={set('notes')} multiline /></div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={() => onSubmit(f)} disabled={saving}>{saving ? 'Salvando...' : 'Salvar estrutura'}</ActionButton>
      </div>
    </DialogShell>
  );
}

function ProcessingDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultProcessing);
  useEffect(() => {
    if (!open) return;
    setF(item ? { ...defaultProcessing, ...item, data_categories: joinList(item.data_categories), data_subject_categories: joinList(item.data_subject_categories), shared_with: joinList(item.shared_with) } : defaultProcessing);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => onSubmit({ ...f, data_categories: splitList(f.data_categories), data_subject_categories: splitList(f.data_subject_categories), shared_with: splitList(f.shared_with) });
  return (
    <DialogShell open title={item ? 'Editar atividade de tratamento' : 'Nova atividade de tratamento'} subtitle="Inventário oficial: finalidade, base legal, categorias, compartilhamento, retenção e risco." onClose={onClose} size="max-w-5xl">
      <div className="grid gap-4 md:grid-cols-2">
        <TF label="Processo *" value={f.process_name} onChange={set('process_name')} />
        <TF label="Base legal *" value={f.legal_basis} onChange={set('legal_basis')} />
        <TF label="Controlador" value={f.controller_name} onChange={set('controller_name')} />
        <TF label="Operador" value={f.operator_name} onChange={set('operator_name')} />
        <TF label="Categorias de dados" value={f.data_categories} onChange={set('data_categories')} multiline placeholder="nome, cpf, e-mail..." />
        <TF label="Titulares afetados" value={f.data_subject_categories} onChange={set('data_subject_categories')} multiline placeholder="servidores, cidadãos..." />
        <TF label="Compartilhamento" value={f.shared_with} onChange={set('shared_with')} multiline placeholder="fornecedor, órgão..." />
        <TF label="Armazenamento" value={f.storage_location} onChange={set('storage_location')} />
        <TF label="Retenção" value={f.retention_period} onChange={set('retention_period')} />
        <SF label="Risco" value={f.risk_level} onChange={set('risk_level')} options={[{ value: 'baixo', label: 'Baixo' }, { value: 'medio', label: 'Médio' }, { value: 'alto', label: 'Alto' }, { value: 'critico', label: 'Crítico' }]} />
        <SF label="Status" value={f.status} onChange={set('status')} options={[{ value: 'mapeado', label: 'Mapeado' }, { value: 'revisao', label: 'Em revisão' }, { value: 'aprovado', label: 'Aprovado' }, { value: 'suspenso', label: 'Suspenso' }]} />
        <div className="md:col-span-2"><TF label="Finalidade *" value={f.purpose} onChange={set('purpose')} multiline /></div>
        <div className="md:col-span-2"><TF label="Medidas de segurança" value={f.security_measures} onChange={set('security_measures')} multiline /></div>
        <div className="md:col-span-2">
          <Toggle label="Transferência internacional" checked={f.international_transfer} onChange={set('international_transfer')} hint="Marque se há fluxo internacional de dados." />
          {f.international_transfer && <div className="mt-3"><TF label="Detalhes da transferência" value={f.transfer_details} onChange={set('transfer_details')} multiline /></div>}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={submit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar atividade'}</ActionButton>
      </div>
    </DialogShell>
  );
}

function RequestDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultRequest);
  useEffect(() => {
    if (!open) return;
    setF(item ? { ...defaultRequest, ...item, due_date: item.due_date ? String(item.due_date).slice(0, 10) : '' } : defaultRequest);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <DialogShell open title={item ? 'Editar solicitação' : 'Nova solicitação do titular'} subtitle="Controle formal de direitos previstos no Art. 18 da LGPD." onClose={onClose} size="max-w-4xl">
      <div className="grid gap-4 md:grid-cols-2">
        <TF label="Titular *" value={f.requester_name} onChange={set('requester_name')} />
        <TF label="E-mail" value={f.requester_email} onChange={set('requester_email')} type="email" />
        <TF label="Documento" value={f.requester_document} onChange={set('requester_document')} />
        <TF label="Prazo" value={f.due_date} onChange={set('due_date')} type="date" />
        <SF label="Tipo de direito *" value={f.request_type} onChange={set('request_type')} options={REQUEST_TYPE_OPTIONS} />
        <SF label="Status" value={f.status} onChange={set('status')} options={[
          { value: 'recebido', label: 'Recebido' }, { value: 'em-analise', label: 'Em análise' },
          { value: 'atendido', label: 'Atendido' }, { value: 'indeferido', label: 'Indeferido' }, { value: 'encerrado', label: 'Encerrado' },
        ]} />
        <div className="md:col-span-2"><TF label="Resposta resumida" value={f.response_summary} onChange={set('response_summary')} multiline /></div>
        <div className="md:col-span-2"><TF label="Observações" value={f.notes} onChange={set('notes')} multiline /></div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={() => onSubmit(f)} disabled={saving}>{saving ? 'Salvando...' : 'Salvar solicitação'}</ActionButton>
      </div>
    </DialogShell>
  );
}

function IncidentDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultIncident);
  useEffect(() => {
    if (!open) return;
    setF(item ? { ...defaultIncident, ...item, affected_data: joinList(item.affected_data), occurred_at: item.occurred_at ? String(item.occurred_at).slice(0, 16) : '', reported_at: item.reported_at ? String(item.reported_at).slice(0, 16) : '', authority_notified_at: item.authority_notified_at ? String(item.authority_notified_at).slice(0, 16) : '' } : defaultIncident);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <DialogShell open title={item ? 'Editar incidente LGPD' : 'Novo incidente LGPD'} subtitle="Registro formal: impacto, contenção e comunicação à autoridade (Art. 48)." onClose={onClose} size="max-w-5xl">
      <div className="grid gap-4 md:grid-cols-2">
        <TF label="Título *" value={f.title} onChange={set('title')} />
        <TF label="Titulares afetados (estimativa)" value={String(f.affected_subjects_estimate)} onChange={(v) => set('affected_subjects_estimate')(Number(v || 0))} type="number" />
        <SF label="Severidade" value={f.severity} onChange={set('severity')} options={[{ value: 'baixo', label: 'Baixo' }, { value: 'medio', label: 'Médio' }, { value: 'alto', label: 'Alto' }, { value: 'critico', label: 'Crítico' }]} />
        <SF label="Status" value={f.status} onChange={set('status')} options={[
          { value: 'aberto', label: 'Aberto' }, { value: 'investigacao', label: 'Em investigação' },
          { value: 'contido', label: 'Contido' }, { value: 'comunicado', label: 'Comunicado' }, { value: 'encerrado', label: 'Encerrado' },
        ]} />
        <TF label="Ocorrido em" value={f.occurred_at} onChange={set('occurred_at')} type="datetime-local" />
        <TF label="Reportado em" value={f.reported_at} onChange={set('reported_at')} type="datetime-local" />
        <div className="md:col-span-2"><TF label="Dados afetados" value={f.affected_data} onChange={set('affected_data')} multiline placeholder="cadastro, autenticação, endereço..." /></div>
        <div className="md:col-span-2"><TF label="Resumo do incidente" value={f.summary} onChange={set('summary')} multiline /></div>
        <div className="md:col-span-2"><TF label="Ações de contenção" value={f.containment_actions} onChange={set('containment_actions')} multiline /></div>
        <div className="md:col-span-2">
          <Toggle label="Autoridade comunicada (ANPD)" checked={f.authority_notified} onChange={set('authority_notified')} hint="Marque quando houver comunicação formal à ANPD ou outra autoridade." />
          {f.authority_notified && <div className="mt-3"><TF label="Data da comunicação" value={f.authority_notified_at} onChange={set('authority_notified_at')} type="datetime-local" /></div>}
        </div>
        <div className="md:col-span-2"><TF label="Observações" value={f.notes} onChange={set('notes')} multiline /></div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={() => onSubmit({ ...f, affected_data: splitList(f.affected_data) })} disabled={saving}>{saving ? 'Salvando...' : 'Salvar incidente'}</ActionButton>
      </div>
    </DialogShell>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, tone = 'primary', alert = false }) {
  const iconCls = {
    primary: 'border-primary/16 bg-primary/10 text-primary',
    danger:  'border-danger/18 bg-danger/10 text-danger',
    warning: 'border-orange-500/20 bg-orange-500/10 text-orange-600',
    success: 'border-info/18 bg-info/10 text-info',
  }[tone] || 'border-primary/16 bg-primary/10 text-primary';
  return (
    <Surface stripe={false} className="p-5">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border ${iconCls}`}>
        <Icon size={18} />
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">{label}</div>
      <div className={`mt-1 text-3xl font-black tracking-tight ${alert && Number(value) > 0 ? 'text-danger' : 'text-on-surface'}`}>{value ?? '—'}</div>
      {sub && <div className="mt-1.5 text-xs text-on-surface/55">{sub}</div>}
    </Surface>
  );
}

const TableWrap = ({ children, minW = '700px' }) => (
  <div className="overflow-x-auto rounded-xl border border-outline/10 bg-surface-high shadow-sm">
    <table className="w-full text-sm" style={{ minWidth: minW }}>
      {children}
    </table>
  </div>
);
const Th = ({ children }) => (
  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-on-surface/50">{children}</th>
);
const Td = ({ children, className = '' }) => (
  <td className={`px-3 py-2.5 ${className}`}>{children}</td>
);

function FilterBar({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline/10 bg-surface-high px-4 py-3">
      {children}
    </div>
  );
}
const filterSelectCls = 'rounded-lg border border-outline/16 bg-surface px-2.5 py-1.5 text-xs text-on-surface outline-none focus:border-primary/30';
const filterInputCls  = 'rounded-lg border border-outline/16 bg-surface px-2.5 py-1.5 text-xs text-on-surface outline-none focus:border-primary/30 min-w-[180px]';

const Spinner = () => (
  <div className="flex items-center justify-center gap-2 py-14 text-on-surface/40">
    <RefreshCcw size={16} className="animate-spin" />
    <span className="text-sm">Carregando...</span>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export default function Lgpd() {
  const [activeTab, setActiveTab] = useState('painel');
  const [audSubTab, setAudSubTab]  = useState('lgpd');

  // Filters (client-side, applied on local data)
  const [invSearch,    setInvSearch]    = useState('');
  const [invRisk,      setInvRisk]      = useState('');
  const [invStatus,    setInvStatus]    = useState('');
  const [reqSearch,    setReqSearch]    = useState('');
  const [reqType,      setReqType]      = useState('');
  const [reqStatus,    setReqStatus]    = useState('');
  const [incSeverity,  setIncSeverity]  = useState('');
  const [incStatus,    setIncStatus]    = useState('');

  // Data
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState({ program: false, processing: false, request: false, incident: false });
  const [dashboard,  setDashboard]  = useState(null);
  const [program,    setProgram]    = useState(defaultProgram);
  const [activities, setActivities] = useState([]);
  const [requests,   setRequests]   = useState([]);
  const [incidents,  setIncidents]  = useState([]);
  const [auditLogs,  setAuditLogs]  = useState([]);
  const [authEvents, setAuthEvents] = useState([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Dialogs
  const [programDialog,    setProgramDialog]    = useState(false);
  const [processingDialog, setProcessingDialog] = useState({ open: false, item: null });
  const [requestDialog,    setRequestDialog]    = useState({ open: false, item: null });
  const [incidentDialog,   setIncidentDialog]   = useState({ open: false, item: null });

  const load = async () => {
    setLoading(true);
    setError('');
    const [dR, pR, aR, rR, iR, auR, authR] = await Promise.allSettled([
      api.get('/api/lgpd/dashboard'),
      api.get('/api/lgpd/program-settings'),
      api.get('/api/lgpd/processing-activities'),
      api.get('/api/lgpd/requests'),
      api.get('/api/lgpd/incidents'),
      api.get('/api/lgpd/audit?limit=100'),
      api.get('/api/auth/activity?limit=120'),
    ]);
    if (dR.status   === 'fulfilled') setDashboard(dR.value.data || null);
    if (pR.status   === 'fulfilled') setProgram(pR.value.data ? { ...defaultProgram, ...pR.value.data } : defaultProgram);
    if (aR.status   === 'fulfilled') setActivities(Array.isArray(aR.value.data) ? aR.value.data : []);
    if (rR.status   === 'fulfilled') setRequests(Array.isArray(rR.value.data) ? rR.value.data : []);
    if (iR.status   === 'fulfilled') setIncidents(Array.isArray(iR.value.data) ? iR.value.data : []);
    if (auR.status  === 'fulfilled') setAuditLogs(Array.isArray(auR.value.data) ? auR.value.data : []);
    if (authR.status === 'fulfilled') setAuthEvents(Array.isArray(authR.value.data) ? authR.value.data : []);
    const fails = [
      dR.status   === 'rejected' ? 'painel' : null,
      pR.status   === 'rejected' ? 'programa' : null,
      aR.status   === 'rejected' ? 'inventário' : null,
      rR.status   === 'rejected' ? 'solicitações' : null,
      iR.status   === 'rejected' ? 'incidentes' : null,
    ].filter(Boolean);
    if (fails.length) setError(`Falha parcial em: ${fails.join(', ')}.`);
    setLoading(false);
  };

  useEffect(() => { load().catch(() => null); }, []);

  // Filtered datasets
  const filteredActivities = useMemo(() => activities.filter((a) => {
    if (invSearch && !String(a.process_name || '').toLowerCase().includes(invSearch.toLowerCase())) return false;
    if (invRisk   && a.risk_level !== invRisk)   return false;
    if (invStatus && a.status     !== invStatus)  return false;
    return true;
  }), [activities, invSearch, invRisk, invStatus]);

  const filteredRequests = useMemo(() => requests.filter((r) => {
    if (reqSearch && !String(r.requester_name || '').toLowerCase().includes(reqSearch.toLowerCase())) return false;
    if (reqType   && r.request_type !== reqType)   return false;
    if (reqStatus && r.status       !== reqStatus)  return false;
    return true;
  }), [requests, reqSearch, reqType, reqStatus]);

  const filteredIncidents = useMemo(() => incidents.filter((i) => {
    if (incSeverity && i.severity !== incSeverity) return false;
    if (incStatus   && i.status   !== incStatus)   return false;
    return true;
  }), [incidents, incSeverity, incStatus]);

  // Save functions
  const saveProgram = async (payload) => {
    setSaving((s) => ({ ...s, program: true }));
    try { await api.post('/api/lgpd/program-settings', payload); await load(); setProgramDialog(false); }
    finally { setSaving((s) => ({ ...s, program: false })); }
  };
  const saveProcessing = async (payload) => {
    setSaving((s) => ({ ...s, processing: true }));
    try {
      if (processingDialog.item?.id) await api.patch(`/api/lgpd/processing-activities/${processingDialog.item.id}`, payload);
      else await api.post('/api/lgpd/processing-activities', payload);
      await load(); setProcessingDialog({ open: false, item: null });
    } finally { setSaving((s) => ({ ...s, processing: false })); }
  };
  const saveRequest = async (payload) => {
    setSaving((s) => ({ ...s, request: true }));
    try {
      if (requestDialog.item?.id) await api.patch(`/api/lgpd/requests/${requestDialog.item.id}`, payload);
      else await api.post('/api/lgpd/requests', payload);
      await load(); setRequestDialog({ open: false, item: null });
    } finally { setSaving((s) => ({ ...s, request: false })); }
  };
  const saveIncident = async (payload) => {
    setSaving((s) => ({ ...s, incident: true }));
    try {
      if (incidentDialog.item?.id) await api.patch(`/api/lgpd/incidents/${incidentDialog.item.id}`, payload);
      else await api.post('/api/lgpd/incidents', payload);
      await load(); setIncidentDialog({ open: false, item: null });
    } finally { setSaving((s) => ({ ...s, incident: false })); }
  };

  const exportInventoryPdf = async () => {
    setPdfLoading(true);
    try {
      const token = localStorage.getItem('becker_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/lgpd/processing-activities/export.pdf', { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `inventario-lgpd-${new Date().toISOString().slice(0, 10)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Erro ao gerar PDF: ' + e.message); }
    finally { setPdfLoading(false); }
  };

  const s = dashboard?.summary || {};
  const highRiskList = useMemo(() => activities.filter((a) => ['alto', 'critico'].includes(a.risk_level)), [activities]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Dialogs */}
      <ProgramDialog    open={programDialog}           item={program}              saving={saving.program}    onClose={() => setProgramDialog(false)}                           onSubmit={saveProgram} />
      <ProcessingDialog open={processingDialog.open}   item={processingDialog.item} saving={saving.processing} onClose={() => setProcessingDialog({ open: false, item: null })} onSubmit={saveProcessing} />
      <RequestDialog    open={requestDialog.open}      item={requestDialog.item}   saving={saving.request}   onClose={() => setRequestDialog({ open: false, item: null })}     onSubmit={saveRequest} />
      <IncidentDialog   open={incidentDialog.open}     item={incidentDialog.item}  saving={saving.incident}  onClose={() => setIncidentDialog({ open: false, item: null })}    onSubmit={saveIncident} />

      {/* Header */}
      <ModuleHeader
        eyebrow="Governança"
        title="LGPD & Proteção de Dados"
        description="Programa institucional de proteção de dados pessoais alinhado à Lei nº 13.709/2018: inventário de tratamento, direitos do titular, incidentes e auditoria."
        badges={<>
          <StatusChip label="Art. 18 — Direitos do titular" tone="primary" />
          <StatusChip label="Art. 37 — Inventário de tratamento" tone="success" />
          <StatusChip label="Art. 41 — Encarregado (DPO)" tone="warning" />
          <StatusChip label="Art. 48 — Comunicação de incidentes" tone="danger" />
        </>}
        actions={<>
          <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => load().catch(() => null)}>Atualizar</ActionButton>
          <ActionButton tone="ghost" icon={FileCheck2} onClick={() => setProgramDialog(true)}>Estrutura LGPD</ActionButton>
        </>}
      />

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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/8 px-4 py-3 text-sm text-danger">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Tab navigation */}
      <SegmentedTabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      {/* ── PAINEL ──────────────────────────────────────────────────────────── */}
      {activeTab === 'painel' && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={ClipboardList}  label="Tratamentos mapeados"  value={s.processing?.total ?? 0}     sub={`${s.processing?.approved ?? 0} aprovados formalmente`} />
            <KpiCard icon={ShieldAlert}    label="Alto risco / Crítico"  value={s.processing?.high_risk ?? 0} sub="Exigem leitura reforçada" tone="danger" alert />
            <KpiCard icon={UserRoundSearch} label="Solicitações abertas" value={s.requests?.open ?? 0}        sub={`${s.requests?.overdue ?? 0} vencidas`} tone={s.requests?.overdue > 0 ? 'danger' : 'primary'} alert={s.requests?.overdue > 0} />
            <KpiCard icon={AlertTriangle}   label="Incidentes abertos"   value={s.incidents?.open ?? 0}       sub={`${s.incidents?.pending_notification ?? 0} sem comunicação formal`} tone="warning" alert />
          </div>

          {/* Program + Compliance */}
          <div className="grid gap-4 xl:grid-cols-3">
            {/* Program card */}
            <Surface stripe={false} className="xl:col-span-2 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/16 bg-primary/10 text-primary">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-on-surface/50">Programa Institucional LGPD</div>
                    <div className="mt-0.5 text-lg font-black text-on-surface">{program.controller_name || 'Controlador não definido'}</div>
                  </div>
                </div>
                <ActionButton tone="ghost" icon={FileCheck2} onClick={() => setProgramDialog(true)}>Editar</ActionButton>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: 'Unidade responsável', value: program.controller_unit || '—' },
                  { label: 'E-mail do controlador', value: program.controller_email || '—' },
                  { label: 'Encarregado (DPO)', value: program.dpo_name || 'Não definido' },
                  { label: 'E-mail do DPO', value: program.dpo_email || '—' },
                  { label: 'Canal do titular', value: program.data_subject_channel || '—' },
                  { label: 'Revisão programada', value: `A cada ${program.review_frequency_days || 180} dias` },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-outline/10 bg-surface p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface/45">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-on-surface">{item.value}</div>
                  </div>
                ))}
              </div>
              {program.privacy_notice_url && (
                <div className="mt-4 rounded-xl border border-primary/12 bg-primary/6 px-4 py-2.5 text-sm text-on-surface/70">
                  Aviso de privacidade:{' '}
                  <a href={program.privacy_notice_url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">
                    {program.privacy_notice_url}
                  </a>
                </div>
              )}
              {program.last_review_at && (
                <div className="mt-2 text-xs text-on-surface/45">Última revisão registrada: {fmtDate(program.last_review_at)}</div>
              )}
            </Surface>

            {/* Compliance gaps */}
            <Surface stripe={false} className="p-6">
              <div className="mb-4 text-sm font-black text-on-surface">Situação de Conformidade</div>
              <div className="space-y-3">
                {[
                  { label: 'Inventários com lacunas', value: s.processing?.missing_safeguards ?? 0, desc: 'Sem retenção, medidas ou controlador', tone: 'danger' },
                  { label: 'Solicitações vencidas', value: s.requests?.overdue ?? 0, desc: 'Demandas do titular em atraso', tone: 'danger' },
                  { label: 'Incidentes sem comunicação', value: s.incidents?.pending_notification ?? 0, desc: 'Graves e ainda não comunicados', tone: 'warning' },
                ].map((item) => (
                  <div key={item.label} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${item.value > 0 ? 'border-danger/20 bg-danger/6' : 'border-outline/12 bg-surface'}`}>
                    {item.value > 0
                      ? <XCircle size={16} className="shrink-0 text-danger" />
                      : <CheckCircle2 size={16} className="shrink-0 text-info" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-on-surface">{item.label}</div>
                      <div className="text-xs text-on-surface/55">{item.desc}</div>
                    </div>
                    <div className={`text-2xl font-black ${item.value > 0 ? 'text-danger' : 'text-info'}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          {/* Direitos do Titular summary */}
          <Surface stripe={false} className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-on-surface">Direitos do Titular — Art. 18 LGPD</div>
                <div className="mt-0.5 text-xs text-on-surface/50">Distribuição de solicitações por tipo de direito exercido</div>
              </div>
              <ActionButton tone="ghost" icon={Plus} onClick={() => { setActiveTab('titulares'); setRequestDialog({ open: true, item: null }); }}>Nova solicitação</ActionButton>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
              {[
                { key: 'confirmacao', label: 'Confirmação' },
                { key: 'acesso', label: 'Acesso' },
                { key: 'correcao', label: 'Correção' },
                { key: 'anonimizacao', label: 'Anonimização' },
                { key: 'eliminacao', label: 'Eliminação' },
                { key: 'portabilidade', label: 'Portabilidade' },
                { key: 'informacao_compartilhamento', label: 'Compartilh.' },
                { key: 'revogacao_consentimento', label: 'Revogação' },
                { key: 'oposicao', label: 'Oposição' },
              ].map((d) => (
                <div key={d.key} className="rounded-xl border border-outline/10 bg-surface p-3 text-center">
                  <div className="text-2xl font-black text-on-surface">{(s.rights || {})[d.key] ?? 0}</div>
                  <div className="mt-1 text-[10px] leading-tight text-on-surface/50">{d.label}</div>
                </div>
              ))}
            </div>
          </Surface>

          {/* High risk quick list */}
          {highRiskList.length > 0 && (
            <Surface stripe={false} className="p-6" tone="danger">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-danger">
                <ShieldAlert size={15} /> Tratamentos de Alto Risco / Crítico ({highRiskList.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {highRiskList.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-danger/20 bg-danger/8 px-3 py-1 text-xs font-semibold text-danger">
                    <StatusChip label={RISK_LABEL[a.risk_level] || a.risk_level} tone="danger" />
                    {a.process_name}
                  </span>
                ))}
              </div>
            </Surface>
          )}
        </div>
      )}

      {/* ── INVENTÁRIO ──────────────────────────────────────────────────────── */}
      {activeTab === 'inventario' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-black text-on-surface">Inventário de Operações de Tratamento</div>
              <div className="text-xs text-on-surface/50">Art. 37, Lei nº 13.709/2018 (LGPD) — registro obrigatório de finalidade, base legal, retenção e medidas de segurança</div>
            </div>
            <div className="flex gap-2">
              <ActionButton tone="ghost" icon={Download} onClick={exportInventoryPdf} disabled={pdfLoading}>
                {pdfLoading ? 'Gerando...' : 'Exportar PDF (Art. 37)'}
              </ActionButton>
              <ActionButton tone="primary" icon={Plus} onClick={() => setProcessingDialog({ open: true, item: null })}>Nova atividade</ActionButton>
            </div>
          </div>

          <FilterBar>
            <Search size={13} className="text-on-surface/40" />
            <input placeholder="Buscar processo..." value={invSearch} onChange={(e) => setInvSearch(e.target.value)} className={filterInputCls} />
            <select value={invRisk} onChange={(e) => setInvRisk(e.target.value)} className={filterSelectCls}>
              <option value="">Todos os riscos</option>
              {Object.entries(RISK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={invStatus} onChange={(e) => setInvStatus(e.target.value)} className={filterSelectCls}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_PA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="ml-auto text-xs text-on-surface/40">{filteredActivities.length} de {activities.length}</span>
          </FilterBar>

          {loading ? <Spinner /> : filteredActivities.length === 0
            ? <EmptyState icon={ClipboardList} title="Nenhuma atividade de tratamento" description="Cadastre a primeira atividade para começar o inventário formal." action={<ActionButton tone="primary" icon={Plus} onClick={() => setProcessingDialog({ open: true, item: null })}>Nova atividade</ActionButton>} />
            : (
              <TableWrap minW="860px">
                <thead>
                  <tr className="border-b border-outline/10 bg-surface">
                    <Th>Processo</Th><Th>Base Legal</Th><Th>Risco</Th><Th>Status</Th><Th>Retenção</Th><Th>Controlador</Th><Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivities.map((a, i) => (
                    <tr key={a.id || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                      <Td>
                        <div className="font-semibold text-on-surface">{a.process_name}</div>
                        {a.purpose && <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-on-surface/50" title={a.purpose}>{a.purpose}</div>}
                      </Td>
                      <Td className="max-w-[160px]">
                        <span className="block truncate text-xs text-on-surface/70" title={a.legal_basis}>{a.legal_basis || '—'}</span>
                      </Td>
                      <Td><StatusChip label={RISK_LABEL[a.risk_level] || a.risk_level || '—'} tone={RISK_TONE[a.risk_level] || 'neutral'} /></Td>
                      <Td><StatusChip label={STATUS_PA_LABEL[a.status] || a.status || '—'} tone={STATUS_PA_TONE[a.status] || 'neutral'} /></Td>
                      <Td className="text-xs text-on-surface/70">{a.retention_period || '—'}</Td>
                      <Td className="text-xs text-on-surface/70">{a.controller_name || '—'}</Td>
                      <Td><ActionButton tone="ghost" onClick={() => setProcessingDialog({ open: true, item: a })}>Editar</ActionButton></Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
        </div>
      )}

      {/* ── TITULARES ───────────────────────────────────────────────────────── */}
      {activeTab === 'titulares' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-black text-on-surface">Direitos do Titular</div>
              <div className="text-xs text-on-surface/50">Art. 18, Lei nº 13.709/2018 (LGPD) — prazo de atendimento: 15 dias úteis</div>
            </div>
            <ActionButton tone="primary" icon={Plus} onClick={() => setRequestDialog({ open: true, item: null })}>Nova solicitação</ActionButton>
          </div>

          <FilterBar>
            <Search size={13} className="text-on-surface/40" />
            <input placeholder="Buscar titular..." value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} className={filterInputCls} />
            <select value={reqType} onChange={(e) => setReqType(e.target.value)} className={filterSelectCls}>
              <option value="">Todos os tipos</option>
              {REQUEST_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={reqStatus} onChange={(e) => setReqStatus(e.target.value)} className={filterSelectCls}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_REQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="ml-auto text-xs text-on-surface/40">{filteredRequests.length} de {requests.length}</span>
          </FilterBar>

          {loading ? <Spinner /> : filteredRequests.length === 0
            ? <EmptyState icon={UserRoundSearch} title="Nenhuma solicitação cadastrada" description="Registre formalmente as solicitações dos titulares de dados pessoais." action={<ActionButton tone="primary" icon={Plus} onClick={() => setRequestDialog({ open: true, item: null })}>Nova solicitação</ActionButton>} />
            : (
              <TableWrap minW="780px">
                <thead>
                  <tr className="border-b border-outline/10 bg-surface">
                    <Th>Titular</Th><Th>Tipo de direito</Th><Th>Status</Th><Th>Prazo</Th><Th>Atualizado</Th><Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r, i) => {
                    const overdue = r.due_date && new Date(r.due_date) < new Date() && !['atendido', 'indeferido', 'encerrado'].includes(r.status);
                    return (
                      <tr key={r.id || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                        <Td>
                          <div className="font-semibold text-on-surface">{r.requester_name}</div>
                          {r.requester_email && <div className="text-[11px] text-on-surface/50">{r.requester_email}</div>}
                        </Td>
                        <Td className="text-xs text-on-surface/70">{rtLabel(r.request_type)}</Td>
                        <Td><StatusChip label={STATUS_REQ_LABEL[r.status] || r.status} tone={STATUS_REQ_TONE[r.status] || 'neutral'} /></Td>
                        <Td>
                          <span className={`text-xs font-semibold ${overdue ? 'text-danger' : 'text-on-surface/70'}`}>
                            {r.due_date ? fmtDate(r.due_date) : '—'}
                            {overdue && ' ⚠ vencido'}
                          </span>
                        </Td>
                        <Td className="text-xs text-on-surface/50">{fmt(r.updated_at)}</Td>
                        <Td><ActionButton tone="ghost" onClick={() => setRequestDialog({ open: true, item: r })}>Editar</ActionButton></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
        </div>
      )}

      {/* ── INCIDENTES ──────────────────────────────────────────────────────── */}
      {activeTab === 'incidentes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-base font-black text-on-surface">Incidentes de Proteção de Dados</div>
              <div className="text-xs text-on-surface/50">Art. 48, Lei nº 13.709/2018 (LGPD) — comunicação à ANPD obrigatória em incidentes graves</div>
            </div>
            <ActionButton tone="primary" icon={Plus} onClick={() => setIncidentDialog({ open: true, item: null })}>Novo incidente</ActionButton>
          </div>

          <FilterBar>
            <select value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} className={filterSelectCls}>
              <option value="">Toda severidade</option>
              {Object.entries(RISK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={incStatus} onChange={(e) => setIncStatus(e.target.value)} className={filterSelectCls}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_INC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="ml-auto text-xs text-on-surface/40">{filteredIncidents.length} de {incidents.length}</span>
          </FilterBar>

          {loading ? <Spinner /> : filteredIncidents.length === 0
            ? <EmptyState icon={AlertTriangle} title="Nenhum incidente registrado" description="Registre formalmente incidentes que envolvam dados pessoais, conforme Art. 48 da LGPD." action={<ActionButton tone="primary" icon={Plus} onClick={() => setIncidentDialog({ open: true, item: null })}>Novo incidente</ActionButton>} />
            : (
              <TableWrap minW="880px">
                <thead>
                  <tr className="border-b border-outline/10 bg-surface">
                    <Th>Título</Th><Th>Severidade</Th><Th>Status</Th><Th>Ocorrido em</Th><Th>Titulares</Th><Th>Autoridade</Th><Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncidents.map((inc, i) => (
                    <tr key={inc.id || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                      <Td>
                        <div className="font-semibold text-on-surface">{inc.title}</div>
                        {inc.summary && <div className="mt-0.5 max-w-[240px] truncate text-[11px] text-on-surface/50" title={inc.summary}>{inc.summary}</div>}
                      </Td>
                      <Td><StatusChip label={RISK_LABEL[inc.severity] || inc.severity} tone={RISK_TONE[inc.severity] || 'neutral'} /></Td>
                      <Td><StatusChip label={STATUS_INC_LABEL[inc.status] || inc.status} tone={STATUS_INC_TONE[inc.status] || 'neutral'} /></Td>
                      <Td className="text-xs text-on-surface/70">{inc.occurred_at ? fmt(inc.occurred_at) : '—'}</Td>
                      <Td className="text-xs font-semibold text-on-surface">{inc.affected_subjects_estimate || 0}</Td>
                      <Td>
                        {inc.authority_notified
                          ? <StatusChip label="Comunicado" tone="success" />
                          : <StatusChip label="Não comunicado" tone="neutral" />}
                      </Td>
                      <Td><ActionButton tone="ghost" onClick={() => setIncidentDialog({ open: true, item: inc })}>Editar</ActionButton></Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
        </div>
      )}

      {/* ── AUDITORIA ───────────────────────────────────────────────────────── */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {[
              { key: 'lgpd',   label: 'Alterações no módulo LGPD' },
              { key: 'acesso', label: 'Evidência de Acesso ao Sistema' },
            ].map((t) => (
              <button key={t.key} onClick={() => setAudSubTab(t.key)}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-all ${audSubTab === t.key ? 'border-primary/18 bg-primary text-on-primary' : 'border-outline/16 text-on-surface/60 hover:text-on-surface'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {audSubTab === 'lgpd' && (
            <>
              <div className="text-xs text-on-surface/50">Trilha de auditoria exclusiva do módulo LGPD — registra criação, edição e exclusão de atividades, solicitações e incidentes.</div>
              {loading ? <Spinner /> : auditLogs.length === 0
                ? <EmptyState icon={ScrollText} title="Nenhum evento de auditoria LGPD" description="As alterações feitas no módulo aparecerão aqui." />
                : (
                  <TableWrap minW="720px">
                    <thead>
                      <tr className="border-b border-outline/10 bg-surface">
                        <Th>Data / Hora</Th><Th>Tipo</Th><Th>Ação</Th><Th>Operador</Th><Th>IP</Th><Th>Resultado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((ev, i) => (
                        <tr key={ev.id || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                          <td className="px-3 py-2 font-mono text-xs text-on-surface/60">{fmt(ev.created_at)}</td>
                          <Td><StatusChip label={ev.entity_type || '—'} tone="primary" /></Td>
                          <Td className="text-xs font-medium text-on-surface">{ev.action || '—'}</Td>
                          <Td className="text-xs text-on-surface/70">{ev.actor_username || 'sistema'}</Td>
                          <Td className="font-mono text-xs text-on-surface/50">{ev.actor_ip || '—'}</Td>
                          <Td>
                            <StatusChip label={ev.success !== false ? 'Sucesso' : 'Falha'} tone={ev.success !== false ? 'success' : 'danger'} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
            </>
          )}

          {audSubTab === 'acesso' && (
            <>
              <div className="text-xs text-on-surface/50">Evidência complementar de acesso ao sistema — apoia a conformidade com o Art. 46 (medidas de segurança e rastreabilidade).</div>
              {loading ? <Spinner /> : authEvents.length === 0
                ? <EmptyState icon={KeyRound} title="Nenhum evento de acesso registrado" description="Os acessos ao sistema aparecerão aqui conforme são realizados." />
                : (
                  <TableWrap minW="760px">
                    <thead>
                      <tr className="border-b border-outline/10 bg-surface">
                        <Th>Data / Hora</Th><Th>Usuário</Th><Th>Ação</Th><Th>IP</Th><Th>Rota</Th><Th>Resultado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {authEvents.map((ev, i) => (
                        <tr key={ev.id || i} className="border-b border-outline/5 hover:bg-surface transition-colors">
                          <td className="px-3 py-2 font-mono text-xs text-on-surface/60">{fmt(ev.created_at)}</td>
                          <Td className="text-xs font-semibold text-on-surface">{ev.username || 'anônimo'}</Td>
                          <Td className="text-xs text-on-surface/70">{ev.action || '—'}</Td>
                          <Td className="font-mono text-xs text-on-surface/50">{ev.ip_address || '—'}</Td>
                          <Td className="max-w-[180px]">
                            <span className="block truncate text-xs text-on-surface/50" title={ev.route}>{ev.route || '—'}</span>
                          </Td>
                          <Td>
                            <StatusChip label={ev.success ? 'Autorizado' : 'Recusado'} tone={ev.success ? 'success' : 'danger'} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
