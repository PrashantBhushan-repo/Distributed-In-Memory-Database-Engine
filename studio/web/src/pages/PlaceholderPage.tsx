import React from 'react';
import { Sparkles, Construction, ExternalLink, ArrowRight } from 'lucide-react';
import { InfoTip } from '../components/InfoTip';
import { CommandChip } from '../components/CommandChip';

interface PlaceholderPageProps {
  title: string;
  description: string;
  term?: string;
  suggestedCommands?: string[];
  stepBadge?: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description,
  term,
  suggestedCommands = [],
  stepBadge = 'Step 2 Shell Ready',
}) => {
  return (
    <div className="space-y-6 max-w-5xl mx-auto py-4">
      {/* Page Header */}
      <div className="border-b border-slate-800 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              {stepBadge}
            </span>
            {term && <InfoTip term={term} />}
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">{title}</h1>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 transition"
          >
            <span>Grafana SRE</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Industrial Placeholder Hero */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-8 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto shadow-inner">
          <Construction className="h-7 w-7 text-amber-400 animate-pulse" />
        </div>

        <div className="max-w-lg mx-auto">
          <h3 className="text-base font-bold text-white">Full Feature Implementation in Progress</h3>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            The shell layout, routing, keyboard navigation, and gateway APIs are fully connected. This view will be populated with specialized charts and interactive controls in the upcoming step.
          </p>
        </div>

        {/* Suggested CLI Commands */}
        {suggestedCommands.length > 0 && (
          <div className="pt-4 max-w-md mx-auto space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Equivalent CLI Commands for this Area:
            </div>
            <div className="flex flex-col gap-2">
              {suggestedCommands.map((cmd) => (
                <CommandChip key={cmd} command={cmd} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
