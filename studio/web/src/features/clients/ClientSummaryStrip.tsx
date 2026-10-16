import React from 'react';
import { Users, ShieldAlert, Radio, HardDrive, AlertTriangle } from 'lucide-react';
import { ClientsSummary } from './types';

interface ClientSummaryStripProps {
  summary: ClientsSummary;
}

export const ClientSummaryStrip: React.FC<ClientSummaryStripProps> = ({ summary }) => {
  const capPercent = Math.round((summary.total / (summary.maxClients || 10000)) * 100);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
      {/* 1. Total Connected */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Connected Clients
          </span>
          <Users className="h-4 w-4 text-sky-400" />
        </div>
        <div className="font-mono text-2xl font-bold text-white">
          {summary.total.toLocaleString()}
        </div>
        <span className="text-[10px] text-slate-400">
          Max limit: {summary.maxClients.toLocaleString()} ({capPercent}%)
        </span>
      </div>

      {/* 2. Blocked Clients */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Blocked (BLPOP/BRPOP)
          </span>
          <ShieldAlert className="h-4 w-4 text-amber-400" />
        </div>
        <div className="font-mono text-2xl font-bold text-amber-400">
          {summary.blockedCount.toLocaleString()}
        </div>
        <span className="text-[10px] text-slate-400">
          Awaiting key events or streams
        </span>
      </div>

      {/* 3. Subscribed (Pub/Sub) */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Subscribed (Pub/Sub)
          </span>
          <Radio className="h-4 w-4 text-indigo-400" />
        </div>
        <div className="font-mono text-2xl font-bold text-indigo-400">
          {summary.subscribedCount.toLocaleString()}
        </div>
        <span className="text-[10px] text-slate-400">
          Active channel listeners
        </span>
      </div>

      {/* 4. Large Output Buffer Warning */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            High Buffer (&gt; 1MB)
          </span>
          <HardDrive className="h-4 w-4 text-rose-400" />
        </div>
        <div className={`font-mono text-2xl font-bold ${summary.highBufferCount > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
          {summary.highBufferCount.toLocaleString()}
        </div>
        <span className="text-[10px] text-slate-400">
          At risk of client buffer eviction
        </span>
      </div>

      {/* 5. Idle Clients (> 300s) */}
      <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-3.5 shadow-sm col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            High Idle (&gt; 5 min)
          </span>
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        </div>
        <div className="font-mono text-2xl font-bold text-slate-200">
          {summary.highIdleCount.toLocaleString()}
        </div>
        <span className="text-[10px] text-slate-400">
          Stale socket pool candidates
        </span>
      </div>
    </div>
  );
};
