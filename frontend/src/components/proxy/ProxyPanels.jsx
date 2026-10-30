import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Kpi, KpiRow, Notice, Panel, askConfirm, errorMessage, fmtDateTime, toast } from '../ui/kit';

/*
 * Proxy Squid e relatórios do proxy. O filtro principal é o DNS; o Squid é a camada complementar, usada só quando
 * a interceptação está ligada. Decisões de política ficam em Políticas de Acesso.
 */

const when = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
};

function Facts({ items }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-outline px-3 py-2">
          <dt className="text-[11.5px] text-on-surface/50">{label}</dt>
          <dd className="mt-0.5 break-words text-[13.5px] font-semibold text-on-surface">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProxyEngine({ engineStatus, refreshAll }) {
  const [busy, setBusy] = useState('');
  const [certificate, setCertificate] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [cert, actions] = await Promise.allSettled([api.get('/api/proxy/certificate'), api.get('/api/proxy/action-logs?limit=24')]);
    if (cert.status === 'fulfilled') setCertificate(cert.value.data);
    if (actions.status === 'fulfilled') setLogs(Array.isArray(actions.value.data) ? actions.value.data : []);
    const failed = [cert.status === 'rejected' ? 'certificado' : null, actions.status === 'rejected' ? 'trilha técnica' : null].filter(Boolean);
    setError(failed.length ? `Não foi possível ler: ${failed.join(' e ')}.` : '');
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async ({ path, key, title, description, confirmLabel, okMessage, tone }) => {
    if (!(await askConfirm({ title, description, confirmLabel: confirmLabel || title, tone }))) return;
    setBusy(key);
    try {
      await api.post(path);
      toast(okMessage);
      await Promise.all([refreshAll(), load()]);
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível concluir a ação.'), 'danger');
    } finally {
      setBusy('');
    }
  };

  const services = [
    { label: 'Squid', on: engineStatus?.squid_active, text: 'Processo do proxy complementar.' },
    { label: 'Interceptação', on: engineStatus?.redirects_active, text: 'Redireciona o tráfego web para o proxy.' },
    { label: 'Logger', on: engineStatus?.logger_active, text: 'Coleta os registros do proxy.' },
    { label: 'Bypass global', on: engineStatus?.bypass_global, text: 'Passagem direta, sem proxy.', warnWhenOn: true },
  ];

  return (
    <div className="space-y-4">
      {error ? <Notice tone="warning" title="Leitura incompleta">{error}</Notice> : null}

      <KpiRow>
        {services.map((s) => (
          <Kpi key={s.label} label={s.label} value={s.on ? 'Ativo' : 'Inativo'} tone={s.warnWhenOn ? (s.on ? 'warning' : 'success') : (s.on ? 'success' : 'neutral')} sub={s.text} />
        ))}
      </KpiRow>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Estado do proxy" description="Modo de execução e o que está em uso.">
          <Facts items={[
            ['Modo', engineStatus?.enforcement_mode || engineStatus?.mode || 'desligado'],
            ['Fonte de verdade', engineStatus?.source_of_truth || '—'],
            ['Portas ativas', (engineStatus?.active_ports || []).join(', ') || 'nenhuma'],
            ['Última ação', engineStatus?.last_action || '—'],
          ]} />
        </Panel>

        <Panel title="Ações do proxy" description="Mudam como o tráfego web passa pelo servidor. Cada uma pede confirmação.">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={Boolean(busy)} onClick={() => act({ path: '/api/proxy/mode/test-http-only', key: 'http-only', title: 'Ativar interceptação só de HTTP', description: 'O tráfego HTTP (sem criptografia) passa a ser redirecionado ao Squid. O HTTPS não muda.', okMessage: 'Interceptação HTTP ativada.' })}>
              {busy === 'http-only' ? 'Processando…' : 'Ativar só HTTP'}
            </Button>
            <Button disabled={Boolean(busy)} onClick={() => act({ path: '/api/proxy/mode/test-http-https', key: 'http-https', title: 'Ativar interceptação de HTTP e HTTPS', description: 'O HTTP e o HTTPS passam a ser redirecionados ao Squid. Os aparelhos precisam ter o certificado do proxy instalado, senão os sites HTTPS dão erro.', okMessage: 'Interceptação HTTP e HTTPS ativada.' })}>
              {busy === 'http-https' ? 'Processando…' : 'Ativar HTTP e HTTPS'}
            </Button>
            <Button variant="danger-soft" disabled={Boolean(busy)} onClick={() => act({ path: '/api/proxy/mode/off', key: 'off', title: 'Desligar a interceptação', description: 'O tráfego web volta a passar direto, sem o proxy. O filtro por DNS continua valendo.', okMessage: 'Interceptação desligada.', tone: 'danger' })}>
              {busy === 'off' ? 'Processando…' : 'Desligar interceptação'}
            </Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => act({ path: '/api/proxy/logger/restart', key: 'logger', title: 'Reiniciar o logger', description: 'Reinicia a coleta de registros do proxy. Pode perder alguns segundos de registro.', okMessage: 'Logger reiniciado.' })}>
              {busy === 'logger' ? 'Processando…' : 'Reiniciar logger'}
            </Button>
            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => act({ path: '/api/proxy/reports/generate', key: 'report', title: 'Gerar relatório SARG', description: 'Gera um novo relatório com os registros atuais do proxy. Pode levar alguns minutos.', okMessage: 'Relatório solicitado.' })}>
              {busy === 'report' ? 'Processando…' : 'Gerar relatório SARG'}
            </Button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Certificado do proxy HTTPS" description="Autoridade usada pelos aparelhos para confiar no proxy.">
          <Facts items={[
            ['Criado em', when(certificate?.created_at)],
            ['Válido até', when(certificate?.valid_until)],
          ]} />
          <div className="mt-3 rounded-lg border border-outline px-3 py-2">
            <div className="text-[11.5px] text-on-surface/50">Impressão digital</div>
            <div className="mt-0.5 break-all font-mono text-[12.5px] text-on-surface">{certificate?.fingerprint || '—'}</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => window.open('/api/cert/download', '_blank')}>Baixar certificado</Button>
            <Button variant="danger-soft" disabled={Boolean(busy)} onClick={() => act({ path: '/api/proxy/certificate/regenerate', key: 'certificate', title: 'Gerar uma nova autoridade (CA)', description: 'A autoridade atual é substituída. Todos os aparelhos que instalaram o certificado antigo precisam instalar o novo, senão o HTTPS interceptado passa a dar erro.', confirmLabel: 'Gerar nova CA', okMessage: 'Nova CA gerada.', tone: 'danger' })}>
              {busy === 'certificate' ? 'Processando…' : 'Gerar nova CA'}
            </Button>
          </div>
        </Panel>

        <Panel title="Últimas ações no proxy" description="Intervenções registradas no motor." padded={false}>
          <DataTable
            rowKey={(i) => `${i.created_at}-${i.action}`}
            rows={logs}
            empty="Nenhuma ação recente registrada."
            columns={[
              { key: 'created_at', label: 'Quando', width: '150px', render: (i) => <span className="tabular text-on-surface/70">{fmtDateTime(i.created_at)}</span> },
              { key: 'action', label: 'Ação', render: (i) => <span className="font-semibold">{i.action || 'Ação técnica'}</span> },
              { key: 'message', label: 'Detalhe', render: (i) => <span className="text-on-surface/65">{i.message || '—'}</span> },
              { key: 'success', label: 'Resultado', render: (i) => <Badge tone={i.success ? 'success' : 'danger'} dot>{i.success ? 'Sucesso' : 'Falha'}</Badge> },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

export function ProxyReports() {
  const [reports, setReports] = useState([]);
  const [institutional, setInstitutional] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [r, s, i] = await Promise.allSettled([api.get('/api/proxy/reports'), api.get('/api/proxy/stats'), api.get('/api/proxy/reports/institutional')]);
    if (r.status === 'fulfilled') setReports(Array.isArray(r.value.data) ? r.value.data : []);
    if (s.status === 'fulfilled') setStats(s.value.data || null);
    if (i.status === 'fulfilled') setInstitutional(i.value.data || null);
    const failed = [r.status === 'rejected' ? 'relatórios' : null, s.status === 'rejected' ? 'estatísticas do proxy' : null, i.status === 'rejected' ? 'relatório institucional' : null].filter(Boolean);
    setError(failed.length ? `Não foi possível ler: ${failed.join(', ')}.` : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sum = institutional?.executive_summary || {};
  const coverage = sum.explicit_coverage_pct_24h ?? 0;

  return (
    <div className="space-y-4">
      {error ? <Notice tone="warning" title="Leitura incompleta">{error}</Notice> : null}

      <KpiRow>
        <Kpi label="Eventos do proxy" value={stats?.total ?? '—'} sub="Acumulado na trilha do proxy." />
        <Kpi label="Bloqueios do proxy" value={stats?.blocked ?? '—'} tone={stats?.blocked ? 'danger' : 'neutral'} sub="Negados pelo proxy." />
        <Kpi label="Relatórios SARG" value={reports.length} tone="success" sub="Disponíveis para consulta." />
        <Kpi label="Cobertura do proxy (24 h)" value={institutional ? `${coverage}%` : '—'} tone={coverage >= 50 ? 'success' : 'warning'} sub="Parte do tráfego vista pelo proxy" />
      </KpiRow>

      {institutional ? (
        <Panel
          title="Relatório institucional (SARG)"
          description={institutional.scope?.statement || 'Uso explícito do proxy no modo atual.'}
          actions={<Badge tone="primary">{institutional.mode === 'acl-plus-dns' ? 'Modo ACL + DNS' : (institutional.mode || 'Modo não identificado')}</Badge>}
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <Facts items={[
                ['Acessos no SARG', sum.total_accesses ?? '—'],
                ['Eventos do proxy (24 h)', sum.explicit_proxy_events_24h ?? '—'],
                ['Eventos de DNS (24 h)', sum.dns_events_24h ?? '—'],
                ['IPs distintos pelo proxy (24 h)', sum.explicit_proxy_unique_ips_24h ?? '—'],
                ['Relatório', institutional.report?.name || '—'],
                ['Atualizado em', when(institutional.report?.updated_at)],
                ['Último evento do proxy', when(sum.latest_proxy_event_at)],
                ['Veredito', sum.coverage_verdict || '—'],
              ]} />
              {(institutional.scope?.limitations || []).length ? (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-semibold text-on-surface">Limitações do relatório</h3>
                  <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-on-surface/70">
                    {institutional.scope.limitations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-on-surface">Sites mais vistos pelo proxy</h3>
                {(institutional.highlights?.top_sites || []).length ? (
                  <ul className="space-y-1">
                    {institutional.highlights.top_sites.map((item, index) => (
                      <li key={`${item.domain || index}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-outline px-3 py-1.5 text-[13px]">
                        <span className="truncate">{item.domain || 'domínio não identificado'}</span>
                        <span className="tabular text-on-surface/60">{item.connects ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-on-surface/55">Sem leitura suficiente no relatório.</p>}
              </div>
              <div>
                <h3 className="mb-1.5 text-[13px] font-semibold text-on-surface">Tentativas negadas</h3>
                {(institutional.highlights?.denied_attempts || []).length ? (
                  <ul className="space-y-1">
                    {institutional.highlights.denied_attempts.map((item, index) => (
                      <li key={`${item.client_ip || index}-${index}`} className="rounded-lg border border-outline px-3 py-1.5 text-[13px] text-on-surface/75">
                        {item.client_ip || 'IP não identificado'} · {item.domain || 'domínio não identificado'} · {item.occurred_at || 'sem data'}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-[13px] text-on-surface/55">Nenhuma negativa encontrada no relatório.</p>}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Relatórios e arquivos"
        description="Relatórios gerados pelo SARG e outras evidências de navegação pelo proxy, para prestação de contas."
        actions={<Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>}
        padded={false}
      >
        <DataTable
          rows={reports}
          empty={loading ? 'Carregando…' : 'Nenhum relatório indexado no momento.'}
          columns={[
            { key: 'name', label: 'Relatório', render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'updated_at', label: 'Atualizado em', render: (r) => <span className="tabular text-on-surface/70">{when(r.updated_at)}</span> },
            { key: 'actions', label: '', align: 'right', render: (r) => <Button onClick={() => window.open(r.index_url, '_blank')}>Abrir</Button> },
          ]}
        />
      </Panel>
    </div>
  );
}

// Painel do Squid com o próprio carregamento de estado.
export function SquidPanel() {
  const [status, setStatus] = useState(null);
  const refreshAll = useCallback(async () => {
    try {
      setStatus((await api.get('/api/proxy/engine/status')).data);
    } catch {
      setStatus(null);
    }
  }, []);
  useEffect(() => {
    refreshAll();
    const timer = window.setInterval(refreshAll, 10000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);
  return <ProxyEngine engineStatus={status} refreshAll={refreshAll} />;
}
