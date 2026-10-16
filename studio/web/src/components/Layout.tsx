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
import { CommandPalette } from './CommandPalette';
import { HelpDrawer } from './HelpDrawer';
import { ConnectModal } from './ConnectModal';
import { useMetrics } from '../features/metrics/MetricsContext';

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
      { name: 'Persistence', path: '/persistence', icon: <Save className="h-4 w-4" />, capability: 'SAVE' },
      { name: 'Replication', path: '/replication', icon: <GitBranch className="h-4 w-4" />, capability: 'PSYNC' },
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
      { name: 'Pub/Sub', path: '/pubsub', icon: <Radio className="h-4 w-4" />, capability: 'PUBLISH' },
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
  const { latestSample, connectionState } = useMetrics();

  // Sidebar collapse
  const [collapsed, setCollapsed] = useState(false);

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Modals & Drawers
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  // Selected DB (0 to 15)
  const [selectedDb, setSelectedDb] = useState(0);

  // Capabilities from Gateway
  const [capabilities, setCapabilities] = useState<Set<string>>(
    new Set(['PING', 'INFO', 'GET', 'SET', 'SCAN', 'TTL', 'SLOWLOG', 'SAVE', 'PSYNC', 'CONFIG', 'PUBLISH'])
  );

  // Telemetry state
  const [telemetry, setTelemetry] = useState({
    role: 'master',
    status: 'connected',
    isDemo: false,
    latencyMs: 0.8,
  });

  // Load theme from localStorage or respect system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('redisx_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial = prefersDark ? 'dark' : 'light';
      setTheme(initial);
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('redisx_theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      return next;
    });
  };

  // Keyboard listener for Cmd+K, Ctrl+T, and '?'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTheme();
      } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch capabilities & telemetry
  useEffect(() => {
    const updateHealth = () => {
      fetch('/health')
        .then((r) => r.json())
        .then((data) => {
          if (data?.redis) {
            setTelemetry((prev) => ({
              ...prev,
              status: data.redis.status,
              isDemo: data.redis.isDemo,
              latencyMs: data.redis.latencyMs || 0.8,
            }));
            if (Array.isArray(data.redis.capabilities)) {
              setCapabilities(new Set(data.redis.capabilities));
            }
          }
        })
        .catch(() => {
          // demo fallback
        });
    };

    updateHealth();
    const interval = setInterval(updateHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusInfo = () => {
    const lat = latestSample?.p99LatencyMs ?? telemetry.latencyMs;
    if (connectionState === 'reconnecting') {
      return {
        pillClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:border-amber-500/40',
        dotClass: 'bg-amber-400 animate-ping',
        label: 'Reconnecting…',
        sub: `(${lat}ms)`,
        reason: 'Stream Reconnecting: Attempting to reconnect to live WebSocket metrics stream...',
      };
    }
    if (telemetry.status === 'connected' && !telemetry.isDemo) {
      return {
        pillClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/40',
        dotClass: 'bg-emerald-400 animate-pulse',
        label: '127.0.0.1:6379',
        sub: `(${lat}ms)`,
        reason: `Server Healthy (Green): Connected to live RedisX engine at 127.0.0.1:6379 (${lat}ms latency). Click to reconfigure.`,
      };
    }
    if (telemetry.isDemo || telemetry.status === 'demo') {
      return {
        pillClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:border-amber-500/40',
        dotClass: 'bg-amber-400 animate-pulse',
        label: 'Demo Simulation',
        sub: '(2k Keys)',
        reason: 'Simulation Active (Amber): Running in-memory demo dataset because RedisX is offline. Click to connect to real server.',
      };
    }
    return {
      pillClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:border-rose-500/40',
      dotClass: 'bg-rose-500',
      label: 'Disconnected',
      sub: '(Unreachable)',
      reason: 'Server Unreachable (Red): Unable to connect to port 6379. Click to configure connection.',
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${theme === 'dark' ? 'bg-[#090d16] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* ─────────────────────────────────────────────────────────────
          LEFT SIDEBAR (COLLAPSIBLE)
      ───────────────────────────────────────────────────────────── */}
      <aside
        className={`border-r transition-all duration-300 flex flex-col justify-between shrink-0 ${
          collapsed ? 'w-20' : 'w-64'
        } ${theme === 'dark' ? 'border-[#1e293b] bg-[#0c1220]' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo & Brand */}
          <div className={`h-16 flex items-center px-4 border-b shrink-0 ${theme === 'dark' ? 'border-[#1e293b]' : 'border-slate-200'}`}>
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center shadow-lg shadow-red-500/20 shrink-0">
              <Database className="h-5 w-5 text-white" />
            </div>

            {!collapsed && (
              <div className="ml-3 overflow-hidden">
                <div className="font-extrabold text-base tracking-tight flex items-center gap-1.5">
                  Redis<span className="text-red-500">X</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    Studio
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate">In-Memory Engine Lab</div>
              </div>
            )}

            <button
              onClick={() => setCollapsed(!collapsed)}
              className="ml-auto text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/40"
              title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label={collapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          {/* Grouped Nav Items */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.group}>
                {!collapsed && (
                  <div className="text-[10px] font-mono font-bold tracking-wider text-slate-500 px-3 mb-1">
                    {group.group}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isSupported = !item.capability || capabilities.has(item.capability);

                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={(e) => {
                          if (!isSupported) {
                            e.preventDefault();
                          }
                        }}
                        title={!isSupported ? `Not supported by this server (Requires ${item.capability})` : item.name}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            !isSupported
                              ? 'opacity-40 cursor-not-allowed text-slate-600'
                              : isActive
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm'
                              : theme === 'dark'
                              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                          }`
                        }
                      >
                        <span className="shrink-0">{item.icon}</span>
                        {!collapsed && <span className="truncate">{item.name}</span>}
                        {!isSupported && !collapsed && (
                          <span className="ml-auto text-[9px] font-mono px-1 rounded bg-slate-800 text-slate-500">
                            n/a
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer User Card */}
        <div className={`p-3 border-t shrink-0 ${theme === 'dark' ? 'border-[#1e293b] bg-slate-950/40' : 'border-slate-200 bg-slate-50'}`}>
          <button
            onClick={() => setConnectOpen(true)}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/40 transition text-left"
          >
            <Server className="h-4 w-4 text-emerald-400 shrink-0" />
            {!collapsed && (
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">127.0.0.1:6379</div>
                <div className="text-[10px] text-emerald-400 truncate">Connected (TCP Active)</div>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          MAIN APP SHELL
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header
          className={`h-16 border-b px-6 flex items-center justify-between shrink-0 ${
            theme === 'dark' ? 'border-[#1e293b] bg-[#0c1220]/70' : 'border-slate-200 bg-white/80'
          } backdrop-blur`}
        >
          {/* Left Controls: Status Pill & DB Selector */}
          <div className="flex items-center gap-3">
            {/* Status Pill */}
            <button
              onClick={() => setConnectOpen(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition ${statusInfo.pillClass}`}
              title={statusInfo.reason}
            >
              <span className={`h-2 w-2 rounded-full ${statusInfo.dotClass}`}></span>
              <span className="font-mono">{statusInfo.label}</span>
              <span className="text-[10px] font-mono opacity-80">{statusInfo.sub}</span>
            </button>

            {/* DB Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs font-mono">
              <span className="text-slate-500">DB:</span>
              <select
                value={selectedDb}
                onChange={(e) => setSelectedDb(Number(e.target.value))}
                className="bg-transparent text-slate-200 font-bold focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 16 }).map((_, i) => (
                  <option key={i} value={i} className="bg-slate-900 text-white">
                    db{i}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right Controls: Search, Theme, Help */}
          <div className="flex items-center gap-3">
            {/* Command Palette Trigger */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-400 transition"
            >
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <span>Search or jump...</span>
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Ctrl+K</kbd>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/40 transition"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Help Drawer Trigger */}
            <button
              onClick={() => setHelpOpen(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800/40 transition"
              title="Page Context Help & Tips (?)"
              aria-label="Open page context help and documentation drawer"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Routed Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#090d16]">{children}</main>

        {/* ─────────────────────────────────────────────────────────────
            PERSISTENT TELEMETRY FOOTER STRIP
        ───────────────────────────────────────────────────────────── */}
        <footer
          className={`h-9 border-t px-6 flex items-center justify-between text-[11px] font-mono shrink-0 ${
            theme === 'dark' ? 'border-[#1e293b] bg-[#0c1220] text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-amber-400" />
              <span>OPS/SEC:</span>
              <span className="text-white font-bold">{latestSample.opsPerSec.toLocaleString()}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3 w-3 text-blue-400" />
              <span>RAM:</span>
              <span className="text-white font-bold">{latestSample.usedMemoryHuman}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-purple-400" />
              <span>CLIENTS:</span>
              <span className="text-white font-bold">{latestSample.connectedClients}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">ROLE:</span>
              <span className="text-emerald-400 font-bold uppercase">{telemetry.role}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-500">
            <span>epoll Reactor</span>
            <span>•</span>
            <span>RESP2 / RESP3 Compliant</span>
          </div>
        </footer>
      </div>

      {/* Modals & Overlays */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        showShortcuts={shortcutsOpen}
        onCloseShortcuts={() => setShortcutsOpen(false)}
      />

      <HelpDrawer
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        currentPath={location.pathname}
      />

      <ConnectModal
        isOpen={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnectSuccess={(info) => {
          setTelemetry((prev) => ({ ...prev, isDemo: info.isDemo }));
        }}
      />
    </div>
  );
};
