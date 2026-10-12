import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { TrendingDown, AlertCircle } from 'lucide-react';
import { ExpirationStatsTimelinePoint } from '../expiration/types';

interface EvictionTimelineProps {
  totalEvictedKeys: number;
}

export const EvictionTimeline: React.FC<EvictionTimelineProps> = ({ totalEvictedKeys }) => {
  const [timeline, setTimeline] = useState<ExpirationStatsTimelinePoint[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('redisx_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/expiration/stats', { headers });
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.timeline)) {
            setTimeline(data.timeline);
          }
        }
      } catch (err) {
        console.error('Failed to load eviction timeline:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-rose-400" />
          <span className="font-semibold text-slate-200">Eviction Rate Timeline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px]">Cumulative Evicted:</span>
          <span className="font-mono font-bold text-rose-400 rounded bg-rose-950/80 border border-rose-900 px-2 py-0.5 text-xs">
            {totalEvictedKeys.toLocaleString()} keys
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-44 w-full pt-1">
        {timeline.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs">
            No eviction activity recorded in metrics ring buffer.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0a0f1d',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(value: any) => [`${value} keys/sec`, 'Eviction Rate']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="evictedRate"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
