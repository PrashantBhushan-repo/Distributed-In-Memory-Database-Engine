import React from 'react';
import { PIPELINE_STAGES, PipelineStage } from './pipelineData';

interface ArchitecturePipelineSvgProps {
  selectedStageId: string;
  onSelectStage: (stage: PipelineStage) => void;
  animatingStageId?: string | null;
  activeRequestType?: 'SET' | 'GET' | null;
  liveStats?: Record<string, string | number>;
}

export const ArchitecturePipelineSvg: React.FC<ArchitecturePipelineSvgProps> = ({
  selectedStageId,
  onSelectStage,
  animatingStageId,
  activeRequestType,
  liveStats = {},
}) => {
  // 9 stages laid out in a responsive 3x3 serpentine / flow layout:
  // Row 1: 0, 1, 2 (Left to Right)
  // Row 2: 5, 4, 3 (Right to Left) -> or snake layout
  // A clean 3-row layout:
  // Row 1: Client (1) -> TCP Server (2) -> Event Loop epoll (3)
  // Row 2: RESP Parser (4) -> Command Dispatcher (5) -> Transaction Manager (6)
  // Row 3: Database API (7) -> Storage Engine (8) -> Subsystems & Durability (9)

  const positions: Record<string, { x: number; y: number; width: number; height: number }> = {
    client: { x: 30, y: 30, width: 230, height: 110 },
    tcp: { x: 330, y: 30, width: 230, height: 110 },
    epoll: { x: 630, y: 30, width: 230, height: 110 },

    resp: { x: 30, y: 190, width: 230, height: 110 },
    dispatcher: { x: 330, y: 190, width: 230, height: 110 },
    tx: { x: 630, y: 190, width: 230, height: 110 },

    db: { x: 30, y: 350, width: 230, height: 110 },
    storage: { x: 330, y: 350, width: 230, height: 110 },
    subsystems: { x: 630, y: 350, width: 230, height: 110 },
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (index + 1) % PIPELINE_STAGES.length;
      onSelectStage(PIPELINE_STAGES[nextIdx]);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (index - 1 + PIPELINE_STAGES.length) % PIPELINE_STAGES.length;
      onSelectStage(PIPELINE_STAGES[prevIdx]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectStage(PIPELINE_STAGES[index]);
    }
  };

  return (
    <div className="relative w-full overflow-x-auto bg-slate-950/70 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2 px-2 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          Interactive C++20 Storage Engine Flow Pipeline
        </span>
        <span className="text-[11px] text-slate-500 font-mono">Use Arrow Keys or Click to Inspect Stage</span>
      </div>

      <svg
        viewBox="0 0 890 490"
        className="w-full h-auto min-w-[760px] select-none"
        role="region"
        aria-label="C++ Database Architecture Pipeline"
      >
        <defs>
          <linearGradient id="pipeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
          </linearGradient>

          <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#64748b" />
          </marker>
          <marker id="arrowActive" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 8 5 L 0 9 z" fill="#ef4444" />
          </marker>
        </defs>

        {/* --- Connecting Flow Lines --- */}
        {/* Row 1: 1 -> 2 -> 3 */}
        <line x1="260" y1="85" x2="330" y2="85" stroke="#334155" strokeWidth="2.5" markerEnd="url(#arrow)" />
        <line x1="560" y1="85" x2="630" y2="85" stroke="#334155" strokeWidth="2.5" markerEnd="url(#arrow)" />

        {/* Transition Row 1 to Row 2: 3 -> 4 */}
        <path
          d="M 745 140 C 745 170, 145 160, 145 190"
          fill="none"
          stroke="#334155"
          strokeWidth="2"
          strokeDasharray="4 4"
          markerEnd="url(#arrow)"
        />

        {/* Row 2: 4 -> 5 -> 6 */}
        <line x1="260" y1="245" x2="330" y2="245" stroke="#334155" strokeWidth="2.5" markerEnd="url(#arrow)" />
        <line x1="560" y1="245" x2="630" y2="245" stroke="#334155" strokeWidth="2.5" markerEnd="url(#arrow)" />

        {/* Transition Row 2 to Row 3: 6 -> 7 */}
        <path
          d="M 745 300 C 745 330, 145 320, 145 350"
          fill="none"
          stroke="#334155"
          strokeWidth="2"
          strokeDasharray="4 4"
          markerEnd="url(#arrow)"
        />

        {/* Row 3: 7 -> 8 -> 9 */}
        <line x1="260" y1="405" x2="330" y2="405" stroke="#334155" strokeWidth="2.5" markerEnd="url(#arrow)" />
        <line x1="560" y1="405" x2="630" y2="405" stroke="#334155" strokeWidth="2.5" markerEnd="url(#arrow)" />

        {/* --- Render Stage Cards --- */}
        {PIPELINE_STAGES.map((stage, idx) => {
          const pos = positions[stage.id];
          const isSelected = selectedStageId === stage.id;
          const isAnimating = animatingStageId === stage.id;

          // Badges for real-time live data
          let badgeText = '';
          if (stage.id === 'client') badgeText = `${liveStats.connected_clients ?? 1} clients`;
          if (stage.id === 'epoll') badgeText = `${liveStats.instantaneous_ops_per_sec ?? 0} ops/s`;
          if (stage.id === 'resp') badgeText = `${liveStats.total_commands_processed ?? 124} cmds`;
          if (stage.id === 'db') badgeText = `${liveStats.db0_keys ?? 8} keys`;
          if (stage.id === 'storage') badgeText = `${liveStats.expired_keys ?? 0} exp`;
          if (stage.id === 'subsystems') badgeText = `${liveStats.used_memory_human ?? '1.2M'}`;

          return (
            <g
              key={stage.id}
              tabIndex={0}
              role="button"
              aria-label={stage.accessibleDescription}
              aria-selected={isSelected}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onClick={() => onSelectStage(stage)}
              className="cursor-pointer focus:outline-none group"
            >
              {/* Outer Card Background */}
              <rect
                x={pos.x}
                y={pos.y}
                width={pos.width}
                height={pos.height}
                rx={12}
                ry={12}
                fill={isSelected ? '#1e293b' : '#0f172a'}
                stroke={isAnimating ? '#ef4444' : isSelected ? '#3b82f6' : '#334155'}
                strokeWidth={isAnimating ? 3 : isSelected ? 2.5 : 1.5}
                filter={isAnimating ? 'url(#glowEffect)' : undefined}
                className="transition-all duration-300 group-hover:stroke-slate-400"
              />

              {/* Stage Step Number Badge */}
              <rect
                x={pos.x + 12}
                y={pos.y + 12}
                width={22}
                height={22}
                rx={6}
                fill={isSelected ? '#3b82f6' : '#1e293b'}
              />
              <text
                x={pos.x + 23}
                y={pos.y + 27}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="bold"
                fontFamily="ui-monospace, monospace"
              >
                {stage.number}
              </text>

              {/* Title */}
              <text
                x={pos.x + 42}
                y={pos.y + 28}
                fill={isSelected ? '#ffffff' : '#f1f5f9'}
                fontSize="13"
                fontWeight="600"
                className="group-hover:fill-red-400 transition"
              >
                {stage.title}
              </text>

              {/* Subtitle */}
              <text x={pos.x + 14} y={pos.y + 52} fill="#94a3b8" fontSize="10.5">
                {stage.subtitle}
              </text>

              {/* Live Metric / Category Tag */}
              {badgeText ? (
                <g>
                  <rect
                    x={pos.x + 14}
                    y={pos.y + 70}
                    width={pos.width - 28}
                    height={24}
                    rx={6}
                    fill={isAnimating ? '#ef444422' : '#020617'}
                    stroke={isAnimating ? '#ef444488' : '#1e293b'}
                    strokeWidth="1"
                  />
                  <text
                    x={pos.x + pos.width / 2}
                    y={pos.y + 86}
                    textAnchor="middle"
                    fill={isAnimating ? '#f87171' : '#38bdf8'}
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="ui-monospace, monospace"
                  >
                    ● {badgeText}
                  </text>
                </g>
              ) : (
                <text x={pos.x + 14} y={pos.y + 85} fill="#64748b" fontSize="10" fontFamily="ui-monospace, monospace">
                  Stage {stage.number}/9
                </text>
              )}

              {/* Animating Request Particle overlay */}
              {isAnimating && (
                <circle
                  cx={pos.x + pos.width - 16}
                  cy={pos.y + 16}
                  r="6"
                  fill="#ef4444"
                  className="animate-ping"
                />
              )}
            </g>
          );
        })}

        {/* Global Active Request Notification */}
        {activeRequestType && animatingStageId && (
          <g>
            <rect x="280" y="450" width="330" height="28" rx="14" fill="#ef444422" stroke="#ef4444" strokeWidth="1.5" />
            <text x="445" y="468" textAnchor="middle" fill="#f87171" fontSize="11" fontWeight="bold">
              ⚡ Tracing {activeRequestType} Request Through Pipeline
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
