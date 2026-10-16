import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { HardDrive, Clock, TrendingUp } from 'lucide-react';

interface MetricPoint {
  timestamp: number;
  usedMemory: number;
  maxMemory: number;
  memoryPercent: number;
}

interface MemoryUsageChartProps {
  maxMemoryBytes: number;
  currentUsedBytes: number;
}

export const MemoryUsageChart: React.FC<MemoryUsageChartProps> = ({
  maxMemoryBytes,
  currentUsedBytes,
}) => {
  const [range, setRange] = useState<'15m' | '1h' | '6h' | '24h'>('1h');
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('redisx_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/metrics/history?range=${range}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (mounted && Array.isArray(data.points)) {
            setPoints(data.points);
          }
        }
      } catch (err) {
        console.error('Failed to fetch memory telemetry history:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [range]);

  const maxMb = maxMemoryBytes > 0 ? Math.round(maxMemoryBytes / (1024 * 1024)) : 256;
  const currentMb = Math.round(currentUsedBytes / (1024 * 1024));

  const chartData = points.map((p) => {
    const d = new Date(p.timestamp);
    const timeLabel = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    return {
      timestamp: p.timestamp,
      time: timeLabel,
      usedMb: Math.round(p.usedMemory / (1024 * 1024)),
      maxMb: p.maxMemory > 0 ? Math.round(p.maxMemory / (1024 * 1024)) : maxMb,
    };
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0d1322] p-4 text-xs shadow-md space-y-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-sky-400" />
          <span className="font-semibold text-slate-200">Memory Usage Over Time</span>
          <span className="rounded bg-slate-900 border border-slate-800 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
            {currentMb} MB / {maxMb} MB ({maxMemoryBytes > 0 ? Math.round((currentUsedBytes / maxMemoryBytes) * 100) : 0}%)
          </span>
        </div>

        {/* Range Selector */}
        <div className="flex items-center rounded-lg bg-slate-900/90 p-0.5 border border-slate-800">
          {(['15m', '1h', '6h', '24h'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-2.5 py-0.5 text-[11px] font-semibold transition ${
                range === r
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-56 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(v) => `${v}M`}
              domain={[0, Math.max(maxMb * 1.15, currentMb * 1.25)]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0a0f1d',
                borderColor: '#334155',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: any, name: any) => [
                `${value} MB`,
                name === 'usedMb' ? 'Used Memory' : 'Max Memory Limit',
              ]}
              labelFormatter={(label) => `Time: ${label}`}
            />
            {maxMb > 0 && (
              <ReferenceLine
                y={maxMb}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{
                  value: `Maxmemory (${maxMb} MB)`,
                  fill: '#ef4444',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="usedMb"
              stroke="#38bdf8"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#memGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
