import { useEffect, useMemo, useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { Bell, Bot, Palette } from 'lucide-react';
import { api } from '../services/api';
import { PageHeader, Panel, Tabs, useUrlTab } from '../components/ui/kit';
import EmailNotifications from '../components/settings/EmailNotifications';
import AiProviders from '../components/settings/AiProviders';

const TABS = [
  { key: 'aparencia', label: 'Aparência', icon: Palette },
  { key: 'email', label: 'Alertas por e-mail e Telegram', icon: Bell },
];

const ACCENTS = [
  { value: 'government', label: 'Azul institucional', swatch: '#1f5fbf' },
  { value: 'navy', label: 'Marinho', swatch: '#1c5a90' },
  { value: 'copper', label: 'Cobre', swatch: '#8b5a2b' },
];

function Choice({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-outline hover:border-primary/40'}`}
    >
      {children}
      {selected ? <Check size={16} className="ml-auto text-primary" /> : null}
    </button>
  );
}

export default function Settings({ theme, accent, uiStyle, onThemeChange, onAccentChange, onUiStyleChange }) {
  // Módulo secreto: só aparece para o GOD (para os outros a rota responde 404 e a aba nem existe).
  const [god, setGod] = useState(false);
  useEffect(() => {
    let alive = true;
    api.get('/api/ai/admin/overview').then(() => { if (alive) setGod(true); }).catch(() => null);
    return () => { alive = false; };
  }, []);
  const tabs = useMemo(() => (god ? [...TABS, { key: 'ia', label: 'IA (restrito)', icon: Bot }] : TABS), [god]);
  const [tab, setTab] = useUrlTab(tabs, 'aparencia');
  // O tema limpo usa só superfícies sólidas; estilos antigos (vidro, minimal, executivo) foram descontinuados.
  useEffect(() => {
    if (uiStyle && uiStyle !== 'solid') onUiStyleChange?.('solid');
  }, [uiStyle, onUiStyleChange]);

  return (
    <div className="space-y-4">
      <PageHeader title="Configurações" description="Aparência do console e envio dos alertas do sistema por e-mail e Telegram." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'email' ? <EmailNotifications /> : null}
      {tab === 'ia' && god ? <AiProviders /> : null}
      {tab === 'aparencia' ? (
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Tema" description="A escolha fica salva neste navegador.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice selected={theme !== 'dark'} onClick={() => onThemeChange('light')}>
              <Sun size={18} className="text-warning" /><span><span className="block text-[13.5px] font-semibold text-on-surface">Claro</span><span className="block text-[12px] text-on-surface/55">Melhor em ambientes iluminados</span></span>
            </Choice>
            <Choice selected={theme === 'dark'} onClick={() => onThemeChange('dark')}>
              <Moon size={18} className="text-primary" /><span><span className="block text-[13.5px] font-semibold text-on-surface">Escuro</span><span className="block text-[12px] text-on-surface/55">Melhor para telas ligadas o dia todo</span></span>
            </Choice>
          </div>
        </Panel>
        <Panel title="Cor de destaque">
          <div className="grid gap-2 sm:grid-cols-3">
            {ACCENTS.map((a) => (
              <Choice key={a.value} selected={(accent || 'government') === a.value} onClick={() => onAccentChange(a.value)}>
                <span className="inline-block h-5 w-5 rounded-full" style={{ background: a.swatch }} />
                <span className="text-[13.5px] font-semibold text-on-surface">{a.label}</span>
              </Choice>
            ))}
          </div>
        </Panel>
      </div>
      ) : null}
    </div>
  );
}
