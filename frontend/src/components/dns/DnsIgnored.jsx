import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, DataTable, Field, Notice, Panel, Switch, askConfirm, errorMessage, inputCls, toast } from '../ui/kit';

/*
 * Domínios ignorados: padrões de consulta DNS que ficam fora do radar, das estatísticas e dos relatórios
 * (ruído de aparelhos, como consultas automáticas de rede interna). Não liberam nem bloqueiam nada.
 */

const MATCH_TYPE_LABELS = { exact: 'Exato', contains: 'Contém', suffix: 'Sufixo', prefix: 'Prefixo' };
const MATCH_TYPE_EXAMPLES = {
  exact: 'ex.: neverssl.com',
  contains: 'ex.: vlan (ignora tudo que tem "vlan")',
  suffix: 'ex.: .local (ignora *.local)',
  prefix: 'ex.: api- (ignora api-*)',
};
const EMPTY = { pattern: '', match_type: 'contains', reason: '' };

export default function DnsIgnored() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/dns/ignored');
      setPatterns(res.data?.patterns || []);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Não foi possível carregar os padrões.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (event) => {
    event.preventDefault();
    if (!form.pattern.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/dns/ignored', form);
      setForm(EMPTY);
      toast('Padrão adicionado.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível adicionar o padrão.'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item) => {
    try {
      await api.patch(`/api/dns/ignored/${item.id}/toggle`);
      toast(item.active ? 'Padrão desativado: volta a aparecer nos relatórios.' : 'Padrão reativado.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível alterar o padrão.'), 'danger');
    }
  };

  const remove = async (item) => {
    if (!(await askConfirm({ title: 'Remover padrão ignorado', description: `O padrão "${item.pattern}" deixa de existir e as consultas dele voltam a aparecer no radar e nos relatórios.`, confirmLabel: 'Remover', tone: 'danger' }))) return;
    try {
      await api.delete(`/api/dns/ignored/${item.id}`);
      toast('Padrão removido.');
      await load();
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível remover o padrão.'), 'danger');
    }
  };

  const columns = [
    { key: 'match_type', label: 'Tipo', width: '110px', render: (p) => <Badge tone={p.active ? 'primary' : 'neutral'}>{MATCH_TYPE_LABELS[p.match_type] || p.match_type}</Badge> },
    { key: 'pattern', label: 'Padrão', render: (p) => <span className={`font-mono ${p.active ? '' : 'text-on-surface/45 line-through'}`}>{p.pattern}</span> },
    { key: 'reason', label: 'Motivo', render: (p) => <span className="text-on-surface/60">{p.reason || '—'}</span> },
    { key: 'active', label: 'Ativo', width: '80px', render: (p) => <Switch checked={Boolean(p.active)} onChange={() => toggle(p)} label={`${p.active ? 'Desativar' : 'Ativar'} o padrão ${p.pattern}`} /> },
    { key: 'actions', label: '', align: 'right', width: '56px', render: (p) => (
      <Button variant="ghost" icon={Trash2} onClick={() => remove(p)} aria-label={`Remover o padrão ${p.pattern}`} title="Remover" />
    ) },
  ];

  return (
    <div className="space-y-4">
      <Panel title="Novo padrão ignorado" description="Domínios que combinarem com o padrão saem do radar, das estatísticas e dos relatórios de acesso. Isso não libera nem bloqueia o acesso.">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-[1.2fr_160px_1fr_auto] md:items-end">
          <Field id="ign-pattern" label="Padrão">
            <input id="ign-pattern" className={inputCls} value={form.pattern} onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value.toLowerCase() }))} placeholder={MATCH_TYPE_EXAMPLES[form.match_type]} required />
          </Field>
          <Field id="ign-type" label="Tipo de combinação">
            <select id="ign-type" className={inputCls} value={form.match_type} onChange={(e) => setForm((f) => ({ ...f, match_type: e.target.value }))}>
              {Object.entries(MATCH_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <Field id="ign-reason" label="Motivo (opcional)">
            <input id="ign-reason" className={inputCls} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Por que ignorar" />
          </Field>
          <Button type="submit" variant="primary" icon={Plus} disabled={saving || !form.pattern.trim()}>{saving ? 'Adicionando…' : 'Adicionar'}</Button>
        </form>
      </Panel>

      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}

      <Panel
        title="Padrões cadastrados"
        description={`${patterns.filter((p) => p.active).length} ativos de ${patterns.length}.`}
        actions={<Button icon={RefreshCw} onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</Button>}
        padded={false}
      >
        <DataTable columns={columns} rows={patterns} empty={loading ? 'Carregando…' : 'Nenhum padrão cadastrado. Adicione um acima para tirar ruído dos relatórios.'} />
      </Panel>
    </div>
  );
}
