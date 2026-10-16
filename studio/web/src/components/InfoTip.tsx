import React, { useState } from 'react';
import { HelpCircle, ExternalLink } from 'lucide-react';
import { GLOSSARY } from '../features/learn/glossary';

interface InfoTipProps {
  term?: string;
  content?: string;
  title?: string;
  className?: string;
  inline?: boolean;
}

export const InfoTip: React.FC<InfoTipProps> = ({
  term,
  content,
  title,
  className = '',
  inline = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedKey = term ? term.toLowerCase().trim() : '';
  const info = normalizedKey ? GLOSSARY[normalizedKey] : null;

  if (!info && !content) {
    return null;
  }

  const tipTitle = title || info?.title || 'Diagnostic Insight';
  const tipCategory = info?.category || 'telemetry';
  const tipShortDesc = content || info?.shortDesc || '';
  const tipDetailedDesc = content ? '' : info?.detailedDesc || '';
  const tipLearnLink = info?.learnLink || null;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        aria-label={`Learn about ${tipTitle}`}
        className="text-slate-400 hover:text-red-400 p-0.5 rounded transition inline-flex items-center focus:outline-none focus:ring-1 focus:ring-red-500"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div
          role="tooltip"
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl text-left text-xs pointer-events-auto transition-all animate-in fade-in zoom-in-95"
        >
          <div className="font-bold text-slate-100 flex items-center justify-between pb-1 mb-1 border-b border-slate-800">
            <span>{tipTitle}</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              {tipCategory}
            </span>
          </div>

          <p className="text-slate-300 text-[11px] leading-relaxed mt-1">{tipShortDesc}</p>
          {tipDetailedDesc && (
            <p className="text-slate-400 text-[11px] leading-relaxed mt-1.5">{tipDetailedDesc}</p>
          )}

          {tipLearnLink && (
            <a
              href={tipLearnLink}
              className="mt-2.5 pt-1.5 border-t border-slate-800/80 text-[11px] text-red-400 hover:text-red-300 font-medium flex items-center gap-1 transition"
            >
              <span>Learn more in documentation</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {/* Tiny arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900"></div>
        </div>
      )}
    </span>
  );
};
