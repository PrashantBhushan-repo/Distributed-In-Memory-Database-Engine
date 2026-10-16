import React, { useState } from 'react';
import { Plus, X, Radio, Asterisk, Hash, Check } from 'lucide-react';
import { SubscriptionItem } from './types';

interface SubscriptionManagerProps {
  subscriptions: SubscriptionItem[];
  onSubscribe: (target: string, isPattern: boolean) => void;
  onUnsubscribe: (target: string, isPattern: boolean) => void;
  quickFillChannel?: string;
}

export const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({
  subscriptions,
  onSubscribe,
  onUnsubscribe,
  quickFillChannel,
}) => {
  const [targetInput, setTargetInput] = useState('');
  const [isPattern, setIsPattern] = useState(false);

  // Update target input if quick fill passed
  React.useEffect(() => {
    if (quickFillChannel) {
      setTargetInput(quickFillChannel);
      setIsPattern(quickFillChannel.includes('*'));
    }
  }, [quickFillChannel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = targetInput.trim();
    if (!trimmed) return;
    onSubscribe(trimmed, isPattern);
    setTargetInput('');
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-3">
      {/* Top Form */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          {isPattern ? (
            <Asterisk className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 top-2.5" />
          ) : (
            <Hash className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
          )}
          <input
            type="text"
            placeholder={isPattern ? 'Pattern (e.g. order:* or chat:*)' : 'Channel name (e.g. notifications:user)'}
            value={targetInput}
            onChange={(e) => {
              setTargetInput(e.target.value);
              if (e.target.value.includes('*') && !isPattern) {
                setIsPattern(true);
              }
            }}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Pattern Checkbox Toggle */}
        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none px-1">
          <input
            type="checkbox"
            checked={isPattern}
            onChange={(e) => setIsPattern(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950 text-red-600 focus:ring-0 focus:ring-offset-0"
          />
          <span>Pattern (PSUBSCRIBE)</span>
        </label>

        {/* Subscribe Button */}
        <button
          type="submit"
          disabled={!targetInput.trim()}
          className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Subscribe
        </button>
      </form>

      {/* Active Subscriptions Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
        <span className="text-[11px] font-semibold text-slate-400">
          Subscribed ({subscriptions.length}):
        </span>

        {subscriptions.length === 0 ? (
          <span className="text-xs text-slate-500 italic">
            No active subscriptions. Subscribe to channels or patterns to stream incoming messages.
          </span>
        ) : (
          subscriptions.map((sub) => (
            <span
              key={`${sub.isPattern ? 'p:' : 'c:'}${sub.target}`}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-mono ${
                sub.isPattern
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
              }`}
            >
              {sub.isPattern ? <Asterisk className="w-3 h-3 text-amber-400" /> : <Hash className="w-3 h-3 text-sky-400" />}
              <span>{sub.target}</span>
              <button
                onClick={() => onUnsubscribe(sub.target, sub.isPattern)}
                className="hover:text-red-400 p-0.5 transition-colors ml-0.5"
                title="Unsubscribe"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
};
