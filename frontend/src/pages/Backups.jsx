import { useEffect, useState } from 'react';
import { Download, History, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Button, ConfirmDialog, DataTable, Kpi, KpiRow, Notice, PageHeader, Panel, errorMessage, toast } from '../components/ui/kit';

const JOB_LABEL = { running: 'Em andamento', success: 'Concluído', failed: 'Falhou', rolled_back: 'Desfeito' };
const JOB_TONE = { running: 'primary', success: 'success', failed: 'danger', rolled_back: 'warning' };

export default function Backups() {
  const [files, setFiles] = useState([]);
  const [job, setJob] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = () => api.get('/api/backups').then((r) => setFiles(Array.isArray(r.data) ? r.data : [])).catch(() => setFiles([]));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!job?.id || job.status !== 'running') return undefined;
    const t = window.setInterval(async () => {
      try {
        const r = await api.get(`/api/backups/jobs/${job.id}`);
        setJob(r.data);
        if (r.data.status !== 'running') {
          toast(r.data.status === 'success' ? `${r.data.kind === 'restore' ? 'Restauração' : 'Backup'} concluído.` : r.data.message || 'A tarefa terminou com falha.', r.data.status === 'success' ? 'success' : 'danger');
          if (r.data.status === 'success') load();
        }
      } catch {
        // a tarefa continua no servidor mesmo se a consulta falhar
      }
    }, 3000);
    return () => window.clearInterval(t);
  }, [job?.id, job?.status]);

  const running = job?.status === 'running';

  const start = async (fn) => {
    setBusy(true);
    setDialogError('');
    try {
      const r = await fn();
      setJob(r.data.job);
      setDialog(null);
    } catch (e) {
      const current = e?.response?.data?.job;
      if (current) { setJob(current); setDialog(null); } else setDialogError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const askCreate = () => setDialog({
    title: 'Gerar backup agora',
    description: 'Copia o código, os dados e o banco do SGCG. Dependências e builds ficam de fora. Leva alguns minutos e roda em segundo plano.',
    confirmLabel: 'Gerar backup',
    onConfirm: () => start(() => api.post('/api/backups/create')),
  });

  const askRestore = (f) => setDialog({
    title: `Restaurar ${f.name}`,
    description: 'O SGCG entra em manutenção. Antes de mudar qualquer coisa, o sistema guarda uma cópia do estado atual para poder desfazer. Banco, dependências e builds são refeitos e só os serviços do SGCG são reiniciados.',
    tone: 'danger',
    minReason: 10,
    reasonLabel: 'Motivo da restauração',
    confirmLabel: 'Restaurar este backup',
    onConfirm: () => start(() => api.post('/api/backups/restore', { filename: f.name })),
  });

  const askRemove = (f) => setDialog({
    title: `Excluir ${f.name}`,
    description: 'O arquivo é apagado do servidor e não pode ser recuperado.',
    tone: 'danger',
    confirmLabel: 'Excluir',
    onConfirm: async () => {
      setBusy(true);
      try {
        await api.post('/api/backups/delete', { filename: f.name });
        toast('Backup excluído.');
        setDialog(null);
        load();
      } catch (e) {
        setDialogError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
  });

  const download = async (f) => {
    try {
      const r = await api.post('/api/backups/download', { filename: f.name }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast('Não foi possível baixar o arquivo.', 'danger');
    }
  };

  const latest = files[0];
  const ageDays = latest ? Math.floor((Date.now() - new Date(latest.date).getTime()) / 864e5) : null;
  const old = latest && ageDays > 7;
  const stale = ageDays != null && ageDays > 30;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backups"
        description="Cópias do código, dos dados e do banco do SGCG, com restauração que pode ser desfeita."
        actions={<Button variant="primary" icon={Plus} onClick={askCreate} disabled={running}>Gerar backup</Button>}
      />
      <KpiRow>
        <Kpi icon={History} label="Backups guardados" value={files.length} />
        <Kpi label="Mais recente" value={latest ? new Date(latest.date).toLocaleDateString('pt-BR') : '—'} sub={latest ? `${ageDays === 0 ? 'hoje' : `há ${ageDays} dia${ageDays === 1 ? '' : 's'}`} · ${latest.size}` : 'Nenhum backup'} tone={latest && !old ? 'success' : stale || !latest ? 'danger' : 'warning'} />
        <Kpi label="Tarefa atual" value={job ? JOB_LABEL[job.status] || job.status : 'Nenhuma'} tone={job ? JOB_TONE[job.status] : 'neutral'} sub={job ? `${job.kind === 'restore' ? 'Restauração' : 'Backup'}${job.step ? ` · ${job.step}` : ''}` : null} />
        <Kpi label="Cópia fora do servidor" value="Não" tone="warning" sub="Use Baixar para guardar uma cópia" />
      </KpiRow>
      {old ? <Notice tone={stale ? 'danger' : 'warning'} title={stale ? 'Backups parados' : undefined}>O último backup tem {ageDays} dias. {stale ? 'Gere um backup novo antes de qualquer mudança grande no sistema.' : 'Gere um novo para não perder alterações recentes.'}</Notice> : null}
      <Notice tone="primary" title="Retenção de 30 dias">
        A regra é guardar 30 dias. Quando o backup diário roda, ele apaga os backups mais antigos que isso, mas os 3 mais recentes ficam sempre e nada é apagado se não houver um backup recente.
      </Notice>
      {job ? (
        <Notice tone={JOB_TONE[job.status] === 'primary' ? 'primary' : JOB_TONE[job.status]} title={`${job.kind === 'restore' ? 'Restauração' : 'Backup'}: ${JOB_LABEL[job.status] || job.status}`}>
          {job.step ? <span className="font-medium">{job.step}. </span> : null}{job.message}
        </Notice>
      ) : null}
      <Panel title="Arquivos de backup" padded={false}>
        <DataTable
          rowKey="name"
          rows={files}
          empty="Nenhum backup encontrado."
          columns={[
            { key: 'name', label: 'Arquivo', render: (f) => <span className="tabular break-all font-medium text-on-surface">{f.name}</span> },
            { key: 'date', label: 'Data', mono: true, render: (f) => new Date(f.date).toLocaleString('pt-BR') },
            { key: 'size', label: 'Tamanho', mono: true },
            {
              key: 'a',
              label: '',
              align: 'right',
              render: (f) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" icon={Download} onClick={() => download(f)}>Baixar</Button>
                  <Button variant="ghost" icon={RotateCcw} onClick={() => askRestore(f)} disabled={running}>Restaurar</Button>
                  <Button variant="ghost" icon={Trash2} onClick={() => askRemove(f)} disabled={running}>Excluir</Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title}
        description={dialog?.description}
        tone={dialog?.tone}
        confirmLabel={dialog?.confirmLabel}
        minReason={dialog?.minReason || 0}
        reasonLabel={dialog?.reasonLabel}
        busy={busy}
        error={dialogError}
        onClose={() => !busy && setDialog(null)}
        onConfirm={(r) => dialog?.onConfirm?.(r)}
      />
    </div>
  );
}
