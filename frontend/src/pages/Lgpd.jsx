import { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Download, FileCheck2, KeyRound,
  LayoutDashboard, Plus, RefreshCw, ScrollText, Search, Shield, ShieldAlert, UserRoundSearch, XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, DataTable, Drawer, Field, Kpi, KpiRow, Notice, PageHeader, Panel, Switch, Tabs, errorMessage, inputCls, toast, useUrlTab } from '../components/ui/kit';

/*
 * Proteção de dados (LGPD): painel de gestão, inventário de tratamentos (Art. 37), pedidos de titulares (Art. 18),
 * incidentes (Art. 48) e evidências de auditoria. Os cadastros abrem em uma gaveta lateral.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'painel',     label: 'Painel de Gestão',      icon: LayoutDashboard },
  { key: 'inventario', label: 'Dados sob Responsabilidade', icon: ClipboardList },
  { key: 'titulares',  label: 'Pedidos de Pessoas',    icon: UserRoundSearch },
  { key: 'incidentes', label: 'Incidentes e Riscos',   icon: AlertTriangle },
  { key: 'auditoria',  label: 'Evidências e Auditoria', icon: ScrollText },
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
const PRIVACY_NOTICE_URL = '/aviso-de-privacidade';

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
  privacy_notice_url: PRIVACY_NOTICE_URL, review_frequency_days: 180, last_review_at: '', notes: '',
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
const num = (v) => Number(v || 0) || 0;

const ENTITY_LABELS = {
  processing: 'Dados sob responsabilidade',
  request: 'Pedido de pessoa',
  incident: 'Incidente ou risco',
  program: 'Estrutura de governança',
  domain_policy: 'Política institucional',
};

const ACTION_LABELS = {
  create: { label: 'Registro criado', description: 'Um novo controle foi incluído no módulo.' },
  update: { label: 'Registro atualizado', description: 'Informações existentes foram revisadas.' },
  delete: { label: 'Registro removido', description: 'Um registro foi retirado da gestão ativa.' },
  'program.update': { label: 'Estrutura institucional atualizada', description: 'Dados do controlador, encarregado ou canal de atendimento foram alterados.' },
};

const AUTH_ACTION_LABELS = {
  'auth.login': 'Entrada no sistema',
  'auth.logout': 'Saída do sistema',
  login: 'Entrada no sistema',
  logout: 'Saída do sistema',
  refresh: 'Renovação de sessão',
};

function auditTypeLabel(value) {
  return ENTITY_LABELS[value] || String(value || 'Registro do sistema').replace(/[_-]+/g, ' ');
}

function auditActionInfo(action, entityType) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const fallback = String(action || '').replace(/[_-]+/g, ' ');
  if (action === 'create') return { label: 'Registro criado', description: `Novo item em ${auditTypeLabel(entityType)}.` };
  if (action === 'update') return { label: 'Registro atualizado', description: `Item de ${auditTypeLabel(entityType)} revisado.` };
  return { label: fallback || 'Ação registrada', description: 'Evento preservado para conferência institucional.' };
}

function authActionLabel(action) {
  return AUTH_ACTION_LABELS[action] || String(action || 'Evento de acesso').replace(/[_-]+/g, ' ');
}

// ─── Formulários ──────────────────────────────────────────────────────────────

function TF({ label, value, onChange, multiline, type = 'text', placeholder = '', hint }) {
  const id = useId();
  return (
    <Field id={id} label={label} hint={hint}>
      {multiline
        ? <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
        : <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />}
    </Field>
  );
}

function SF({ label, value, onChange, options }) {
  const id = useId();
  return (
    <Field id={id} label={label}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-outline px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-on-surface">{label}</div>
        {hint ? <div className="text-[12px] text-on-surface/55">{hint}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

const RISK_OPTIONS = [{ value: 'baixo', label: 'Baixo' }, { value: 'medio', label: 'Médio' }, { value: 'alto', label: 'Alto' }, { value: 'critico', label: 'Crítico' }];
const PA_STATUS_OPTIONS = [{ value: 'mapeado', label: 'Mapeado' }, { value: 'revisao', label: 'Em revisão' }, { value: 'aprovado', label: 'Aprovado' }, { value: 'suspenso', label: 'Suspenso' }];
const REQ_STATUS_OPTIONS = [{ value: 'recebido', label: 'Recebido' }, { value: 'em-analise', label: 'Em análise' }, { value: 'atendido', label: 'Atendido' }, { value: 'indeferido', label: 'Indeferido' }, { value: 'encerrado', label: 'Encerrado' }];
const INC_STATUS_OPTIONS = [{ value: 'aberto', label: 'Aberto' }, { value: 'investigacao', label: 'Em investigação' }, { value: 'contido', label: 'Contido' }, { value: 'comunicado', label: 'Comunicado' }, { value: 'encerrado', label: 'Encerrado' }];

// Gaveta padrão dos cadastros: cabeçalho, corpo rolável e rodapé com Cancelar/Salvar.
function FormDrawer({ open, title, description, saving, error, submitLabel, onClose, onSubmit, children }) {
  return (
    <Drawer
      open={open}
      busy={saving}
      onClose={onClose}
      title={title}
      description={description}
      width="max-w-3xl"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={onSubmit} disabled={saving}>{saving ? 'Salvando…' : submitLabel}</Button>
        </>
      )}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </Drawer>
  );
}
const Full = ({ children }) => <div className="md:col-span-2">{children}</div>;

// ─── Gavetas de cadastro ──────────────────────────────────────────────────────

function ProgramDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultProgram);
  useEffect(() => {
    if (!open) return;
    setF(item
      ? {
          ...defaultProgram,
          ...item,
          privacy_notice_url: item.privacy_notice_url || PRIVACY_NOTICE_URL,
          last_review_at: item.last_review_at ? String(item.last_review_at).slice(0, 10) : '',
        }
      : defaultProgram);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <FormDrawer open title="Estrutura institucional LGPD" description="Controlador, encarregado, canal do titular e ciclo de revisão." saving={saving} submitLabel="Salvar estrutura" onClose={onClose} onSubmit={() => onSubmit(f)}>
      <TF label="Controlador" value={f.controller_name} onChange={set('controller_name')} />
      <TF label="Unidade responsável" value={f.controller_unit} onChange={set('controller_unit')} />
      <TF label="E-mail do controlador" value={f.controller_email} onChange={set('controller_email')} type="email" />
      <TF label="Encarregado (DPO)" value={f.dpo_name} onChange={set('dpo_name')} />
      <TF label="E-mail do DPO" value={f.dpo_email} onChange={set('dpo_email')} type="email" />
      <TF label="Telefone do DPO" value={f.dpo_phone} onChange={set('dpo_phone')} />
      <TF label="Canal do titular" value={f.data_subject_channel} onChange={set('data_subject_channel')} placeholder="Fala.BR, ouvidoria, e-mail…" />
      <TF label="Aviso de privacidade (URL)" value={f.privacy_notice_url} onChange={set('privacy_notice_url')} placeholder="https://…" />
      <TF label="Frequência de revisão (dias)" value={String(f.review_frequency_days)} onChange={(v) => set('review_frequency_days')(Number(v || 180))} type="number" />
      <TF label="Última revisão" value={f.last_review_at} onChange={set('last_review_at')} type="date" />
      <Full><TF label="Notas institucionais" value={f.notes} onChange={set('notes')} multiline /></Full>
    </FormDrawer>
  );
}

function ProcessingDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultProcessing);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(item ? { ...defaultProcessing, ...item, data_categories: joinList(item.data_categories), data_subject_categories: joinList(item.data_subject_categories), shared_with: joinList(item.shared_with) } : defaultProcessing);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.process_name.trim() || !f.legal_basis.trim() || !f.purpose.trim()) return setError('Preencha processo, base legal e finalidade.');
    setError('');
    return onSubmit({ ...f, data_categories: splitList(f.data_categories), data_subject_categories: splitList(f.data_subject_categories), shared_with: splitList(f.shared_with) });
  };
  return (
    <FormDrawer open title={item ? 'Editar atividade de tratamento' : 'Nova atividade de tratamento'} description="Inventário oficial: finalidade, base legal, categorias, compartilhamento, retenção e risco." saving={saving} error={error} submitLabel="Salvar atividade" onClose={onClose} onSubmit={submit}>
      <TF label="Processo *" value={f.process_name} onChange={set('process_name')} />
      <TF label="Base legal *" value={f.legal_basis} onChange={set('legal_basis')} />
      <TF label="Controlador" value={f.controller_name} onChange={set('controller_name')} />
      <TF label="Operador" value={f.operator_name} onChange={set('operator_name')} />
      <TF label="Categorias de dados" value={f.data_categories} onChange={set('data_categories')} multiline placeholder="nome, cpf, e-mail…" hint="Separe por vírgula." />
      <TF label="Titulares afetados" value={f.data_subject_categories} onChange={set('data_subject_categories')} multiline placeholder="servidores, cidadãos…" hint="Separe por vírgula." />
      <TF label="Compartilhamento" value={f.shared_with} onChange={set('shared_with')} multiline placeholder="fornecedor, órgão…" hint="Separe por vírgula." />
      <TF label="Armazenamento" value={f.storage_location} onChange={set('storage_location')} />
      <TF label="Retenção" value={f.retention_period} onChange={set('retention_period')} />
      <SF label="Risco" value={f.risk_level} onChange={set('risk_level')} options={RISK_OPTIONS} />
      <SF label="Status" value={f.status} onChange={set('status')} options={PA_STATUS_OPTIONS} />
      <Full><TF label="Finalidade *" value={f.purpose} onChange={set('purpose')} multiline /></Full>
      <Full><TF label="Medidas de segurança" value={f.security_measures} onChange={set('security_measures')} multiline /></Full>
      <Full>
        <ToggleRow label="Transferência internacional" checked={f.international_transfer} onChange={set('international_transfer')} hint="Ligue se há fluxo internacional de dados." />
        {f.international_transfer ? <div className="mt-3"><TF label="Detalhes da transferência" value={f.transfer_details} onChange={set('transfer_details')} multiline /></div> : null}
      </Full>
    </FormDrawer>
  );
}

function RequestDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultRequest);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(item ? { ...defaultRequest, ...item, due_date: item.due_date ? String(item.due_date).slice(0, 10) : '' } : defaultRequest);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.requester_name.trim()) return setError('Informe o nome do titular.');
    setError('');
    return onSubmit(f);
  };
  return (
    <FormDrawer open title={item ? 'Editar solicitação' : 'Nova solicitação do titular'} description="Controle formal de direitos previstos no Art. 18 da LGPD." saving={saving} error={error} submitLabel="Salvar solicitação" onClose={onClose} onSubmit={submit}>
      <TF label="Titular *" value={f.requester_name} onChange={set('requester_name')} />
      <TF label="E-mail" value={f.requester_email} onChange={set('requester_email')} type="email" />
      <TF label="Documento" value={f.requester_document} onChange={set('requester_document')} />
      <TF label="Prazo" value={f.due_date} onChange={set('due_date')} type="date" />
      <SF label="Tipo de direito *" value={f.request_type} onChange={set('request_type')} options={REQUEST_TYPE_OPTIONS} />
      <SF label="Status" value={f.status} onChange={set('status')} options={REQ_STATUS_OPTIONS} />
      <Full><TF label="Resposta resumida" value={f.response_summary} onChange={set('response_summary')} multiline /></Full>
      <Full><TF label="Observações" value={f.notes} onChange={set('notes')} multiline /></Full>
    </FormDrawer>
  );
}

function IncidentDialog({ open, item, saving, onClose, onSubmit }) {
  const [f, setF] = useState(defaultIncident);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(item ? { ...defaultIncident, ...item, affected_data: joinList(item.affected_data), occurred_at: item.occurred_at ? String(item.occurred_at).slice(0, 16) : '', reported_at: item.reported_at ? String(item.reported_at).slice(0, 16) : '', authority_notified_at: item.authority_notified_at ? String(item.authority_notified_at).slice(0, 16) : '' } : defaultIncident);
  }, [open, item]);
  if (!open) return null;
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => {
    if (!f.title.trim()) return setError('Informe o título do incidente.');
    setError('');
    return onSubmit({ ...f, affected_data: splitList(f.affected_data) });
  };
  return (
    <FormDrawer open title={item ? 'Editar incidente LGPD' : 'Novo incidente LGPD'} description="Registro formal: impacto, contenção e comunicação à autoridade (Art. 48)." saving={saving} error={error} submitLabel="Salvar incidente" onClose={onClose} onSubmit={submit}>
      <TF label="Título *" value={f.title} onChange={set('title')} />
      <TF label="Titulares afetados (estimativa)" value={String(f.affected_subjects_estimate)} onChange={(v) => set('affected_subjects_estimate')(Number(v || 0))} type="number" />
      <SF label="Severidade" value={f.severity} onChange={set('severity')} options={RISK_OPTIONS} />
      <SF label="Status" value={f.status} onChange={set('status')} options={INC_STATUS_OPTIONS} />
      <TF label="Ocorrido em" value={f.occurred_at} onChange={set('occurred_at')} type="datetime-local" />
      <TF label="Reportado em" value={f.reported_at} onChange={set('reported_at')} type="datetime-local" />
      <Full><TF label="Dados afetados" value={f.affected_data} onChange={set('affected_data')} multiline placeholder="cadastro, autenticação, endereço…" hint="Separe por vírgula." /></Full>
      <Full><TF label="Resumo do incidente" value={f.summary} onChange={set('summary')} multiline /></Full>
      <Full><TF label="Ações de contenção" value={f.containment_actions} onChange={set('containment_actions')} multiline /></Full>
      <Full>
        <ToggleRow label="Autoridade comunicada (ANPD)" checked={f.authority_notified} onChange={set('authority_notified')} hint="Ligue quando houver comunicação formal à ANPD ou outra autoridade." />
        {f.authority_notified ? <div className="mt-3"><TF label="Data da comunicação" value={f.authority_notified_at} onChange={set('authority_notified_at')} type="datetime-local" /></div> : null}
      </Full>
      <Full><TF label="Observações" value={f.notes} onChange={set('notes')} multiline /></Full>
    </FormDrawer>
  );
}

// ─── Peças de tela ────────────────────────────────────────────────────────────

const filterCls = `${inputCls} sm:!w-auto sm:min-w-[170px]`;

function FilterBar({ count, total, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-outline px-4 py-3">
      {children}
      <span className="tabular ml-auto text-[12px] text-on-surface/50">{count} de {total}</span>
    </div>
  );
}

const fillerNote = (loading, empty) => (loading ? 'Carregando…' : empty);

export default function Lgpd() {
  const [activeTab, setActiveTab] = useUrlTab(TABS, 'painel');
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

  // Salvar: avisa o resultado e só fecha a gaveta se deu certo (antes um erro do servidor não aparecia).
  const persist = async (kind, request, done, okMessage) => {
    setSaving((s) => ({ ...s, [kind]: true }));
    try {
      await request();
      await load();
      done();
      toast(okMessage);
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível salvar. Confira os campos e tente de novo.'), 'danger');
    } finally {
      setSaving((s) => ({ ...s, [kind]: false }));
    }
  };
  const saveProgram = (payload) => persist('program', () => api.post('/api/lgpd/program-settings', payload), () => setProgramDialog(false), 'Estrutura institucional salva.');
  const saveProcessing = (payload) => persist(
    'processing',
    () => (processingDialog.item?.id ? api.patch(`/api/lgpd/processing-activities/${processingDialog.item.id}`, payload) : api.post('/api/lgpd/processing-activities', payload)),
    () => setProcessingDialog({ open: false, item: null }),
    'Atividade de tratamento salva.',
  );
  const saveRequest = (payload) => persist(
    'request',
    () => (requestDialog.item?.id ? api.patch(`/api/lgpd/requests/${requestDialog.item.id}`, payload) : api.post('/api/lgpd/requests', payload)),
    () => setRequestDialog({ open: false, item: null }),
    'Solicitação salva.',
  );
  const saveIncident = (payload) => persist(
    'incident',
    () => (incidentDialog.item?.id ? api.patch(`/api/lgpd/incidents/${incidentDialog.item.id}`, payload) : api.post('/api/lgpd/incidents', payload)),
    () => setIncidentDialog({ open: false, item: null }),
    'Incidente salvo.',
  );

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
    } catch (e) { toast(`Não foi possível gerar o PDF: ${e.message}`, 'danger'); }
    finally { setPdfLoading(false); }
  };

  const localSummary = useMemo(() => {
    const openRequestStatuses = ['recebido', 'em-analise'];
    const closedRequestStatuses = ['atendido', 'indeferido', 'encerrado'];
    const today = new Date();
    const rights = requests.reduce((acc, item) => {
      const key = String(item.request_type || '').replace(/-/g, '_');
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      processing: {
        total: activities.length,
        approved: activities.filter((item) => item.status === 'aprovado').length,
        high_risk: activities.filter((item) => ['alto', 'critico'].includes(item.risk_level)).length,
        transfers: activities.filter((item) => item.international_transfer === true).length,
        missing_safeguards: activities.filter((item) => !item.retention_period || !item.security_measures || !item.controller_name).length,
      },
      requests: {
        total: requests.length,
        open: requests.filter((item) => openRequestStatuses.includes(item.status)).length,
        overdue: requests.filter((item) => item.due_date && new Date(item.due_date) < today && !closedRequestStatuses.includes(item.status)).length,
      },
      incidents: {
        total: incidents.length,
        open: incidents.filter((item) => item.status !== 'encerrado').length,
        notified: incidents.filter((item) => item.authority_notified === true).length,
        pending_notification: incidents.filter((item) => item.status !== 'encerrado' && ['alto', 'critico'].includes(item.severity) && item.authority_notified !== true).length,
      },
      rights,
    };
  }, [activities, requests, incidents]);

  const mergeSummary = (server = {}, local = {}) => {
    const keys = new Set([...Object.keys(server || {}), ...Object.keys(local || {})]);
    return Array.from(keys).reduce((acc, key) => {
      acc[key] = Math.max(num(server?.[key]), num(local?.[key]));
      return acc;
    }, {});
  };

  const serverSummary = dashboard?.summary || {};
  const s = {
    processing: mergeSummary(serverSummary.processing, localSummary.processing),
    requests: mergeSummary(serverSummary.requests, localSummary.requests),
    incidents: mergeSummary(serverSummary.incidents, localSummary.incidents),
    auth: serverSummary.auth || {},
    rights: mergeSummary(serverSummary.rights, localSummary.rights),
  };
  const hasGovernanceData = num(s.processing.total) + num(s.requests.total) + num(s.incidents.total) > 0;
  const highRiskList = useMemo(() => activities.filter((a) => ['alto', 'critico'].includes(a.risk_level)), [activities]);
  const privacyNoticeUrl = program.privacy_notice_url || PRIVACY_NOTICE_URL;

  // ─── Colunas das tabelas ───────────────────────────────────────────────────
  const inventoryColumns = [
    { key: 'process_name', label: 'Processo', render: (a) => (
      <div className="min-w-[200px]">
        <div className="font-semibold text-on-surface">{a.process_name}</div>
        {a.purpose ? <div className="mt-0.5 max-w-[320px] truncate text-[12px] text-on-surface/55" title={a.purpose}>{a.purpose}</div> : null}
      </div>
    ) },
    { key: 'legal_basis', label: 'Base legal', render: (a) => <span className="block max-w-[180px] truncate text-on-surface/75" title={a.legal_basis}>{a.legal_basis || '—'}</span> },
    { key: 'risk_level', label: 'Risco', render: (a) => <Badge tone={RISK_TONE[a.risk_level] || 'neutral'}>{RISK_LABEL[a.risk_level] || a.risk_level || '—'}</Badge> },
    { key: 'status', label: 'Status', render: (a) => <Badge tone={STATUS_PA_TONE[a.status] || 'neutral'} dot>{STATUS_PA_LABEL[a.status] || a.status || '—'}</Badge> },
    { key: 'retention_period', label: 'Retenção', render: (a) => a.retention_period || '—' },
    { key: 'controller_name', label: 'Controlador', render: (a) => a.controller_name || '—' },
    { key: 'actions', label: '', align: 'right', render: (a) => <Button variant="ghost" onClick={() => setProcessingDialog({ open: true, item: a })}>Editar</Button> },
  ];

  const requestColumns = [
    { key: 'requester_name', label: 'Titular', render: (r) => (
      <div className="min-w-[180px]">
        <div className="font-semibold text-on-surface">{r.requester_name}</div>
        {r.requester_email ? <div className="text-[12px] text-on-surface/55">{r.requester_email}</div> : null}
      </div>
    ) },
    { key: 'request_type', label: 'Tipo de direito', render: (r) => rtLabel(r.request_type) },
    { key: 'status', label: 'Status', render: (r) => <Badge tone={STATUS_REQ_TONE[r.status] || 'neutral'} dot>{STATUS_REQ_LABEL[r.status] || r.status}</Badge> },
    { key: 'due_date', label: 'Prazo', render: (r) => {
      const overdue = r.due_date && new Date(r.due_date) < new Date() && !['atendido', 'indeferido', 'encerrado'].includes(r.status);
      return (
        <span className={overdue ? 'font-semibold text-danger' : 'text-on-surface/75'}>
          {r.due_date ? fmtDate(r.due_date) : '—'}
          {overdue ? ' · vencido' : ''}
        </span>
      );
    } },
    { key: 'updated_at', label: 'Atualizado', render: (r) => <span className="text-on-surface/55">{fmt(r.updated_at)}</span> },
    { key: 'actions', label: '', align: 'right', render: (r) => <Button variant="ghost" onClick={() => setRequestDialog({ open: true, item: r })}>Editar</Button> },
  ];

  const incidentColumns = [
    { key: 'title', label: 'Título', render: (i) => (
      <div className="min-w-[200px]">
        <div className="font-semibold text-on-surface">{i.title}</div>
        {i.summary ? <div className="mt-0.5 max-w-[300px] truncate text-[12px] text-on-surface/55" title={i.summary}>{i.summary}</div> : null}
      </div>
    ) },
    { key: 'severity', label: 'Severidade', render: (i) => <Badge tone={RISK_TONE[i.severity] || 'neutral'}>{RISK_LABEL[i.severity] || i.severity}</Badge> },
    { key: 'status', label: 'Status', render: (i) => <Badge tone={STATUS_INC_TONE[i.status] || 'neutral'} dot>{STATUS_INC_LABEL[i.status] || i.status}</Badge> },
    { key: 'occurred_at', label: 'Ocorrido em', render: (i) => (i.occurred_at ? fmt(i.occurred_at) : '—') },
    { key: 'affected_subjects_estimate', label: 'Titulares', render: (i) => <span className="tabular font-semibold">{i.affected_subjects_estimate || 0}</span> },
    { key: 'authority_notified', label: 'Autoridade', render: (i) => <Badge tone={i.authority_notified ? 'success' : 'neutral'}>{i.authority_notified ? 'Comunicado' : 'Não comunicado'}</Badge> },
    { key: 'actions', label: '', align: 'right', render: (i) => <Button variant="ghost" onClick={() => setIncidentDialog({ open: true, item: i })}>Editar</Button> },
  ];

  const auditColumns = [
    { key: 'created_at', label: 'Data e hora', mono: true, render: (ev) => <span className="text-on-surface/65">{fmt(ev.created_at)}</span> },
    { key: 'entity_type', label: 'Área afetada', render: (ev) => <Badge tone="primary">{auditTypeLabel(ev.entity_type)}</Badge> },
    { key: 'action', label: 'O que aconteceu', render: (ev) => {
      const info = auditActionInfo(ev.action, ev.entity_type);
      return (
        <div className="min-w-[200px]">
          <div className="font-semibold text-on-surface">{info.label}</div>
          <div className="mt-0.5 max-w-[360px] text-[12px] leading-5 text-on-surface/60">{ev.message || info.description}</div>
        </div>
      );
    } },
    { key: 'actor_username', label: 'Operador', render: (ev) => <div><div>{ev.actor_username || 'sistema'}</div><div className="tabular text-[11.5px] text-on-surface/50">{ev.actor_ip || '—'}</div></div> },
    { key: 'success', label: 'Resultado', render: (ev) => <Badge tone={ev.success !== false ? 'success' : 'danger'} dot>{ev.success !== false ? 'Registrado' : 'Falhou'}</Badge> },
  ];

  const accessColumns = [
    { key: 'created_at', label: 'Data e hora', mono: true, render: (ev) => <span className="text-on-surface/65">{fmt(ev.created_at)}</span> },
    { key: 'username', label: 'Usuário', render: (ev) => <span className="font-semibold">{ev.username || 'anônimo'}</span> },
    { key: 'action', label: 'Evento', render: (ev) => authActionLabel(ev.action) },
    { key: 'ip_address', label: 'IP', mono: true, render: (ev) => <span className="text-on-surface/65">{ev.ip_address || '—'}</span> },
    { key: 'route', label: 'Rota', render: (ev) => <span className="block max-w-[220px] truncate text-on-surface/55" title={ev.route}>{ev.route || '—'}</span> },
    { key: 'success', label: 'Resultado', render: (ev) => <Badge tone={ev.success ? 'success' : 'danger'} dot>{ev.success ? 'Autorizado' : 'Recusado'}</Badge> },
  ];

  const rightsTiles = [
    { key: 'confirmacao', label: 'Confirmação' },
    { key: 'acesso', label: 'Acesso' },
    { key: 'correcao', label: 'Correção' },
    { key: 'anonimizacao', label: 'Anonimização' },
    { key: 'eliminacao', label: 'Eliminação' },
    { key: 'portabilidade', label: 'Portabilidade' },
    { key: 'informacao_compartilhamento', label: 'Compartilhamento' },
    { key: 'revogacao_consentimento', label: 'Revogação' },
    { key: 'oposicao', label: 'Oposição' },
  ];

  const attention = [
    { label: 'Áreas sem responsabilidade completa', value: s.processing?.missing_safeguards ?? 0, desc: 'Falta responsável, retenção ou segurança declarada.', tone: 'danger' },
    { label: 'Pedidos fora do prazo', value: s.requests?.overdue ?? 0, desc: 'Demandas de pessoas aguardando resposta.', tone: 'danger' },
    { label: 'Incidentes graves pendentes', value: s.incidents?.pending_notification ?? 0, desc: 'Precisam de decisão sobre comunicação formal.', tone: 'warning' },
  ];

  const openProcessing = () => setProcessingDialog({ open: true, item: null });
  const openRequest = () => setRequestDialog({ open: true, item: null });
  const openIncident = () => setIncidentDialog({ open: true, item: null });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <ProgramDialog    open={programDialog}         item={program}               saving={saving.program}    onClose={() => setProgramDialog(false)}                            onSubmit={saveProgram} />
      <ProcessingDialog open={processingDialog.open} item={processingDialog.item} saving={saving.processing} onClose={() => setProcessingDialog({ open: false, item: null })} onSubmit={saveProcessing} />
      <RequestDialog    open={requestDialog.open}    item={requestDialog.item}    saving={saving.request}    onClose={() => setRequestDialog({ open: false, item: null })}    onSubmit={saveRequest} />
      <IncidentDialog   open={incidentDialog.open}   item={incidentDialog.item}   saving={saving.incident}   onClose={() => setIncidentDialog({ open: false, item: null })}   onSubmit={saveIncident} />

      <PageHeader
        title="Proteção de Dados (LGPD)"
        description="Quais dados pessoais a Prefeitura guarda, quais pedidos precisam de resposta, quais riscos exigem providência e quais evidências comprovam a atuação institucional."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={() => load().catch(() => null)} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
            <Button icon={FileCheck2} onClick={() => setProgramDialog(true)}>Estrutura de governança</Button>
          </>
        )}
      />

      {error ? <Notice tone="warning" title="Carregamento incompleto">{error} Os demais dados continuam disponíveis.</Notice> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-outline bg-container px-3 py-2 text-[12.5px] text-on-surface/70">
        <span className="inline-flex items-center gap-1.5 font-semibold text-on-surface"><Shield size={14} className="text-primary" />Base legal</span>
        {LGPD_REFS.map((r) => <Badge key={r.art} tone="primary">{r.art} · {r.desc}</Badge>)}
      </div>

      <Tabs tabs={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'painel' ? (
        <div className="space-y-4">
          <KpiRow>
            <Kpi icon={ClipboardList} label="Áreas com dados pessoais" value={s.processing?.total ?? 0} sub={`${s.processing?.approved ?? 0} com responsabilidade validada`} />
            <Kpi icon={ShieldAlert} label="Riscos relevantes" value={s.processing?.high_risk ?? 0} tone={s.processing?.high_risk > 0 ? 'danger' : 'neutral'} sub="Precisam de acompanhamento" />
            <Kpi icon={UserRoundSearch} label="Pedidos em andamento" value={s.requests?.open ?? 0} tone={s.requests?.overdue > 0 ? 'danger' : 'neutral'} sub={`${s.requests?.overdue ?? 0} fora do prazo`} />
            <Kpi icon={AlertTriangle} label="Incidentes em aberto" value={s.incidents?.open ?? 0} tone={s.incidents?.open > 0 ? 'warning' : 'neutral'} sub={`${s.incidents?.pending_notification ?? 0} graves sem comunicação`} />
          </KpiRow>

          {!hasGovernanceData && !loading ? (
            <Notice
              tone="primary"
              title="Painel ainda sem registros"
              action={(
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={Plus} onClick={() => { setActiveTab('inventario'); openProcessing(); }}>Mapear dados</Button>
                  <Button icon={UserRoundSearch} onClick={() => { setActiveTab('titulares'); openRequest(); }}>Registrar pedido</Button>
                </div>
              )}
            >
              O painel começa a preencher quando houver cadastro das áreas que tratam dados pessoais, pedidos de pessoas ou incidentes. Comece pelo mapa de responsabilidades.
            </Notice>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title={program.controller_name || 'Controlador não definido'}
              description="Responsabilidade institucional"
              actions={<Button icon={FileCheck2} onClick={() => setProgramDialog(true)}>Editar</Button>}
            >
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['Unidade responsável', program.controller_unit || '—'],
                  ['E-mail do controlador', program.controller_email || '—'],
                  ['Responsável por dados (DPO)', program.dpo_name || 'Não definido'],
                  ['Contato do responsável', program.dpo_email || '—'],
                  ['Canal de atendimento', program.data_subject_channel || '—'],
                  ['Revisão da governança', `A cada ${program.review_frequency_days || 180} dias`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-outline px-3 py-2">
                    <dt className="text-[11.5px] text-on-surface/50">{label}</dt>
                    <dd className="mt-0.5 break-words text-[13.5px] font-semibold text-on-surface">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[13px] text-on-surface/70">
                Aviso de privacidade publicado:{' '}
                <a href={privacyNoticeUrl} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">{privacyNoticeUrl}</a>
              </p>
              {program.last_review_at ? <p className="mt-1 text-[12px] text-on-surface/50">Última revisão registrada: {fmtDate(program.last_review_at)}</p> : null}
            </Panel>

            <Panel title="Providências que exigem atenção">
              <ul className="space-y-2">
                {attention.map((item) => (
                  <li key={item.label} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${item.value > 0 ? (item.tone === 'warning' ? 'border-warning/30 bg-warning/8' : 'border-danger/30 bg-danger/8') : 'border-outline'}`}>
                    {item.value > 0
                      ? <XCircle size={16} className={`shrink-0 ${item.tone === 'warning' ? 'text-warning' : 'text-danger'}`} />
                      : <CheckCircle2 size={16} className="shrink-0 text-success" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-on-surface">{item.label}</div>
                      <div className="text-[12px] text-on-surface/55">{item.desc}</div>
                    </div>
                    <div className={`tabular text-xl font-bold ${item.value > 0 ? (item.tone === 'warning' ? 'text-warning' : 'text-danger') : 'text-success'}`}>{item.value}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel
            title="Pedidos de pessoas"
            description="Que tipo de demanda a Prefeitura está recebendo sobre dados pessoais."
            actions={<Button icon={Plus} onClick={() => { setActiveTab('titulares'); openRequest(); }}>Nova solicitação</Button>}
          >
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {rightsTiles.map((d) => (
                <div key={d.key} className="rounded-lg border border-outline px-2 py-2.5 text-center">
                  <div className="tabular text-xl font-bold text-on-surface">{(s.rights || {})[d.key] ?? 0}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-on-surface/55">{d.label}</div>
                </div>
              ))}
            </div>
          </Panel>

          {highRiskList.length > 0 ? (
            <Notice tone="danger" title={`Tratamentos de risco alto ou crítico (${highRiskList.length})`}>
              <div className="mt-2 flex flex-wrap gap-2">
                {highRiskList.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-on-surface">
                    <Badge tone="danger">{RISK_LABEL[a.risk_level] || a.risk_level}</Badge>{a.process_name}
                  </span>
                ))}
              </div>
            </Notice>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'inventario' ? (
        <Panel
          title="Inventário de operações de tratamento"
          description="Art. 37 da LGPD: registro de finalidade, base legal, retenção e medidas de segurança."
          actions={(
            <>
              <Button icon={Download} onClick={exportInventoryPdf} disabled={pdfLoading}>{pdfLoading ? 'Gerando…' : 'Exportar PDF (Art. 37)'}</Button>
              <Button variant="primary" icon={Plus} onClick={openProcessing}>Nova atividade</Button>
            </>
          )}
          padded={false}
        >
          <FilterBar count={filteredActivities.length} total={activities.length}>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input aria-label="Buscar processo" placeholder="Buscar processo…" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} className={`${filterCls} pl-9`} />
            </div>
            <select aria-label="Filtrar por risco" value={invRisk} onChange={(e) => setInvRisk(e.target.value)} className={filterCls}>
              <option value="">Todos os riscos</option>
              {Object.entries(RISK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Filtrar por status" value={invStatus} onChange={(e) => setInvStatus(e.target.value)} className={filterCls}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_PA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FilterBar>
          <DataTable columns={inventoryColumns} rows={filteredActivities} empty={fillerNote(loading, activities.length ? 'Nenhuma atividade neste filtro.' : 'Nenhuma atividade cadastrada. Use "Nova atividade" para começar o inventário formal.')} />
        </Panel>
      ) : null}

      {activeTab === 'titulares' ? (
        <Panel
          title="Pedidos de pessoas (direitos do titular)"
          description="Art. 18 da LGPD. Prazo de atendimento: 15 dias úteis."
          actions={<Button variant="primary" icon={Plus} onClick={openRequest}>Nova solicitação</Button>}
          padded={false}
        >
          <FilterBar count={filteredRequests.length} total={requests.length}>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input aria-label="Buscar titular" placeholder="Buscar titular…" value={reqSearch} onChange={(e) => setReqSearch(e.target.value)} className={`${filterCls} pl-9`} />
            </div>
            <select aria-label="Filtrar por tipo de direito" value={reqType} onChange={(e) => setReqType(e.target.value)} className={filterCls}>
              <option value="">Todos os tipos</option>
              {REQUEST_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select aria-label="Filtrar por status" value={reqStatus} onChange={(e) => setReqStatus(e.target.value)} className={filterCls}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_REQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FilterBar>
          <DataTable columns={requestColumns} rows={filteredRequests} empty={fillerNote(loading, requests.length ? 'Nenhuma solicitação neste filtro.' : 'Nenhuma solicitação cadastrada. Registre formalmente os pedidos dos titulares.')} />
        </Panel>
      ) : null}

      {activeTab === 'incidentes' ? (
        <Panel
          title="Incidentes de proteção de dados"
          description="Art. 48 da LGPD: comunicação à ANPD é obrigatória em incidentes graves."
          actions={<Button variant="primary" icon={Plus} onClick={openIncident}>Novo incidente</Button>}
          padded={false}
        >
          <FilterBar count={filteredIncidents.length} total={incidents.length}>
            <select aria-label="Filtrar por severidade" value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} className={filterCls}>
              <option value="">Toda severidade</option>
              {Object.entries(RISK_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Filtrar por status" value={incStatus} onChange={(e) => setIncStatus(e.target.value)} className={filterCls}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_INC_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </FilterBar>
          <DataTable columns={incidentColumns} rows={filteredIncidents} empty={fillerNote(loading, incidents.length ? 'Nenhum incidente neste filtro.' : 'Nenhum incidente registrado. Registre aqui os que envolvam dados pessoais (Art. 48).')} />
        </Panel>
      ) : null}

      {activeTab === 'auditoria' ? (
        <div className="space-y-4">
          <Tabs
            tabs={[{ key: 'lgpd', label: 'Evidências de gestão', icon: ScrollText, count: auditLogs.length }, { key: 'acesso', label: 'Acessos ao sistema', icon: KeyRound, count: authEvents.length }]}
            value={audSubTab}
            onChange={setAudSubTab}
          />
          {audSubTab === 'lgpd' ? (
            <Panel title="Evidências de gestão" description="Quem mexeu, qual área foi afetada e o que mudou, em linguagem operacional." padded={false}>
              <DataTable columns={auditColumns} rows={auditLogs} empty={fillerNote(loading, 'Nenhuma evidência registrada. Quando uma responsabilidade, pedido ou incidente for criado ou revisado, ela aparece aqui.')} />
            </Panel>
          ) : (
            <Panel title="Acessos ao sistema" description="Entradas, recusas e rotas sensíveis, com autoria e IP." padded={false}>
              <DataTable columns={accessColumns} rows={authEvents} empty={fillerNote(loading, 'Nenhum acesso registrado ainda.')} />
            </Panel>
          )}
        </div>
      ) : null}
    </div>
  );
}
