import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Download, Save, Trash2, Plus, Server } from 'lucide-react';

const API_URL = "/api";

export default function ProxyRules() {
  const [activeTab, setActiveTab] = useState('bloqueados');
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);

  // Carrega lista ao mudar de aba
  useEffect(() => {
    fetchList();
  }, [activeTab]);

  const fetchList = async () => {
    setLoading(true);
    try {
      // Mapeia abas para endpoints da API
      const type = activeTab === 'bancos' ? 'bancos' : activeTab;
      const res = await fetch(`${API_URL}/rules/${type}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erro ao buscar dados", error);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const type = activeTab === 'bancos' ? 'bancos' : activeTab;
      await fetch(`${API_URL}/rules/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: items })
      });
      alert('Regras salvas e Proxy atualizado!');
    } catch (error) {
      alert('Erro ao salvar.');
    }
    setLoading(false);
  };

  const addItem = () => {
    if (newItem && !items.includes(newItem)) {
      setItems([...items, newItem.toLowerCase()]);
      setNewItem('');
    }
  };

  const removeItem = (itemToRemove) => {
    setItems(items.filter(item => item !== itemToRemove));
  };

  const handleDownloadCert = () => {
    window.location.href = `${API_URL}/cert/download`;
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen font-sans">
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Server className="text-blue-500" /> Centro de Controle Becker Proxy
          </h1>
          <p className="text-gray-400 mt-1">Gestão de Acesso, Exceções SSL e Segurança</p>
        </div>
        
        <button 
          onClick={handleDownloadCert}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg hover:shadow-green-500/20"
        >
          <Download size={20} />
          Baixar Certificado CA (.der)
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <TabButton 
          active={activeTab === 'bloqueados'} 
          onClick={() => setActiveTab('bloqueados')} 
          icon={<ShieldAlert size={18} />}
          label="Sites Bloqueados"
          color="red"
        />
        <TabButton 
          active={activeTab === 'permitidos'} 
          onClick={() => setActiveTab('permitidos')} 
          icon={<ShieldCheck size={18} />}
          label="Sites Permitidos (VIP)"
          color="blue"
        />
        <TabButton 
          active={activeTab === 'bancos'} 
          onClick={() => setActiveTab('bancos')} 
          icon={<ShieldCheck size={18} />} // Ícone repetido intencionalmente, mas contexto diferente
          label="Exceções Bancos/SSL"
          color="yellow"
        />
      </div>

      {/* Content Area */}
      <div className="bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
        <h2 className="text-xl font-semibold mb-4 capitalize flex items-center gap-2">
          {activeTab === 'bloqueados' && <span className="text-red-400">⛔ Lista Negra (Blacklist)</span>}
          {activeTab === 'permitidos' && <span className="text-blue-400">✅ Lista Branca (Whitelist)</span>}
          {activeTab === 'bancos' && <span className="text-yellow-400">🏦 Bancos & Gov (Sem Inspeção)</span>}
        </h2>

        {/* Input Add */}
        <div className="flex gap-2 mb-6">
          <input 
            type="text" 
            placeholder="Ex: facebook.com ou .bet365.com" 
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500 text-white"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
          />
          <button 
            onClick={addItem}
            className="bg-gray-700 hover:bg-gray-600 px-6 rounded-lg transition-colors"
          >
            <Plus size={24} />
          </button>
        </div>

        {/* List */}
        <div className="max-h-[400px] overflow-y-auto mb-6 pr-2 custom-scrollbar">
          {items.length === 0 && <p className="text-gray-500 text-center py-4">Nenhum site na lista.</p>}
          
          {items.map((item, index) => (
            <div key={index} className="flex justify-between items-center bg-gray-700/50 p-3 mb-2 rounded border border-gray-700 hover:border-gray-500 transition-all group">
              <span className="font-mono text-gray-200">{item}</span>
              <button 
                onClick={() => removeItem(item)}
                className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 p-2 rounded"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        {/* Save Button */}
        <div className="flex justify-end border-t border-gray-700 pt-4">
          <button 
            onClick={handleSave}
            disabled={loading}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-lg transition-all ${
              loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-blue-500/30'
            }`}
          >
            <Save size={20} />
            {loading ? 'Aplicando...' : 'Salvar e Aplicar Regras'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, color }) {
  const activeClasses = {
    red: "bg-red-500/10 text-red-400 border-red-500",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500",
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all font-medium ${
        active 
          ? activeClasses[color] 
          : "border-transparent text-gray-400 hover:bg-gray-800 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
