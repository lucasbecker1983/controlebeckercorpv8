import React, { useState } from 'react';
import { Clock, ShieldCheck, ShieldAlert, Wifi, Briefcase, Camera, Users, Phone, Settings, Save } from 'lucide-react';
import { authFetch } from '../services/authFetch';

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
    <div className="p-8 min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="mb-10 flex items-center gap-4">
        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-2xl text-blue-600 dark:text-blue-400">
          <Clock size={32} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Controle de Horários</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Gerencie a disponibilidade de internet por VLAN</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {vlans.map((vlan) => {
          const Icon = vlan.icon;
          return (
            <div key={vlan.id} className="relative p-6 bg-white dark:bg-slate-800 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 dark:border-slate-700/50 flex flex-col gap-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl text-white shadow-md ${vlan.color}`}>
                    <Icon size={26} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">VLAN {vlan.id}</h2>
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{vlan.name}</span>
                  </div>
                </div>
                <button onClick={() => handleToggleEnable(vlan.id)} className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${vlan.enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${vlan.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl font-medium text-sm ${vlan.enabled ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400'}`}>
                {vlan.enabled ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                {vlan.enabled ? 'Agendamento Ativo' : 'Acesso 24/7 (Aberto)'}
              </div>

              <div className={`grid grid-cols-2 gap-4 transition-opacity duration-300 ${vlan.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Abre às</label>
                  <input type="time" value={vlan.start} onChange={(e) => handleChangeTime(vlan.id, 'start', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-lg font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Fecha às</label>
                  <input type="time" value={vlan.end} onChange={(e) => handleChangeTime(vlan.id, 'end', e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-lg font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer" />
                </div>
              </div>

              <button onClick={() => handleSave(vlan)} className={`mt-auto flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-sm transition-all duration-200 ${loadingId === vlan.id ? 'bg-blue-400 text-white cursor-wait' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md hover:shadow-lg dark:bg-blue-600 dark:hover:bg-blue-500'}`}>
                <Save size={18} />
                {loadingId === vlan.id ? 'APLICANDO...' : 'APLICAR REGRAS'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VlanManagerMD3;
