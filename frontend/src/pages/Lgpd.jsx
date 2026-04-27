import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, FileCheck2, KeyRound, Plus, RefreshCcw, ShieldAlert, UserRoundSearch } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, DialogShell, ModuleHeader, Section, StatusChip, Surface } from '../components/ui/primitives';

const defaultProcessing = {
  process_name: '',
  purpose: '',
  legal_basis: '',
  controller_name: '',
  operator_name: '',
  data_categories: '',
  data_subject_categories: '',
  shared_with: '',
  storage_location: '',
  retention_period: '',
  security_measures: '',
  international_transfer: false,
  transfer_details: '',
  risk_level: 'medio',
  status: 'mapeado',
};

const defaultRequest = {
  requester_name: '',
  requester_email: '',
  requester_document: '',
  request_type: 'acesso',
  status: 'recebido',
  due_date: '',
  response_summary: '',
  notes: '',
};

const defaultIncident = {
  title: '',
  severity: 'medio',
  status: 'aberto',
  occurred_at: '',
  reported_at: '',
  affected_data: '',
  affected_subjects_estimate: 0,
  authority_notified: false,
  authority_notified_at: '',
  summary: '',
  containment_actions: '',
  notes: '',
};

const defaultProgramSettings = {
  controller_name: '',
  controller_unit: '',
  controller_email: '',
  dpo_name: '',
  dpo_email: '',
  dpo_phone: '',
  data_subject_channel: '',
  privacy_notice_url: '',
  review_frequency_days: 180,
  last_review_at: '',
  notes: '',
};

const requestTypeOptions = [
  { value: 'confirmacao', label: 'Confirmação de tratamento' },
  { value: 'acesso', label: 'Acesso aos dados' },
  { value: 'correcao', label: 'Correção de dados' },
  { value: 'anonimizacao', label: 'Anonimização ou bloqueio' },
  { value: 'eliminacao', label: 'Eliminação de dados' },
  { value: 'portabilidade', label: 'Portabilidade' },
  { value: 'informacao-compartilhamento', label: 'Informação sobre compartilhamento' },
  { value: 'revogacao-consentimento', label: 'Revogação do consentimento' },
  { value: 'oposicao', label: 'Oposição' },
  { value: 'outro', label: 'Outro' },
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function splitList(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function requestTypeLabel(value) {
  return requestTypeOptions.find((option) => option.value === value)?.label || value || '—';
}

function StatusPill({ label, tone = 'neutral' }) {
  return <StatusChip label={label} tone={tone} />;
}

function MetricCard({ icon: Icon, label, value, subtitle, tone = 'primary' }) {
  return (
    <Surface className="p-6">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${
        tone === 'danger'
          ? 'border-danger/18 bg-danger/10 text-danger'
          : tone === 'warning'
            ? 'border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-300'
            : tone === 'success'
              ? 'border-info/18 bg-info/10 text-info'
              : 'border-primary/16 bg-primary/10 text-primary'
      }`}>
        <Icon size={20} />
      </div>
      <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight text-on-surface">{value}</div>
      <p className="mt-2 text-sm leading-6 text-on-surface/62">{subtitle}</p>
    </Surface>
  );
}

function TextField({ label, value, onChange, multiline = false, type = 'text', placeholder = '' }) {
  const shared = 'w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15';
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-on-surface/52">{label}</span>
      {multiline ? (
        <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={shared} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={shared} />
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-black uppercase tracking-[0.14em] text-on-surface/52">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-outline/16 bg-surface px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
        checked ? 'border-primary/22 bg-primary/10 text-on-surface' : 'border-outline/16 bg-surface text-on-surface/80'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">{label}</div>
          {hint ? <div className="mt-1 text-xs text-on-surface/58">{hint}</div> : null}
        </div>
        <StatusChip label={checked ? 'Sim' : 'Não'} tone={checked ? 'success' : 'neutral'} />
      </div>
    </button>
  );
}

function ProgramSettingsDialog({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(defaultProgramSettings);

  useEffect(() => {
    if (!open) return;
    setForm(item ? {
      ...defaultProgramSettings,
      ...item,
      last_review_at: item.last_review_at ? String(item.last_review_at).slice(0, 10) : '',
    } : defaultProgramSettings);
  }, [open, item]);

  if (!open) return null;

  return (
    <DialogShell
      open={open}
      title="Estrutura institucional LGPD"
      subtitle="Defina controlador, encarregado, canal do titular e ciclo de revisão do programa de proteção de dados."
      onClose={onClose}
      size="max-w-5xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Controlador" value={form.controller_name} onChange={(value) => setForm((current) => ({ ...current, controller_name: value }))} />
        <TextField label="Unidade responsável" value={form.controller_unit} onChange={(value) => setForm((current) => ({ ...current, controller_unit: value }))} />
        <TextField label="E-mail do controlador" value={form.controller_email} onChange={(value) => setForm((current) => ({ ...current, controller_email: value }))} type="email" />
        <TextField label="Encarregado (DPO)" value={form.dpo_name} onChange={(value) => setForm((current) => ({ ...current, dpo_name: value }))} />
        <TextField label="E-mail do encarregado" value={form.dpo_email} onChange={(value) => setForm((current) => ({ ...current, dpo_email: value }))} type="email" />
        <TextField label="Telefone do encarregado" value={form.dpo_phone} onChange={(value) => setForm((current) => ({ ...current, dpo_phone: value }))} />
        <TextField label="Canal do titular" value={form.data_subject_channel} onChange={(value) => setForm((current) => ({ ...current, data_subject_channel: value }))} placeholder="Fala.BR, ouvidoria, e-mail institucional..." />
        <TextField label="Aviso de privacidade" value={form.privacy_notice_url} onChange={(value) => setForm((current) => ({ ...current, privacy_notice_url: value }))} placeholder="https://..." />
        <TextField label="Frequência de revisão (dias)" value={String(form.review_frequency_days || 180)} onChange={(value) => setForm((current) => ({ ...current, review_frequency_days: Number(value || 180) }))} type="number" />
        <TextField label="Última revisão" value={form.last_review_at} onChange={(value) => setForm((current) => ({ ...current, last_review_at: value }))} type="date" />
      </div>
      <div className="mt-4">
        <TextField label="Notas institucionais" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} multiline />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={() => onSubmit(form)} disabled={saving}>{saving ? 'Salvando...' : 'Salvar estrutura'}</ActionButton>
      </div>
    </DialogShell>
  );
}

function ProcessingDialog({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(defaultProcessing);

  useEffect(() => {
    if (!open) return;
    setForm(item ? {
      ...defaultProcessing,
      ...item,
      data_categories: joinList(item.data_categories),
      data_subject_categories: joinList(item.data_subject_categories),
      shared_with: joinList(item.shared_with),
    } : defaultProcessing);
  }, [open, item]);

  if (!open) return null;

  const submit = () => onSubmit({
    ...form,
    data_categories: splitList(form.data_categories),
    data_subject_categories: splitList(form.data_subject_categories),
    shared_with: splitList(form.shared_with),
  });

  return (
    <DialogShell
      open={open}
      title={item ? 'Editar atividade de tratamento' : 'Nova atividade de tratamento'}
      subtitle="Inventário oficial de tratamento de dados pessoais, com finalidade, base legal, retenção e risco."
      onClose={onClose}
      size="max-w-5xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Processo" value={form.process_name} onChange={(value) => setForm((current) => ({ ...current, process_name: value }))} />
        <TextField label="Base legal" value={form.legal_basis} onChange={(value) => setForm((current) => ({ ...current, legal_basis: value }))} />
        <TextField label="Controlador" value={form.controller_name} onChange={(value) => setForm((current) => ({ ...current, controller_name: value }))} />
        <TextField label="Operador" value={form.operator_name} onChange={(value) => setForm((current) => ({ ...current, operator_name: value }))} />
        <TextField label="Categorias de dados" value={form.data_categories} onChange={(value) => setForm((current) => ({ ...current, data_categories: value }))} multiline placeholder="nome, cpf, e-mail..." />
        <TextField label="Titulares afetados" value={form.data_subject_categories} onChange={(value) => setForm((current) => ({ ...current, data_subject_categories: value }))} multiline placeholder="servidores, cidadãos..." />
        <TextField label="Compartilhamento" value={form.shared_with} onChange={(value) => setForm((current) => ({ ...current, shared_with: value }))} multiline placeholder="fornecedor, órgão..." />
        <TextField label="Armazenamento" value={form.storage_location} onChange={(value) => setForm((current) => ({ ...current, storage_location: value }))} />
        <TextField label="Retenção" value={form.retention_period} onChange={(value) => setForm((current) => ({ ...current, retention_period: value }))} />
        <SelectField
          label="Risco"
          value={form.risk_level}
          onChange={(value) => setForm((current) => ({ ...current, risk_level: value }))}
          options={[
            { value: 'baixo', label: 'Baixo' },
            { value: 'medio', label: 'Médio' },
            { value: 'alto', label: 'Alto' },
            { value: 'critico', label: 'Crítico' },
          ]}
        />
        <SelectField
          label="Status"
          value={form.status}
          onChange={(value) => setForm((current) => ({ ...current, status: value }))}
          options={[
            { value: 'mapeado', label: 'Mapeado' },
            { value: 'revisao', label: 'Em revisão' },
            { value: 'aprovado', label: 'Aprovado' },
            { value: 'suspenso', label: 'Suspenso' },
          ]}
        />
      </div>
      <div className="mt-4 grid gap-4">
        <TextField label="Finalidade" value={form.purpose} onChange={(value) => setForm((current) => ({ ...current, purpose: value }))} multiline />
        <TextField label="Medidas de segurança" value={form.security_measures} onChange={(value) => setForm((current) => ({ ...current, security_measures: value }))} multiline />
        <ToggleField label="Transferência internacional" checked={form.international_transfer} onChange={(value) => setForm((current) => ({ ...current, international_transfer: value }))} hint="Marque se há fluxo internacional de dados." />
        {form.international_transfer ? (
          <TextField label="Detalhes da transferência" value={form.transfer_details} onChange={(value) => setForm((current) => ({ ...current, transfer_details: value }))} multiline />
        ) : null}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={submit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar atividade'}</ActionButton>
      </div>
    </DialogShell>
  );
}

function RequestDialog({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(defaultRequest);
  useEffect(() => {
    if (!open) return;
    setForm(item ? { ...defaultRequest, ...item, due_date: item.due_date ? String(item.due_date).slice(0, 10) : '' } : defaultRequest);
  }, [open, item]);
  if (!open) return null;

  return (
    <DialogShell
      open={open}
      title={item ? 'Editar solicitação do titular' : 'Nova solicitação do titular'}
      subtitle="Controle formal de acesso, correção, eliminação, portabilidade e demais direitos do titular."
      onClose={onClose}
      size="max-w-4xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Titular" value={form.requester_name} onChange={(value) => setForm((current) => ({ ...current, requester_name: value }))} />
        <TextField label="E-mail" value={form.requester_email} onChange={(value) => setForm((current) => ({ ...current, requester_email: value }))} type="email" />
        <TextField label="Documento" value={form.requester_document} onChange={(value) => setForm((current) => ({ ...current, requester_document: value }))} />
        <TextField label="Prazo" value={form.due_date} onChange={(value) => setForm((current) => ({ ...current, due_date: value }))} type="date" />
        <SelectField
          label="Tipo"
          value={form.request_type}
          onChange={(value) => setForm((current) => ({ ...current, request_type: value }))}
          options={requestTypeOptions}
        />
        <SelectField
          label="Status"
          value={form.status}
          onChange={(value) => setForm((current) => ({ ...current, status: value }))}
          options={[
            { value: 'recebido', label: 'Recebido' },
            { value: 'em-analise', label: 'Em análise' },
            { value: 'atendido', label: 'Atendido' },
            { value: 'indeferido', label: 'Indeferido' },
            { value: 'encerrado', label: 'Encerrado' },
          ]}
        />
      </div>
      <div className="mt-4 grid gap-4">
        <TextField label="Resposta resumida" value={form.response_summary} onChange={(value) => setForm((current) => ({ ...current, response_summary: value }))} multiline />
        <TextField label="Observações" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} multiline />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton tone="primary" onClick={() => onSubmit(form)} disabled={saving}>{saving ? 'Salvando...' : 'Salvar solicitação'}</ActionButton>
      </div>
    </DialogShell>
  );
}

function IncidentDialog({ open, item, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(defaultIncident);
  useEffect(() => {
    if (!open) return;
    setForm(item ? {
      ...defaultIncident,
      ...item,
      affected_data: joinList(item.affected_data),
      occurred_at: item.occurred_at ? String(item.occurred_at).slice(0, 16) : '',
      reported_at: item.reported_at ? String(item.reported_at).slice(0, 16) : '',
      authority_notified_at: item.authority_notified_at ? String(item.authority_notified_at).slice(0, 16) : '',
    } : defaultIncident);
  }, [open, item]);
  if (!open) return null;

  return (
    <DialogShell
      open={open}
      title={item ? 'Editar incidente LGPD' : 'Novo incidente LGPD'}
      subtitle="Registro formal de incidente, impacto, comunicação e contenção."
      onClose={onClose}
      size="max-w-5xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Título" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
        <TextField label="Titulares afetados" value={String(form.affected_subjects_estimate || 0)} onChange={(value) => setForm((current) => ({ ...current, affected_subjects_estimate: Number(value || 0) }))} type="number" />
        <SelectField
          label="Severidade"
          value={form.severity}
          onChange={(value) => setForm((current) => ({ ...current, severity: value }))}
          options={[
            { value: 'baixo', label: 'Baixo' },
            { value: 'medio', label: 'Médio' },
            { value: 'alto', label: 'Alto' },
            { value: 'critico', label: 'Crítico' },
          ]}
        />
        <SelectField
          label="Status"
          value={form.status}
          onChange={(value) => setForm((current) => ({ ...current, status: value }))}
          options={[
            { value: 'aberto', label: 'Aberto' },
            { value: 'investigacao', label: 'Em investigação' },
            { value: 'contido', label: 'Contido' },
            { value: 'comunicado', label: 'Comunicado' },
            { value: 'encerrado', label: 'Encerrado' },
          ]}
        />
        <TextField label="Ocorrido em" value={form.occurred_at} onChange={(value) => setForm((current) => ({ ...current, occurred_at: value }))} type="datetime-local" />
        <TextField label="Reportado em" value={form.reported_at} onChange={(value) => setForm((current) => ({ ...current, reported_at: value }))} type="datetime-local" />
      </div>
      <div className="mt-4 grid gap-4">
        <TextField label="Dados afetados" value={form.affected_data} onChange={(value) => setForm((current) => ({ ...current, affected_data: value }))} multiline placeholder="cadastro, autenticação, endereço..." />
        <TextField label="Resumo" value={form.summary} onChange={(value) => setForm((current) => ({ ...current, summary: value }))} multiline />
        <TextField label="Ações de contenção" value={form.containment_actions} onChange={(value) => setForm((current) => ({ ...current, containment_actions: value }))} multiline />
        <ToggleField label="Autoridade comunicada" checked={form.authority_notified} onChange={(value) => setForm((current) => ({ ...current, authority_notified: value }))} hint="Utilize quando houver comunicação formal à ANPD ou outra autoridade." />
        {form.authority_notified ? (
          <TextField label="Data da comunicação" value={form.authority_notified_at} onChange={(value) => setForm((current) => ({ ...current, authority_notified_at: value }))} type="datetime-local" />
        ) : null}
        <TextField label="Observações" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} multiline />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <ActionButton tone="ghost" onClick={onClose}>Cancelar</ActionButton>
        <ActionButton
          tone="primary"
          onClick={() => onSubmit({ ...form, affected_data: splitList(form.affected_data) })}
          disabled={saving}
        >
          {saving ? 'Salvando...' : 'Salvar incidente'}
        </ActionButton>
      </div>
    </DialogShell>
  );
}

export default function Lgpd() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState({ program: false, processing: false, request: false, incident: false });
  const [dashboard, setDashboard] = useState(null);
  const [program, setProgram] = useState(defaultProgramSettings);
  const [processingActivities, setProcessingActivities] = useState([]);
  const [requests, setRequests] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [authEvents, setAuthEvents] = useState([]);
  const [programDialog, setProgramDialog] = useState({ open: false });
  const [processingDialog, setProcessingDialog] = useState({ open: false, item: null });
  const [requestDialog, setRequestDialog] = useState({ open: false, item: null });
  const [incidentDialog, setIncidentDialog] = useState({ open: false, item: null });

  const load = async () => {
    setLoading(true);
    setError('');
    const [dashboardRes, programRes, processingRes, requestsRes, incidentsRes, auditRes, authRes] = await Promise.allSettled([
      api.get('/api/lgpd/dashboard'),
      api.get('/api/lgpd/program-settings'),
      api.get('/api/lgpd/processing-activities'),
      api.get('/api/lgpd/requests'),
      api.get('/api/lgpd/incidents'),
      api.get('/api/lgpd/audit?limit=80'),
      api.get('/api/auth/activity?limit=120'),
    ]);

    if (dashboardRes.status === 'fulfilled') setDashboard(dashboardRes.value.data || null);
    if (programRes.status === 'fulfilled') setProgram(programRes.value.data ? { ...defaultProgramSettings, ...programRes.value.data } : defaultProgramSettings);
    if (processingRes.status === 'fulfilled') setProcessingActivities(Array.isArray(processingRes.value.data) ? processingRes.value.data : []);
    if (requestsRes.status === 'fulfilled') setRequests(Array.isArray(requestsRes.value.data) ? requestsRes.value.data : []);
    if (incidentsRes.status === 'fulfilled') setIncidents(Array.isArray(incidentsRes.value.data) ? incidentsRes.value.data : []);
    if (auditRes.status === 'fulfilled') setAudit(Array.isArray(auditRes.value.data) ? auditRes.value.data : []);
    if (authRes.status === 'fulfilled') setAuthEvents(Array.isArray(authRes.value.data) ? authRes.value.data : []);

    const failures = [
      dashboardRes.status === 'rejected' ? 'painel LGPD' : null,
      programRes.status === 'rejected' ? 'estrutura institucional' : null,
      processingRes.status === 'rejected' ? 'atividades de tratamento' : null,
      requestsRes.status === 'rejected' ? 'solicitações do titular' : null,
      incidentsRes.status === 'rejected' ? 'incidentes' : null,
      auditRes.status === 'rejected' ? 'trilha LGPD' : null,
      authRes.status === 'rejected' ? 'autenticação' : null,
    ].filter(Boolean);

    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }

    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const summary = dashboard?.summary || {};
  const rightsSummary = summary.rights || {};
  const highRiskProcesses = useMemo(
    () => processingActivities.filter((item) => ['alto', 'critico'].includes(String(item.risk_level || '').toLowerCase())),
    [processingActivities],
  );

  const rightsCards = [
    { key: 'confirmacao', label: 'Confirmação de tratamento', value: rightsSummary.confirmacao ?? 0 },
    { key: 'acesso', label: 'Acesso aos dados', value: rightsSummary.acesso ?? 0 },
    { key: 'correcao', label: 'Correção', value: rightsSummary.correcao ?? 0 },
    { key: 'anonimizacao', label: 'Anonimização ou bloqueio', value: rightsSummary.anonimizacao ?? 0 },
    { key: 'eliminacao', label: 'Eliminação', value: rightsSummary.eliminacao ?? 0 },
    { key: 'portabilidade', label: 'Portabilidade', value: rightsSummary.portabilidade ?? 0 },
    { key: 'informacao_compartilhamento', label: 'Compartilhamento', value: rightsSummary.informacao_compartilhamento ?? 0 },
    { key: 'revogacao_consentimento', label: 'Revogação do consentimento', value: rightsSummary.revogacao_consentimento ?? 0 },
    { key: 'oposicao', label: 'Oposição', value: rightsSummary.oposicao ?? 0 },
  ];

  const complianceCards = [
    {
      label: 'Inventários com lacunas',
      value: summary.processing?.missing_safeguards ?? 0,
      tone: (summary.processing?.missing_safeguards ?? 0) > 0 ? 'danger' : 'success',
      subtitle: 'Tratamentos sem retenção, medidas de segurança ou identificação do controlador.',
    },
    {
      label: 'Solicitações vencidas',
      value: summary.requests?.overdue ?? 0,
      tone: (summary.requests?.overdue ?? 0) > 0 ? 'danger' : 'success',
      subtitle: 'Demandas do titular que exigem resposta institucional prioritária.',
    },
    {
      label: 'Incidentes pendentes de comunicação',
      value: summary.incidents?.pending_notification ?? 0,
      tone: (summary.incidents?.pending_notification ?? 0) > 0 ? 'warning' : 'success',
      subtitle: 'Incidentes graves ainda sem registro de comunicação formal à autoridade.',
    },
  ];

  const saveProgram = async (payload) => {
    setSaving((current) => ({ ...current, program: true }));
    try {
      await api.post('/api/lgpd/program-settings', payload);
      await load();
      setProgramDialog({ open: false });
    } finally {
      setSaving((current) => ({ ...current, program: false }));
    }
  };

  const saveProcessing = async (payload) => {
    setSaving((current) => ({ ...current, processing: true }));
    try {
      if (processingDialog.item?.id) {
        await api.patch(`/api/lgpd/processing-activities/${processingDialog.item.id}`, payload);
      } else {
        await api.post('/api/lgpd/processing-activities', payload);
      }
      await load();
      setProcessingDialog({ open: false, item: null });
    } finally {
      setSaving((current) => ({ ...current, processing: false }));
    }
  };

  const saveRequest = async (payload) => {
    setSaving((current) => ({ ...current, request: true }));
    try {
      if (requestDialog.item?.id) {
        await api.patch(`/api/lgpd/requests/${requestDialog.item.id}`, payload);
      } else {
        await api.post('/api/lgpd/requests', payload);
      }
      await load();
      setRequestDialog({ open: false, item: null });
    } finally {
      setSaving((current) => ({ ...current, request: false }));
    }
  };

  const saveIncident = async (payload) => {
    setSaving((current) => ({ ...current, incident: true }));
    try {
      if (incidentDialog.item?.id) {
        await api.patch(`/api/lgpd/incidents/${incidentDialog.item.id}`, payload);
      } else {
        await api.post('/api/lgpd/incidents', payload);
      }
      await load();
      setIncidentDialog({ open: false, item: null });
    } finally {
      setSaving((current) => ({ ...current, incident: false }));
    }
  };

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      <ProgramSettingsDialog open={programDialog.open} item={program} saving={saving.program} onClose={() => setProgramDialog({ open: false })} onSubmit={saveProgram} />
      <ProcessingDialog open={processingDialog.open} item={processingDialog.item} saving={saving.processing} onClose={() => setProcessingDialog({ open: false, item: null })} onSubmit={saveProcessing} />
      <RequestDialog open={requestDialog.open} item={requestDialog.item} saving={saving.request} onClose={() => setRequestDialog({ open: false, item: null })} onSubmit={saveRequest} />
      <IncidentDialog open={incidentDialog.open} item={incidentDialog.item} saving={saving.incident} onClose={() => setIncidentDialog({ open: false, item: null })} onSubmit={saveIncident} />

      <ModuleHeader
        eyebrow="Governança"
        title="LGPD & Proteção de Dados"
        description="Camada institucional de proteção de dados alinhada à LGPD: estrutura do programa, registro de operações de tratamento, direitos do titular, comunicação de incidentes e evidências auditáveis."
        badges={(
          <>
            <StatusChip label="Tabelas protegidas em banco" tone="primary" />
            <StatusChip label="Art. 18, 37, 41 e 48 refletidos" tone="success" />
            <StatusChip label="Programa institucional auditável" tone="warning" />
          </>
        )}
        actions={(
          <>
            <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => load().catch(() => null)}>
              Atualizar módulo
            </ActionButton>
            <ActionButton tone="ghost" icon={FileCheck2} onClick={() => setProgramDialog({ open: true })}>
              Estrutura LGPD
            </ActionButton>
            <ActionButton tone="primary" icon={Plus} onClick={() => setProcessingDialog({ open: true, item: null })}>
              Novo tratamento
            </ActionButton>
          </>
        )}
      />

      {error ? (
        <Surface className="p-5">
          <div className="text-sm font-semibold text-danger">{error}</div>
        </Surface>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={ClipboardList}
          label="Tratamentos mapeados"
          value={summary.processing?.total ?? 0}
          subtitle={`${summary.processing?.approved ?? 0} aprovados formalmente.`}
        />
        <MetricCard
          icon={ShieldAlert}
          label="Tratamentos de alto risco"
          value={summary.processing?.high_risk ?? 0}
          subtitle="Processos que exigem leitura reforçada e mitigação."
          tone="danger"
        />
        <MetricCard
          icon={UserRoundSearch}
          label="Solicitações do titular"
          value={summary.requests?.open ?? 0}
          subtitle={`${summary.requests?.overdue ?? 0} vencidas no recorte.`}
          tone="warning"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Incidentes abertos"
          value={summary.incidents?.open ?? 0}
          subtitle={`${summary.incidents?.notified ?? 0} comunicados à autoridade.`}
          tone="danger"
        />
        <MetricCard
          icon={FileCheck2}
          label="Lacunas de conformidade"
          value={(summary.processing?.missing_safeguards ?? 0) + (summary.requests?.overdue ?? 0) + (summary.incidents?.pending_notification ?? 0)}
          subtitle="Pendências somadas entre inventário, direitos e incidentes."
          tone={(summary.processing?.missing_safeguards ?? 0) + (summary.requests?.overdue ?? 0) + (summary.incidents?.pending_notification ?? 0) > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section
          title="Programa Institucional LGPD"
          subtitle="Estrutura mínima de controlador, encarregado, canal do titular e rotina de revisão. Em órgãos públicos, esse desenho precisa estar explícito e acessível."
          actions={<ActionButton tone="ghost" icon={FileCheck2} onClick={() => setProgramDialog({ open: true })}>Editar estrutura</ActionButton>}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Surface stripe={false} className="p-5">
              <div className="text-[11px] font-semibold tracking-tight text-primary">Controlador</div>
              <div className="mt-2 text-lg font-black text-on-surface">{program.controller_name || 'Não definido'}</div>
              <div className="mt-2 text-sm leading-6 text-on-surface/64">{program.controller_unit || 'Unidade responsável ainda não identificada.'}</div>
              <div className="mt-3 text-sm text-on-surface/62">{program.controller_email || 'Sem e-mail institucional registrado.'}</div>
            </Surface>
            <Surface stripe={false} className="p-5">
              <div className="text-[11px] font-semibold tracking-tight text-primary">Encarregado e canal do titular</div>
              <div className="mt-2 text-lg font-black text-on-surface">{program.dpo_name || 'Não definido'}</div>
              <div className="mt-2 text-sm leading-6 text-on-surface/64">{program.dpo_email || 'Sem e-mail do encarregado.'}</div>
              <div className="mt-1 text-sm leading-6 text-on-surface/64">{program.dpo_phone || 'Sem telefone do encarregado.'}</div>
              <div className="mt-3 text-sm text-on-surface/62">{program.data_subject_channel || 'Canal do titular ainda não configurado.'}</div>
            </Surface>
            <Surface stripe={false} className="p-5">
              <div className="text-[11px] font-semibold tracking-tight text-primary">Ritmo de governança</div>
              <div className="mt-2 text-lg font-black text-on-surface">{program.review_frequency_days || 180} dias</div>
              <div className="mt-2 text-sm leading-6 text-on-surface/64">Periodicidade formal de revisão do programa de proteção de dados.</div>
              <div className="mt-3 text-sm text-on-surface/62">Última revisão: {formatDate(program.last_review_at)}</div>
            </Surface>
            <Surface stripe={false} className="p-5">
              <div className="text-[11px] font-semibold tracking-tight text-primary">Aviso de privacidade</div>
              <div className="mt-2 text-sm leading-6 text-on-surface/64">
                {program.privacy_notice_url ? (
                  <a href={program.privacy_notice_url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline-offset-4 hover:underline">
                    {program.privacy_notice_url}
                  </a>
                ) : 'Aviso de privacidade ainda não vinculado ao módulo.'}
              </div>
              <div className="mt-3 text-sm text-on-surface/62">{program.notes || 'Sem notas institucionais registradas.'}</div>
            </Surface>
          </div>
        </Section>

        <Section title="Lacunas de conformidade" subtitle="Leitura rápida dos pontos que precisam de decisão administrativa.">
          <div className="space-y-3">
            {complianceCards.map((item) => (
              <Surface key={item.label} stripe={false} className="p-4">
                <div className="text-sm font-bold text-on-surface">{item.label}</div>
                <div className="mt-2 text-3xl font-black text-on-surface">{item.value}</div>
                <div className="mt-2"><StatusPill label={item.value > 0 ? 'Atenção requerida' : 'Sem pendência'} tone={item.tone} /></div>
                <div className="mt-2 text-sm leading-6 text-on-surface/62">{item.subtitle}</div>
              </Surface>
            ))}
          </div>
        </Section>
      </div>

      <Section
        title="Direitos do Titular"
        subtitle="O módulo agora separa claramente o atendimento aos direitos previstos no art. 18 da LGPD do inventário técnico e da trilha de acesso."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rightsCards.map((item) => (
            <Surface key={item.key} stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">{item.label}</div>
              <div className="mt-2 text-3xl font-black text-on-surface">{item.value}</div>
              <div className="mt-2 text-sm text-on-surface/62">Solicitações registradas neste direito.</div>
            </Surface>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section
          title="Inventário de Tratamento"
          subtitle="Registro oficial de finalidade, base legal, categorias de dados, compartilhamento, retenção e medidas de segurança."
          actions={<ActionButton tone="ghost" icon={Plus} onClick={() => setProcessingDialog({ open: true, item: null })}>Nova atividade</ActionButton>}
          className="xl:col-span-2"
        >
          <div className="grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Carregando inventário de tratamento...</div>
            ) : processingActivities.length ? processingActivities.map((item) => (
              <Surface key={item.id} stripe={false} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-black text-on-surface">{item.process_name}</div>
                      <StatusPill label={item.status || 'mapeado'} tone={item.status === 'aprovado' ? 'success' : item.status === 'suspenso' ? 'danger' : 'warning'} />
                      <StatusPill label={`Risco ${item.risk_level || 'medio'}`} tone={['alto', 'critico'].includes(item.risk_level) ? 'danger' : item.risk_level === 'medio' ? 'warning' : 'neutral'} />
                      {item.international_transfer ? <StatusPill label="Transferência internacional" tone="warning" /> : null}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-on-surface/68">{item.purpose}</div>
                    <div className="mt-3 grid gap-2 text-sm text-on-surface/64 md:grid-cols-2">
                      <div>Base legal: {item.legal_basis}</div>
                      <div>Retenção: {item.retention_period || '—'}</div>
                      <div>Armazenamento: {item.storage_location || '—'}</div>
                      <div>Compartilhamento: {(item.shared_with || []).length ? item.shared_with.join(', ') : '—'}</div>
                    </div>
                  </div>
                  <ActionButton tone="ghost" onClick={() => setProcessingDialog({ open: true, item })}>Editar</ActionButton>
                </div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Nenhuma atividade de tratamento cadastrada.</div>
            )}
          </div>
        </Section>

        <Section title="Mapa de Atenção" subtitle="Leitura rápida dos pontos que exigem governança mais forte.">
          <div className="space-y-3">
            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Tratamentos críticos</div>
              <div className="mt-3 space-y-2">
                {highRiskProcesses.length ? highRiskProcesses.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-danger/14 bg-danger/8 px-3 py-2 text-sm text-on-surface">
                    {item.process_name}
                  </div>
                )) : <div className="text-sm text-on-surface/62">Nenhum tratamento crítico mapeado.</div>}
              </div>
            </Surface>
            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Demandas do titular</div>
              <div className="mt-2 text-3xl font-black text-on-surface">{summary.requests?.open ?? 0}</div>
              <div className="mt-1 text-sm text-on-surface/62">Solicitações abertas ou em análise.</div>
            </Surface>
            <Surface stripe={false} className="p-4">
              <div className="text-sm font-bold text-on-surface">Incidentes notificados</div>
              <div className="mt-2 text-3xl font-black text-on-surface">{summary.incidents?.notified ?? 0}</div>
              <div className="mt-1 text-sm text-on-surface/62">Comunicações formais registradas.</div>
            </Surface>
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Evidência Complementar de Acesso"
          subtitle="Esta leitura apoia a proteção de dados com rastreabilidade de acesso: quem acessou o sistema, quando, de qual IP, em qual rota, por qual método e com qual resultado."
        >
          <div className="grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Carregando trilha de acesso institucional...</div>
            ) : authEvents.length ? authEvents.map((item) => (
              <Surface key={`auth-${item.id}`} stripe={false} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-primary/16 bg-primary/10 text-primary">
                        <KeyRound size={16} />
                      </div>
                      <div className="text-sm font-bold text-on-surface">{item.username || 'Operador não identificado'}</div>
                      <StatusPill label={item.success ? 'Sucesso' : 'Falha'} tone={item.success ? 'success' : 'danger'} />
                      <StatusPill label={item.status || 'observado'} tone={item.success ? 'primary' : 'warning'} />
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-on-surface/68 md:grid-cols-2 xl:grid-cols-3">
                      <div>Evento: {item.action || '—'}</div>
                      <div>IP: {item.ip_address || '—'}</div>
                      <div>Rota: {item.route || '—'}</div>
                      <div>Método: {item.method || '—'}</div>
                      <div>Data/Hora: {formatDate(item.created_at)}</div>
                      <div>Resultado: {item.success ? 'acesso autorizado' : 'acesso recusado'}</div>
                    </div>
                  </div>
                </div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Nenhum evento de acesso institucional encontrado.</div>
            )}
          </div>
        </Section>

        <Section
          title="Solicitações dos Titulares"
          subtitle="Atendimento formal aos direitos do titular previstos na LGPD."
          actions={<ActionButton tone="ghost" icon={Plus} onClick={() => setRequestDialog({ open: true, item: null })}>Nova solicitação</ActionButton>}
        >
          <div className="grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Carregando solicitações...</div>
            ) : requests.length ? requests.map((item) => (
              <Surface key={item.id} stripe={false} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-bold text-on-surface">{item.requester_name}</div>
                      <StatusPill label={requestTypeLabel(item.request_type)} tone="primary" />
                      <StatusPill label={item.status} tone={['atendido', 'encerrado'].includes(item.status) ? 'success' : item.status === 'indeferido' ? 'danger' : 'warning'} />
                    </div>
                    <div className="mt-2 text-sm text-on-surface/68">Prazo: {item.due_date || 'não informado'} • Atualizado em {formatDate(item.updated_at)}</div>
                    <div className="mt-2 text-sm text-on-surface/62">{item.response_summary || item.notes || 'Sem resposta formal registrada.'}</div>
                  </div>
                  <ActionButton tone="ghost" onClick={() => setRequestDialog({ open: true, item })}>Editar</ActionButton>
                </div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Nenhuma solicitação cadastrada.</div>
            )}
          </div>
        </Section>

        <Section
          title="Incidentes de Proteção de Dados"
          subtitle="Registro e acompanhamento de incidentes, impacto, contenção e comunicação."
          actions={<ActionButton tone="ghost" icon={Plus} onClick={() => setIncidentDialog({ open: true, item: null })}>Novo incidente</ActionButton>}
        >
          <div className="grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Carregando incidentes...</div>
            ) : incidents.length ? incidents.map((item) => (
              <Surface key={item.id} stripe={false} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-bold text-on-surface">{item.title}</div>
                      <StatusPill label={item.status} tone={item.status === 'encerrado' ? 'success' : 'warning'} />
                      <StatusPill label={`Sev. ${item.severity}`} tone={['alto', 'critico'].includes(item.severity) ? 'danger' : item.severity === 'medio' ? 'warning' : 'neutral'} />
                      {item.authority_notified ? <StatusPill label="Autoridade comunicada" tone="primary" /> : null}
                    </div>
                    <div className="mt-2 text-sm text-on-surface/68">Ocorrido em {formatDate(item.occurred_at)} • Reportado em {formatDate(item.reported_at)}</div>
                    <div className="mt-2 text-sm text-on-surface/62">{item.summary || item.notes || 'Sem resumo registrado.'}</div>
                  </div>
                  <ActionButton tone="ghost" onClick={() => setIncidentDialog({ open: true, item })}>Editar</ActionButton>
                </div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Nenhum incidente LGPD registrado.</div>
            )}
          </div>
        </Section>
      </div>

      <Section title="Trilha de Auditoria LGPD" subtitle="Toda alteração institucional do módulo fica registrada em trilha própria protegida.">
        <div className="grid gap-3">
          {loading ? (
            <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Carregando trilha LGPD...</div>
          ) : audit.length ? audit.map((item) => (
            <Surface key={item.id} stripe={false} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label={item.entity_type} tone="primary" />
                    <StatusPill label={item.success ? 'Sucesso' : 'Falha'} tone={item.success ? 'success' : 'danger'} />
                    <div className="text-sm font-bold text-on-surface">{item.action}</div>
                  </div>
                  <div className="mt-2 text-sm text-on-surface/68">{item.message || 'Operação institucional registrada.'}</div>
                  <div className="mt-1 text-xs text-on-surface/56">
                    Usuário: {item.actor_username || 'sistema'} • IP: {item.actor_ip || 'não informado'} • {formatDate(item.created_at)}
                  </div>
                </div>
              </div>
            </Surface>
          )) : (
            <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">Nenhum evento de auditoria LGPD registrado.</div>
          )}
        </div>
      </Section>
    </div>
  );
}
