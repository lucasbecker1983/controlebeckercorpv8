import { ArrowLeft, Building2, FileText, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { StatusChip, Surface } from '../components/ui/primitives';

const sections = [
  {
    title: 'Quem é responsável pelos dados',
    text: 'A Prefeitura Municipal de Jacarezinho/PR é a controladora dos dados pessoais tratados no SGCG. A JMB Tecnologia atua como mantenedora técnica da plataforma, prestando suporte, hospedagem, evolução e operação assistida conforme orientação institucional.',
  },
  {
    title: 'Quais dados podem ser tratados',
    text: 'A plataforma pode tratar dados cadastrais, dados de autenticação, usuário, setor, CPF quando necessário, telefone, endereço IP, MAC do dispositivo, VLAN, registros de sessão, eventos de segurança, chamados, evidências de auditoria e metadados técnicos de navegação institucional.',
  },
  {
    title: 'Por que esses dados são usados',
    text: 'Os dados são usados para identificar usuários autorizados, proteger a rede pública, liberar ou restringir acesso conforme política institucional, responder chamados, registrar decisões administrativas, investigar incidentes, produzir relatórios oficiais e cumprir obrigações legais de segurança e auditoria.',
  },
  {
    title: 'Base legal e responsabilidade pública',
    text: 'O tratamento observa a Lei Geral de Proteção de Dados Pessoais, Lei nº 13.709/2018, especialmente as bases de cumprimento de obrigação legal, execução de políticas públicas, legítimo interesse público, proteção do crédito institucional quando aplicável, segurança e prevenção a fraudes. Também são observadas as responsabilidades previstas no Marco Civil da Internet.',
  },
  {
    title: 'Com quem os dados podem ser compartilhados',
    text: 'Os dados podem ser acessados por agentes públicos autorizados, equipes técnicas credenciadas, fornecedores contratados para sustentação da plataforma e autoridades competentes, sempre no limite da finalidade institucional, da segurança da informação e da necessidade de auditoria.',
  },
  {
    title: 'Por quanto tempo os registros ficam guardados',
    text: 'Os registros são mantidos pelo período necessário à operação do serviço público, à segurança da rede, à apuração de incidentes, à prestação de contas e ao cumprimento de prazos legais ou regulatórios. Logs de auditoria podem ser preservados de forma imutável para comprovação institucional.',
  },
  {
    title: 'Direitos das pessoas',
    text: 'O titular pode solicitar confirmação de tratamento, acesso, correção, atualização, informação sobre compartilhamento, revisão de registros e demais direitos previstos na LGPD. A solicitação deve ser feita pelo canal oficial indicado pela Prefeitura.',
  },
  {
    title: 'Segurança e auditoria',
    text: 'A plataforma aplica controles de autenticação, rastreabilidade, trilhas de auditoria, registros técnicos, monitoramento de eventos, segregação de perfis e medidas de proteção para reduzir risco de acesso indevido, perda, alteração não autorizada ou uso incompatível com a finalidade pública.',
  },
];

export default function PrivacyNotice() {
  const issuedAt = '13 de maio de 2026';

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href="/"
            className="inline-flex min-h-[var(--control-height)] items-center gap-2 rounded-full border border-outline/12 bg-surface-high/72 px-4 py-2 text-sm font-semibold text-on-surface/70 shadow-[var(--shadow-soft)] transition hover:border-primary/18 hover:text-primary"
          >
            <ArrowLeft size={16} />
            Voltar
          </a>
          <div className="flex flex-wrap gap-2">
            <StatusChip label="Documento público" tone="primary" />
            <StatusChip label="LGPD" tone="success" />
            <StatusChip label="Marco Civil" tone="warning" />
          </div>
        </div>

        <section className="rounded-[28px] border border-outline/12 bg-surface-high/80 p-6 shadow-[var(--shadow-soft)] sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/16 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-primary">
                <ShieldCheck size={14} />
                SGCG
              </div>
              <h1 className="mt-5 max-w-4xl text-3xl font-black tracking-tight text-on-surface sm:text-4xl lg:text-5xl">
                Aviso de Privacidade do Sistema de Governança e Controle Governamental
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-on-surface/66 sm:text-base">
                Este aviso explica, em linguagem direta, como os dados pessoais podem ser tratados no SGCG para operação institucional, segurança da rede, controle governamental, atendimento, auditoria e prestação de contas.
              </p>
            </div>

            <div className="rounded-[22px] border border-outline/12 bg-surface p-5">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/16 bg-primary/10 text-primary">
                  <Building2 size={20} />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.14em] text-on-surface/48">Controlador</div>
                  <div className="mt-1 text-sm font-black text-on-surface">Prefeitura Municipal de Jacarezinho/PR</div>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6 text-on-surface/66">
                <div className="flex gap-2">
                  <FileText size={16} className="mt-1 shrink-0 text-primary" />
                  <span>Versão publicada em {issuedAt}.</span>
                </div>
                <div className="flex gap-2">
                  <LockKeyhole size={16} className="mt-1 shrink-0 text-primary" />
                  <span>Uso institucional, com evidências preservadas para controle interno.</span>
                </div>
                <div className="flex gap-2">
                  <Mail size={16} className="mt-1 shrink-0 text-primary" />
                  <span>Solicitações devem seguir o canal oficial informado pela Prefeitura.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <Surface key={section.title} stripe={false} className="p-5 sm:p-6">
              <h2 className="text-lg font-black tracking-tight text-on-surface">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-on-surface/66">{section.text}</p>
            </Surface>
          ))}
        </div>

        <section className="rounded-[24px] border border-primary/14 bg-primary/8 p-5 sm:p-6">
          <h2 className="text-lg font-black tracking-tight text-on-surface">Atualizações deste aviso</h2>
          <p className="mt-3 text-sm leading-7 text-on-surface/66">
            Este aviso pode ser atualizado para refletir mudanças legais, técnicas, administrativas ou operacionais. A versão publicada nesta página é a referência vigente para o uso institucional do SGCG.
          </p>
        </section>
      </div>
    </main>
  );
}
