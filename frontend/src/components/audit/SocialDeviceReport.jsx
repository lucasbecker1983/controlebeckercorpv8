import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Search, UserCog } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Drawer, Field, Kpi, KpiRow, Notice, Panel, Switch, errorMessage, inputCls, toast } from '../ui/kit';

/*
 * Redes sociais por aparelho: uma linha por aparelho ("iPhone da Lavínia Pimentel"), com IP, MAC, VLAN,
 * redes tentadas, dias e horários. Feito para virar um documento curto para o Secretário, sem a lista de eventos.
 */

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - 3 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const PRESETS = [
  { key: 'hoje', label: 'Hoje', from: () => today() },
  { key: '7d', label: 'Últimos 7 dias', from: () => daysAgo(6) },
  { key: '30d', label: 'Últimos 30 dias', from: () => daysAgo(29) },
];
const VLANS = [
  { value: '', label: 'Todas as VLANs' },
  { value: '10', label: 'VLAN 10 · Secretaria' },
  { value: '30', label: 'VLAN 30 · Celulares' },
  { value: '40', label: 'VLAN 40' },
  { value: '50', label: 'VLAN 50 · SINE' },
  { value: '70', label: 'VLAN 70 · Visitantes' },
];
const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const fmtWhen = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attempts = (d) => d.blocked + d.allowed_other;

function printReport({ data, rows, vipRows, vlanLabel }) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const docId = `SGCG-RS-${Date.now().toString(36).toUpperCase()}`;
  const s = data.summary;
  const top = s.networks.slice(0, 3).map((n) => n.name).join(', ');
  // Aparelhos com poucas tentativas viram uma linha só, para o documento não crescer à toa.
  const MIN = 20;
  const main = rows.filter((d) => attempts(d) >= MIN);
  const minor = rows.filter((d) => attempts(d) < MIN);
  const identified = rows.filter((d) => d.person).length;
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) { toast('Permita janelas pop-up para gerar o documento.', 'warning'); return; }
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Redes sociais por aparelho — ${docId}</title>
<style>
@page{size:A4 landscape;margin:1.2cm 1.4cm 1.6cm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111}
.h{display:flex;align-items:center;gap:14px;border-bottom:3px solid #003087;padding-bottom:9px;margin-bottom:12px}
.h img{width:52px;height:58px;object-fit:contain}
.h h1{font-size:12.5pt;color:#003087;text-transform:uppercase;letter-spacing:.3px}
.h h2{font-size:9pt;color:#555;font-weight:normal;margin-top:2px}
.h h3{font-size:11pt;margin-top:5px;text-transform:uppercase;letter-spacing:.3px}
.sum{background:#f0f4fa;border-left:3px solid #003087;padding:8px 12px;margin-bottom:12px;line-height:1.5}
table{width:100%;border-collapse:collapse;font-size:8.5pt}
th{background:#003087;color:#fff;text-align:left;padding:5px 6px;font-size:8pt}
td{padding:3px 6px;border-bottom:1px solid #e1e4ea;vertical-align:top}
.minor{margin-top:8px;font-size:8pt;color:#333;line-height:1.45}
tr:nth-child(even) td{background:#f7f8fa}
.id{font-weight:bold;font-size:9pt}
.sub{color:#555;font-size:7.5pt;margin-top:2px}
.num{text-align:right;white-space:nowrap}
.note{margin-top:10px;font-size:7.5pt;color:#444;line-height:1.45}
.sig{margin-top:34px;display:flex;justify-content:space-between;gap:40px}
.sig div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center;font-size:8.5pt}
.foot{margin-top:14px;display:flex;justify-content:space-between;font-size:7pt;color:#777}
</style></head><body>
<div class="h"><img src="${window.location.origin}/LOGO-JACAREZINHO.png" onerror="this.style.display='none'">
<div><h1>Prefeitura Municipal de Jacarezinho</h1><h2>Secretaria Municipal de Comércio, Indústria, Serviços e Inovação</h2>
<h3>Tentativas de acesso a redes sociais por aparelho</h3></div></div>
<div class="sum">
<b>Período:</b> ${fmtDay(data.period.from)} a ${fmtDay(data.period.to)} · <b>Rede:</b> ${esc(vlanLabel)}<br>
${rows.length ? `<b>${rows.length}</b> aparelho(s) tentaram acessar redes sociais proibidas, somando <b>${fmtNum(s.blocked)}</b> tentativas bloqueadas${top ? ` (principalmente ${esc(top)})` : ''}. ${identified} deles estão identificados pelo nome do responsável.` : 'Nenhum aparelho tentou acessar redes sociais proibidas no período.'}
${vipRows.length ? `<br>${vipRows.length} aparelho(s) VIP usaram redes sociais com acesso autorizado (não constam na tabela).` : ''}
</div>
${main.length ? `<table><thead><tr><th>#</th><th>Aparelho e responsável</th><th>IP · MAC · VLAN</th><th>Redes tentadas</th><th class="num">Tentativas</th><th>Dias</th><th>Último registro</th></tr></thead><tbody>
${main.map((d, i) => `<tr><td>${i + 1}</td>
<td><div class="id">${esc(d.label)}</div><div class="sub">${esc([d.os, d.hostname ? `nome na rede: ${d.hostname}` : '', d.person_from_hostname ? 'nome tirado do próprio aparelho' : '', d.device_from_traffic ? 'tipo deduzido pelo tráfego' : '', d.manual_label ? 'identificado manualmente' : ''].filter(Boolean).join(' · ') || '—')}</div></td>
<td>${esc(d.ips.join(', '))}<div class="sub">${esc(d.mac || 'MAC não registrado')} · VLAN ${esc(d.vlans.join(', '))}</div></td>
<td>${esc(d.networks.slice(0, 4).map((n) => `${n.name} (${fmtNum(n.count)})`).join(', '))}</td>
<td class="num">${fmtNum(attempts(d))}</td>
<td>${d.active_days}</td>
<td>${fmtWhen(d.last_at)}</td></tr>`).join('')}
</tbody></table>` : ''}
${minor.length ? `<p class="minor">Outros ${minor.length} aparelho(s) com menos de ${MIN} tentativas cada (${fmtNum(minor.reduce((t, d) => t + attempts(d), 0))} no total): ${esc(minor.map((d) => `${d.label} (${d.ips[0]})`).join('; '))}.</p>` : ''}
<p class="note">Como ler: cada tentativa é um pedido de conexão feito pelo aplicativo ou pelo navegador; um aplicativo aberto faz dezenas por minuto, e aplicativos instalados também tentam em segundo plano. O número indica insistência de uso, não minutos de navegação. As tentativas foram bloqueadas pela rede; a identificação vem do portal de colaboradores, do cadastro de VIPs, do hotspot de visitantes, do agente dos computadores ou do nome que o próprio aparelho informa à rede.</p>
<div class="sig"><div>Responsável técnico</div><div>Leandro de Azevedo Lima<br>Secretário Municipal de Comércio, Indústria, Serviços e Inovação</div></div>
<div class="foot"><span>SGCG — Sistema de Governança e Controle Governamental · emitido em ${now}</span><span>Nº ${docId}</span></div>
<script>setTimeout(function(){window.print();},500);<\/script>
</body></html>`);
  win.document.close();
}

// Gaveta para dar nome a um aparelho ("Celular Samsung" -> "Celular Samsung do João Silva"). Fica na auditoria.
function IdentifyDrawer({ item, onClose, onSaved }) {
  const [person, setPerson] = useState('');
  const [device, setDevice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setPerson(item.person || '');
    // Mesmo nome da lista, sem o " da Fulana" do fim.
    const shown = item.person ? item.label.replace(new RegExp(` d[ao] ${item.person.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '') : item.label;
    setDevice(/não identificado|MAC privado/.test(shown) ? '' : shown.replace(/ \(iPhone, iPad ou Mac\)$/, ''));
    setNotes('');
    setError('');
  }, [item]);
  if (!item) return null;
  const save = async () => {
    if (person.trim().length < 3 && device.trim().length < 3) { setError('Informe o responsável ou o tipo de aparelho.'); return; }
    setSaving(true);
    try {
      await api.post('/api/device-audit/labels', { mac: item.mac || undefined, ip: item.mac ? undefined : item.ips[0], person, device, notes });
      toast('Aparelho identificado. O nome já vale para todo o histórico dele.', 'success');
      onSaved();
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open
      busy={saving}
      onClose={onClose}
      title="Identificar aparelho"
      description={`${item.label} · ${item.ips.join(', ')} · ${item.mac || 'sem MAC registrado'}. O nome fica registrado na auditoria com o seu usuário.`}
      footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar identificação'}</Button></>}
    >
      <Field id="id-person" label="Responsável" hint="Nome completo de quem usa o aparelho."><input id="id-person" className={inputCls} value={person} onChange={(e) => setPerson(e.target.value)} placeholder="ex.: Maria da Silva" /></Field>
      <Field id="id-device" label="Aparelho" hint="Marca e modelo, se souber."><input id="id-device" className={inputCls} value={device} onChange={(e) => setDevice(e.target.value)} placeholder="ex.: iPhone, Galaxy A54, Moto G84" /></Field>
      <Field id="id-notes" label="Como foi confirmado (opcional)"><input id="id-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex.: conferido com a chefia do setor" /></Field>
      {!item.mac ? <Notice tone="warning">Este aparelho não tem MAC registrado: o nome fica amarrado ao IP {item.ips[0]}.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Drawer>
  );
}

export default function SocialDeviceReport() {
  const [preset, setPreset] = useState('7d');
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [vlan, setVlan] = useState('');
  const [showVip, setShowVip] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [identify, setIdentify] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from, to });
      if (vlan) params.set('vlan', vlan);
      setData((await api.get(`/api/device-audit/social?${params}`)).data);
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível montar o relatório.'));
    } finally {
      setLoading(false);
    }
  }, [from, to, vlan]);
  useEffect(() => { load(); }, [load]);

  const choosePreset = (key) => {
    setPreset(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p) { setFrom(p.from()); setTo(today()); }
  };

  const devices = data?.devices || [];
  const rows = useMemo(() => devices.filter((d) => !d.vip && attempts(d) > 0), [devices]);
  const vipRows = useMemo(() => devices.filter((d) => d.vip), [devices]);
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    const base = showVip ? [...rows, ...vipRows] : rows;
    if (!q) return base;
    return base.filter((d) => [d.label, d.hostname, d.mac, ...d.ips].join(' ').toLocaleLowerCase('pt-BR').includes(q));
  }, [rows, vipRows, showVip, search]);
  const vlanLabel = VLANS.find((v) => v.value === vlan)?.label || 'Todas as VLANs';
  const s = data?.summary;

  const columns = [
    {
      key: 'label', label: 'Aparelho e responsável', render: (d) => (
        <div className="min-w-[220px]">
          <div className="font-semibold text-on-surface">{d.label}{d.vip ? <span className="ml-2 align-middle"><Badge tone="primary">VIP</Badge></span> : null}</div>
          <div className="mt-0.5 text-[12px] text-on-surface/55">{[d.os, d.hostname ? `nome na rede: ${d.hostname}` : '', d.person_from_hostname ? 'nome tirado do aparelho' : '', d.device_from_traffic ? 'tipo deduzido pelo tráfego' : '', d.manual_label ? `identificado por ${d.manual_label.by}` : ''].filter(Boolean).join(' · ') || '—'}</div>
        </div>
      ),
    },
    { key: 'net', label: 'IP · MAC · VLAN', render: (d) => <div className="tabular text-[12.5px]"><div>{d.ips.join(', ')}</div><div className="text-on-surface/55">{d.mac || 'MAC não registrado'} · VLAN {d.vlans.join(', ')}</div></div> },
    { key: 'redes', label: 'Redes tentadas', render: (d) => <div className="flex max-w-[300px] flex-wrap gap-1">{d.networks.slice(0, 4).map((n) => <Badge key={n.name} tone="neutral">{n.name} · {fmtNum(n.count)}</Badge>)}</div> },
    { key: 'n', label: 'Tentativas', align: 'right', render: (d) => <span className="tabular font-semibold">{fmtNum(d.vip ? d.allowed_vip : attempts(d))}</span> },
    { key: 'dias', label: 'Dias', align: 'right', render: (d) => <span className="tabular">{d.active_days}</span> },
    { key: 'last', label: 'Último registro', render: (d) => <span className="tabular text-[12.5px] text-on-surface/65">{fmtWhen(d.last_at)}</span> },
    { key: 'id', label: '', align: 'right', render: (d) => <Button variant={d.person ? 'ghost' : 'secondary'} icon={UserCog} onClick={() => setIdentify(d)} aria-label={`Identificar ${d.label}`} title={d.person ? 'Corrigir identificação' : 'Identificar responsável'}>{d.person ? null : 'Identificar'}</Button> },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title="Redes sociais por aparelho"
        description="Quem tentou acessar redes sociais proibidas, com o aparelho identificado. Uma linha por aparelho, pronta para imprimir."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>
            <Button variant="primary" icon={Printer} onClick={() => printReport({ data, rows, vipRows, vlanLabel })} disabled={!data || loading}>Imprimir para o Secretário</Button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field id="rs-preset" label="Período">
            <select id="rs-preset" className={inputCls} value={preset} onChange={(e) => choosePreset(e.target.value)}>
              {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="custom">Outro período</option>
            </select>
          </Field>
          <Field id="rs-from" label="De"><input id="rs-from" type="date" className={inputCls} value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} /></Field>
          <Field id="rs-to" label="Até"><input id="rs-to" type="date" className={inputCls} value={to} min={from} max={today()} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} /></Field>
          <Field id="rs-vlan" label="Rede">
            <select id="rs-vlan" className={inputCls} value={vlan} onChange={(e) => setVlan(e.target.value)}>
              {VLANS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </Field>
          <Field id="rs-search" label="Buscar">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface/40" />
              <input id="rs-search" className={`${inputCls} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="nome, aparelho, IP ou MAC" />
            </div>
          </Field>
        </div>
      </Panel>

      {error ? <Notice tone="danger" title="Falha ao montar o relatório" action={<Button onClick={load}>Tentar de novo</Button>}>{error}</Notice> : null}

      <KpiRow>
        <Kpi label="Aparelhos que tentaram" value={s ? rows.length : '—'} tone={rows.length ? 'warning' : 'neutral'} sub={s ? `${rows.filter((d) => d.person).length} identificados pelo nome` : undefined} />
        <Kpi label="Tentativas bloqueadas" value={s ? fmtNum(s.blocked) : '—'} sub={s?.networks?.length ? `mais tentada: ${s.networks[0].name}` : undefined} />
        <Kpi label="Passaram sem bloqueio" value={s ? fmtNum(s.allowed_other) : '—'} tone={s?.allowed_other ? 'danger' : 'success'} sub="fora dos VIPs" />
        <Kpi label="VIPs com acesso autorizado" value={s ? vipRows.length : '—'} sub={s ? `${fmtNum(s.allowed_vip)} acessos` : undefined} />
      </KpiRow>

      {s?.allowed_other ? (
        <Notice tone="warning" title="Houve acessos não bloqueados no período">
          {fmtNum(s.allowed_other)} acessos de aparelhos que não são VIP passaram. Até 10/11/2026 existiam liberações por horário (almoço e sexta-feira) e endereços do Facebook liberados junto com o WhatsApp; elas foram desligadas nessa data.
        </Notice>
      ) : null}

      <Panel
        title={`Aparelhos (${visible.length})`}
        description="Ordenado por número de tentativas. Cada tentativa é um pedido de conexão do aplicativo; apps instalados também tentam em segundo plano."
        actions={<label className="flex items-center gap-2 text-[13px] text-on-surface/75"><Switch checked={showVip} onChange={setShowVip} label="Mostrar VIPs" /> Mostrar VIPs</label>}
        padded={false}
      >
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(d) => d.mac || d.ips.join(',')}
          empty={loading ? 'Montando o relatório…' : 'Nenhum aparelho tentou acessar redes sociais neste período.'}
        />
      </Panel>
      <IdentifyDrawer item={identify} onClose={() => setIdentify(null)} onSaved={() => { setIdentify(null); load(); }} />
    </div>
  );
}
