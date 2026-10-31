import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Mail, RefreshCw, Send } from 'lucide-react';
import { api } from '../../services/api';
import { Badge, Button, Drawer, Field, Notice, Panel, Switch, errorMessage, inputCls, toast } from '../ui/kit';

/*
 * Alertas do Sentinela: e-mail (SMTP) e Telegram. As falhas de serviço, os lembretes de 3 horas e a queda do link
 * saem pelos dois canais. O token do Telegram nunca passa por esta tela: fica só no .env do servidor.
 */

const EMPTY = { host: '', port: 587, username: '', password: '', from_email: '', from_name: 'Becker Sentinel', to_email: '', use_tls: true, use_ssl: false, requires_auth: true, is_active: false, has_password: false };

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-outline px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-on-surface">{label}</div>
        {hint ? <div className="text-[12px] text-on-surface/55">{hint}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

function SmtpDrawer({ open, config, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!open) return;
    setF({ ...EMPTY, ...config, password: '' });
    setShowPassword(false);
    setMessage(null);
  }, [open, config]);

  const set = (key) => (e) => setF((cur) => ({ ...cur, [key]: e.target.value }));
  const flip = (key) => (value) => setF((cur) => ({ ...cur, [key]: value }));
  const payload = () => ({
    host: f.host.trim(), port: Number(f.port || 587), username: f.username.trim(), password: f.password,
    from_email: f.from_email.trim(), from_name: f.from_name.trim(), to_email: f.to_email.trim(),
    use_tls: Boolean(f.use_tls), use_ssl: Boolean(f.use_ssl), requires_auth: Boolean(f.requires_auth), is_active: Boolean(f.is_active),
  });

  const save = async () => {
    setBusy('save');
    setMessage(null);
    try {
      await api.post('/api/security/smtp', payload());
      toast('Configuração de e-mail salva.');
      onSaved();
      onClose();
    } catch (e) {
      setMessage({ tone: 'danger', text: errorMessage(e, 'Não foi possível salvar a configuração.') });
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setMessage(null);
    try {
      const res = await api.post('/api/security/smtp/test', payload());
      setMessage({ tone: 'success', text: res.data?.message || 'E-mail de teste enviado.' });
    } catch (e) {
      setMessage({ tone: 'danger', text: errorMessage(e, 'Não foi possível enviar o e-mail de teste.') });
    } finally {
      setBusy('');
    }
  };

  return (
    <Drawer
      open={open}
      busy={Boolean(busy)}
      onClose={onClose}
      width="max-w-2xl"
      title="Servidor de e-mail (SMTP)"
      description="Dados do servidor que envia os alertas do SGCG."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>Cancelar</Button>
          <Button icon={Send} onClick={test} disabled={Boolean(busy)}>{busy === 'test' ? 'Enviando…' : 'Enviar e-mail de teste'}</Button>
          <Button variant="primary" onClick={save} disabled={Boolean(busy)}>{busy === 'save' ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}
    >
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field id="smtp-host" label="Servidor (host)"><input id="smtp-host" className={inputCls} value={f.host} onChange={set('host')} placeholder="smtp.gmail.com" /></Field>
        <Field id="smtp-port" label="Porta"><input id="smtp-port" type="number" className={inputCls} value={f.port} onChange={set('port')} /></Field>
      </div>
      <Field id="smtp-user" label="Usuário"><input id="smtp-user" className={inputCls} value={f.username} onChange={set('username')} autoComplete="off" /></Field>
      <Field id="smtp-pass" label="Senha" hint={f.has_password ? 'Deixe em branco para manter a senha atual.' : 'Informe a senha do servidor de e-mail.'}>
        <div className="relative">
          <input id="smtp-pass" type={showPassword ? 'text' : 'password'} className={`${inputCls} pr-11`} value={f.password} onChange={set('password')} autoComplete="new-password" />
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-on-surface/55 hover:text-on-surface" aria-label={showPassword ? 'Ocultar a senha' : 'Mostrar a senha'}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="smtp-from" label="E-mail do remetente"><input id="smtp-from" className={inputCls} value={f.from_email} onChange={set('from_email')} /></Field>
        <Field id="smtp-name" label="Nome do remetente"><input id="smtp-name" className={inputCls} value={f.from_name} onChange={set('from_name')} /></Field>
      </div>
      <Field id="smtp-to" label="E-mail que recebe os alertas" hint="Também é o destino do e-mail de teste.">
        <input id="smtp-to" className={inputCls} value={f.to_email} onChange={set('to_email')} />
      </Field>
      <div className="space-y-2">
        <ToggleRow label="Enviar alertas por e-mail" hint="Desligado: o Sentinela não manda e-mail (o Telegram continua)." checked={f.is_active} onChange={flip('is_active')} />
        <ToggleRow label="Exigir usuário e senha" checked={f.requires_auth} onChange={flip('requires_auth')} />
        <ToggleRow label="TLS (STARTTLS)" hint="Conexão segura negociada. Padrão para a porta 587." checked={f.use_tls} onChange={flip('use_tls')} />
        <ToggleRow label="SSL direto" hint="Use com portas como 465." checked={f.use_ssl} onChange={flip('use_ssl')} />
      </div>
    </Drawer>
  );
}

export default function EmailNotifications() {
  const [smtp, setSmtp] = useState(EMPTY);
  const [telegram, setTelegram] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const [s, t] = await Promise.allSettled([api.get('/api/security/smtp'), api.get('/api/security/telegram')]);
    if (s.status === 'fulfilled') { setSmtp({ ...EMPTY, ...s.value.data }); setError(''); } else setError(errorMessage(s.reason, 'Não foi possível carregar a configuração de e-mail.'));
    if (t.status === 'fulfilled') setTelegram(Boolean(t.value.data?.configured));
  }, []);

  useEffect(() => { load(); }, [load]);

  const testTelegram = async () => {
    setTesting(true);
    try {
      const res = await api.post('/api/security/telegram/test');
      toast(res.data?.message || 'Mensagem de teste enviada.');
    } catch (e) {
      toast(errorMessage(e, 'Não foi possível enviar ao Telegram.'), 'danger');
    } finally {
      setTesting(false);
    }
  };

  const facts = [
    ['Situação', smtp.is_active ? <Badge tone="success" dot>Enviando alertas</Badge> : <Badge tone="warning" dot>Desligado</Badge>],
    ['Servidor', smtp.host ? `${smtp.host}:${smtp.port}` : 'Não configurado'],
    ['Autenticação', smtp.requires_auth ? 'Com usuário e senha' : 'Sem autenticação'],
    ['Usuário', smtp.username || '—'],
    ['Remetente', smtp.from_email || '—'],
    ['Recebe os alertas', smtp.to_email || smtp.username || '—'],
  ];

  return (
    <div className="space-y-4">
      <SmtpDrawer open={open} config={smtp} onClose={() => setOpen(false)} onSaved={load} />
      <Notice tone="primary" title="O que chega por aqui">
        Serviço do SGCG parado, lembrete de falha a cada 3 horas e queda do link de internet. As quedas saem por e-mail e por Telegram; o aviso de que o serviço voltou sai só pelo Telegram.
      </Notice>
      {error ? <Notice tone="danger" title="Falha ao carregar">{error}</Notice> : null}

      <Panel
        title="E-mail"
        description="Servidor de e-mail (SMTP) que envia os alertas."
        actions={(
          <>
            <Button icon={RefreshCw} onClick={load}>Recarregar</Button>
            <Button variant="primary" icon={Mail} onClick={() => setOpen(true)}>Editar e testar</Button>
          </>
        )}
      >
        <dl className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-outline p-3">
              <dt className="text-[11.5px] text-on-surface/50">{k}</dt>
              <dd className="mt-0.5 break-words font-medium text-on-surface">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        title="Telegram"
        description="Mensagens do Sentinela no seu Telegram."
        actions={<Button icon={Send} onClick={testTelegram} disabled={!telegram || testing}>{testing ? 'Enviando…' : 'Enviar mensagem de teste'}</Button>}
      >
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          {telegram === null ? <span className="text-on-surface/55">Verificando…</span> : telegram ? <Badge tone="success" dot>Configurado</Badge> : <Badge tone="warning" dot>Não configurado</Badge>}
          <span className="text-on-surface/65">
            {telegram === false
              ? 'O token do bot e o chat ficam só no servidor, por segurança. Para configurar, rode no servidor: sudo bash scripts/sgcg-telegram-setup.sh e depois reinicie o backend.'
              : 'O token do bot e o chat ficam só no servidor e não aparecem nesta tela.'}
          </span>
        </div>
      </Panel>
    </div>
  );
}
