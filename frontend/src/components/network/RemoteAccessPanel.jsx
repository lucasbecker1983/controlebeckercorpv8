import { useEffect, useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Field, Panel, errorMessage, inputCls, toast } from '../ui/kit';

/* Acesso remoto (VPN WireGuard) e usuários de arquivos (storage/SMB). */

const saveText = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function RemoteAccessPanel() {
  const [data, setData] = useState({ vpn: [], storage: [], status: {} });
  const [vpnName, setVpnName] = useState('');
  const [storage, setStorage] = useState({ username: '', password: '', path: '/mnt/dados', has_smb: false });
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/api/connectivity/list').then((r) => setData(r.data || { vpn: [], storage: [], status: {} })).catch(() => null);
  useEffect(() => { load(); const t = window.setInterval(load, 15000); return () => window.clearInterval(t); }, []);

  const createVpn = async (e) => {
    e.preventDefault();
    try {
      const r = await api.post('/api/connectivity/vpn/create', { name: vpnName.trim() });
      if (r.data?.success) {
        saveText(r.data.config, `vpn-${vpnName.trim()}.conf`);
        toast(`Acesso VPN criado para ${vpnName.trim()}. O arquivo foi baixado.`);
        setVpnName('');
        load();
      }
    } catch (err) {
      toast(errorMessage(err, 'Falha ao gerar acesso VPN.'), 'danger');
    }
  };

  const downloadVpn = async (p) => {
    try {
      const r = await api.post('/api/connectivity/vpn/download', { id: p.id });
      if (r.data?.success) saveText(r.data.config, r.data.filename);
    } catch (err) {
      toast(errorMessage(err, 'Falha ao baixar o arquivo.'), 'danger');
    }
  };

  const createStorage = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/connectivity/storage/create', storage);
      toast(`Usuário ${storage.username} criado.`);
      setStorage({ ...storage, username: '', password: '' });
      load();
    } catch (err) {
      toast(errorMessage(err, 'Falha ao criar usuário.'), 'danger');
    }
  };

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await dialog.run();
      toast(dialog.ok);
      setDialog(null);
      load();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Acesso remoto (VPN)" actions={<Badge tone={data.status?.vpn ? 'success' : 'danger'} dot>{data.status?.vpn ? 'Disponível' : 'Indisponível'}</Badge>} padded={false}>
        <form onSubmit={createVpn} className="flex gap-2 border-b border-outline p-4">
          <input aria-label="Nome" className={inputCls} value={vpnName} onChange={(e) => setVpnName(e.target.value)} placeholder="Nome da pessoa ou aparelho" />
          <Button type="submit" variant="primary" icon={Plus} disabled={!vpnName.trim()}>Criar acesso</Button>
        </form>
        <DataTable
          rows={data.vpn || []}
          empty="Nenhum acesso VPN criado."
          columns={[
            { key: 'name', label: 'Nome', render: (p) => <span className="font-medium text-on-surface">{p.name}</span> },
            { key: 'ip', label: 'IP na VPN', mono: true },
            { key: 'st', label: 'Estado', render: (p) => (p.is_active ? <Badge tone="success" dot>Conectado</Badge> : <Badge dot>Desconectado</Badge>) },
            { key: 'a', label: '', align: 'right', render: (p) => <div className="flex justify-end gap-1"><Button variant="ghost" icon={Download} onClick={() => downloadVpn(p)}>Arquivo</Button><Button variant="ghost" icon={Trash2} onClick={() => setDialog({ title: `Revogar acesso de ${p.name}`, description: 'O arquivo de configuração deixa de funcionar.', ok: 'Acesso revogado.', run: () => api.post('/api/connectivity/vpn/delete', { id: p.id }) })}>Revogar</Button></div> },
          ]}
        />
      </Panel>

      <Panel title="Usuários de arquivos" actions={<Badge tone={data.status?.storage ? 'success' : 'danger'} dot>{data.status?.storage ? 'Disponível' : 'Indisponível'}</Badge>} padded={false}>
        <form onSubmit={createStorage} className="space-y-3 border-b border-outline p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Usuário" className={inputCls} value={storage.username} onChange={(e) => setStorage({ ...storage, username: e.target.value })} placeholder="Usuário" />
            <input aria-label="Senha" type="password" className={inputCls} value={storage.password} onChange={(e) => setStorage({ ...storage, password: e.target.value })} placeholder="Senha" />
          </div>
          <Field id="st-path" label="Pasta"><input id="st-path" className={`${inputCls} tabular`} value={storage.path} onChange={(e) => setStorage({ ...storage, path: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-[13px] text-on-surface/75">
            <input type="checkbox" checked={storage.has_smb} onChange={(e) => setStorage({ ...storage, has_smb: e.target.checked })} /> Permitir acesso pela rede do Windows (SMB)
          </label>
          <Button type="submit" variant="primary" icon={Plus} disabled={!storage.username.trim() || !storage.password}>Criar usuário</Button>
        </form>
        <DataTable
          rows={data.storage || []}
          empty="Nenhum usuário de arquivos."
          columns={[
            { key: 'u', label: 'Usuário', render: (u) => <span className="font-medium text-on-surface">{u.username}</span> },
            { key: 'path', label: 'Pasta', mono: true },
            { key: 'smb', label: 'Windows', render: (u) => (u.has_smb ? <Badge tone="primary">SMB</Badge> : '—') },
            { key: 'a', label: '', align: 'right', render: (u) => <Button variant="ghost" icon={Trash2} onClick={() => setDialog({ title: `Remover ${u.username}`, description: 'O usuário perde o acesso aos arquivos.', ok: 'Usuário removido.', run: () => api.post('/api/connectivity/storage/delete', { id: u.id, username: u.username }) })}>Remover</Button> },
          ]}
        />
      </Panel>

      <ConfirmDialog open={Boolean(dialog)} title={dialog?.title} description={dialog?.description} tone="danger" confirmLabel="Confirmar" busy={busy} onClose={() => !busy && setDialog(null)} onConfirm={confirmRemove} />
    </div>
  );
}
