import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tv } from 'lucide-react';
import { DataTable, PageHeader } from '../components/ui/kit';
import { VlanChip } from '../components/policies/shared';
import TrafficCanvas from '../components/traffic/TrafficCanvas';
import { TM_CSS } from '../components/traffic/trafficStyles';
import { BASE_W, MIN_W, POLL_MS, buildModel, fmt, layoutModel, pct, useFonts, useTrafficData } from '../components/traffic/trafficModel';

/*
 * Mapa de Tráfego em camadas, fiel ao protótipo da auditoria UI/UX:
 * DISPOSITIVOS → VLANs → LINK → SITES, ligações com espessura = banda e partículas no sentido escolhido.
 *
 * - Cores lidas do tema do sistema (claro ou escuro) e relidas quando o tema muda.
 * - Todos os IPs com tráfego aparecem (sem limite), com download e upload no rótulo.
 * - O nó com a maior banda agora fica vermelho e piscando, exceto o NVR (ver TOP_IGNORE).
 * - Tráfego interno (ex.: câmeras ↔ NVR) vai da VLAN direto a "Rede interna", sem passar pelo link.
 * O desenho e o modelo ficam em components/traffic e também alimentam o Modo TV (/mapa-trafego/tv).
 */

export default function TrafficMap() {
  useFonts();
  const [mode, setMode] = useState('d');
  const [paused, setPaused] = useState(false);
  const [sel, setSel] = useState(null);
  const [boxW, setBoxW] = useState(BASE_W);
  const wrapRef = useRef(null);
  const { data, error } = useTrafficData(paused, POLL_MS);

  // Largura disponível: o mapa ocupa o espaço todo; abaixo de MIN_W rola na horizontal.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setBoxW(Math.floor(el.clientWidth || BASE_W));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => buildModel(data, mode), [data, mode]);
  const LINK = Number(data?.link_mbps || 300);
  const LW = Math.max(MIN_W, boxW);
  const geo = useMemo(() => layoutModel(model, LW), [model, LW]);

  const keyOfSel = (x) => (x ? (x.t === 'site' ? `site:${x.key}` : x.key) : null);
  const select = useCallback((next) => setSel((cur) => (cur && next && keyOfSel(cur) === keyOfSel(next) ? null : next)), []);

  const devicesByTotal = useMemo(() => (model ? [...model.devices].sort((a, b) => b.total - a.total) : []), [model]);
  const topIps = devicesByTotal.slice(0, 5);
  const topSites = model ? model.sites.filter((t) => !t.internal && t.key !== '__outros__').slice(0, 5) : [];
  const selDev = sel?.t === 'dev' ? model?.devices.find((d) => d.ip === sel.ip) : null;
  const selSite = sel?.t === 'site' ? model?.sites.find((t) => t.key === sel.key) : null;
  const selVlan = sel?.t === 'vlan' ? model?.vlans.find((v) => v.id === sel.id) : null;
  const vName = (id) => model?.vlans.find((v) => v.id === id)?.name || '';
  const topDev = model?.topIp ? model.devices.find((d) => d.ip === model.topIp) : null;
  const stale = data?.updated_at && Date.now() - Number(data.updated_at) > 60000;
  const narrow = boxW < MIN_W;

  return (
    <div className="space-y-4">
      <style>{TM_CSS}</style>
      <PageHeader
        title="Mapa de Tráfego"
        description={`Dispositivos à esquerda, VLANs, o link de ${LINK} Mbps no centro e os sites à direita. A espessura de cada ligação é a banda em uso. Clique num IP para ver os sites dele, ou num site para ver quem está puxando.`}
        actions={<a href="/mapa-trafego/tv" target="_blank" rel="noreferrer" className="tm-btn" style={{ background: 'var(--md-container)', color: 'var(--md-on-surface)' }}><Tv size={15} style={{ marginRight: 6 }} />Modo TV</a>}
      />

      <div className="tm">
        <div className="tm-bar">
          <span className="tm-title">Mapa de Tráfego</span>
          <span className={`tm-tag ${paused ? 'paused' : 'live'}`}>{paused ? 'pausado' : 'ao vivo'}</span>
          {data?.updated_at ? <span className={`tm-tag ${stale ? 'late' : ''}`}>{stale ? 'coletor atrasado · ' : ''}{new Date(Number(data.updated_at)).toLocaleTimeString('pt-BR')}</span> : null}
          {model ? <span className="tm-tag">{model.devices.length} IP{model.devices.length === 1 ? '' : 's'} com tráfego</span> : null}
          {topDev ? <span className="tm-tag top"><span className="tm-dot" style={{ marginRight: 6, verticalAlign: 'middle' }} />maior consumo: {topDev.ip}</span> : null}
          <div className="tm-seg" role="group" aria-label="Sentido do tráfego">
            <button type="button" aria-pressed={mode === 'd'} onClick={() => setMode('d')}>Download</button>
            <button type="button" aria-pressed={mode === 'u'} onClick={() => setMode('u')}>Upload</button>
          </div>
          <button type="button" className="tm-btn" onClick={() => setPaused((p) => !p)}>{paused ? 'Retomar' : 'Pausar'}</button>
        </div>
        <div className="tm-body">
          <div className="tm-canvas" ref={wrapRef}>
            {error && !data ? <div className="tm-hint" style={{ color: 'var(--md-danger)' }}>Não foi possível ler o tráfego. Verifique se o backend está no ar.</div> : null}
            {narrow ? <div className="tm-hint">Arraste para os lados para ver o mapa inteiro.</div> : null}
            <TrafficCanvas
              model={model}
              geo={geo}
              LW={LW}
              mode={mode}
              sel={sel}
              LINK={LINK}
              paused={paused}
              interactive
              onSelect={select}
              label={`Mapa de tráfego: ${model?.devices.length || 0} IPs com tráfego, link a ${fmt(model?.wanDown)} Mbps de download e ${fmt(model?.wanUp)} de upload${topDev ? `; maior consumo ${topDev.ip}` : ''}. A lista completa está na tabela abaixo.`}
            />
          </div>
          <aside className="tm-side">
            <div className="tm-gauge">
              {[['Download', model?.wanDown], ['Upload', model?.wanUp]].map(([label, v]) => (
                <div key={label}>
                  <div className="tm-lbl">{label}</div>
                  <div className="tm-val">{model ? `${fmt(v)} Mbps` : '—'}</div>
                  <div className="tm-pct">{model ? `${pct(v || 0, LINK)}% de ${LINK} Mbps` : ''}</div>
                </div>
              ))}
            </div>
            <div className="tm-rank">
              <h3>Quem mais consome</h3>
              <ol>
                {topIps.map((d) => (
                  <li key={d.ip} className={sel?.key === `dev:${d.ip}` ? 'sel' : ''} onClick={() => select({ t: 'dev', ip: d.ip, key: `dev:${d.ip}` })} title={d.kind}>
                    <span className="tm-name tm-mono">{d.ip === model.topIp ? <span className="tm-dot" style={{ marginRight: 6 }} /> : null}{d.ip}</span>
                    <span className="tm-mb">↓{fmt(d.down)} ↑{fmt(d.up)}</span>
                    <span className="tm-barline"><i style={{ width: `${Math.min(100, (d.total / LINK) * 300).toFixed(1)}%`, background: `var(--vlan-${d.vlan}, var(--vlan-80))` }} /></span>
                  </li>
                ))}
                {!topIps.length ? <li className="tm-pct empty">Sem tráfego agora.</li> : null}
              </ol>
            </div>
            <div className="tm-rank">
              <h3>Sites mais pesados</h3>
              <ol>
                {topSites.map((t) => (
                  <li key={t.key} className={sel?.t === 'site' && sel.key === t.key ? 'sel' : ''} onClick={() => select({ t: 'site', key: t.key })}>
                    <span className="tm-name">{t.name}</span>
                    <span className="tm-mb">{pct(t.val, LINK)}%</span>
                    <span className="tm-barline"><i style={{ width: `${Math.min(100, (t.val / LINK) * 300).toFixed(1)}%`, background: 'var(--vlan-80)' }} /></span>
                  </li>
                ))}
                {!topSites.length ? <li className="tm-pct empty">Nenhum site de internet agora.</li> : null}
              </ol>
            </div>
            <div className="tm-detail">
              {selDev ? (
                <>
                  <h3 className="tm-mono">{selDev.ip}</h3>
                  <span className="tm-muted">{selDev.kind} · VLAN {selDev.vlan} {vName(selDev.vlan)}{selDev.qosVip ? ' · faixa prioritária' : ''}</span>
                  {selDev.ip === model.topIp ? <span className="tm-crit">Maior consumo da rede agora</span> : null}
                  <span className="tm-mono">↓{fmt(selDev.down)} ↑{fmt(selDev.up)} Mbps <span className="tm-muted">(internet ↓{fmt(selDev.inetDown)} ↑{fmt(selDev.inetUp)} · interno ↓{fmt(selDev.intDown)} ↑{fmt(selDev.intUp)})</span></span>
                  <div>{selDev.flows.map((f) => <div key={f.site}>{model.sites.find((x) => x.key === f.site)?.name || f.site} <span className="tm-mono tm-muted">↓{fmt(f.d)} ↑{fmt(f.u)}</span></div>)}</div>
                  <div className="tm-acts">
                    <Link to={`/acoes-rapidas?acao=banda&ip=${selDev.ip}`}>Limitar banda</Link>
                    <Link to="/politicas?tab=regras">Bloquear</Link>
                    <Link to={`/radar-dns?ip=${selDev.ip}`}>Ver no Radar DNS</Link>
                  </div>
                </>
              ) : selSite ? (
                <>
                  <h3>{selSite.name}</h3>
                  {selSite.dom ? <span className="tm-mono tm-muted">{selSite.dom}</span> : null}
                  <span className="tm-mono">↓{fmt(selSite.down)} ↑{fmt(selSite.up)} Mbps{selSite.internal ? <span className="tm-muted"> · interno, não usa o link</span> : null}</span>
                  <div>
                    {model.devices.filter((d) => d.flows.some((f) => f.site === selSite.key)).sort((a, b) => b.total - a.total).map((d) => {
                      const f = d.flows.find((x) => x.site === selSite.key);
                      return <div key={d.ip}><span className="tm-mono">{d.ip}</span> <span className="tm-mono tm-muted">↓{fmt(f.d)} ↑{fmt(f.u)}</span></div>;
                    })}
                  </div>
                  {selSite.dom ? (
                    <div className="tm-acts">
                      <Link to={`/acoes-rapidas?acao=bloquear&dominio=${selSite.dom}`}>Bloquear site</Link>
                      <Link to="/politicas?tab=horarios">Limitar por horário</Link>
                    </div>
                  ) : null}
                </>
              ) : selVlan ? (
                <>
                  <h3>VLAN {selVlan.id} · {selVlan.name}</h3>
                  <span className="tm-muted">Internet: {fmt(selVlan.inet)} de {selVlan.limit ?? '—'} Mbps do limite de QoS ({mode === 'd' ? 'download' : 'upload'}){selVlan.internal > 0.05 ? ` · interno ${fmt(selVlan.internal)} Mbps` : ''}.</span>
                  <span className="tm-muted">{selVlan.count} IP{selVlan.count === 1 ? '' : 's'} com tráfego · {selVlan.neighbors} aparelhos ligados</span>
                  <div className="tm-acts">
                    <Link to="/rede?tab=qos">Ajustar QoS</Link>
                    <Link to="/politicas?tab=horarios">Horários</Link>
                    <Link to="/operacoes?tab=emergencia">Bloqueio total</Link>
                  </div>
                </>
              ) : (
                <span className="tm-muted">Clique num nó do mapa ou num item da lista para ver detalhes.</span>
              )}
            </div>
          </aside>
        </div>
        <div className="tm-legend">
          {(model?.vlans || []).map((v) => (
            <span key={v.id}><i style={{ background: `var(--vlan-${v.id}, var(--vlan-99))` }} />VLAN {v.id} {v.name}{v.limit ? ` · QoS ${v.limit} Mbps` : ''}</span>
          ))}
          <span><span className="tm-dot" />Maior consumo agora (o NVR 192.168.10.50 não entra)</span>
          <span>Anel da VLAN: uso do limite (verde, âmbar acima de 70%, vermelho acima de 90%)</span>
          <span>Rede interna: tráfego entre VLANs, não passa pelo link</span>
        </div>
      </div>

      <section className="sgcg-card min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-on-surface">Todos os IPs com tráfego ({devicesByTotal.length})</h2>
            <p className="mt-0.5 text-[12.5px] leading-5 text-on-surface/55">Atualiza a cada {POLL_MS / 1000} s. Clique numa linha para destacá-la no mapa.</p>
          </div>
        </div>
        <DataTable
          rowKey="ip"
          rows={devicesByTotal}
          empty="Nenhum IP com tráfego agora."
          onRowClick={(d) => select({ t: 'dev', ip: d.ip, key: `dev:${d.ip}` })}
          columns={[
            {
              key: 'ip', label: 'IP', render: (d) => (
                <div className="min-w-0">
                  <div className="tabular flex items-center gap-1.5 font-medium">{d.ip === model.topIp ? <span className="tm-dot" title="Maior consumo agora" /> : null}{d.ip}</div>
                  <div className="truncate text-[11.5px] text-on-surface/50">{d.kind}</div>
                </div>
              ),
            },
            { key: 'vlan', label: 'VLAN', render: (d) => <VlanChip id={d.vlan} small /> },
            { key: 'down', label: 'Download', align: 'right', mono: true, render: (d) => `${fmt(d.down)} Mbps` },
            { key: 'up', label: 'Upload', align: 'right', mono: true, render: (d) => `${fmt(d.up)} Mbps` },
            { key: 'inet', label: 'Internet ↓/↑', align: 'right', mono: true, render: (d) => <span className="text-on-surface/70">{fmt(d.inetDown)} / {fmt(d.inetUp)}</span> },
            { key: 'int', label: 'Interno ↓/↑', align: 'right', mono: true, render: (d) => <span className="text-on-surface/70">{fmt(d.intDown)} / {fmt(d.intUp)}</span> },
            { key: 'dest', label: 'Principal destino', render: (d) => <span className="text-on-surface/70">{[...d.flows].sort((a, b) => (b.d + b.u) - (a.d + a.u))[0]?.labels?.[0]?.label || '—'}</span> },
          ]}
        />
      </section>
    </div>
  );
}
