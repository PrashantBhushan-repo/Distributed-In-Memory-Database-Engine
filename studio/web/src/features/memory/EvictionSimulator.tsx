import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Lock,
  Unlock,
  RotateCcw,
  Sliders,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { EvictionSimulationResult } from './types';

interface EvictionSimulatorProps {
  currentMaxmemoryBytes: number;
  currentPolicy: string;
  selectedPolicy: string;
  onConfigApplied?: () => void;
}

export const EvictionSimulator: React.FC<EvictionSimulatorProps> = ({
  currentMaxmemoryBytes,
  currentPolicy,
  selectedPolicy,
  onConfigApplied,
}) => {
  // Simulator input state
  const [targetMb, setTargetMb] = useState<number>(
    currentMaxmemoryBytes > 0 ? Math.round(currentMaxmemoryBytes / (1024 * 1024)) : 256
  );
  const [targetPolicy, setTargetPolicy] = useState<string>(selectedPolicy || currentPolicy);

  // Simulation output
  const [simResult, setSimResult] = useState<EvictionSimulationResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Apply modal & state
  const [unlockAdmin, setUnlockAdmin] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [appliedInfo, setAppliedInfo] = useState<{
    previous: { maxmemory: number; policy: string };
    commands: string[];
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Sync selected policy from outside
  useEffect(() => {
    if (selectedPolicy) setTargetPolicy(selectedPolicy);
  }, [selectedPolicy]);

  // Run simulation whenever targetMb or targetPolicy changes
  useEffect(() => {
    let mounted = true;
    const runSim = async () => {
      setSimLoading(true);
      try {
        const token = localStorage.getItem('redisx_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `/api/memory/simulate?maxmemory=${targetMb}M&policy=${encodeURIComponent(targetPolicy)}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (mounted) setSimResult(data);
        }
      } catch (err) {
        console.error('Simulation error:', err);
      } finally {
        if (mounted) setSimLoading(false);
      }
    };

    const handler = setTimeout(runSim, 200);
    return () => {
      mounted = false;
      clearTimeout(handler);
    };
  }, [targetMb, targetPolicy]);

  const handleApply = async () => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/memory/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          maxmemory: targetMb * 1024 * 1024,
          policy: targetPolicy,
          unlock: unlockAdmin,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setAppliedInfo({
          previous: data.previous,
          commands: data.commands,
        });
        onConfigApplied?.();
      } else {
        setApplyError(data.message || data.error || 'Failed to apply memory configuration.');
      }
    } catch (err: any) {
      setApplyError(err.message || 'Network error applying configuration.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRollback = async () => {
    if (!appliedInfo) return;
    setIsApplying(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/memory/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          maxmemory: appliedInfo.previous.maxmemory,
          policy: appliedInfo.previous.policy,
          unlock: true,
        }),
      });

      if (res.ok) {
        setAppliedInfo(null);
        setTargetMb(Math.round(appliedInfo.previous.maxmemory / (1024 * 1024)));
        setTargetPolicy(appliedInfo.previous.policy);
        onConfigApplied?.();
      }
    } catch (err) {
      console.error('Rollback error:', err);
    } finally {
      setIsApplying(false);
    }
  };

  const copyCommands = () => {
    if (!simResult?.equivalentCommand) return;
    navigator.clipboard.writeText(simResult.equivalentCommand.join('\n'));
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1500);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="font-bold text-slate-100 text-sm">"What Would Happen?" Eviction Simulator</h3>
        </div>
        <span className="text-[11px] text-slate-400">
          Predict key eviction impact before executing CONFIG SET
        </span>
      </div>

      {/* Simulator Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/70 p-3.5 rounded-xl border border-slate-850">
        {/* Maxmemory Target */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-slate-300">
              Target Maxmemory Limit:
            </label>
            <span className="font-mono text-emerald-400 font-bold text-sm">
              {targetMb} MB
            </span>
          </div>

          <input
            type="range"
            min={16}
            max={1024}
            step={16}
            value={targetMb}
            onChange={(e) => setTargetMb(Number(e.target.value))}
            className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[32, 64, 128, 256, 512, 1024].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTargetMb(preset)}
                className={`rounded px-2 py-0.5 text-[10px] font-mono transition ${
                  targetMb === preset
                    ? 'bg-sky-600 text-white font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {preset}M
              </button>
            ))}
          </div>
        </div>

        {/* Policy Target */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-slate-300 block">
            Target Eviction Policy:
          </label>
          <select
            value={targetPolicy}
            onChange={(e) => setTargetPolicy(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
          >
            {[
              'volatile-lru',
              'allkeys-lru',
              'volatile-lfu',
              'allkeys-lfu',
              'volatile-random',
              'allkeys-random',
              'volatile-ttl',
              'noeviction',
            ].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400">
            Selected: <span className="text-slate-300 font-mono">{targetPolicy}</span>
          </p>
        </div>
      </div>

      {/* Simulator Results Box */}
      {simResult && (
        <div className="space-y-3">
          <div
            className={`rounded-xl border p-3.5 space-y-2.5 ${
              simResult.writesBlocked
                ? 'border-red-900/80 bg-red-950/20 text-red-200'
                : simResult.deficitBytes > 0
                ? 'border-amber-900/80 bg-amber-950/20 text-amber-200'
                : 'border-emerald-900/80 bg-emerald-950/20 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              {simResult.writesBlocked ? (
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              ) : simResult.deficitBytes > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              )}
              <span>Simulation Forecast & Impact Analysis</span>
            </div>

            <p className="text-xs leading-relaxed pl-6 text-slate-200">
              {simResult.summary}
            </p>

            <div className="grid grid-cols-3 gap-2 pl-6 pt-1 text-[11px] font-mono">
              <div className="rounded bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">Memory Deficit</span>
                <span className="font-bold text-white">
                  {(simResult.deficitBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
              <div className="rounded bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">Keys at Risk</span>
                <span className="font-bold text-white">
                  ~{simResult.keysAtRisk.toLocaleString()}
                </span>
              </div>
              <div className="rounded bg-slate-950/60 p-2 border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">Share of Keyspace</span>
                <span className="font-bold text-white">
                  {simResult.shareAtRiskPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* Equivalent CLI Commands */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Equivalent redis-cli commands:</span>
              <button
                type="button"
                onClick={copyCommands}
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"
              >
                {copiedCmd ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                {copiedCmd ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] text-sky-300">
              {simResult.equivalentCommand.join('\n')}
            </div>
          </div>
        </div>
      )}

      {/* Safety Gatekeeper & Apply Section */}
      <div className="border-t border-slate-800 pt-3 space-y-3">
        {applyError && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 p-2.5 text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>{applyError}</div>
          </div>
        )}

        {appliedInfo ? (
          <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
              <CheckCircle className="h-4 w-4" />
              <span>Configuration successfully applied to Redis instance!</span>
            </div>
            <button
              type="button"
              onClick={handleRollback}
              disabled={isApplying}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition border border-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Rollback to Previous ({Math.round(appliedInfo.previous.maxmemory / (1024 * 1024))}MB, {appliedInfo.previous.policy})
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unlockAdmin}
                onChange={(e) => setUnlockAdmin(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 h-4 w-4"
              />
              <span className="text-xs text-slate-300">
                Confirm &amp; Unlock Live Server Reconfiguration (Administrator Privileges Required)
              </span>
            </label>

            <button
              type="button"
              onClick={handleApply}
              disabled={!unlockAdmin || isApplying}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:hover:bg-sky-600 px-4 py-2 font-semibold text-white shadow-md shadow-sky-900/30 transition text-xs"
            >
              {unlockAdmin ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span>{isApplying ? 'Applying...' : 'Apply Configuration via CONFIG SET'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
