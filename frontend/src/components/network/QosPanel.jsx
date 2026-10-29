import { useEffect, useState } from 'react';
import { Plus, RefreshCcw, Save, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, ConfirmDialog, Field, Notice, Panel, errorMessage, inputCls, toast } from '../ui/kit';
import { VlanDot } from './VlanTable';

const VLANS = [
  { id: 10, label: 'Secretaria' },
  { id: 30, label: 'Celulares' },
  { id: 40, label: 'Câmeras / CFTV' },
  { id: 50, label: 'SINE' },
  { id: 70, label: 'Visitantes' },
  { id: 80, label: 'VoIP' },
];

export default function QosPanel() {
  const [configs, setConfigs] = useState({});
  const [loadError, setLoadError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = () => api.get('/api/qos').then((res) => { setConfigs(res.data || {}); setLoadError(''); }).catch((e) => setLoadError(errorMessage(e, 'Não foi possível ler o estado do QoS.')));
  useEffect(() => { load(); }, []);

  const set = (iface, patch) => setConfigs((prev) => ({ ...prev, [iface]: { ...prev[iface], ...patch } }));
  const setVip = (iface, index, patch) => setConfigs((prev) => {
    const vips = [...(prev[iface]?.vips || [])];
    vips[index] = { ...vips[index], ...patch };
    return { ...prev, [iface]: { ...prev[iface], vips } };
  });

  const apply = async (vlan) => {
    const iface = `enp6s0.${vlan.id}`;
    const conf = configs[iface] || {};
    setBusy(true);
    setDialogError('');
    try {
      const res = await api.post('/api/qos/apply', {
        interface: iface,
        download: Number(conf.down_limit) || 0,
        upload: Number(conf.up_limit) || 0,
        vips: (conf.vips || []).filter((v) => String(v.ip || '').trim()).map((v) => ({ ip: String(v.ip).replace(/\/32$/, '').trim(), label: v.label || '' })),
      });
      const warnings = res.data?.warnings || [];
      toast(warnings.length ? `QoS aplicado na VLAN ${vlan.id}, com avisos: ${warnings.join(' ')}` : `QoS aplicado na VLAN ${vlan.id}.`, warnings.length ? 'warning' : 'success');
      setConfirm(null);
      load();
    } catch (e) {
      setDialogError(errorMessage(e, 'Erro ao aplicar limites de banda.'));
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    setBusy(true);
    try {
      await api.post('/api/qos/reconcile');
      toast('Filas de banda reaplicadas a partir do banco.');
      load();
    } catch (e) {
      toast(errorMessage(e, 'Falha ao reaplicar as filas.'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Notice tone="primary" title="Como funciona">
        Cada VLAN tem um limite de download e upload dividido entre todas as estações. Os dispositivos com <b>prioridade</b> ficam fora desse limite. O tráfego entre VLANs (câmeras, servidor) não conta no limite.
      </Notice>
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      <div className="flex justify-end">
        <Button icon={RefreshCcw} onClick={reconcile} disabled={busy}>Reaplicar todas as filas</Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {VLANS.map((vlan) => {
          const iface = `enp6s0.${vlan.id}`;
          const conf = configs[iface] || {};
          const vips = conf.vips || [];
          const synced = conf.runtime_synced;
          return (
            <Panel
              key={vlan.id}
              title={<span className="flex items-center gap-2"><VlanDot id={vlan.id} />VLAN {vlan.id} · {vlan.label}</span>}
              actions={conf.active ? (synced ? <Badge tone="success" dot>Aplicado</Badge> : <Badge tone="warning" dot>Fora de sincronia</Badge>) : <Badge dot>Sem limite</Badge>}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field id={`down-${vlan.id}`} label="Download (Mbps)">
                    <input id={`down-${vlan.id}`} type="number" min="0" className={inputCls} value={conf.down_limit ?? ''} onChange={(e) => set(iface, { down_limit: e.target.value })} />
                  </Field>
                  <Field id={`up-${vlan.id}`} label="Upload (Mbps)">
                    <input id={`up-${vlan.id}`} type="number" min="0" className={inputCls} value={conf.up_limit ?? ''} onChange={(e) => set(iface, { up_limit: e.target.value })} />
                  </Field>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-on-surface/75">Com prioridade ({vips.length})</span>
                    <Button variant="ghost" icon={Plus} onClick={() => set(iface, { vips: [...vips, { ip: '', label: '' }] })}>Adicionar</Button>
                  </div>
                  {vips.length ? (
                    <div className="space-y-1.5">
                      {vips.map((vip, i) => (
                        <div key={`${iface}-${i}`} className="flex items-center gap-2">
                          <input aria-label="IP" className={`${inputCls} tabular w-36`} value={String(vip.ip || '').replace(/\/32$/, '')} onChange={(e) => setVip(iface, i, { ip: e.target.value })} placeholder="192.168.10.50" />
                          <input aria-label="Identificação" className={inputCls} value={vip.label || ''} onChange={(e) => setVip(iface, i, { label: e.target.value })} placeholder="Quem é" />
                          <button type="button" aria-label="Remover" onClick={() => set(iface, { vips: vips.filter((_, j) => j !== i) })} className="rounded-md p-2 text-on-surface/45 hover:bg-danger/10 hover:text-danger"><Trash2 size={15} /></button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[12.5px] text-on-surface/50">Ninguém com prioridade nesta VLAN.</p>}
                </div>
                {(conf.warnings || []).length ? <Notice tone="warning">{conf.warnings.join(' ')}</Notice> : null}
                <div className="flex justify-end">
                  <Button variant="primary" icon={Save} onClick={() => { setDialogError(''); setConfirm(vlan); }} disabled={busy}>Aplicar nesta VLAN</Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm ? `Aplicar banda na VLAN ${confirm.id}` : ''}
        description="As filas da VLAN serão reaplicadas. A rede dessa VLAN pisca por menos de um segundo."
        confirmLabel="Aplicar"
        busy={busy}
        error={dialogError}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={() => apply(confirm)}
      />
    </div>
  );
}
