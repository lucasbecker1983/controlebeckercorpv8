import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AppShell from './components/ui/AppShell';
import Topbar from './components/ui/Topbar';
import Login from './pages/Login';
import Overview from './pages/Overview';
import TrafficMap from './pages/TrafficMap';
import QuickActions from './pages/QuickActions';
import Network from './pages/Network';
import Server from './pages/Server';
import Users from './pages/Users';
import Proxy from './pages/Proxy';
import BlockingReleases from './pages/BlockingReleases';
import Control from './pages/Control';
import AiAssistant from './pages/AiAssistant';
import Backups from './pages/Backups';
import Security from './pages/Security';
import Settings from './pages/Settings';
import DataGovernance from './pages/DataGovernance';
import GovernanceVisual from './pages/GovernanceVisual';
import CentralAudit from './pages/CentralAudit';
import ApprovalsExceptions from './pages/ApprovalsExceptions';
import Lgpd from './pages/Lgpd';
import Reports from './pages/Reports';
import Hotspot from './pages/Hotspot';
import HotspotPortal from './pages/HotspotPortal';
import Collaborators from './pages/Collaborators';
import CollaboratorPortal from './pages/CollaboratorPortal';
import SupportPortal from './pages/SupportPortal';
import SupportTickets from './pages/SupportTickets';
import Maintenance from './pages/Maintenance';
import PrivacyNotice from './pages/PrivacyNotice';
import { api, resetAuthInvalidation } from './services/api';
import { resetAuthFetchInvalidation } from './services/authFetch';
import { storageGet, storageRemove, storageSet } from './services/browserStorage';

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
    const scopedValue = storageGet(`${baseKey}_${scope}`, '');
    if (scopedValue) return scopedValue;
  }
  return storageGet(baseKey, '') || fallback;
}

const resolveStoredTheme = (user) => readPreference('sgcg_theme', user, storageGet('becker_theme', '') || 'light');
const resolveStoredAccent = (user) => readPreference('sgcg_accent', user, 'government');
const resolveStoredUiStyle = (user) => readPreference('sgcg_ui_style', user, 'solid');

function isCollaboratorPortalRequest() {
  const { hostname, pathname } = window.location;
  if (pathname.startsWith('/suporte')) return false;
  return pathname.startsWith('/collab/portal')
    || hostname === '192.168.30.1'
    || hostname === 'connectivitycheck.gstatic.com'
    || hostname === 'clients3.google.com'
    || hostname === 'captive.apple.com'
    || hostname === 'www.msftconnecttest.com'
    || hostname === 'msftconnecttest.com';
}

function isSupportPortalRequest() {
  const { pathname, hostname } = window.location;
  return pathname.startsWith('/suporte')
    || hostname === 'suporte.interno.jacarezinho'
    || hostname === 'chamados.interno.jacarezinho'
    || hostname === 'suporte.jacarezinho.interno'
    || hostname === 'chamados.jacarezinho.interno';
}

function isHotspotPortalRequest() {
  const { hostname, pathname } = window.location;
  return window.__SGCG_FORCE_PORTAL === 'hotspot'
    || pathname.startsWith('/hotspot/portal')
    || hostname === '192.168.70.1';
}

function readStoredUser() {
  try {
    return JSON.parse(storageGet('becker_user', '{}') || '{}') || {};
  } catch {
    storageRemove('becker_token');
    storageRemove('becker_user');
    return {};
  }
}

const POLICY_CONTEXT = {
  eyebrow: 'Controlar',
  title: 'Políticas de Acesso',
  description: 'Bloqueios e liberações por VLAN, exceções VIP e liberações temporárias. Para uma ação simples, use Ações Rápidas.',
};

const DNS_PROXY_CONTEXT = {
  eyebrow: 'Controlar',
  title: 'DNS & Proxy',
  description: 'Motor de filtragem, contingência de DNS, domínios ignorados e telemetria do proxy.',
};

const POLICY_TABS = ['overview', 'policies', 'vlans', 'vips', 'sporadic'];
const DNS_PROXY_TABS = ['observability', 'engine', 'contingency', 'metrics', 'ignored'];

function PolicyPage() {
  return <BlockingReleases allowedTabs={POLICY_TABS} initialTab="policies" context={POLICY_CONTEXT} />;
}

function DnsProxyPage() {
  return <BlockingReleases allowedTabs={DNS_PROXY_TABS} initialTab="engine" context={DNS_PROXY_CONTEXT} showQuickPanels={false} />;
}

// Endereços antigos continuam funcionando e levam para a tela nova.
function LegacyRedirect({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

function LegacyBlockingRedirect() {
  const location = useLocation();
  const tab = new URLSearchParams(location.search).get('tab');
  const target = DNS_PROXY_TABS.includes(tab) ? '/dns-proxy' : '/politicas';
  return <Navigate to={`${target}${location.search}`} replace />;
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(() => readStoredUser());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => resolveStoredTheme(readStoredUser()));
  const [accent, setAccent] = useState(() => resolveStoredAccent(readStoredUser()));
  const [uiStyle, setUiStyle] = useState(() => resolveStoredUiStyle(readStoredUser()));

  useEffect(() => {
    const token = storageGet('becker_token', '');
    const storedUser = readStoredUser();
    if (!token || (!storedUser?.username && !storedUser?.id)) {
      storageRemove('becker_token');
      storageRemove('becker_user');
      setUser({});
    } else {
      setUser(storedUser);
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    const handleAuthInvalid = () => {
      storageRemove('becker_token');
      storageRemove('becker_user');
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
    storageSet('sgcg_theme', theme);
    storageSet('sgcg_accent', accent);
    storageSet('sgcg_ui_style', uiStyle);
    storageSet('becker_theme', theme);
    if (scope) {
      storageSet(`sgcg_theme_${scope}`, theme);
      storageSet(`sgcg_accent_${scope}`, accent);
      storageSet(`sgcg_ui_style_${scope}`, uiStyle);
    }
  }, [theme, accent, uiStyle, user]);

  const handleLogout = () => {
    resetAuthInvalidation();
    resetAuthFetchInvalidation();
    storageRemove('becker_token');
    storageRemove('becker_user');
    window.history.replaceState({}, '', '/');
    setUser({});
    setAuthReady(true);
    api.post('/api/auth/logout').catch(() => null);
  };

  if (!authReady) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-on-surface/60">Carregando...</div>;
  }

  if (isHotspotPortalRequest()) {
    return <HotspotPortal />;
  }

  if (isSupportPortalRequest()) {
    return <SupportPortal />;
  }

  if (isCollaboratorPortalRequest()) {
    return <CollaboratorPortal />;
  }

  if (window.location.pathname.startsWith('/manutencao')) {
    return <Maintenance />;
  }

  if (window.location.pathname.startsWith('/aviso-de-privacidade')) {
    return <PrivacyNotice />;
  }

  if (!user?.id && !user?.username) {
    return <Login onLogin={(nextUser) => {
      resetAuthInvalidation();
      resetAuthFetchInvalidation();
      setUser(nextUser);
      storageSet('becker_user', JSON.stringify(nextUser));
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
          <a href="https://jmbtecnologia.com.br" target="_blank" rel="noreferrer" className="text-[11.5px] text-on-surface/45 hover:text-on-surface/70">
            Mantido por JMB Tecnologia
          </a>
        )}
      >
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/mapa-trafego" element={<TrafficMap />} />
          <Route path="/radar-dns" element={<Proxy />} />
          <Route path="/servidor" element={<Server />} />
          <Route path="/acoes-rapidas" element={<QuickActions />} />
          <Route path="/rede" element={<Network />} />
          <Route path="/politicas" element={<PolicyPage />} />
          <Route path="/dns-proxy" element={<DnsProxyPage />} />
          <Route path="/seguranca" element={<Security />} />
          <Route path="/chamados" element={<SupportTickets />} />
          <Route path="/hotspot" element={<Hotspot />} />
          <Route path="/colaboradores" element={<Collaborators />} />
          <Route path="/auditoria" element={<CentralAudit />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/indicadores" element={<GovernanceVisual />} />
          <Route path="/aprovacoes" element={<ApprovalsExceptions />} />
          <Route path="/lgpd" element={<Lgpd />} />
          <Route path="/dados" element={<DataGovernance />} />
          <Route path="/operacoes" element={<Control user={user} />} />
          <Route path="/backups" element={<Backups />} />
          <Route path="/assistente-ia" element={<AiAssistant />} />
          <Route path="/usuarios" element={<Users />} />
          <Route
            path="/configuracoes"
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

          <Route path="/network" element={<LegacyRedirect to="/rede" />} />
          <Route path="/redes/agendamento" element={<Navigate to="/rede?tab=scheduler" replace />} />
          <Route path="/server" element={<LegacyRedirect to="/servidor" />} />
          <Route path="/users" element={<LegacyRedirect to="/usuarios" />} />
          <Route path="/proxy" element={<LegacyRedirect to="/radar-dns" />} />
          <Route path="/bloqueios-liberacoes" element={<LegacyBlockingRedirect />} />
          <Route path="/governanca-politicas" element={<LegacyRedirect to="/politicas" />} />
          <Route path="/governanca-conformidade" element={<LegacyRedirect to="/lgpd" />} />
          <Route path="/governanca-auditoria" element={<LegacyRedirect to="/auditoria" />} />
          <Route path="/auditoria-central" element={<LegacyRedirect to="/auditoria" />} />
          <Route path="/trilha-institucional" element={<LegacyRedirect to="/auditoria" />} />
          <Route path="/governanca-visual" element={<LegacyRedirect to="/indicadores" />} />
          <Route path="/governanca-dados" element={<LegacyRedirect to="/dados" />} />
          <Route path="/aprovacoes-excecoes" element={<LegacyRedirect to="/aprovacoes" />} />
          <Route path="/control" element={<LegacyRedirect to="/operacoes" />} />
          <Route path="/security" element={<LegacyRedirect to="/seguranca" />} />
          <Route path="/colaboradores-mobile" element={<LegacyRedirect to="/colaboradores" />} />
          <Route path="/settings" element={<LegacyRedirect to="/configuracoes" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
