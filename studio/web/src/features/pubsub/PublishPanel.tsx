import React, { useState } from 'react';
import { Send, Sparkles, Check, AlertCircle, FileCode, Hash } from 'lucide-react';

interface PublishPanelProps {
  initialChannel?: string;
  onPublishSuccess?: (channel: string, message: string, receivers: number) => void;
}

export const PublishPanel: React.FC<PublishPanelProps> = ({
  initialChannel = '',
  onPublishSuccess,
}) => {
  const [channel, setChannel] = useState(initialChannel);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; receivers?: number; error?: string } | null>(null);

  React.useEffect(() => {
    if (initialChannel) {
      setChannel(initialChannel);
    }
  }, [initialChannel]);

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(message);
      setMessage(JSON.stringify(parsed, null, 2));
    } catch {
      // not valid json, ignore
    }
  };

  const handleInsertSample = () => {
    setMessage(
      JSON.stringify(
        {
          event: 'order_status_updated',
          orderId: `ord_${Math.floor(1000 + Math.random() * 9000)}`,
          status: 'fulfilled',
          itemsCount: 3,
          timestamp: Date.now(),
        },
        null,
        2
      )
    );
    if (!channel) setChannel('order:events');
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const ch = channel.trim();
    if (!ch || !message.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/pubsub/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel: ch,
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, receivers: data.receivers });
        onPublishSuccess?.(ch, message.trim(), data.receivers);
      } else {
        setResult({ success: false, error: data.error || 'Failed to publish message' });
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Network error publishing message' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-red-500" />
          <h3 className="text-xs font-bold text-slate-200">Publish Message</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleFormatJson}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1"
            title="Prettify JSON"
          >
            <FileCode className="w-3 h-3 text-slate-400" />
            Format JSON
          </button>
          <button
            type="button"
            onClick={handleInsertSample}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            Sample
          </button>
        </div>
      </div>

      <form onSubmit={handlePublish} className="space-y-2.5">
        <div>
          <label className="block text-[11px] text-slate-400 font-medium mb-1">Target Channel</label>
          <div className="relative">
            <Hash className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="e.g. notifications:user or order:events"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 focus:outline-none focus:border-red-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 font-medium mb-1">Message Payload</label>
          <textarea
            rows={3}
            placeholder='Payload (plain text or JSON: {"event": "login", "user": "alice"})'
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 focus:outline-none focus:border-red-500 resize-none"
            required
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            {result?.success && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <Check className="w-3.5 h-3.5" />
                Delivered to {result.receivers} subscriber(s)
              </span>
            )}
            {result?.error && (
              <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {result.error}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !channel.trim() || !message.trim()}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  );
};
