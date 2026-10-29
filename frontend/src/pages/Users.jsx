import { useEffect, useState } from 'react';
import { Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, ConfirmDialog, DataTable, Field, Kpi, KpiRow, Notice, PageHeader, Panel, errorMessage, fmtDateTime, inputCls, toast } from '../components/ui/kit';

const ROLES = [
  { value: 'admin', label: 'Administrador', desc: 'Acesso total, inclusive gerenciar usuários e reiniciar o servidor.' },
  { value: 'user', label: 'Operador', desc: 'Opera o sistema no dia a dia.' },
  { value: 'viewer', label: 'Consulta', desc: 'Só visualiza.' },
];
const roleLabel = (r) => {
  const v = String(r || '').toLowerCase();
  return v === 'god' ? 'Super administrador' : ROLES.find((x) => x.value === v)?.label || r || '—';
};
const EMPTY = { id: null, name: '', username: '', password: '', role: 'user' };

export default function Users({ user: me }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const isAdmin = ['admin', 'god'].includes(String(me?.role || '').toLowerCase());

  const load = () => api.get('/api/users').then((r) => { setUsers(Array.isArray(r.data) ? r.data : []); setError(''); }).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, role: form.role.toLowerCase() };
      if (form.id) await api.post('/api/users/update', payload);
      else await api.post('/api/users', payload);
      toast(form.id ? 'Usuário atualizado.' : 'Usuário criado.');
      setForm(null);
      load();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.post('/api/users/delete', { id: removing.id });
      toast('Usuário excluído.');
      setRemoving(null);
      load();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const admins = users.filter((u) => ['admin', 'god'].includes(String(u.role).toLowerCase())).length;
  const passwordOk = form && (form.id ? !form.password || form.password.length >= 8 : form.password.length >= 8);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuários"
        description="Contas de acesso ao SGCG e o que cada perfil pode fazer."
        actions={isAdmin ? <Button variant="primary" icon={UserPlus} onClick={() => setForm({ ...EMPTY })}>Novo usuário</Button> : null}
      />
      <KpiRow>
        <Kpi label="Usuários" value={users.length} />
        <Kpi label="Administradores" value={admins} tone={admins > 3 ? 'warning' : 'neutral'} sub={admins > 3 ? 'Muitos com acesso total' : null} />
        <Kpi label="Operadores" value={users.filter((u) => String(u.role).toLowerCase() === 'user').length} />
        <Kpi label="Somente consulta" value={users.filter((u) => String(u.role).toLowerCase() === 'viewer').length} />
      </KpiRow>
      {!isAdmin ? <Notice tone="primary">Só administradores podem criar, editar ou excluir usuários.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {form ? (
        <Panel title={form.id ? `Editar ${form.username}` : 'Novo usuário'} actions={<Button variant="ghost" icon={X} onClick={() => setForm(null)}>Fechar</Button>}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field id="u-name" label="Nome"><input id="u-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field id="u-login" label="Usuário (login)"><input id="u-login" className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} autoComplete="off" required /></Field>
              <Field id="u-pass" label={form.id ? 'Nova senha (opcional)' : 'Senha'} hint="Mínimo de 8 caracteres." error={form.password && form.password.length < 8 ? 'Senha muito curta.' : null}>
                <input id="u-pass" type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" required={!form.id} />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-semibold text-on-surface/75">Perfil</legend>
              <div className="grid gap-2 md:grid-cols-3">
                {ROLES.map((r) => (
                  <label key={r.value} className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${String(form.role).toLowerCase() === r.value ? 'border-primary bg-primary/5' : 'border-outline'}`}>
                    <input type="radio" name="role" value={r.value} checked={String(form.role).toLowerCase() === r.value} onChange={() => setForm({ ...form, role: r.value })} />
                    <span><span className="block text-[13.5px] font-semibold text-on-surface">{r.label}</span><span className="block text-[12px] text-on-surface/55">{r.desc}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={saving || !form.username || !passwordOk}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title="Contas" padded={false}>
        <DataTable
          rows={users}
          empty="Nenhum usuário."
          columns={[
            { key: 'name', label: 'Nome', render: (u) => <div><div className="font-medium text-on-surface">{u.name}</div><div className="tabular text-[11.5px] text-on-surface/50">{u.username}</div></div> },
            { key: 'role', label: 'Perfil', render: (u) => <Badge tone={['admin', 'god'].includes(String(u.role).toLowerCase()) ? 'warning' : 'primary'}>{roleLabel(u.role)}</Badge> },
            { key: 'created', label: 'Criado em', mono: true, render: (u) => fmtDateTime(u.created_at) },
            {
              key: 'a',
              label: '',
              align: 'right',
              render: (u) => (isAdmin ? (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" icon={Pencil} onClick={() => setForm({ id: u.id, name: u.name || '', username: u.username, password: '', role: String(u.role || 'user').toLowerCase() })}>Editar</Button>
                  <Button variant="ghost" icon={Trash2} onClick={() => setRemoving(u)} disabled={Number(u.id) === Number(me?.id)}>Excluir</Button>
                </div>
              ) : null),
            },
          ]}
        />
      </Panel>

      <ConfirmDialog open={Boolean(removing)} title={removing ? `Excluir ${removing.username}` : ''} description="A pessoa perde o acesso ao SGCG na hora." tone="danger" confirmLabel="Excluir" busy={busy} onClose={() => !busy && setRemoving(null)} onConfirm={remove} />
    </div>
  );
}
