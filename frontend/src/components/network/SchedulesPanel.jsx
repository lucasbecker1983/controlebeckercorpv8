import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Button, ConfirmDialog, DataTable, Field, Notice, Panel, errorMessage, inputCls, toast } from '../ui/kit';

/*
 * Horários de liberação por VLAN. Usa as janelas de política do motor de bloqueios
 * (o antigo agendador por VLAN foi desativado no backend e não aplicava nada).
 */

const WEEKDAYS = [
  { v: 1, l: 'Seg' }, { v: 2, l: 'Ter' }, { v: 3, l: 'Qua' }, { v: 4, l: 'Qui' }, { v: 5, l: 'Sex' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' },
];
const VLANS = [{ id: 10, l: 'Secretaria' }, { id: 30, l: 'Celulares' }, { id: 50, l: 'SINE' }, { id: 70, l: 'Visitantes' }];
const CATEGORIES = ['YouTube', 'Redes Sociais'];
const EMPTY = { name: '', vlan_ids: [30], categories: ['Redes Sociais'], start_time: '11:30', end_time: '13:00', date_mode: 'weekly', weekdays: [1, 2, 3, 4, 5], start_date: '', end_date: '', notes: '', active: true };

const describeDays = (w) => {
  if (w.date_mode === 'single') return `No dia ${w.start_date ? new Date(`${w.start_date}T12:00`).toLocaleDateString('pt-BR') : '—'}`;
  if (w.date_mode === 'range') return `De ${w.start_date || '—'} a ${w.end_date || '—'}`;
  const days = (w.weekdays || []).map(Number);
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Segunda a sexta';
  if (days.length === 7) return 'Todos os dias';
  return WEEKDAYS.filter((d) => days.includes(d.v)).map((d) => d.l).join(', ') || '—';
};

function Toggle({ on, onClick, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-primary' : 'bg-on-surface/20'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function SchedulesPanel() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = () => api.get('/api/bloqueios-liberacoes/scheduled-policy-windows').then((r) => { setItems(Array.isArray(r.data) ? r.data : []); setError(''); }).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);

  const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, start_date: form.start_date || null, end_date: form.end_date || null };
      if (editingId) await api.patch(`/api/bloqueios-liberacoes/scheduled-policy-windows/${editingId}`, payload);
      else await api.post('/api/bloqueios-liberacoes/scheduled-policy-windows', payload);
      toast(editingId ? 'Horário atualizado.' : 'Horário criado.');
      setForm(null);
      setEditingId(null);
      load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (w) => {
    try {
      await api.patch(`/api/bloqueios-liberacoes/scheduled-policy-windows/${w.id}`, { active: !w.active });
      toast(w.active ? 'Horário pausado.' : 'Horário ativado.');
      load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/api/bloqueios-liberacoes/scheduled-policy-windows/${removing.id}`);
      toast('Horário removido.');
      setRemoving(null);
      load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  return (
    <div className="space-y-4">
      <Notice tone="primary" title="Horários de liberação">
        Libera YouTube ou redes sociais em uma VLAN só em certos horários, como o almoço. Fora do horário, valem as regras normais. Pornografia nunca pode ser liberada por horário.
      </Notice>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Panel
        title="Horários cadastrados"
        actions={<Button variant="primary" icon={Plus} onClick={() => { setEditingId(null); setForm({ ...EMPTY }); }}>Novo horário</Button>}
        padded={false}
      >
        <DataTable
          rows={items}
          empty="Nenhum horário cadastrado."
          columns={[
            { key: 'name', label: 'Nome', render: (w) => <div><div className="font-medium text-on-surface">{w.name}</div>{w.notes ? <div className="text-[11.5px] text-on-surface/50">{w.notes}</div> : null}</div> },
            { key: 'what', label: 'Libera', render: (w) => (w.categories || []).join(', ') },
            { key: 'where', label: 'VLANs', render: (w) => (w.vlan_ids || []).join(', ') },
            { key: 'when', label: 'Quando', render: (w) => <div><div>{describeDays(w)}</div><div className="tabular text-[11.5px] text-on-surface/55">{w.start_time} às {w.end_time}</div></div> },
            { key: 'active', label: 'Ativo', render: (w) => <Toggle on={w.active} onClick={() => toggleActive(w)} label={`Ativar ${w.name}`} /> },
            {
              key: 'actions',
              label: '',
              align: 'right',
              render: (w) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" icon={Pencil} onClick={() => { setEditingId(w.id); setForm({ ...EMPTY, ...w, start_date: w.start_date || '', end_date: w.end_date || '' }); }}>Editar</Button>
                  <Button variant="ghost" icon={Trash2} onClick={() => setRemoving(w)}>Remover</Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>

      {form ? (
        <Panel title={editingId ? 'Editar horário' : 'Novo horário'}>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field id="sch-name" label="Nome">
                <input id="sch-name" className={inputCls} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Horário de almoço" required disabled={Boolean(editingId)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="sch-start" label="Das"><input id="sch-start" type="time" className={inputCls} value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} required /></Field>
                <Field id="sch-end" label="Até"><input id="sch-end" type="time" className={inputCls} value={form.end_time} onChange={(e) => set({ end_time: e.target.value })} required /></Field>
              </div>
            </div>
            <fieldset>
              <legend className="mb-1 text-[12.5px] font-semibold text-on-surface/75">O que liberar</legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => <Button key={c} variant={form.categories.includes(c) ? 'primary' : 'secondary'} onClick={() => set({ categories: toggleIn(form.categories, c) })}>{c}</Button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-[12.5px] font-semibold text-on-surface/75">Em quais VLANs</legend>
              <div className="flex flex-wrap gap-2">
                {VLANS.map((v) => <Button key={v.id} variant={form.vlan_ids.includes(v.id) ? 'primary' : 'secondary'} onClick={() => set({ vlan_ids: toggleIn(form.vlan_ids, v.id) })}>{v.id} · {v.l}</Button>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-[12.5px] font-semibold text-on-surface/75">Dias</legend>
              <div className="mb-2 flex flex-wrap gap-2">
                {[['weekly', 'Toda semana'], ['single', 'Um dia'], ['range', 'Período']].map(([k, l]) => <Button key={k} variant={form.date_mode === k ? 'primary' : 'secondary'} onClick={() => set({ date_mode: k })}>{l}</Button>)}
              </div>
              {form.date_mode === 'weekly' ? (
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => <Button key={d.v} variant={form.weekdays.includes(d.v) ? 'primary' : 'secondary'} onClick={() => set({ weekdays: toggleIn(form.weekdays, d.v) })}>{d.l}</Button>)}
                </div>
              ) : (
                <div className="grid max-w-md grid-cols-2 gap-3">
                  <Field id="sch-d1" label={form.date_mode === 'single' ? 'Dia' : 'Início'}><input id="sch-d1" type="date" className={inputCls} value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} required /></Field>
                  {form.date_mode === 'range' ? <Field id="sch-d2" label="Fim"><input id="sch-d2" type="date" className={inputCls} value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} required /></Field> : null}
                </div>
              )}
            </fieldset>
            <Field id="sch-notes" label="Observação (opcional)"><input id="sch-notes" className={inputCls} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setForm(null); setEditingId(null); }}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={saving || !form.name.trim() || !form.categories.length || !form.vlan_ids.length}>{saving ? 'Salvando...' : 'Salvar horário'}</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remover horário"
        description={removing ? `“${removing.name}” deixa de valer na hora.` : ''}
        tone="danger"
        confirmLabel="Remover"
        onClose={() => setRemoving(null)}
        onConfirm={remove}
      />
    </div>
  );
}
