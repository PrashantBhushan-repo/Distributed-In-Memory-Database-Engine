import React, { useState } from 'react';
import { Shield, Zap, AlertTriangle, Check, Sliders, ArrowRight } from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';

interface DurabilityExplainerProps {
  currentPolicy: 'always' | 'everysec' | 'no';
  onUpdatePolicy: (policy: 'always' | 'everysec' | 'no') => Promise<void>;
}

export const DurabilityExplainer: React.FC<DurabilityExplainerProps> = ({
  currentPolicy,
  onUpdatePolicy,
}) => {
  const [selectedPolicy, setSelectedPolicy] = useState<'always' | 'everysec' | 'no'>(currentPolicy);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  const POLICIES = [
    {
      id: 'always' as const,
      name: 'always',
      tag: 'Maximum Durability',
      color: 'amber',
      lossWindow: '0 seconds (Zero data loss guarantee)',
      speed: 'Slow (Disk fsync bottleneck on every write)',
      writeImpact: 'High IOPS load — 1,000–5,000 writes/sec max on NVMe',
      description:
        'Forces the operating system to flush write buffers to disk synchronously after every single write command before returning acknowledgment.',
    },
    {
      id: 'everysec' as const,
      name: 'everysec (Recommended)',
      tag: 'Balanced Standard',
      color: 'emerald',
      lossWindow: 'At most 1 second of writes',
      speed: 'Very Fast (Near native in-memory throughput)',
      writeImpact: 'Low IOPS load — Background thread handles 1s fsync batches',
      description:
        'Writes are buffered in memory and a background thread executes an fsync once every second. Gives near-pure RAM speed while bounding potential failure loss to 1 second.',
    },
    {
      id: 'no' as const,
      name: 'no',
      tag: 'Maximum Speed',
      color: 'sky',
      lossWindow: 'Up to 30 seconds (OS kernel flush interval)',
      speed: 'Maximum Throughput (Fastest)',
      writeImpact: 'Lowest IOPS load — Kernel flushes pages lazily',
      description:
        'Redis hands write buffers over to the operating system kernel and never explicitly calls fsync. The OS flushes pages whenever kernel thresholds are met (usually 30s).',
    },
  ];

  const active = POLICIES.find((p) => p.id === selectedPolicy) || POLICIES[1];

  const handleApply = async () => {
    setSaving(true);
    try {
      await onUpdatePolicy(selectedPolicy);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">AOF Fsync Durability Policy</h3>
          <InfoTip content="The appendfsync configuration parameter controls how often Redis calls the fsync() system call to flush dirty kernel buffers to physical non-volatile disk media." />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Active Setting:</span>
          <code className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold font-mono">
            {currentPolicy}
          </code>
        </div>
      </div>

      {/* Segmented Control / Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
        {POLICIES.map((p) => {
          const isSelected = selectedPolicy === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPolicy(p.id)}
              className={`flex flex-col items-start p-3 rounded-lg text-left transition-all ${
                isSelected
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-bold font-mono text-white">{p.name}</span>
                {currentPolicy === p.id && (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                    CURRENT
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 font-medium">{p.tag}</span>
            </button>
          );
        })}
      </div>

      {/* Tradeoff Comparison View */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
        {/* Data Loss Window */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            <span>Data-Loss Window on Power Outage</span>
          </div>
          <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
            <span className="text-xs font-mono font-bold text-amber-300">{active.lossWindow}</span>
            <p className="text-[11px] text-slate-400 mt-1">{active.description}</p>
          </div>
        </div>

        {/* Speed & Throughput */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Zap className="h-3.5 w-3.5 text-sky-400" />
            <span>Write Performance & IOPS Impact</span>
          </div>
          <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
            <span className="text-xs font-mono font-bold text-sky-300">{active.speed}</span>
            <p className="text-[11px] text-slate-400 mt-1">{active.writeImpact}</p>
          </div>
        </div>
      </div>

      {/* Action footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-[11px] text-slate-400 font-mono">
          Command: <code className="text-sky-400 font-semibold">CONFIG SET appendfsync {selectedPolicy}</code>
        </div>
        <div className="flex items-center gap-3">
          {successMsg && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <Check className="h-3.5 w-3.5" />
              Policy Updated!
            </span>
          )}
          <button
            onClick={handleApply}
            disabled={saving || selectedPolicy === currentPolicy}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              saving || selectedPolicy === currentPolicy
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>{saving ? 'Applying...' : 'Apply Fsync Policy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
