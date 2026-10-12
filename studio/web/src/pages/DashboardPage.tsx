import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
  Clock,
  HardDrive,
  Users,
  Activity,
  Database,
  Server,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { useMetrics } from '../features/metrics/MetricsContext';
import { Sparkline } from '../components/Sparkline';
import { InfoTip } from '../components/InfoTip';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    latestSample,
    healthSummary,
    history,
    connectionState,
    simulateCondition,
    activeCondition,
  } = useMetrics();

  // Memoize sparkline datasets to prevent unneeded re-renders on minor ticks
  const opsData = useMemo(() => history.map((s) => ({ value: s.opsPerSec })), [history]);
  const latencyData = useMemo(() => history.map((s) => ({ value: s.p99LatencyMs })), [history]);
  const memoryData = useMemo(() => history.map((s) => ({ value: s.usedMemory / (1024 * 1024) })), [history]);
  const clientsData = useMemo(() => history.map((s) => ({ value: s.connectedClients })), [history]);
  const hitRateData = useMemo(() => history.map((s) => ({ value: s.hitRate })), [history]);
  const keysData = useMemo(() => history.map((s) => ({ value: s.totalKeys })), [history]);

  const isHealthy = healthSummary.status === 'healthy';
  const isCritical = healthSummary.status === 'critical';
  const topIssue = healthSummary.topIssue;

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">
      {/* ─────────────────────────────────────────────────────────────
          1. BIG STATUS CARD AT THE TOP
      ───────────────────────────────────────────────────────────── */}
      <div
        className={`rounded-2xl p-6 border transition-all duration-300 shadow-xl ${
          isHealthy
            ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/30'
            : isCritical
            ? 'bg-gradient-to-r from-rose-950/50 via-slate-900 to-slate-900 border-rose-500/40'
            : 'bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-900 border-amber-500/40'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                isHealthy
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : isCritical
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
              }`}
            >
              {isHealthy ? (
                <CheckCircle2 className="h-6 w-6" />
              ) : (
                <AlertTriangle className="h-6 w-6" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${
                    isHealthy
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : isCritical
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {healthSummary.status.toUpperCase()}
                </span>
                {connectionState === 'reconnecting' && (
                  <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Reconnecting stream...
                  </span>
                )}
              </div>

              <h2 className="text-xl font-black text-white tracking-tight">
                {isHealthy ? 'RedisX Engine Healthy & Nominal' : topIssue?.title}
              </h2>

              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                {isHealthy
                  ? 'All operational metrics are within nominal thresholds. Memory is below limits, replication offset is synchronized, and median response latencies are sub-millisecond.'
                  : topIssue?.description}
              </p>

              {!isHealthy && topIssue?.fixSuggestion && (
                <div className="pt-1 text-xs text-slate-400 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-200">Suggested Fix:</span>
                  <span>{topIssue.fixSuggestion}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            {!isHealthy && topIssue && (
              <button
                onClick={() => navigate(topIssue.deepLink)}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition group"
              >
                <span>Resolve in {topIssue.deepLink.replace('/', '').toUpperCase()}</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 border border-slate-700 transition"
            >
              <span>Grafana SRE</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Interactive Demo Tweak Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px] uppercase tracking-wider">Test Health Scenarios:</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: null, label: 'Nominal (Healthy)' },
              { id: 'high_memory', label: 'Memory Pressure (>85%)' },
              { id: 'low_hit_rate', label: 'Low Hit Rate (<80%)' },
              { id: 'high_eviction', label: 'Active Evictions' },
              { id: 'replica_lag', label: 'Replica Lag' },
            ].map((sc) => (
              <button
                key={String(sc.id)}
                onClick={() => simulateCondition(sc.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
                  activeCondition === sc.id
                    ? 'bg-red-600 text-white font-bold shadow-sm'
                    : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. 6 GOLDEN KPI TILES (WITH 60-MIN SPARKLINE & INFOTIP)
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Tile 1: Ops / Sec */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span>Throughput (Ops/Sec)</span>
                <InfoTip term="pipelining" />
              </span>
              <Zap className="h-4 w-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {latestSample.opsPerSec.toLocaleString()}
            </div>
          </div>
          <div className="mt-3">
            <Sparkline data={opsData} color="#f59e0b" gradientId="spark-ops" height={38} />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
              <span className="text-emerald-400">↑ 132k Peak Pipelined</span>
              <span>Last 60 mins</span>
            </div>
          </div>
        </div>

        {/* Tile 2: p99 Latency */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span>p99 Latency (ms)</span>
                <InfoTip term="slowlog" />
              </span>
              <Clock className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {latestSample.p99LatencyMs} ms
            </div>
          </div>
          <div className="mt-3">
            <Sparkline data={latencyData} color="#10b981" gradientId="spark-latency" height={38} />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
              <span>Median: 0.42 ms</span>
              <span>Linux epoll</span>
            </div>
          </div>
        </div>

        {/* Tile 3: Memory Used / Max */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span>Memory Used / Max</span>
                <InfoTip term="maxmemory" />
              </span>
              <HardDrive className="h-4 w-4 text-blue-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black font-mono text-white">
                {latestSample.usedMemoryHuman}
              </span>
              <span className="text-xs font-mono text-slate-500">
                / {Math.round(latestSample.maxMemory / (1024 * 1024))} MB ({latestSample.memoryPercent}%)
              </span>
            </div>

            {/* Visual Gauge Bar */}
            <div className="w-full bg-slate-950 rounded-full h-1.5 mt-2 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-500 ${
                  latestSample.memoryPercent >= 90
                    ? 'bg-rose-500'
                    : latestSample.memoryPercent >= 75
                    ? 'bg-amber-400'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, latestSample.memoryPercent)}%` }}
              />
            </div>
          </div>
          <div className="mt-3">
            <Sparkline data={memoryData} color="#3b82f6" gradientId="spark-mem" height={38} />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
              <span>volatile-lru</span>
              <span>Sample LRU</span>
            </div>
          </div>
        </div>

        {/* Tile 4: Connected Clients */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span>Connected Clients</span>
                <InfoTip term="pipelining" />
              </span>
              <Users className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {latestSample.connectedClients}
            </div>
          </div>
          <div className="mt-3">
            <Sparkline data={clientsData} color="#a855f7" gradientId="spark-clients" height={38} />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
              <span>Blocked: {latestSample.blockedClients}</span>
              <span>Pool multiplexed</span>
            </div>
          </div>
        </div>

        {/* Tile 5: Cache Hit Rate */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span>Cache Hit Rate</span>
                <InfoTip term="hit rate" />
              </span>
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>
            <div
              className={`text-2xl font-black font-mono mt-1 ${
                latestSample.hitRate >= 90 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {latestSample.hitRate}%
            </div>
          </div>
          <div className="mt-3">
            <Sparkline data={hitRateData} color="#10b981" gradientId="spark-hit" height={38} />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
              <span>Target &gt; 90%</span>
              <span>Evicted: {latestSample.evictedKeysPerSec}/s</span>
            </div>
          </div>
        </div>

        {/* Tile 6: Total Keys */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <span>Total Keys Active</span>
                <InfoTip term="ttl" />
              </span>
              <Database className="h-4 w-4 text-rose-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {latestSample.totalKeys.toLocaleString()}
            </div>
          </div>
          <div className="mt-3">
            <Sparkline data={keysData} color="#f43f5e" gradientId="spark-keys" height={38} />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1.5 font-mono">
              <span>db0 keyspace</span>
              <span>Expiring: 450</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. THINGS TO LOOK AT & SERVER DETAILS
      ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Things To Look At List (2 Cols) */}
        <div className="lg:col-span-2 bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Things to Look At
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              Evaluated: {new Date(healthSummary.checkedAt).toLocaleTimeString()}
            </span>
          </div>

          {healthSummary.thingsToLookAt.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <span>
                No active performance anomalies detected. Memory, replication backlog, slowlog entries, and connection limits are all operating within safe parameters.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {healthSummary.thingsToLookAt.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    issue.severity === 'critical'
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                      : 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.2 rounded ${
                          issue.severity === 'critical'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <span className="text-xs font-bold text-white">{issue.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{issue.description}</p>
                  </div>

                  <button
                    onClick={() => navigate(issue.deepLink)}
                    className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Server Card (1 Col) */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-4">
              <Server className="h-4 w-4 text-blue-400" />
              Engine Specifications
            </h3>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Version</span>
                <span className="text-slate-200 font-bold">0.1.0-redisx</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Role</span>
                <span className="text-emerald-400 font-bold uppercase">Master</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Port</span>
                <span className="text-slate-200">6379 (TCP)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Process ID</span>
                <span className="text-slate-200">12894</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Reactor Loop</span>
                <span className="text-amber-400">epoll (C++20)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Uptime</span>
                <span className="text-slate-200">3h 24m 12s</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 font-sans">
            RESP2 / RESP3 compatible wire protocol.
          </div>
        </div>
      </div>
    </div>
  );
};
