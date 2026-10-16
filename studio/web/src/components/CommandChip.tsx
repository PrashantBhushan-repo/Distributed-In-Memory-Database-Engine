import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface CommandChipProps {
  command: string;
  className?: string;
  label?: string;
}

export const CommandChip: React.FC<CommandChipProps> = ({ command, className = '', label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`inline-flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono transition group hover:border-slate-700 ${className}`}
    >
      <Terminal className="h-3 w-3 text-red-500 shrink-0" />
      {label && <span className="text-slate-500 text-[11px] font-sans mr-0.5">{label}:</span>}
      <span className="text-slate-200 select-all truncate">{command}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy command to clipboard"
        className="text-slate-400 hover:text-white p-1 rounded transition hover:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 ml-auto"
        title="Copy raw CLI command"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
        )}
      </button>
    </div>
  );
};
