import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { Download, Bell, BellRing, Check, X, ShieldAlert } from 'lucide-react';
import { exportChartToCsv } from './lttb';

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  unit?: string;
  dashed?: boolean;
}

interface ChartCardProps {
  id: string;
  title: string;
  description?: string;
  currentValue: string;
  data: any[];
  comparedData?: any[];
  series: ChartSeries[];
  compareSeries?: ChartSeries[];
  yUnit?: string;
  threshold?: number;
  onSaveThreshold?: (id: string, value: number | null) => void;
  isCompareActive?: boolean;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  id,
  title,
  description,
  currentValue,
  data,
  comparedData = [],
  series,
  compareSeries = [],
  yUnit = '',
  threshold,
  onSaveThreshold,
  isCompareActive = false,
}) => {
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [thresholdInput, setThresholdInput] = useState<string>(
    threshold !== undefined && threshold !== null ? String(threshold) : ''
  );

  const handleExportCsv = () => {
    const columns = [
      { key: 'timestamp', header: 'Timestamp' },
      ...series.map((s) => ({ key: s.key, header: s.name })),
    ];
    exportChartToCsv(`redis-${id}-${new Date().toISOString().slice(0, 10)}`, data, columns);
  };

  const handleSaveThreshold = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(thresholdInput);
    if (!isNaN(val) && val > 0) {
      onSaveThreshold?.(id, val);
    } else {
      onSaveThreshold?.(id, null);
    }
    setShowThresholdModal(false);
  };

  const handleClearThreshold = () => {
    setThresholdInput('');
    onSaveThreshold?.(id, null);
    setShowThresholdModal(false);
  };

  // Merge current and comparison data for chart if comparison active
  const mergedData = React.useMemo(() => {
    if (!isCompareActive || !comparedData || comparedData.length === 0) {
      return data;
    }
    return data.map((item, idx) => {
      const compItem = comparedData[idx];
      const merged: any = { ...item };
      if (compItem) {
        series.forEach((s) => {
          merged[`${s.key}_prev`] = compItem[s.key];
        });
      }
      return merged;
    });
  }, [data, comparedData, isCompareActive, series]);

  return (
    <div className="relative flex flex-col bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm hover:border-slate-700 transition-colors">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            {threshold !== undefined && threshold !== null && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <ShieldAlert className="w-2.5 h-2.5" />
                Limit: {threshold} {yUnit}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </div>

        {/* Value + Actions */}
        <div className="flex items-center gap-2">
          <span className="text-base font-bold font-mono text-slate-100">{currentValue}</span>

          <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
            {/* Threshold Alert Config */}
            <button
              onClick={() => setShowThresholdModal(true)}
              title={threshold ? 'Edit threshold alert line' : 'Set threshold alert line'}
              className={`p-1.5 rounded-lg border transition-colors ${
                threshold
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {threshold ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
            </button>

            {/* CSV Download */}
            <button
              onClick={handleExportCsv}
              title="Download CSV"
              className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Threshold Modal Popover */}
      {showThresholdModal && (
        <div className="absolute top-12 right-4 z-30 w-72 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-200">Set Alert Threshold</span>
            <button
              onClick={() => setShowThresholdModal(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mb-2">
            Renders a warning threshold line and tints the elevated region. Saved locally.
          </p>
          <form onSubmit={handleSaveThreshold} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                placeholder={`Value (${yUnit || 'units'})`}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-red-500 font-mono"
                autoFocus
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Save
              </button>
            </div>
            {threshold && (
              <button
                type="button"
                onClick={handleClearThreshold}
                className="w-full text-center text-[11px] text-slate-400 hover:text-red-400 pt-1"
              >
                Clear current threshold
              </button>
            )}
          </form>
        </div>
      )}

      {/* Recharts Canvas */}
      <div className="h-44 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mergedData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="timestamp"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(ts) => {
                const d = new Date(ts);
                return `${d.getHours().toString().padStart(2, '0')}:${d
                  .getMinutes()
                  .toString()
                  .padStart(2, '0')}`;
              }}
            />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#f8fafc',
              }}
              labelFormatter={(ts) => new Date(Number(ts)).toLocaleTimeString()}
              formatter={(val: any, name: any) => [
                `${Number(val).toLocaleString()} ${yUnit}`,
                String(name),
              ]}
            />

            {/* Threshold Line */}
            {threshold !== undefined && threshold !== null && (
              <ReferenceLine
                y={threshold}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `ALERT: ${threshold} ${yUnit}`,
                  fill: '#ef4444',
                  fontSize: 10,
                  position: 'insideTopRight',
                }}
              />
            )}

            {/* Previous Period Comparison Lines (dashed) */}
            {isCompareActive &&
              series.map((s) => (
                <Line
                  key={`${s.key}_prev`}
                  type="monotone"
                  dataKey={`${s.key}_prev`}
                  name={`${s.name} (Prev)`}
                  stroke={s.color}
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}

            {/* Active Primary Lines */}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend below */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
        {isCompareActive && (
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="w-3 border-t-2 border-dashed border-slate-500" />
            <span>Previous Period</span>
          </div>
        )}
      </div>
    </div>
  );
};
