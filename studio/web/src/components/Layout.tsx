import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  Database,
  Terminal,
  Layers,
  HardDrive,
  Clock,
  Users,
  AlertTriangle,
  Save,
  GitBranch,
  Shield,
  Settings,
  BarChart2,
  Tv,
  Radio,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Search,
  HelpCircle,
  Server,
  Zap,
  Lock,
  Cpu,
  Globe,
} from 'lucide-react';
import { getDisplayHost } from '../utils/host';
import { CommandPalette } from './CommandPalette';
import { HelpDrawer } from './HelpDrawer';
import { ConnectModal } from './ConnectModal';
import { useMetrics } from '../features/metrics/MetricsContext';
import { isCapabilityUnavailable } from '../features/metrics/capabilities';

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  capability?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: 'OVERVIEW',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: <Activity className="h-4 w-4" /> },
    ],
  },
  {
    group: 'DATA',
    items: [
      { name: 'Key Explorer', path: '/keys', icon: <Database className="h-4 w-4" />, capability: 'SCAN' },
      { name: 'Console CLI', path: '/console', icon: <Terminal className="h-4 w-4" /> },
      { name: 'Data Types Playground', path: '/playground', icon: <Layers className="h-4 w-4" /> },
    ],
  },
  {
    group: 'RUNTIME',
    items: [
      { name: 'Memory & Eviction', path: '/memory', icon: <HardDrive className="h-4 w-4" />, capability: 'INFO' },
      { name: 'Expiration (TTL)', path: '/expiration', icon: <Clock className="h-4 w-4" />, capability: 'TTL' },
      { name: 'Clients', path: '/clients', icon: <Users className="h-4 w-4" />, capability: 'CLIENT' },
      { name: 'Slow Log', path: '/slowlog', icon: <AlertTriangle className="h-4 w-4" />, capability: 'SLOWLOG' },
    ],
  },
  {
    group: 'RELIABILITY',
    items: [
      { name: 'Persistence', path: '/persistence', icon: <Save className="h-4 w-4" />, capability: 'INFO' },
      { name: 'Replication', path: '/replication', icon: <GitBranch className="h-4 w-4" />, capability: 'INFO' },
    ],
  },
  {
    group: 'ACCESS',
    items: [
      { name: 'Security & ACL', path: '/security', icon: <Shield className="h-4 w-4" />, capability: 'ACL' },
      { name: 'Configuration', path: '/config', icon: <Settings className="h-4 w-4" />, capability: 'CONFIG' },
    ],
  },
  {
    group: 'OBSERVE',
    items: [
      { name: 'Metrics', path: '/metrics', icon: <BarChart2 className="h-4 w-4" /> },
      { name: 'Live Monitor', path: '/monitor', icon: <Tv className="h-4 w-4" /> },
      { name: 'Pub/Sub', path: '/pubsub', icon: <Radio className="h-4 w-4" />, capability: 'PUBSUB' },
    ],
  },
  {
    group: 'LEARN',
    items: [
      { name: 'Architecture Tour', path: '/learn/tour', icon: <Cpu className="h-4 w-4" /> },
      { name: 'Command Reference', path: '/learn/commands', icon: <BookOpen className="h-4 w-4" /> },
      { name: 'Guided Labs', path: '/learn/labs', icon: <Globe className="h-4 w-4" /> },
    ],
  },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { latestSample, connectionState, engine, stale, hasSample } = useMetrics();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('redisx_theme') === 'light' ? 'light' : 'dark');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [requestError, setRequestError] = useState<{ message: string; hint?: string } | null>(null);
  const selectedDb = Number(localStorage.getItem('redisx_db') ?? 0);
  const currentItem = NAV_GROUPS.flatMap(group => group.items).find(item => item.path === location.pathname);
  const currentGroup = NAV_GROUPS.find(group => group.items.some(item => item.path === location.pathname));
  const online = !stale && connectionState === 'connected';
  const statusLabel = engine?.isDemo ? 'Demo data' : online ? 'Live engine' : hasSample ? 'Readings are stale' : 'Connecting';
  const endpoint = engine ? `${engine.host}:${engine.port}` : 'Waiting for gateway';
  let user = { username: 'Account', role: 'viewer' };
  try { user = JSON.parse(localStorage.getItem('redisx_user') ?? '{}'); } catch { /* Missing account metadata. */ }
  const playground = user.username === 'Local Explorer';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('redisx_theme', theme);
  }, [theme]);
  useEffect(() => {
    const report = (event: Event) => setRequestError((event as CustomEvent<{ message: string; hint?: string }>).detail);
    window.addEventListener('redisx:apierror', report);
    return () => window.removeEventListener('redisx:apierror', report);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(value => !value); }
      if (event.key === '?' && !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) { event.preventDefault(); setShortcutsOpen(true); }
      if (event.key === 'Escape') { setHelpOpen(false); setPaletteOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <div className={`studio-app ${collapsed ? 'is-collapsed' : ''}`}>
    <a href="#studio-main" className="studio-skip">Skip to content</a>
    <aside className="studio-sidebar" aria-label="Studio navigation">
      <a className="studio-wordmark" href="/"><Database size={24} /><span className="studio-brand-name">RedisX <small>STUDIO</small></span></a>
      <button className="studio-workspace" onClick={() => setConnectOpen(true)} title="Manage engine connection">
        <span className="studio-workspace-icon"><Server size={17} /></span><span className="studio-nav-label"><strong>{engine?.isDemo ? 'Demo workspace' : 'Engine workspace'}</strong><small>{endpoint}</small></span><ChevronDownIcon />
      </button>
      <nav>{NAV_GROUPS.map(group => <div className="studio-nav-group" key={group.group}>
        <div className="studio-nav-heading">{group.group}</div>
        {group.items.map(item => {
          const supported = !isCapabilityUnavailable(engine, item.capability);
          return <NavLink to={item.path} key={item.path} className={({ isActive }) => `studio-nav-item ${isActive ? 'is-active' : ''}`}
            title={supported ? item.name : `${item.name}: unavailable on this engine`}>
            {item.icon}<span className="studio-nav-label">{item.name.replace('Console CLI', 'Console').replace('Data Types Playground', 'Playground').replace('Expiration (TTL)', 'Expiration')}</span>
            {!supported && <span className="studio-unsupported-dot" aria-label="Unsupported feature" />}
          </NavLink>;
        })}
      </div>)}</nav>
      <div className="studio-sidebar-bottom">{playground ? <div className="studio-account"><span className="studio-avatar"><Terminal size={14} /></span><span className="studio-nav-label"><strong>Engine playground</strong><small>No sign-in required</small></span></div> : <button className="studio-account" onClick={() => { localStorage.removeItem('redisx_token'); localStorage.removeItem('redisx_user'); window.dispatchEvent(new Event('redisx:unauthorized')); }} title="Sign out">
        <span className="studio-avatar">{user.username?.slice(0, 1).toUpperCase()}</span><span className="studio-nav-label"><strong>{user.username}</strong><small>{user.role} · Sign out</small></span>
      </button>}<button className="studio-icon-button studio-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div>
    </aside>
    <div className="studio-workarea">
      <header className="studio-topbar"><div className="studio-breadcrumb"><span>{currentGroup?.group.toLowerCase()}</span><ChevronRight size={13} /><strong>{currentItem?.name ?? 'Studio'}</strong></div>
        <div className="studio-header-tools"><button className="studio-search" onClick={() => setPaletteOpen(true)}><Search size={15} /><span>Search workspace</span><kbd>Ctrl K</kbd></button>
          <button className="studio-icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button className="studio-icon-button" onClick={() => setHelpOpen(true)} aria-label="Open page help"><HelpCircle size={17} /></button>
        </div>
      </header>
      <div className="studio-connection-bar"><button onClick={() => setConnectOpen(true)} className="studio-connection-name"><span className={`studio-status-dot ${online && !engine?.isDemo ? 'is-live' : ''}`} /><span>{endpoint}</span><ChevronRight size={13} /></button>
        <span className={`studio-source-badge ${engine?.isDemo ? 'is-demo' : ''}`}>{statusLabel}</span><span className="studio-connection-spacer" />
        <label className="studio-db-select"><Database size={13} /><span>Database</span><select aria-label="Selected database" value={selectedDb} onChange={event => { localStorage.setItem('redisx_db', event.target.value); window.location.assign(location.pathname); }}>
          {Array.from({ length: engine?.isDemo ? 1 : 16 }, (_, db) => <option key={db} value={db}>db{db}</option>)}
        </select></label>
      </div>
      {stale && <div className="studio-stale-notice" role="status"><AlertTriangle size={15} />{hasSample ? 'Live updates interrupted. Showing the last verified readings.' : 'Waiting for engine readings. Check the connection if this continues.'}<button onClick={() => setConnectOpen(true)}>Connection settings <ArrowRightIcon /></button></div>}
      <main id="studio-main" tabIndex={-1} className="studio-main" key={selectedDb}>{currentItem && isCapabilityUnavailable(engine, currentItem.capability) ? <div className="studio-unavailable"><Database size={28} /><h1>{currentItem.name}</h1><p>This engine does not expose {currentItem.capability}. This feature is unavailable for this connection.</p><button className="studio-secondary" onClick={() => setConnectOpen(true)}>Manage connection</button></div> : children}</main>
      <footer className="studio-statusbar"><span><span className={`studio-status-dot ${online ? 'is-live' : ''}`} />{statusLabel}</span><span>{hasSample ? latestSample.opsPerSec.toLocaleString() : '—'} ops/s</span><span>{latestSample.usedMemoryHuman} memory</span><span>{hasSample ? latestSample.connectedClients : '—'} clients</span><span className="studio-statusbar-right">{hasSample ? `Sampled ${new Date(latestSample.timestamp).toLocaleTimeString()}` : 'No samples yet'}</span></footer>
    </div>
    <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} showShortcuts={shortcutsOpen} onCloseShortcuts={() => setShortcutsOpen(false)} />
    <HelpDrawer isOpen={helpOpen} onClose={() => setHelpOpen(false)} currentPath={location.pathname} />
    {requestError && <div className="studio-error-toast" role="alert"><AlertTriangle size={17} /><div><strong>{requestError.message}</strong>{requestError.hint && <p>{requestError.hint}</p>}</div><button aria-label="Dismiss error" onClick={() => setRequestError(null)}>×</button></div>}
    <ConnectModal isOpen={connectOpen} onClose={() => setConnectOpen(false)} onConnectSuccess={() => {}} />
  </div>;
};
function ChevronDownIcon() { return <ChevronRight className="studio-workspace-chevron" size={14} />; }
function ArrowRightIcon() { return <ChevronRight size={13} />; }
