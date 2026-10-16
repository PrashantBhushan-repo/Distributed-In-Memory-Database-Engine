import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Activity } from 'lucide-react';
import { ExpirationStatsTimelinePoint } from './types';

interface ExpiredVsEvictedChartProps {
  timeline: ExpirationStatsTimelinePoint[];
  expiredRate: number;
  evictedRate: number;
}

export const ExpiredVsEvictedChart: React.FC<ExpiredVsEvictedChartProps> = ({
  timeline,
  expiredRate,
  evictedRate,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">Expired vs. Evicted Rates</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Expired: {expiredRate}/s
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            Evicted: {evictedRate}/s
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-52 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={10} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0a0f1d',
                borderColor: '#334155',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: any, name: any) => [
                `${value} keys/sec`,
                name === 'expiredRate' ? 'Expired Rate' : 'Evicted Rate',
              ]}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(val) => (val === 'expiredRate' ? 'Natural Expiration' : 'Memory Eviction')}
            />
            <Line
              type="monotone"
              dataKey="expiredRate"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
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
      </div>
    </div>
  );
};
