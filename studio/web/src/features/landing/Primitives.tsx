import React from 'react';
import { Activity, Database, Terminal, Layers, Cpu, Clock, Users, Save, GitBranch, Shield, Settings, ChartNoAxesCombined, Monitor, Radio, BookOpen, type LucideIcon } from 'lucide-react';
export const icons: Record<string, LucideIcon> = { activity: Activity, database: Database, terminal: Terminal, layers: Layers, cpu: Cpu, clock: Clock, users: Users, save: Save, branch: GitBranch, shield: Shield, settings: Settings, chart: ChartNoAxesCombined, monitor: Monitor, radio: Radio, book: BookOpen };
export function Mark({ small = false }: { small?: boolean }) {
  return <span className={`lp-mark ${small ? 'lp-mark-small' : ''}`} aria-hidden="true"><Layers size={small ? 17 : 21} strokeWidth={2.3} /></span>;
}
export function Trace({ values, label, animated = false, paused = false }: {
  values: number[];
  label: string;
  animated?: boolean;
  paused?: boolean;
}) {
  const samples = animated ? [...values, ...values, values[0]] : values;
  const spacing = 600 / Math.max(1, animated ? values.length : values.length - 1);
  const points = samples.map((value, index) => `${index * spacing},${130 - value}`).join(' ');
  const width = animated ? 1200 : 600;
  return (
    <svg className={`lp-trace${animated ? ' lp-live-trace' : ''}`} viewBox="0 0 600 140"
      role="img" aria-label={label} preserveAspectRatio="none" data-paused={paused}>
      <path d="M0 35H600M0 70H600M0 105H600" className="lp-gridline" />
      <g className={animated ? 'lp-trace-signal' : undefined}>
        <polygon points={`0,140 ${points} ${width},140`} fill="currentColor" opacity=".065" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>
      {animated && <line className="lp-chart-scan" x1="0" y1="0" x2="0" y2="140" stroke="currentColor" strokeWidth="1" opacity=".15" aria-hidden="true" />}
    </svg>
  );
}
