import { useEffect, useState } from 'react';
import { Ban, Check, Search } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Field, Notice, Panel, errorMessage, fmtDateTime, inputCls, toast } from '../ui/kit';

/* Bloqueio de internet por IP ou MAC e descoberta de dispositivos nas VLANs. */

export default function DevicesPanel() {
  const [blocked, setBlocked] = useState([]);
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState({ type: 'ip', value: '' });
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [filter, setFilter] = useState('');

  const load = () => api.get('/api/access').then((r) => setBlocked(Array.isArray(r.data) ? r.data : [])).catch(() => null);
  useEffect(() => { load(); }, []);

  const run = async (fn, ok) => {
    setBusy(true);
    setDialogError('');
    try {
      await fn();
      toast(ok);
      setDialog(null);
      load();
    } catch (e) {
      setDialogError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const askBlock = (type, value, vendor) => setDialog({
    title: `Bloquear a internet de ${value}`,
    description: 'O dispositivo continua na rede interna, mas não navega até ser liberado.',
    tone: 'danger',
    minReason: 10,
    confirmLabel: 'Bloquear',
    onConfirm: (reason) => run(async () => {
      await api.post('/api/access/block', { type, value, vendor: vendor || 'Manual', reason });
      setScan((list) => list?.map((d) => (d.ip === value || d.mac === value ? { ...d, is_blocked: true } : d)) || list);
      setForm({ type: 'ip', value: '' });
    }, `${value} bloqueado.`),
  });

  const askUnblock = (item) => setDialog({
    title: `Liberar ${item.target_value}`,
    description: 'O dispositivo volta a navegar com as regras normais.',
    confirmLabel: 'Liberar',
    onConfirm: () => run(() => api.post('/api/access/unblock', { id: item.id, type: item.target_type, value: item.target_value }), `${item.target_value} liberado.`),
  });

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await api.get('/api/access/scan');
      setScan(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast(errorMessage(e, 'Falha na varredura.'), 'danger');
    } finally {
      setScanning(false);
    }
  };

  const valid = form.type === 'ip' ? /^\d{1,3}(\.\d{1,3}){3}$/.test(form.value.trim()) : /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(form.value.trim());
  const scanRows = (scan || []).filter((d) => !filter || `${d.ip} ${d.mac} ${d.vendor} ${d.vlan}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title={`Dispositivos sem internet (${blocked.length})`} padded={false}>
          <DataTable
            rows={blocked}
            empty="Nenhum dispositivo bloqueado."
            columns={[
              { key: 'target', label: 'Dispositivo', render: (b) => <div><div className="tabular font-medium text-on-surface">{b.target_value}</div><div className="text-[11.5px] text-on-surface/50">{b.target_type?.toUpperCase()} · {b.vendor || '—'}</div></div> },
              { key: 'reason', label: 'Motivo', render: (b) => b.reason || '—' },
              { key: 'when', label: 'Desde', mono: true, render: (b) => fmtDateTime(b.created_at) },
              { key: 'a', label: '', align: 'right', render: (b) => <Button icon={Check} onClick={() => askUnblock(b)}>Liberar</Button> },
            ]}
          />
        </Panel>
        <Panel title="Bloquear um dispositivo">
          <form onSubmit={(e) => { e.preventDefault(); if (valid) askBlock(form.type, form.value.trim()); }} className="space-y-3">
            <div className="flex gap-2">
              <select aria-label="Tipo" className={`${inputCls} w-24`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="ip">IP</option>
                <option value="mac">MAC</option>
              </select>
              <input aria-label="Endereço" className={`${inputCls} tabular`} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.type === 'ip' ? '192.168.10.55' : 'AA:BB:CC:DD:EE:FF'} />
            </div>
            <Button type="submit" variant="danger-soft" icon={Ban} disabled={!valid}>Bloquear internet</Button>
          </form>
        </Panel>
      </div>

      <Panel
        title="Descobrir dispositivos"
        description="Varre as VLANs 10, 30, 50 e 70 e lista quem responde. Leva alguns segundos."
        actions={<Button variant="primary" icon={Search} onClick={runScan} disabled={scanning}>{scanning ? 'Varrendo...' : 'Varrer agora'}</Button>}
        padded={false}
      >
        {scan ? (
          <>
            <div className="border-b border-outline px-4 py-2.5">
              <input aria-label="Filtrar" className={`${inputCls} max-w-sm`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar por IP, MAC, fabricante ou VLAN" />
            </div>
            <DataTable
              rowKey={(d) => d.mac || d.ip}
              rows={scanRows}
              empty="Nenhum dispositivo encontrado."
              columns={[
                { key: 'ip', label: 'IP', mono: true, render: (d) => d.ip },
                { key: 'mac', label: 'MAC', mono: true, render: (d) => d.mac || '—' },
                { key: 'vendor', label: 'Fabricante', render: (d) => d.vendor || 'Desconhecido' },
                { key: 'vlan', label: 'VLAN', render: (d) => d.vlan || '—' },
                { key: 'st', label: 'Internet', render: (d) => (d.is_blocked ? <Badge tone="danger">Bloqueada</Badge> : <Badge tone="success">Liberada</Badge>) },
                { key: 'a', label: '', align: 'right', render: (d) => (!d.is_blocked && d.mac ? <Button variant="ghost" icon={Ban} onClick={() => askBlock('mac', d.mac, d.vendor)}>Bloquear</Button> : null) },
              ]}
            />
          </>
        ) : <p className="px-4 py-6 text-center text-sm text-on-surface/55">Clique em Varrer agora para listar os dispositivos.</p>}
      </Panel>
      <Notice tone="primary">Para ver todos os dispositivos conectados agora, com o consumo de cada um, use o Mapa de Tráfego.</Notice>

      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title}
        description={dialog?.description}
        tone={dialog?.tone}
        confirmLabel={dialog?.confirmLabel}
        minReason={dialog?.minReason || 0}
        busy={busy}
        error={dialogError}
        onClose={() => !busy && setDialog(null)}
        onConfirm={(reason) => dialog?.onConfirm?.(reason)}
      />
    </div>
  );
}
