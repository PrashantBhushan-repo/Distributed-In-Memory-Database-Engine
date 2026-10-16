import React, { useState, useEffect, useRef } from 'react';
import { Search, History, ArrowRight, CornerDownLeft, X, Trash2 } from 'lucide-react';
import { loadConsoleHistory, saveConsoleHistory } from './commandUtils';

interface HistorySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCommand: (cmd: string) => void;
}

export const HistorySearchModal: React.FC<HistorySearchModalProps> = ({
  isOpen,
  onClose,
  onSelectCommand,
}) => {
  const [historyList, setHistoryList] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const items = loadConsoleHistory().reverse(); // Show most recent first
      setHistoryList(items);
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = historyList.filter((item) =>
    item.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectCommand(filtered[selectedIndex]);
        onClose();
      }
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all stored console command history?')) {
      saveConsoleHistory([]);
      setHistoryList([]);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-slate-700 bg-[#0d1322] shadow-2xl overflow-hidden text-slate-100 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3 bg-slate-950/70">
          <History className="h-5 w-5 text-sky-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Reverse history search (Ctrl+R)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent font-mono text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-slate-850">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {historyList.length === 0
                ? 'No command history recorded yet.'
                : `No history matches "${query}".`}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item}-${idx}`}
                  onClick={() => {
                    onSelectCommand(item);
                    onClose();
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer font-mono text-xs transition ${
                    isSelected
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                      : 'hover:bg-slate-900 text-slate-300 border border-transparent'
                  }`}
                >
                  <span className="truncate pr-3">{item}</span>
                  {isSelected && (
                    <span className="flex items-center gap-1 text-[10px] text-sky-400 shrink-0 font-sans font-medium">
                      Select <CornerDownLeft className="h-3 w-3" />
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-[10px] text-slate-400 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">↑↓</kbd> navigate</span>
            <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">Enter</kbd> choose</span>
            <span><kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">Esc</kbd> cancel</span>
          </div>

          {historyList.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1 text-red-400 hover:text-red-350 hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Clear History
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
