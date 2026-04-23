import React, { useState, useEffect } from 'react';
import VlanManagerMD3 from "./pages/VlanManagerMD3";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AppShell from './components/ui/AppShell';
import Topbar from './components/ui/Topbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Network from './pages/Network';
import Server from './pages/Server';
import Users from './pages/Users';
import Proxy from './pages/Proxy';
import BlockingReleases from './pages/BlockingReleases';
import Control from './pages/Control';
import Backups from './pages/Backups';
import Security from './pages/Security';
import Settings from './pages/Settings';

const resolveStoredTheme = () => localStorage.getItem('sgcg_theme') || localStorage.getItem('becker_theme') || 'dark';
const resolveStoredAccent = () => localStorage.getItem('sgcg_accent') || 'government';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('becker_token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('becker_user') || '{}'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(resolveStoredTheme);
  const [accent, setAccent] = useState(resolveStoredAccent);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('sgcg_theme', theme);
    localStorage.setItem('sgcg_accent', accent);
    localStorage.setItem('becker_theme', theme);
  }, [theme, accent]);

  if (!token) {
    return (
      <Login
        theme={theme}
        accent={accent}
        onThemeChange={setTheme}
        onAccentChange={setAccent}
        onLogin={(t, u) => { setToken(t); setUser(u); }}
      />
    );
  }

  return (
    <BrowserRouter>
      <AppShell
        sidebar={(
          <Sidebar
            user={user}
            theme={theme}
            accent={accent}
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            onLogout={() => { localStorage.clear(); setToken(null); }}
          />
        )}
        topbar={(
          <Topbar
            user={user}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            onOpenMenu={() => setIsMobileMenuOpen(true)}
          />
        )}
        footer={(
          <a
            href="https://jmbtecnologia.com.br"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-outline/12 bg-surface-high/68 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface/44 transition-all duration-200 hover:border-primary/18 hover:text-on-surface/72"
            title="JMB Tecnologia"
          >
            <span>Operado por</span>
            <span className="inline-flex items-center rounded-md border border-primary/16 bg-primary/10 px-2 py-1 text-[9px] font-black tracking-[0.24em] text-primary transition-colors duration-200 group-hover:border-primary/24">
              JMB TECNOLOGIA
            </span>
          </a>
        )}
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/network" element={<Network />} />
          <Route path="/server" element={<Server />} />
          <Route path="/users" element={<Users />} />
          <Route path="/proxy" element={<Proxy />} />
          <Route path="/bloqueios-liberacoes" element={<BlockingReleases />} />
          <Route path="/control" element={<Control />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/security" element={<Security />} />
          <Route
            path="/settings"
            element={(
              <Settings
                theme={theme}
                accent={accent}
                onThemeChange={setTheme}
                onAccentChange={setAccent}
                user={user}
              />
            )}
          />
          <Route path="*" element={<Navigate to="/" />} />
          <Route path="/redes/agendamento" element={<VlanManagerMD3 />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
