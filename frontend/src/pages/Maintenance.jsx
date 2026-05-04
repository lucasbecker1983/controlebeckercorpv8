import React from 'react';
import { Building2, CircuitBoard, Clock3, ShieldCheck } from 'lucide-react';

export default function Maintenance() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f6f8fb] text-[#122033]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(37,99,235,0.18),transparent_28rem),radial-gradient(circle_at_82%_22%,rgba(20,184,166,0.18),transparent_24rem),linear-gradient(135deg,#f8fafc_0%,#eef6f1_48%,#f6f8fb_100%)]" />
      <main className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-rows-[auto_1fr_auto] gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-[#122033]/12 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xl font-black uppercase tracking-[0.02em] text-[#122033] sm:text-3xl">
                Prefeitura Municipal de Jacarezinho
              </div>
              <div className="mt-1 text-sm font-bold text-[#436072] sm:text-base">
                Secretaria de Comércio, Indústria, Serviços e Inovação
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0f766e]/20 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-[#0f766e] shadow-sm">
              <ShieldCheck size={15} />
              SGCG
            </div>
          </div>
        </header>

        <section className="grid items-center gap-7 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-[#122033]/12 bg-white/75 p-7 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur sm:p-10 lg:p-12">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#0f766e]">
              <Clock3 size={16} />
              Continuidade operacional
            </div>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.92] tracking-normal text-[#122033] sm:text-7xl lg:text-8xl">
              Rede em manutenção.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#3a5063] sm:text-xl">
              Esta conexão foi colocada temporariamente em modo manutenção por uma intervenção técnica autorizada. A navegação será restabelecida assim que a equipe concluir a verificação do ambiente.
            </p>
          </div>

          <div className="relative min-h-[360px] overflow-hidden rounded-[28px] bg-[#102033] p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.22)] sm:min-h-[460px] sm:p-8">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#14b8a6]/25" />
            <div className="absolute bottom-8 right-8 h-24 w-24 rounded-full border border-white/10" />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
                  <CircuitBoard size={15} />
                  Modo manutenção ativo
                </div>
                <div className="mt-10 grid grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div
                      key={index}
                      className={`aspect-square min-h-20 rounded-2xl border border-white/14 ${[1, 4, 7].includes(index) ? 'bg-emerald-400/24' : 'bg-white/7'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-white/12 bg-white/8 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-emerald-200">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-black">Intervenção institucional</div>
                    <div className="mt-1 text-xs leading-5 text-white/68">
                      Não é necessário alterar configurações do dispositivo.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#122033]/12 pt-4 text-xs font-medium text-[#5b7080] sm:flex-row sm:items-center sm:justify-between">
          <span>SGCG - Sistema de Governança e Controle Governamental</span>
          <span>JMB Tecnologia</span>
        </footer>
      </main>
    </div>
  );
}
