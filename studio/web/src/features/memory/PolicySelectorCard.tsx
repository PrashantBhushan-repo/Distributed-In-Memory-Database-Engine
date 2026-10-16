import React from 'react';
import { ShieldCheck, Check, Info } from 'lucide-react';
import { EVICTION_POLICIES, EvictionPolicyInfo } from './types';

interface PolicySelectorCardProps {
  currentPolicy: string;
  selectedPolicy: string;
  onSelectPolicy: (policy: string) => void;
}

export const PolicySelectorCard: React.FC<PolicySelectorCardProps> = ({
  currentPolicy,
  selectedPolicy,
  onSelectPolicy,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">Maxmemory Eviction Policies</span>
        </div>
        <span className="text-slate-400 text-[11px]">
          Current server policy: <strong className="font-mono text-emerald-400">{currentPolicy}</strong>
        </span>
      </div>

      {/* Grid of 8 policies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {EVICTION_POLICIES.map((policy) => {
          const isSelected = selectedPolicy === policy.id;
          const isCurrent = currentPolicy === policy.id;

          return (
            <div
              key={policy.id}
              onClick={() => onSelectPolicy(policy.id)}
              className={`rounded-xl border p-3 cursor-pointer transition flex flex-col justify-between ${
                isSelected
                  ? 'border-sky-500 bg-sky-500/10 shadow-sm shadow-sky-500/20'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? 'border-sky-400 bg-sky-400'
                          : 'border-slate-600 bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-black stroke-[3]" />}
                    </div>
                    <span className="font-mono font-bold text-white text-[12px]">{policy.name}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isCurrent && (
                      <span className="rounded bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-400">
                        Active Server
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                        policy.isVolatile
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-850'
                          : 'bg-indigo-950/80 text-indigo-400 border border-indigo-850'
                      }`}
                    >
                      {policy.isVolatile ? 'Volatile (TTL)' : 'All Keys'}
                    </span>
                  </div>
                </div>

                <p className="text-slate-300 text-[11px] leading-relaxed mt-1">
                  {policy.description}
                </p>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-850/80 flex items-center justify-between text-[10px]">
                <span className="text-slate-400 font-medium">Good for:</span>
                <span className="font-semibold text-sky-300">{policy.tag}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
