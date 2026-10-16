import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
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
  X,
  Keyboard,
} from 'lucide-react';

export interface PaletteItem {
  id: string;
  title: string;
  description: string;
  path: string;
  category: 'Overview' | 'Data' | 'Runtime' | 'Reliability' | 'Access' | 'Observe' | 'Learn';
  icon: React.ReactNode;
}

// Global registry for extensible palette items
let registeredDynamicItems: PaletteItem[] = [];
const registryListeners: Array<() => void> = [];

export function registerPaletteItems(newItems: PaletteItem[]): () => void {
  registeredDynamicItems = [...registeredDynamicItems, ...newItems];
  registryListeners.forEach((fn) => fn());
  return () => {
    registeredDynamicItems = registeredDynamicItems.filter((i) => !newItems.some((n) => n.id === i.id));
    registryListeners.forEach((fn) => fn());
  };
}

const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'dash', title: 'Dashboard', description: 'Real-time performance summary & SRE signals', path: '/dashboard', category: 'Overview', icon: <Activity className="h-4 w-4" /> },
  { id: 'keys', title: 'Key Explorer', description: 'Browse, inspect and edit keys by type', path: '/keys', category: 'Data', icon: <Database className="h-4 w-4" /> },
  { id: 'cli', title: 'Console CLI', description: 'Execute raw RESP commands interactively', path: '/console', category: 'Data', icon: <Terminal className="h-4 w-4" /> },
  { id: 'play', title: 'Data Types Playground', description: 'Visualize Skiplists, Listpacks and Intsets', path: '/playground', category: 'Data', icon: <Layers className="h-4 w-4" /> },
  { id: 'mem', title: 'Memory & Eviction', description: 'Heap memory analyzer and LRU/LFU policy tester', path: '/memory', category: 'Runtime', icon: <HardDrive className="h-4 w-4" /> },
  { id: 'exp', title: 'Expiration & TTL', description: 'Keys expiring soonest & active eviction cycles', path: '/expiration', category: 'Runtime', icon: <Clock className="h-4 w-4" /> },
  { id: 'clients', title: 'Client Connections', description: 'Connected sockets, idle times & buffer sizes', path: '/clients', category: 'Runtime', icon: <Users className="h-4 w-4" /> },
  { id: 'slow', title: 'Slow Log', description: 'Diagnostic log of commands exceeding latency thresholds', path: '/slowlog', category: 'Runtime', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'persist', title: 'Persistence', description: 'RDB binary snapshots & AOF append log timeline', path: '/persistence', category: 'Reliability', icon: <Save className="h-4 w-4" /> },
  { id: 'repl', title: 'Replication Stream', description: 'PSYNC topology graph & circular backlog buffer', path: '/replication', category: 'Reliability', icon: <GitBranch className="h-4 w-4" /> },
  { id: 'sec', title: 'Security & ACL', description: 'User roles, dangerous command locks & rules', path: '/security', category: 'Access', icon: <Shield className="h-4 w-4" /> },
  { id: 'cfg', title: 'Configuration', description: 'Searchable runtime parameters & diff inspector', path: '/config', category: 'Access', icon: <Settings className="h-4 w-4" /> },
  { id: 'metrics', title: 'Metrics Telemetry', description: 'OpenMetrics time-series & latency percentiles', path: '/metrics', category: 'Observe', icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'mon', title: 'Live Monitor', description: 'Real-time WebSocket streaming feed of commands', path: '/monitor', category: 'Observe', icon: <Tv className="h-4 w-4" /> },
  { id: 'pubsub', title: 'Pub/Sub Engine', description: 'Channel listener & broadcast message publisher', path: '/pubsub', category: 'Observe', icon: <Radio className="h-4 w-4" /> },
  { id: 'tour', title: 'Architecture Tour', description: 'Visual pipeline of the epoll reactor event loop', path: '/learn/tour', category: 'Learn', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'ref', title: 'Command Reference', description: 'Complete 68+ Redis command dictionary with O(1) complexities', path: '/learn/commands', category: 'Learn', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'labs', title: 'Guided Labs', description: 'Interactive tutorials: failovers, TTL, and transactions', path: '/learn/labs', category: 'Learn', icon: <BookOpen className="h-4 w-4" /> },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  showShortcuts?: boolean;
  onCloseShortcuts?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  showShortcuts = false,
  onCloseShortcuts,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setRevision] = useState(0);

  useEffect(() => {
    const rerender = () => setRevision((r) => r + 1);
    registryListeners.push(rerender);
    return () => {
      const idx = registryListeners.indexOf(rerender);
      if (idx !== -1) registryListeners.splice(idx, 1);
    };
  }, []);

  const allItems = [...PALETTE_ITEMS, ...registeredDynamicItems];

  const filteredItems = allItems.filter((item) => {
    const q = query.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          navigate(filteredItems[selectedIndex].path);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, navigate, onClose]);

  if (showShortcuts) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-md bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 shadow-2xl text-slate-100">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-red-500" />
              <h3 className="font-bold text-base text-white">Keyboard Shortcuts</h3>
            </div>
            <button onClick={onCloseShortcuts} className="text-slate-400 hover:text-white p-1 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 py-4 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Open Command Palette</span>
              <kbd className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300">Ctrl/Cmd + K</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Toggle Help Drawer & Tips</span>
              <kbd className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300">?</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Switch Theme (Light / Dark)</span>
              <kbd className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300">Ctrl + T</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Navigate Palette Items</span>
              <kbd className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300">↑ / ↓</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Execute / Jump</span>
              <kbd className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300">Enter</kbd>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-right">
            <button
              onClick={onCloseShortcuts}
              className="px-4 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-[#0f172a] border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/60">
          <Search className="h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="Type a command, page name or concept (e.g. keys, memory, tour)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm font-sans text-white placeholder-slate-500 focus:outline-none"
            autoFocus
          />
          <kbd className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-800/40">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">No matching pages or tools found.</div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition ${
                  selectedIndex === idx ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    selectedIndex === idx ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <span>{item.title}</span>
                    <span className="text-[10px] font-mono text-slate-500 font-normal uppercase">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.description}</p>
                </div>
                <div className="text-[10px] font-mono text-slate-500 shrink-0">{item.path}</div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center gap-2">
            <span>Use ↑↓ to navigate</span>
            <span>•</span>
            <span>Enter to select</span>
          </div>
          <span>Press &apos;?&apos; for shortcuts</span>
        </div>
      </div>
    </div>
  );
};
