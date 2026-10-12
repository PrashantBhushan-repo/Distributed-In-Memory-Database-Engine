import React from 'react';
import { Timer, Zap, CheckCircle2, Info } from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';

interface ActiveExpireStatsCardProps {
  expiredKeys: number;
  expiredRate: number;
  activeExpireEnabled: boolean;
}

export const ActiveExpireStatsCard: React.FC<ActiveExpireStatsCardProps> = ({
  expiredKeys,
  expiredRate,
  activeExpireEnabled,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-slate-200">Active Expiration Cycle Status</span>
          <InfoTip content="Redis scans 20 random volatile keys 10 times a second (10 Hz). If over 25% are expired, it repeats immediately in an adaptive fast-cycle loop to reclaim memory." />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950 border border-emerald-800/80 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
          <CheckCircle2 className="h-3 w-3" />
          {activeExpireEnabled ? 'Adaptive 10Hz Active' : 'Passive Only'}
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
        <div className="rounded-lg bg-slate-950/70 p-3 border border-slate-850">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">
            Total Expired Keys
          </span>
          <div className="font-mono text-lg font-bold text-white">
            {expiredKeys.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-400">Cumulative counter</span>
        </div>

        <div className="rounded-lg bg-slate-950/70 p-3 border border-slate-850">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">
            Current Purge Velocity
          </span>
          <div className="font-mono text-lg font-bold text-emerald-400">
            {expiredRate} / sec
          </div>
          <span className="text-[10px] text-slate-400">Instantaneous rate</span>
        </div>

        <div className="rounded-lg bg-slate-950/70 p-3 border border-slate-850 col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">
            Cycle Algorithm
          </span>
          <div className="font-mono text-sm font-bold text-sky-400 mt-1">
            Sample 20 keys @ 10Hz
          </div>
          <span className="text-[10px] text-slate-400">Adaptive repetition limit</span>
        </div>
      </div>
    </div>
  );
};
