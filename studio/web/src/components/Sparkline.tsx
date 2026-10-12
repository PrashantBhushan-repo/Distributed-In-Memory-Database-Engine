import React from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

interface SparklineProps {
  data: Array<{ value: number }>;
  color?: string; // hex or tailwind stroke
  gradientId: string;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = React.memo(({
  data,
  color = '#ef4444',
  gradientId,
  height = 42,
}) => {
  if (!data || data.length === 0) {
    return <div style={{ height }} className="w-full bg-slate-900/30 rounded animate-pulse" />;
  }

  // Calculate min and max for optimal dynamic scaling
  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1 || 1;

  return (
    <div style={{ height }} className="w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <YAxis
            domain={[minVal - padding, maxVal + padding]}
            hide
            type="number"
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.8}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

Sparkline.displayName = 'Sparkline';
