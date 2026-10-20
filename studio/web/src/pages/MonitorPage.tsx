import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Tv,
  Play,
  Pause,
  Trash2,
  Download,
  AlertTriangle,
  Clock,
  Filter,
  ShieldAlert,
  ArrowDownToLine,
  RefreshCw,
} from 'lucide-react';
import { MonitorEntry, MonitorFilter } from '../features/monitor/types';
import { MonitorFeedTable } from '../features/monitor/MonitorFeedTable';

export const MonitorPage: React.FC = () => {
  const [entries, setEntries] = useState<MonitorEntry[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [droppedCount, setDroppedCount] = useState(0);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number>(300);
  const [isAutoStopped, setIsAutoStopped] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [warningText, setWarningText] = useState<string>(
    'MONITOR degrades Redis throughput by up to 50%. Use sparingly in production.'
  );

  // Filters state
  const [cmdFilter, setCmdFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [keyPatternFilter, setKeyPatternFilter] = useState('');

  const wsRef = useRef<WebSocket | null>(null);

  // Countdown timer for 5-minute auto stop
  useEffect(() => {
    if (isAutoStopped || sessionSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSessionSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsAutoStopped(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAutoStopped, sessionSecondsLeft]);

  // Connect to /ws/monitor WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const token = localStorage.getItem('redisx_token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = '4000'; // Gateway port
    const url = `${protocol}//${host}:${port}/ws/monitor${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Send initial filter if any
      if (cmdFilter || clientFilter || keyPatternFilter) {
        ws.send(
          JSON.stringify({
            action: 'filter',
            filter: {
              command: cmdFilter || undefined,
              client: clientFilter || undefined,
              keyPattern: keyPatternFilter || undefined,
            },
          })
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notice') {
          setWarningText(data.text);
          if (data.autoStopSeconds) setSessionSecondsLeft(data.autoStopSeconds);
        } else if (data.type === 'entry') {
          if (!isPaused) {
            setEntries((prev) => {
              // Keep maximum 2000 entries in memory for virtual table
              const next = [...prev, data.entry];
              return next.length > 2000 ? next.slice(next.length - 2000) : next;
            });
          }
          if (data.droppedCount !== undefined) {
            setDroppedCount(data.droppedCount);
          }
        } else if (data.type === 'rate_limit') {
          setDroppedCount(data.droppedCount || 0);
        } else if (data.type === 'stopped') {
          setIsAutoStopped(true);
          setIsPaused(true);
        }
      } catch (err) {
        console.error('Error parsing monitor message:', err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };
  }, [cmdFilter, clientFilter, keyPatternFilter, isPaused]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Send filters to server
  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'filter',
          filter: {
            command: cmdFilter.trim() || undefined,
            client: clientFilter.trim() || undefined,
            keyPattern: keyPatternFilter.trim() || undefined,
          },
        })
      );
    }
  };

  const handleClearFeed = () => {
    setEntries([]);
    setDroppedCount(0);
  };

  const handleExport = (format: 'json' | 'txt') => {
    let content = '';
    let mime = 'text/plain';
    if (format === 'json') {
      content = JSON.stringify(entries, null, 2);
      mime = 'application/json';
    } else {
      content = entries.map((e) => e.raw).join('\n');
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `redis-monitor-dump-${new Date().toISOString().slice(0, 19)}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)] min-h-[32rem] space-y-3">
      <div className="studio-feature-heading"><h1>Live Monitor</h1><p>Inspect commands received by the engine.</p></div>
      {/* 1. Performance Warning Banner */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between text-amber-300 text-xs">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Performance Warning:</strong> {warningText}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 font-mono text-xs text-amber-200">
            <Clock className="w-3.5 h-3.5" />
            <span>Auto-stop: {formatCountdown(sessionSecondsLeft)}</span>
          </div>
          {isAutoStopped && (
            <button
              onClick={() => {
                setIsAutoStopped(false);
                setSessionSecondsLeft(300);
                connectWebSocket();
              }}
              className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Restart Session
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Toolbar & Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Server-Side Filters Form */}
        <form onSubmit={handleApplyFilters} className="flex flex-wrap items-center gap-2 flex-1">
          <div className="flex items-center gap-1 text-xs text-slate-400 font-semibold mr-1">
            <Filter className="w-3.5 h-3.5 text-red-500" /> Filters:
          </div>

          <input
            type="text"
            placeholder="Command (e.g. GET)"
            value={cmdFilter}
            onChange={(e) => setCmdFilter(e.target.value)}
            className="w-28 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono uppercase focus:outline-none focus:border-red-500"
          />

          <input
            type="text"
            placeholder="Client IP (e.g. 10.0.1)"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="w-32 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-red-500"
          />

          <input
            type="text"
            placeholder="Key Pattern (e.g. user:*)"
            value={keyPatternFilter}
            onChange={(e) => setKeyPatternFilter(e.target.value)}
            className="w-36 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-red-500"
          />

          <button
            type="submit"
            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            Apply
          </button>
        </form>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Dropped Messages Badge */}
          {droppedCount > 0 && (
            <span className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-medium">
              Dropped: {droppedCount.toLocaleString()}
            </span>
          )}

          {/* Connection Status Badge */}
          <span
            className={`px-2 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
              wsConnected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-slate-500'}`}
            />
            {wsConnected ? 'Streaming' : 'Disconnected'}
          </span>

          {/* Pause / Resume */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          {/* Clear Feed */}
          <button
            onClick={handleClearFeed}
            title="Clear Feed"
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Export Dropdown / Buttons */}
          <button
            onClick={() => handleExport('txt')}
            title="Export as Text (.txt)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export TXT
          </button>
          <button
            onClick={() => handleExport('json')}
            title="Export as JSON (.json)"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* 3. Virtualized Feed Table */}
      <div className="flex-1 overflow-hidden">
        <MonitorFeedTable
          entries={entries}
          isPinnedToBottom={isPinnedToBottom}
          onTogglePinned={setIsPinnedToBottom}
        />
      </div>
    </div>
  );
};
