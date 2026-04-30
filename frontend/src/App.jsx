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
import DataGovernance from './pages/DataGovernance';
import ApprovalsExceptions from './pages/ApprovalsExceptions';
import Lgpd from './pages/Lgpd';
import Reports from './pages/Reports';
import Hotspot from './pages/Hotspot';
import HotspotPortal from './pages/HotspotPortal';
import { api, resetAuthInvalidation } from './services/api';
import { resetAuthFetchInvalidation } from './services/authFetch';

function getPreferenceScope(user) {
  const identifier = user?.username || user?.name || user?.email || user?.id;
  return String(identifier || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readPreference(baseKey, user, fallback) {
  const scope = getPreferenceScope(user);
  if (scope) {
    const scopedValue = localStorage.getItem(`${baseKey}_${scope}`);
    if (scopedValue) return scopedValue;
  }
  return localStorage.getItem(baseKey) || fallback;
}

const resolveStoredTheme = (user) => readPreference('sgcg_theme', user, localStorage.getItem('becker_theme') || 'light');
const resolveStoredAccent = (user) => readPreference('sgcg_accent', user, 'government');
const resolveStoredUiStyle = (user) => readPreference('sgcg_ui_style', user, 'solid');

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('becker_user') || '{}'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => resolveStoredTheme(JSON.parse(localStorage.getItem('becker_user') || '{}')));
  const [accent, setAccent] = useState(() => resolveStoredAccent(JSON.parse(localStorage.getItem('becker_user') || '{}')));
  const [uiStyle, setUiStyle] = useState(() => resolveStoredUiStyle(JSON.parse(localStorage.getItem('becker_user') || '{}')));

  useEffect(() => {
    const token = localStorage.getItem('becker_token');
    const storedUser = JSON.parse(localStorage.getItem('becker_user') || '{}');
    if (!token || (!storedUser?.username && !storedUser?.id)) {
      localStorage.removeItem('becker_token');
      localStorage.removeItem('becker_user');
      setUser({});
    } else {
      setUser(storedUser);
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    const handleAuthInvalid = () => {
      localStorage.removeItem('becker_token');
      localStorage.removeItem('becker_user');
      setUser({});
      setAuthReady(true);
    };

    window.addEventListener('sgcg:auth-invalid', handleAuthInvalid);
    return () => window.removeEventListener('sgcg:auth-invalid', handleAuthInvalid);
  }, []);

  useEffect(() => {
    setTheme(resolveStoredTheme(user));
    setAccent(resolveStoredAccent(user));
    setUiStyle(resolveStoredUiStyle(user));
  }, [user]);

  useEffect(() => {
    const scope = getPreferenceScope(user);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);
    document.documentElement.setAttribute('data-ui-style', uiStyle);
    localStorage.setItem('sgcg_theme', theme);
    localStorage.setItem('sgcg_accent', accent);
    localStorage.setItem('sgcg_ui_style', uiStyle);
    localStorage.setItem('becker_theme', theme);
    if (scope) {
      localStorage.setItem(`sgcg_theme_${scope}`, theme);
      localStorage.setItem(`sgcg_accent_${scope}`, accent);
      localStorage.setItem(`sgcg_ui_style_${scope}`, uiStyle);
    }
  }, [theme, accent, uiStyle, user]);

  const handleLogout = () => {
    resetAuthInvalidation();
    resetAuthFetchInvalidation();
    localStorage.removeItem('becker_token');
    localStorage.removeItem('becker_user');
    window.history.replaceState({}, '', '/');
    setUser({});
    setAuthReady(true);
    api.post('/api/auth/logout').catch(() => null);
  };

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface">Carregando sessão institucional...</div>;
  }

  if (window.location.pathname.startsWith('/hotspot/portal')) {
    return <HotspotPortal />;
  }

  if (!user?.id && !user?.username) {
    return <Login onLogin={(nextUser) => {
      resetAuthInvalidation();
      resetAuthFetchInvalidation();
      setUser(nextUser);
      localStorage.setItem('becker_user', JSON.stringify(nextUser));
    }} />;
  }

  return (
    <BrowserRouter>
      <AppShell
        sidebar={(
          <Sidebar
            user={user}
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            onLogout={handleLogout}
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
            className="group inline-flex items-center gap-2 rounded-full border border-outline/12 bg-surface-high/64 px-3 py-1.5 text-[11px] font-medium tracking-tight text-on-surface/60 transition-all duration-200 hover:border-primary/18 hover:text-on-surface/82"
            title="JMB Tecnologia"
          >
            <span>Plataforma mantida por</span>
            <span className="inline-flex h-6 items-center rounded-md border border-primary/12 bg-primary/10 px-1.5 transition-colors duration-200 group-hover:border-primary/22">
              <img src="/jmb-logo-clean.png" alt="JMB Tecnologia" className="h-[18px] w-auto object-contain" />
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
          <Route path="/governanca-dados" element={<DataGovernance />} />
          <Route path="/lgpd" element={<Lgpd />} />
          <Route path="/aprovacoes-excecoes" element={<ApprovalsExceptions />} />
          <Route path="/trilha-institucional" element={<Navigate to="/relatorios" />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/control" element={<Control />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/security" element={<Security />} />
          <Route path="/hotspot" element={<Hotspot />} />
          <Route
            path="/settings"
            element={(
              <Settings
                theme={theme}
                accent={accent}
                uiStyle={uiStyle}
                onThemeChange={setTheme}
                onAccentChange={setAccent}
                onUiStyleChange={setUiStyle}
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
