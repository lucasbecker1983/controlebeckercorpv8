import { useEffect, useMemo, useState } from 'react';
import { Activity, FileCheck2, KeyRound, RefreshCcw, ScanSearch, ShieldAlert, ShieldCheck, UserCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { ActionButton, ModuleHeader, Surface, StatusChip } from '../components/ui/primitives';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function toneFromSuccess(value) {
  return value ? 'success' : 'danger';
}

export default function InstitutionalTrail() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authEvents, setAuthEvents] = useState([]);
  const [adminTrail, setAdminTrail] = useState([]);
  const [proxyLogs, setProxyLogs] = useState([]);

  const load = async () => {
    setLoading(true);
    setError('');
    const [authRes, adminRes, proxyRes] = await Promise.allSettled([
      api.get('/api/auth/activity?limit=180'),
      api.get('/api/bloqueios-liberacoes/audit?period=7d'),
      api.get('/api/proxy/action-logs?limit=80'),
    ]);

    if (authRes.status === 'fulfilled') setAuthEvents(Array.isArray(authRes.value.data) ? authRes.value.data : []);
    if (adminRes.status === 'fulfilled') setAdminTrail(Array.isArray(adminRes.value.data) ? adminRes.value.data : []);
    if (proxyRes.status === 'fulfilled') setProxyLogs(Array.isArray(proxyRes.value.data) ? proxyRes.value.data : []);

    const failures = [
      authRes.status === 'rejected' ? 'autenticação' : null,
      adminRes.status === 'rejected' ? 'trilha administrativa' : null,
      proxyRes.status === 'rejected' ? 'operações DNS/Proxy' : null,
    ].filter(Boolean);

    if (failures.length) {
      setError(`Falha parcial em: ${failures.join(', ')}.`);
    }

    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const summary = useMemo(() => {
    const authSuccess = authEvents.filter((item) => item.success).length;
    const authFailure = authEvents.filter((item) => !item.success).length;
    const adminSuccess = adminTrail.filter((item) => item.success).length;
    const adminFailure = adminTrail.filter((item) => !item.success).length;
    const operators = new Set([
      ...authEvents.map((item) => item.username).filter(Boolean),
      ...adminTrail.map((item) => item.requested_by).filter(Boolean),
      ...proxyLogs.map((item) => item.requested_by).filter(Boolean),
    ]).size;
    return {
      authSuccess,
      authFailure,
      adminSuccess,
      adminFailure,
      operators,
    };
  }, [authEvents, adminTrail, proxyLogs]);

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      <ModuleHeader
        eyebrow="Governança"
        title="Trilha Institucional"
        description="Camada institucional de responsabilização. Aqui ficam a trilha administrativa, eventos de autenticação e operações sensíveis do ambiente, sem repetir relatório de dados ou radar operacional."
        badges={(
          <>
            <StatusChip label="Responsabilização administrativa" tone="primary" />
            <StatusChip label="Autenticação auditável" tone="success" />
            <StatusChip label="Operações sensíveis rastreadas" tone="warning" />
          </>
        )}
        actions={(
          <ActionButton tone="ghost" icon={RefreshCcw} onClick={() => load().catch(() => null)}>
            Atualizar trilha
          </ActionButton>
        )}
      />

      {error ? (
        <Surface className="p-5">
          <div className="text-sm font-semibold text-danger">{error}</div>
        </Surface>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <Surface className="p-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-info/18 bg-info/10 text-info">
            <ShieldCheck size={20} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Autenticações válidas</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-on-surface">{summary.authSuccess}</div>
        </Surface>

        <Surface className="p-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-danger/18 bg-danger/10 text-danger">
            <ShieldAlert size={20} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Falhas de autenticação</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-on-surface">{summary.authFailure}</div>
        </Surface>

        <Surface className="p-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/16 bg-primary/10 text-primary">
            <FileCheck2 size={20} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Ações administrativas</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-on-surface">{adminTrail.length}</div>
        </Surface>

        <Surface className="p-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-300">
            <Activity size={20} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Operações DNS/Proxy</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-on-surface">{proxyLogs.length}</div>
        </Surface>

        <Surface className="p-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-outline/16 bg-surface-high/72 text-on-surface">
            <UserCircle2 size={20} />
          </div>
          <div className="mt-4 text-[11px] font-semibold tracking-tight text-on-surface/62">Operadores distintos</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-on-surface">{summary.operators}</div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Surface className="p-6 xl:col-span-1">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Autenticação e sessão</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-on-surface">Quem entrou, falhou ou encerrou sessão</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface/64">
            Esta trilha mostra autenticação, refresh, logout e falhas de acesso no ciclo institucional do sistema.
          </p>

          <div className="mt-6 grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Carregando autenticação institucional...
              </div>
            ) : authEvents.length ? authEvents.slice(0, 16).map((item) => (
              <Surface key={`auth-${item.id}`} stripe={false} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={item.success ? 'Sucesso' : 'Falha'} tone={toneFromSuccess(item.success)} />
                  <StatusChip label={item.status || 'observado'} tone={item.success ? 'primary' : 'warning'} />
                </div>
                <div className="mt-3 text-sm font-bold text-on-surface">{item.action}</div>
                <div className="mt-2 text-sm text-on-surface/68">{item.username || 'Operador não identificado'}</div>
                <div className="mt-1 text-xs text-on-surface/56">IP {item.ip_address || '—'} • {formatDate(item.created_at)}</div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Nenhuma trilha de autenticação encontrada.
              </div>
            )}
          </div>
        </Surface>

        <Surface className="p-6 xl:col-span-1">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Trilha administrativa</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-on-surface">Políticas, apply, rollback e decisões operadas</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface/64">
            Aqui ficam os atos administrativos do módulo de políticas institucionais, inclusive alterações de domínio, escopo, contingência e aplicação do motor.
          </p>

          <div className="mt-6 grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Carregando trilha administrativa...
              </div>
            ) : adminTrail.length ? adminTrail.slice(0, 16).map((item) => (
              <Surface key={`admin-${item.id}`} stripe={false} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={item.success ? 'Executado' : 'Falhou'} tone={toneFromSuccess(item.success)} />
                  {item.vlan_id ? <StatusChip label={`VLAN ${item.vlan_id}`} tone="neutral" /> : null}
                </div>
                <div className="mt-3 text-sm font-bold text-on-surface">{item.action}</div>
                <div className="mt-2 text-sm text-on-surface/68">{item.message || item.requested_by || 'Ação institucional'}</div>
                <div className="mt-1 text-xs text-on-surface/56">{item.requested_by || 'system'} • {formatDate(item.created_at)}</div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Nenhuma ação administrativa encontrada.
              </div>
            )}
          </div>
        </Surface>

        <Surface className="p-6 xl:col-span-1">
          <div className="text-[11px] font-semibold tracking-tight text-primary">Operações observáveis</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-on-surface">Eventos sensíveis do eixo DNS/Proxy</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface/64">
            Operações como regeneração de certificado, limpeza de radar e reinício de logger permanecem auditáveis aqui, mas o radar operacional em si fica no módulo de observabilidade.
          </p>

          <div className="mt-6 grid gap-3">
            {loading ? (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Carregando operações observáveis...
              </div>
            ) : proxyLogs.length ? proxyLogs.slice(0, 16).map((item) => (
              <Surface key={`proxy-${item.id}`} stripe={false} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={item.success ? 'Executado' : 'Falhou'} tone={toneFromSuccess(item.success)} />
                  <StatusChip label="DNS/Proxy" tone="primary" />
                </div>
                <div className="mt-3 text-sm font-bold text-on-surface">{item.action}</div>
                <div className="mt-2 text-sm text-on-surface/68">{item.message || 'Operação observável registrada.'}</div>
                <div className="mt-1 text-xs text-on-surface/56">{item.requested_by || 'system'} • {formatDate(item.created_at)}</div>
              </Surface>
            )) : (
              <div className="rounded-[var(--surface-radius)] border border-dashed border-outline/16 bg-surface-high/55 px-5 py-6 text-sm text-on-surface/62">
                Nenhuma operação sensível registrada neste recorte.
              </div>
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
