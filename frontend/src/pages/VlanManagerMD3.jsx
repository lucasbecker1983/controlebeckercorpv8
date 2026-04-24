import React, { useState } from 'react';
import { Clock, ShieldCheck, ShieldAlert, Wifi, Briefcase, Camera, Users, Phone, Settings, Save } from 'lucide-react';
import { authFetch } from '../services/authFetch';
import { ActionButton, ModuleHeader, Surface } from '../components/ui/primitives';

const VlanManagerMD3 = () => {
  const [vlans, setVlans] = useState([
    { id: 10, name: 'Secretaria', icon: Briefcase, color: 'bg-blue-500', start: '08:00', end: '18:00', enabled: false },
    { id: 30, name: 'Celulares', icon: Wifi, color: 'bg-purple-500', start: '08:00', end: '18:00', enabled: true },
    { id: 40, name: 'CFTV', icon: Camera, color: 'bg-slate-500', start: '00:00', end: '23:59', enabled: false },
    { id: 50, name: 'SINE', icon: Users, color: 'bg-teal-500', start: '08:30', end: '17:00', enabled: true },
    { id: 70, name: 'Visitantes', icon: Users, color: 'bg-orange-500', start: '09:00', end: '16:00', enabled: true },
    { id: 80, name: 'VOiP', icon: Phone, color: 'bg-green-500', start: '00:00', end: '23:59', enabled: false },
    { id: 99, name: 'Gerenciamento', icon: Settings, color: 'bg-red-500', start: '00:00', end: '23:59', enabled: false },
  ]);

  const [loadingId, setLoadingId] = useState(null);

  const handleToggleEnable = (id) => setVlans(vlans.map(v => v.id === id ? { ...v, enabled: !v.enabled } : v));
  const handleChangeTime = (id, field, value) => setVlans(vlans.map(v => v.id === id ? { ...v, [field]: value } : v));

  const handleSave = async (vlan) => {
    setLoadingId(vlan.id);
    try {
      const response = await authFetch('/api/vlans/schedule', {
        method: 'POST',
        body: JSON.stringify({ vlanId: vlan.id, startTime: vlan.start, endTime: vlan.end, enabled: vlan.enabled }),
      });
      const data = await response.json();
      alert(response.ok ? data.message : `Erro: ${data.error}`);
    } catch (error) {
      alert("Falha de comunicação com o servidor.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        eyebrow="Controle"
        title="Horários de Rede"
        description="Gerencie a disponibilidade de internet por VLAN com leitura institucional, respeitando o tema global do SGCG e sem superfícies isoladas em modo escuro."
        badges={(
          <>
            <span className="inline-flex min-h-[var(--chip-height)] items-center rounded-full border border-primary/16 bg-primary/10 px-[var(--chip-padding-x)] py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
              Janela por VLAN
            </span>
            <span className="inline-flex min-h-[var(--chip-height)] items-center rounded-full border border-info/18 bg-info/10 px-[var(--chip-padding-x)] py-1 text-[10px] font-black uppercase tracking-[0.16em] text-info">
              Governado pelo shell SGCG
            </span>
          </>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {vlans.map((vlan) => {
          const Icon = vlan.icon;
          return (
            <Surface key={vlan.id} className="relative flex flex-col gap-6 p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl text-white shadow-md ${vlan.color}`}>
                    <Icon size={26} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-on-surface">VLAN {vlan.id}</h2>
                    <span className="text-sm font-semibold uppercase tracking-wider text-on-surface/50">{vlan.name}</span>
                  </div>
                </div>
                <button onClick={() => handleToggleEnable(vlan.id)} className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${vlan.enabled ? 'bg-primary' : 'bg-outline/30'}`}>
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${vlan.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium ${vlan.enabled ? 'bg-primary/10 text-primary' : 'bg-surface-high/72 text-on-surface/58'}`}>
                {vlan.enabled ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                {vlan.enabled ? 'Agendamento Ativo' : 'Acesso 24/7 (Aberto)'}
              </div>

              <div className={`grid grid-cols-1 gap-4 transition-opacity duration-300 sm:grid-cols-2 ${vlan.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex flex-col gap-1.5">
                  <label className="ml-1 text-xs font-bold uppercase text-on-surface/50">Abre às</label>
                  <input type="time" value={vlan.start} onChange={(e) => handleChangeTime(vlan.id, 'start', e.target.value)} className="w-full rounded-2xl border border-outline/16 bg-surface-high/72 px-4 py-3 text-lg font-medium text-on-surface outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/30 cursor-pointer" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="ml-1 text-xs font-bold uppercase text-on-surface/50">Fecha às</label>
                  <input type="time" value={vlan.end} onChange={(e) => handleChangeTime(vlan.id, 'end', e.target.value)} className="w-full rounded-2xl border border-outline/16 bg-surface-high/72 px-4 py-3 text-lg font-medium text-on-surface outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/30 cursor-pointer" />
                </div>
              </div>

              <ActionButton
                onClick={() => handleSave(vlan)}
                icon={Save}
                tone={loadingId === vlan.id ? 'neutral' : 'primary'}
                className="mt-auto w-full"
                disabled={loadingId === vlan.id}
              >
                {loadingId === vlan.id ? 'Aplicando...' : 'Aplicar regras'}
              </ActionButton>
            </Surface>
          );
        })}
      </div>
    </div>
  );
};

export default VlanManagerMD3;
