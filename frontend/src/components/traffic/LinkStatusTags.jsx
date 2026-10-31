import { fmt } from './trafficModel';

/*
 * Estado do link no cabeçalho do Mapa de Tráfego (página normal e Modo TV).
 * Duas coisas separadas: o gateway do provedor (a Secretaria alcança a Nicknetwork?) e a internet além dele.
 *  - gateway sem resposta: o problema está entre a Secretaria e o provedor;
 *  - gateway responde e a internet não: o problema está além do gateway do provedor.
 * `prefix` é "tm" (página normal) ou "tv" (Modo TV): usa as classes de etiqueta de cada tela.
 */

// Leitura da sentinela com mais de 20 s é velha: mostra "verificando" em vez de afirmar algo que pode ter mudado.
export const LINK_STALE_MS = 20000;

export const linkStateOf = (link, now = Date.now()) => {
  if (!link || !link.checked_at || now - link.checked_at > LINK_STALE_MS) return 'checking';
  return link.state || 'checking';
};

const rtt = (v) => (v == null ? '' : ` · ${v < 1 ? '<1' : fmt(v)} ms`);

const since = (ts, now) => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  const at = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (s < 60) return `desde ${at} (${s} s)`;
  if (s < 3600) return `desde ${at} (${Math.round(s / 60)} min)`;
  return `desde ${at} (${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min)`;
};

export default function LinkStatusTags({ link, prefix = 'tm', now = Date.now() }) {
  const state = linkStateOf(link, now);
  if (!link || state === 'checking') return <span className={`${prefix}-tag`} title="Verificando o link com o provedor e a internet">link: verificando</span>;
  const provider = link.provider || 'Provedor';
  const gw = link.gateway || {};
  const gwDown = state === 'no_gateway';
  const worldDown = state !== 'ok';
  return (
    <>
      <span
        className={`${prefix}-tag ${gwDown ? 'down pulse' : 'ok'}`}
        title={`Gateway do provedor ${provider} (${gw.ip}): ${gwDown ? 'sem resposta. O problema está entre a Secretaria e o provedor.' : 'responde.'}`}
      >
        {provider} {gw.ip}{gwDown ? ' · sem resposta' : rtt(gw.rtt_ms)}
      </span>
      <span
        className={`${prefix}-tag ${worldDown ? 'down pulse' : 'ok'}`}
        title={`Internet (${(link.world?.targets || []).map((t) => `${t.label} ${t.ip}: ${t.online ? 'responde' : 'sem resposta'}`).join('; ')})`}
      >
        {worldDown ? 'internet OFF' : `internet OK${rtt(link.world?.rtt_ms)}`}
      </span>
    </>
  );
}

// Faixa de alerta sob o cabeçalho: diz onde está o problema e desde quando. Só aparece com o link fora.
export function LinkAlert({ link, prefix = 'tm', now = Date.now() }) {
  const state = linkStateOf(link, now);
  if (state !== 'no_gateway' && state !== 'no_world') return null;
  const provider = link.provider || 'Provedor';
  const gwDown = state === 'no_gateway';
  return (
    <div className={`${prefix}-linkalert`} role="alert">
      <span className="lk-dot" />
      <span>
        {gwDown ? `Sem acesso ao gateway da ${provider} (${link.gateway?.ip}): o problema está entre a Secretaria e o provedor` : `O gateway da ${provider} responde, mas não há internet além dele: o problema está no provedor`}
        {' '}<small>· {since(link.since, now)}</small>
      </span>
    </div>
  );
}
