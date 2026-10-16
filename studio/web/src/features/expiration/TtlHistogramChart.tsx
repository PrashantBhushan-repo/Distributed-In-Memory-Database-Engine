import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { HistogramBucket } from './types';

interface TtlHistogramChartProps {
  buckets: HistogramBucket[];
  totalSampled: number;
  withTtlCount: number;
}

export const TtlHistogramChart: React.FC<TtlHistogramChartProps> = ({
  buckets,
  totalSampled,
  withTtlCount,
}) => {
  const BUCKET_COLORS = [
    '#f43f5e', // < 1m (rose / imminent)
    '#f59e0b', // < 1h (amber)
    '#38bdf8', // < 1d (sky)
    '#818cf8', // < 7d (indigo)
    '#a855f7', // > 7d (purple)
    '#64748b', // No TTL (slate)
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">TTL Lifetime Distribution</span>
        </div>
        <span className="text-[11px] text-slate-400">
          {withTtlCount.toLocaleString()} expiring / {totalSampled.toLocaleString()} sampled keys
        </span>
      </div>

      {/* Chart */}
      <div className="h-52 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0a0f1d',
                borderColor: '#334155',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: any, name: any, props: any) => [
                `${value} keys (${props.payload.percentage}%)`,
                'Key Count',
              ]}
              labelFormatter={(label) => `Range: ${label}`}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {buckets.map((_, index) => (
                <Cell key={`cell-${index}`} fill={BUCKET_COLORS[index % BUCKET_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
