import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Pause,
  Play,
  Trash2,
  Download,
  Copy,
  Check,
  Radio,
  Hash,
  Asterisk,
  FileJson,
  FileText,
} from 'lucide-react';
import { PubSubMessageEvent } from './types';

interface MessageStreamProps {
  messages: PubSubMessageEvent[];
  isPaused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
  onExport: () => void;
}

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  isPaused,
  onTogglePause,
  onClear,
  onExport,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const streamBottomRef = useRef<HTMLDivElement>(null);

  // Filter messages by channel, pattern or payload
  const filtered = useMemo(() => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.channel.toLowerCase().includes(q) ||
        (m.pattern && m.pattern.toLowerCase().includes(q)) ||
        m.payload.toLowerCase().includes(q)
    );
  }, [messages, filterQuery]);

  // Auto-scroll to bottom on new messages if not paused
  useEffect(() => {
    if (!isPaused && streamBottomRef.current) {
      streamBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isPaused]);

  const handleCopy = (idx: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const isJson = (str: string) => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  };

  const formatPayload = (str: string) => {
    try {
      const obj = JSON.parse(str);
      return JSON.stringify(obj, null, 2);
    } catch {
      return str;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Stream Toolbar */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200">Live Message Stream</h3>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {filtered.length} msgs
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Filter Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Filter payload or channel..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-44 pl-8 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-red-500 font-mono"
            />
          </div>

          {/* Pause / Resume */}
          <button
            onClick={onTogglePause}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>

          {/* Clear Stream */}
          <button
            onClick={onClear}
            title="Clear Stream"
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Download JSON */}
          <button
            onClick={onExport}
            title="Export messages as JSON"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs">
            <Radio className="w-8 h-8 mb-2 text-slate-600 animate-pulse" />
            <p>No messages received yet.</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Publish a message or wait for subscribers to trigger activity.
            </p>
          </div>
        ) : (
          filtered.map((msg, idx) => {
            const hasJson = isJson(msg.payload);
            return (
              <div
                key={`${msg.timestamp}-${idx}`}
                className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-2 hover:border-slate-700 transition-colors"
              >
                {/* Message Header */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500 text-[11px]">{msg.timeStr}</span>

                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        msg.type === 'pmessage'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
                      }`}
                    >
                      {msg.type === 'pmessage' ? (
                        <>
                          <Asterisk className="w-2.5 h-2.5" /> pmessage
                        </>
                      ) : (
                        <>
                          <Hash className="w-2.5 h-2.5" /> message
                        </>
                      )}
                    </span>

                    <span className="font-mono text-slate-300 font-semibold">{msg.channel}</span>

                    {msg.pattern && (
                      <span className="text-[11px] font-mono text-slate-500">
                        (matched: {msg.pattern})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                      {hasJson ? (
                        <>
                          <FileJson className="w-3 h-3 text-amber-400" /> JSON
                        </>
                      ) : (
                        <>
                          <FileText className="w-3 h-3 text-slate-400" /> Text
                        </>
                      )}
                    </span>

                    <button
                      onClick={() => handleCopy(idx, msg.payload)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                      title="Copy Payload"
                    >
                      {copiedIdx === idx ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Message Body */}
                <pre className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap break-all">
                  {hasJson ? formatPayload(msg.payload) : msg.payload}
                </pre>
              </div>
            );
          })
        )}
        <div ref={streamBottomRef} />
      </div>
    </div>
  );
};
