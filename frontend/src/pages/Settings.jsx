import { Moon, Palette, ShieldCheck, Sun, SwatchBook, UserCircle2 } from 'lucide-react';

const accentOptions = [
  {
    value: 'government',
    label: 'Governamental',
    description: 'Verde institucional com contraste técnico para operação pública.',
    swatches: ['#0f6a5c', '#2e557a', '#8d6c23'],
  },
  {
    value: 'navy',
    label: 'Institucional',
    description: 'Azul sóbrio para ambientes formais e administrativos.',
    swatches: ['#1c5a90', '#4a677f', '#876a3a'],
  },
  {
    value: 'copper',
    label: 'Executivo',
    description: 'Cobre e grafite para leitura premium e reuniões decisórias.',
    swatches: ['#8b5a2b', '#6e5a49', '#1f6a61'],
  },
];

function TonePreview({ color }) {
  return <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: color }} />;
}

export default function Settings({ theme, accent, onThemeChange, onAccentChange, user }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[var(--dialog-radius)] border border-outline/12 bg-container/88 p-[var(--spacing-section)] shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/16 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              <SwatchBook size={14} />
              Configurações
            </div>
            <h1 className="mt-4 text-[var(--text-display)] font-black tracking-tight text-on-surface">
              Aparência institucional do SGCG
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-on-surface/66">
              Este módulo inicial centraliza o tema visual do sistema. As próximas configurações podem evoluir aqui sem misturar decisões operacionais com a governança da interface.
            </p>
          </div>

          <div className="rounded-[calc(var(--surface-radius)-2px)] border border-outline/12 bg-surface-high/72 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/16 bg-primary text-sm font-black text-on-primary">
                {String(user?.name || user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-semibold text-on-surface">{user?.name || user?.username || 'Usuário'}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-on-surface/48">
                  <UserCircle2 size={13} className="text-primary" />
                  <span>{user?.role || user?.perfil || 'Operador institucional'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[var(--dialog-radius)] border border-outline/12 bg-container/88 p-[var(--spacing-section)] shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            <ShieldCheck size={14} />
            Tema
          </div>
          <h2 className="mt-3 text-[var(--text-headline)] font-black tracking-tight text-on-surface">Modo de visualização</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface/62">
            Defina o comportamento visual principal do painel para operação diurna ou salas de monitoramento com baixa luminosidade.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onThemeChange('light')}
              className={`rounded-3xl border p-5 text-left transition-all ${
                theme === 'light'
                  ? 'border-primary/24 bg-primary/10 shadow-[var(--shadow-soft)]'
                  : 'border-outline/12 bg-surface-high/62 hover:border-primary/16'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-outline/12 bg-white text-primary shadow-sm">
                  <Sun size={20} />
                </span>
                <div>
                  <div className="text-sm font-bold text-on-surface">Tema claro</div>
                  <div className="mt-1 text-xs text-on-surface/56">Melhor para operação administrativa e leitura documental.</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onThemeChange('dark')}
              className={`rounded-3xl border p-5 text-left transition-all ${
                theme === 'dark'
                  ? 'border-primary/24 bg-primary/10 shadow-[var(--shadow-soft)]'
                  : 'border-outline/12 bg-surface-high/62 hover:border-primary/16'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-outline/12 bg-slate-950 text-primary shadow-sm">
                  <Moon size={20} />
                </span>
                <div>
                  <div className="text-sm font-bold text-on-surface">Tema escuro</div>
                  <div className="mt-1 text-xs text-on-surface/56">Melhor para supervisão contínua, salas técnicas e dashboards densos.</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="rounded-[var(--dialog-radius)] border border-outline/12 bg-container/88 p-[var(--spacing-section)] shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            <Palette size={14} />
            Cores
          </div>
          <h2 className="mt-3 text-[var(--text-headline)] font-black tracking-tight text-on-surface">Paleta institucional</h2>
          <p className="mt-2 text-sm leading-6 text-on-surface/62">
            A cor-base altera o acento visual do sistema sem mudar o conteúdo operacional. Isso permite adequar o painel a diferentes salas, clientes e contextos institucionais.
          </p>

          <div className="mt-6 space-y-3">
            {accentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onAccentChange(option.value)}
                className={`w-full rounded-3xl border p-5 text-left transition-all ${
                  accent === option.value
                    ? 'border-primary/24 bg-primary/10 shadow-[var(--shadow-soft)]'
                    : 'border-outline/12 bg-surface-high/62 hover:border-primary/16'
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-bold text-on-surface">{option.label}</div>
                    <p className="mt-1 text-xs leading-5 text-on-surface/56">{option.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {option.swatches.map((color) => (
                      <TonePreview key={color} color={color} />
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
