import React from 'react';
import { Server, Database, Activity, ShieldCheck, AlertCircle } from 'lucide-react';
import { ReplicationTopology } from './types';
import { useEngineAddress } from '../../utils/useEngineAddress';

interface TopologyGraphProps {
  topology: ReplicationTopology;
  onSelectReplica?: (id: string) => void;
}

export const TopologyGraph: React.FC<TopologyGraphProps> = ({ topology, onSelectReplica }) => {
  const engineAddress = useEngineAddress();
  const isMaster = topology.role === 'master';
  const replicas = topology.replicas || [];

  // SVG dimensions
  const width = 760;
  const height = 300;

  // Center Primary node coordinates
  const centerX = width / 2;
  const centerY = isMaster ? height / 2 : height * 0.7;

  // Master Upstream coordinates if role === 'slave'
  const upstreamX = width / 2;
  const upstreamY = 70;

  return (
    <div className="relative rounded-xl border border-slate-800 bg-[#0b101b] p-5 shadow-xs overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Live Replication Stream Topology</h3>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400" />
            Online & In-Sync
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-xs shadow-amber-400" />
            Syncing / Lagging
          </span>
        </div>
      </div>

      <div className="relative w-full flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full max-w-[760px] h-[300px] select-none"
        >
          <defs>
            {/* Linear gradients */}
            <linearGradient id="primaryGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.05" />
            </linearGradient>

            <linearGradient id="replicaGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.05" />
            </linearGradient>

            {/* Pulsing ring filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* If node is SLAVE, draw line to upstream master */}
          {!isMaster && (
            <g>
              <line
                x1={upstreamX}
                y1={upstreamY + 35}
                x2={centerX}
                y2={centerY - 35}
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeDasharray="6 6"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="24"
                  to="0"
                  dur="1s"
                  repeatCount="indefinite"
                />
              </line>

              {/* Upstream Master Node Box */}
              <g transform={`translate(${upstreamX - 90}, ${upstreamY - 30})`}>
                <rect
                  width="180"
                  height="60"
                  rx="10"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                />
                <text x="90" y="24" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle">
                  UPSTREAM MASTER
                </text>
                <text x="90" y="44" fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">
                  {topology.masterHost ? `${topology.masterHost}:${topology.masterPort ?? 'unknown'}` : engineAddress}
                </text>
              </g>
            </g>
          )}

          {/* Draw connecting stream paths to Replicas if Master */}
          {isMaster &&
            replicas.map((rep, index) => {
              // Compute replica X coordinate: spaced horizontally
              const spacing = width / (replicas.length + 1);
              const repX = spacing * (index + 1);
              const repY = height * 0.75;

              // Cubic bezier curve path
              const pathD = `M ${centerX} ${centerY + 30} C ${centerX} ${centerY + 60}, ${repX} ${centerY + 60}, ${repX} ${repY - 35}`;

              const isLagging = rep.lagSeconds > 0 || rep.state !== 'online';
              const lineColor = isLagging ? '#f59e0b' : '#10b981';
              const streamSpeed = isLagging ? '2s' : '0.8s';

              return (
                <g key={rep.id}>
                  {/* Background path line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="4"
                  />
                  {/* Animated replication data stream line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="2.5"
                    strokeDasharray="6 6"
                  >
                    <animate
                      attributeName="stroke-dashoffset"
                      from="24"
                      to="0"
                      dur={streamSpeed}
                      repeatCount="indefinite"
                    />
                  </path>
                </g>
              );
            })}

          {/* Central Primary Node */}
          <g transform={`translate(${centerX - 105}, ${centerY - 40})`}>
            {/* Outer halo */}
            <rect
              width="210"
              height="80"
              rx="12"
              fill="url(#primaryGlow)"
              stroke={isMaster ? '#10b981' : '#38bdf8'}
              strokeWidth="2"
              filter="url(#glow)"
            />
            {/* Core Box */}
            <rect
              width="210"
              height="80"
              rx="12"
              fill="#070b14"
              stroke={isMaster ? '#059669' : '#0284c7'}
              strokeWidth="1.5"
            />
            {/* Label */}
            <text x="105" y="24" fill={isMaster ? '#10b981' : '#38bdf8'} fontSize="11" fontWeight="bold" textAnchor="middle" letterSpacing="0.05em">
              {isMaster ? '★ PRIMARY (THIS NODE)' : 'REPLICA (THIS NODE)'}
            </text>
            <text x="105" y="44" fill="#f8fafc" fontSize="13" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              port 6379 • {topology.role.toUpperCase()}
            </text>
            <text x="105" y="64" fill="#94a3b8" fontSize="10" fontFamily="monospace" textAnchor="middle">
              Stream Offset: {topology.masterReplOffset.toLocaleString()}
            </text>
          </g>

          {/* Render Orbiting Replica Nodes */}
          {isMaster &&
            replicas.map((rep, index) => {
              const spacing = width / (replicas.length + 1);
              const repX = spacing * (index + 1);
              const repY = height * 0.75;

              const isLagging = rep.lagSeconds > 0 || rep.state !== 'online';
              const borderColor = isLagging ? '#f59e0b' : '#10b981';

              return (
                <g
                  key={rep.id}
                  transform={`translate(${repX - 85}, ${repY - 30})`}
                  className="cursor-pointer transition-transform hover:scale-105"
                  onClick={() => onSelectReplica?.(rep.id)}
                >
                  <rect
                    width="170"
                    height="68"
                    rx="10"
                    fill="#0b101b"
                    stroke={borderColor}
                    strokeWidth="1.5"
                  />
                  <circle cx="18" cy="18" r="4" fill={borderColor} />
                  <text x="30" y="22" fill="#f1f5f9" fontSize="11" fontWeight="bold" fontFamily="monospace">
                    {rep.ip}:{rep.port}
                  </text>
                  <text x="18" y="42" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                    Offset: {rep.offset.toLocaleString()}
                  </text>
                  <text x="18" y="58" fill={isLagging ? '#fbbf24' : '#64748b'} fontSize="10" fontFamily="monospace">
                    {isLagging ? `Lag: ${rep.lagSeconds}s (${rep.lagBytes.toLocaleString()} B)` : 'Lag: 0s (In-Sync)'}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      <div className="mt-2 text-center text-xs text-slate-500 font-mono">
        Master Replication ID: <span className="text-slate-300">{topology.masterReplId}</span>
      </div>
    </div>
  );
};
