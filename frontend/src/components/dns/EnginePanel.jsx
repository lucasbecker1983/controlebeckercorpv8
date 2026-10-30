import { useCallback, useEffect, useState } from 'react';
import { Database, Flame, Power, RefreshCw, RotateCcw, ScanSearch, ShieldAlert, ShieldCheck, Sparkles, Waypoints } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Kpi, KpiRow, Notice, Panel, askConfirm, errorMessage, toast } from '../ui/kit';
import { BASE } from './governance';

/*
 * Motor de filtragem: modo de enforcement (ACL, ACL + DNS, interceptação), saúde dos serviços, integridade dos
 * arquivos gerados e o bypass de emergência. Toda ação que muda a rede pede confirmação antes.
 */

const MODE_LABELS = { 'acl-only': 'ACL', 'acl-plus-dns': 'ACL + DNS', 'intercept-selective': 'Interceptação seletiva' };
const FALLBACK_MODES = [
  { key: 'acl-only', label: 'ACL', hint: 'Aplica somente regras de ACL, sem enforcement DNS.' },
  { key: 'acl-plus-dns', label: 'ACL + DNS', hint: 'Combina ACL com enforcement DNS no Unbound.' },
  { key: 'intercept-selective', label: 'Interceptação seletiva', hint: 'Ativa a interceptação complementar apenas quando exigida.' },
];
const MODE_NOTE = {
  'acl-only': { tone: 'neutral', text: 'Sem enforcement por DNS' },
  'acl-plus-dns': { tone: 'success', text: 'Unbound ativo' },
  'intercept-selective': { tone: 'warning', text: 'Portas 3128/3130 só neste modo' },
};
const INTEGRITY_LABELS = {
  compiler_manifest: 'Manifesto do compilador',
  allowed_rpz: 'Lista de liberações (RPZ)',
  blocked_rpz: 'Lista de bloqueios (RPZ)',
  unbound_conf: 'Configuração do Unbound',
  squid_acl: 'ACLs do Squid',
};

const isHealthy = (value) => ['active', 'healthy', 'ok', 'enabled', 'present'].some((token) => String(value || '').toLowerCase().includes(token));
const statusTone = (value) => {
  const text = String(value || '').toLowerCase();
  if (isHealthy(text)) return 'success';
  if (text.includes('warn')) return 'warning';
  if (text.includes('degrad') || text.includes('fail')) return 'danger';
  return 'neutral';
};
const statusLabel = (value) => {
  const text = String(value || 'unknown').toLowerCase();
  if (isHealthy(text)) return 'Saudável';
  if (text.includes('warn')) return 'Atenção';
  if (text.includes('degrad')) return 'Degradado';
  if (text.includes('fail')) return 'Falha';
  if (text === 'unknown') return 'Sem leitura';
  return String(value);
};

export default function EnginePanel() {
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [vlans, setVlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [s, h, v] = await Promise.allSettled([
      api.get(`${BASE}/status`, { timeout: 15000 }),
      api.get(`${BASE}/health`, { timeout: 15000 }),
      api.get(`${BASE}/vlans`),
    ]);
    if (s.status === 'fulfilled') setStatus(s.value.data);
    if (h.status === 'fulfilled') setHealth(h.value.data);
    if (v.status === 'fulfilled') setVlans(Array.isArray(v.value.data) ? v.value.data : []);
    setError([s, h].some((r) => r.status === 'rejected') ? 'Parte das leituras do motor falhou; os dados abaixo podem estar incompletos.' : '');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const engine = status?.engine || {};
  const mode = engine.enforcement_mode || 'acl-plus-dns';
  const modes = engine.available_modes || FALLBACK_MODES;
  const emergency = Boolean(engine.emergency_bypass || health?.engine?.emergency_bypass);
  const contingency = status?.contingency || health?.contingency || null;
  const contingencyActive = contingency?.status === 'active';

  const act = async (request, okMessage) => {
    setBusy(true);
    try {
      await request();
      toast(okMessage);
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Falha operacional.'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const changeMode = async (next) => {
    const ok = await askConfirm({
      title: `Mudar para o modo ${MODE_LABELS[next] || next}`,
      description: `O motor recompila e aplica as regras agora, para todas as VLANs. Modo atual: ${MODE_LABELS[mode] || mode}. Dá para voltar pelo mesmo botão.`,
      confirmLabel: 'Mudar modo',
    });
    if (ok) act(() => api.post(`${BASE}/mode`, { mode: next, apply_now: true }), `Modo ${MODE_LABELS[next] || next} aplicado.`);
  };

  const runEngine = async (endpoint, label, description, okMessage) => {
    const ok = await askConfirm({ title: label, description, confirmLabel: label });
    if (ok) act(() => api.post(`${BASE}/${endpoint}`), okMessage);
  };

  const toggleEmergency = async () => {
    const enabling = !emergency;
    const ok = await askConfirm({
      title: enabling ? 'Ativar bypass de emergência' : 'Desativar bypass de emergência',
      description: enabling
        ? `Libera TODAS as VLANs na hora, ignorando ACL, DNS e interceptação. O Unbound para de aplicar as listas de bloqueio.${contingencyActive ? ' A contingência DNS ativa será suspensa.' : ''} Use só se o filtro estiver derrubando a rede.`
        : `O motor recompila e volta a aplicar o filtro institucional no modo ${MODE_LABELS[mode] || mode}.`,
      confirmLabel: enabling ? 'Ativar emergência' : 'Desativar emergência',
      tone: 'danger',
    });
    if (ok) act(() => api.post(`${BASE}/emergency-bypass`, { enabled: enabling }), enabling ? 'Bypass de emergência ativado.' : 'Bypass desativado; filtro restaurado.');
  };

  const cards = [
    { icon: Sparkles, label: 'Compilador de políticas', status: health?.services?.policy_compiler || engine.compiler_status || 'unknown', sub: `Manifesto ${health?.divergence?.compiler_version || engine.compiler_version || '—'}`, detail: engine.last_error || 'Sem erro recente.' },
    { icon: ShieldCheck, label: 'Unbound (DNS)', status: health?.services?.unbound || 'unknown', sub: 'Aplica os bloqueios por DNS.', detail: health?.validation?.unbound_validation?.stderr || 'Sem erro recente.' },
    { icon: Waypoints, label: 'Squid (proxy)', status: health?.services?.squid || 'unknown', sub: 'Camada complementar de proxy.', detail: (health?.warnings?.squid || []).join(' | ') || 'Sem aviso relevante.' },
    { icon: ScanSearch, label: 'Divergência', status: health?.services?.drift_monitor || (health?.divergence?.mode_mismatch ? 'degraded' : 'healthy'), sub: 'Banco, manifesto e arquivos.', detail: health?.divergence?.mode_mismatch ? 'O manifesto é diferente do estado salvo.' : 'Sem divergência relevante.' },
    { icon: Database, label: 'PostgreSQL', status: health?.services?.postgresql || 'unknown', sub: 'Guarda as políticas.', detail: 'Listas, exceções, auditoria e estado do motor.' },
    { icon: Flame, label: 'Contingência DNS', status: contingency?.status || 'normal', sub: contingencyActive ? 'Resolvedores públicos liberados.' : 'Sem contingência em curso.', detail: contingency?.reason || 'Operação dentro do padrão.' },
  ];

  const integrity = Object.entries(health?.integrity || {});
  const internalDns = status?.engine?.internal_dns_by_vlan
    || Object.fromEntries(vlans.map((row) => [row.vlan_id, String(row.subnet_cidr || '').replace(/\.0\/\d+$/, '.1')]));
  const managed = engine.managed_vlan_ids || vlans.filter((row) => row.exempt !== true).map((row) => row.vlan_id);
  const dnsRows = (managed || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b).map((vlanId) => ({ vlanId, dns: internalDns?.[vlanId] || '—' }));

  return (
    <div className="space-y-4">
      {error ? <Notice tone="warning" title="Leitura incompleta">{error}</Notice> : null}
      {emergency ? (
        <Notice tone="danger" title="Bypass de emergência ativo" action={<Button variant="danger" onClick={toggleEmergency} disabled={busy}>Desativar emergência</Button>}>
          O filtro está suspenso para todas as VLANs: ACL, DNS e interceptação não estão sendo aplicados.
        </Notice>
      ) : null}

      <KpiRow>
        <Kpi label="Modo de filtragem" value={MODE_LABELS[mode] || mode} sub={mode === 'acl-plus-dns' ? 'Unbound filtra por VLAN' : 'Veja os modos abaixo'} />
        <Kpi label="Bypass de emergência" value={emergency ? 'Ativo' : 'Desligado'} tone={emergency ? 'danger' : 'success'} sub={emergency ? 'Filtro suspenso' : 'Filtro em operação'} />
        <Kpi label="Contingência DNS" value={contingencyActive ? 'Ativa' : 'Normal'} tone={contingencyActive ? 'danger' : 'success'} sub={contingencyActive ? 'Resolvedores públicos liberados' : 'Só o DNS interno'} />
        <Kpi label="Divergência" value={health?.divergence?.mode_mismatch ? 'Há' : 'Nenhuma'} tone={health?.divergence?.mode_mismatch ? 'danger' : 'success'} sub="Manifesto x modo salvo" />
      </KpiRow>

      <Panel title="Modo de enforcement" description="Como o filtro é aplicado. Mudar o modo recompila e aplica as regras na hora, em todas as VLANs.">
        <div className="grid gap-3 md:grid-cols-3">
          {modes.map((item) => {
            const active = item.key === mode;
            const note = MODE_NOTE[item.key];
            return (
              <div key={item.key} className={`flex flex-col gap-3 rounded-lg border p-4 ${active ? 'border-primary/50 bg-primary/5' : 'border-outline'}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-on-surface">{item.label}</h3>
                  <Badge tone={active ? 'primary' : 'neutral'} dot={active}>{active ? 'Ativo' : 'Disponível'}</Badge>
                </div>
                <p className="flex-1 text-[13px] leading-5 text-on-surface/65">{item.hint}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant={active ? 'ghost' : 'primary'} disabled={busy || active} onClick={() => changeMode(item.key)}>{active ? 'Modo atual' : 'Usar este modo'}</Button>
                  {note ? <Badge tone={note.tone}>{note.text}</Badge> : null}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Ações do motor"
        description="Cada ação pede confirmação. Aplicar recompila e aplica as políticas; desfazer volta ao estado anterior; validar só confere, sem mudar nada."
        actions={<Button icon={RefreshCw} onClick={load} disabled={loading || busy}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={Power} disabled={busy} onClick={() => runEngine('apply', 'Aplicar políticas', 'Recompila e aplica as políticas atuais em todas as VLANs.', 'Políticas aplicadas.')}>Aplicar políticas</Button>
          <Button icon={RotateCcw} disabled={busy} onClick={() => runEngine('rollback', 'Desfazer última aplicação', 'Volta o motor ao estado anterior à última aplicação.', 'Aplicação desfeita.')}>Desfazer última aplicação</Button>
          <Button icon={ScanSearch} disabled={busy} onClick={() => runEngine('ops/validate', 'Validar', 'Confere a configuração do motor sem alterar nada.', 'Validação concluída.')}>Validar</Button>
          <Button icon={RefreshCw} disabled={busy} onClick={() => runEngine('ops/reload-engine', 'Recarregar motor', 'Recarrega o motor com os arquivos atuais. Pode interromper o DNS por alguns segundos.', 'Motor recarregado.')}>Recarregar motor</Button>
          {!emergency ? <Button variant="danger-soft" icon={ShieldAlert} disabled={busy} onClick={toggleEmergency}>Bypass de emergência</Button> : null}
        </div>
      </Panel>

      <Panel title="Serviços do motor" description="Estado de cada peça que aplica o filtro." padded={false}>
        <DataTable
          rowKey="label"
          rows={cards}
          empty="Sem leitura."
          columns={[
            { key: 'label', label: 'Serviço', render: (c) => <span className="inline-flex items-center gap-2 font-semibold text-on-surface"><c.icon size={15} className="text-on-surface/50" />{c.label}</span> },
            { key: 'status', label: 'Estado', render: (c) => <Badge tone={statusTone(c.status)} dot>{statusLabel(c.status)}</Badge> },
            { key: 'sub', label: 'Função', render: (c) => <span className="text-on-surface/70">{c.sub}</span> },
            { key: 'detail', label: 'Detalhe', render: (c) => <span className="block max-w-[360px] break-words text-on-surface/60">{c.detail}</span> },
          ]}
        />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Integridade dos arquivos" description="Artefatos que o motor espera encontrar para aplicar e desfazer.">
          {integrity.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {integrity.map(([key, ok]) => (
                <li key={key} className="flex items-center justify-between gap-2 rounded-lg border border-outline px-3 py-2 text-[13px]">
                  <span className="text-on-surface/80">{INTEGRITY_LABELS[key] || key.replace(/_/g, ' ')}</span>
                  <Badge tone={ok ? 'success' : 'danger'} dot>{ok ? 'Disponível' : 'Indisponível'}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="py-4 text-center text-sm text-on-surface/50">{loading ? 'Carregando…' : 'Sem leitura de integridade.'}</p>}
        </Panel>
        <Panel title="DNS interno por VLAN" description="Cada VLAN usa o gateway dela como DNS (Unbound), no modo ACL + DNS.">
          {dnsRows.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {dnsRows.map((row) => (
                <li key={row.vlanId} className="flex items-center justify-between gap-2 rounded-lg border border-outline px-3 py-2 text-[13px]">
                  <span className="text-on-surface/80">VLAN {row.vlanId}</span>
                  <span className="tabular font-semibold text-on-surface">{row.dns}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-4 text-center text-sm text-on-surface/50">{loading ? 'Carregando…' : 'Nenhuma VLAN gerenciada.'}</p>}
        </Panel>
      </div>
    </div>
  );
}
