import React from 'react';
import { X, Lightbulb, BookOpen, ExternalLink, ArrowRight } from 'lucide-react';
import { InfoTip } from './InfoTip';

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPath: string;
}

const ROUTE_TIPS: Record<string, { title: string; tips: string[]; relevantTerms: string[] }> = {
  '/dashboard': {
    title: 'Dashboard Overview',
    tips: [
      'Throughput (QPS) spikes indicate high traffic bursts or benchmark runs.',
      'Check Hit Rate: If below 90%, inspect your keyspace TTL policies and caching strategies.',
      'Memory shows current allocated heap. volatile-lru will evict expiring keys first under pressure.',
    ],
    relevantTerms: ['hit rate', 'maxmemory', 'eviction'],
  },
  '/keys': {
    title: 'Key Explorer Best Practices',
    tips: [
      'In production, Key Explorer uses non-blocking SCAN instead of KEYS * to prevent event loop stalls.',
      'Inspect the "encoding" tag to verify whether Lists and Sets are using compact Listpacks or Intsets.',
      'Keys with active TTL countdowns will be evicted automatically when they expire.',
    ],
    relevantTerms: ['ttl', 'encoding', 'listpack'],
  },
  '/console': {
    title: 'Interactive Console CLI',
    tips: [
      'Type any valid RESP command. Results are automatically parsed and formatted into tables.',
      'Use the quick-action pills above the console for immediate diagnostic queries like PING and DBSIZE.',
      'Pipelined commands can be sent in sequence without waiting for individual TCP acknowledgments.',
    ],
    relevantTerms: ['pipelining', 'slowlog'],
  },
  '/playground': {
    title: 'Data Types & Encodings Sandbox',
    tips: [
      'Watch listpack memory elements convert to quicklist nodes as size exceeds limits.',
      'Examine SkipList level towers: higher towers enable logarithmic O(log N) searches in sorted sets.',
      'Observe Intset automatic bit-width promotion when 16-bit integers transition to 32-bit or 64-bit.',
    ],
    relevantTerms: ['listpack', 'encoding', 'rehash'],
  },
  '/memory': {
    title: 'Memory & Eviction Management',
    tips: [
      'Sample-based LRU/LFU examines candidate pools (N=5-10) without consuming 24 bytes per key for list pointers.',
      'Fragmentation ratio above 1.5 indicates memory allocator overhead; jemalloc mitigates fragmentation.',
      'maxmemory 0 allows unbounded memory growth until the OS kernel signals OOM.',
    ],
    relevantTerms: ['maxmemory', 'eviction'],
  },
  '/expiration': {
    title: 'Active & Passive Key Expiration',
    tips: [
      'RedisX uses active sampling cycles (10 times/second) to purge expired keys in the background.',
      'Passive expiration deletes expired keys on-demand whenever a read command touches them.',
      'Persistent keys (TTL = -1) stay in memory forever unless explicitly deleted or evicted.',
    ],
    relevantTerms: ['ttl', 'eviction'],
  },
  '/clients': {
    title: 'Client Connection Pools',
    tips: [
      'The single-threaded epoll reactor multiplexes thousands of client connections with zero thread contention.',
      'Inspect output buffer sizes to detect slow consumer clients that lag behind the server.',
      'Blocked clients (BLPOP, BRPOP) sleep in wakeup queues until data is pushed.',
    ],
    relevantTerms: ['pipelining', 'replica'],
  },
  '/slowlog': {
    title: 'Slow Command Analysis',
    tips: [
      'Commands appearing in the slowlog took longer than slowlog-log-slower-than microseconds.',
      'Never run O(N) commands like KEYS * in production; prefer SCAN with a sensible COUNT.',
      'The slowlog is kept entirely in memory and never written to disk.',
    ],
    relevantTerms: ['slowlog'],
  },
  '/persistence': {
    title: 'AOF & RDB Persistence Architecture',
    tips: [
      'RDB snapshots offer instantaneous cold restart times using 64-bit CRC verified binary files.',
      'AOF logs provide near-zero Recovery Point Objective (RPO) with appendfsync everysec.',
      'Trigger BGSAVE or BGREWRITEAOF to snapshot memory without blocking read/write execution.',
    ],
    relevantTerms: ['aof', 'rdb snapshot'],
  },
  '/replication': {
    title: 'Primary-Replica PSYNC Stream',
    tips: [
      'The circular 1 MB replication backlog allows disconnected replicas to recover with partial resync.',
      'Replication offset differences between primary and replicas indicate real-time replication lag.',
      'Use WAIT <numreplicas> <timeout> if your application requires synchronous durability guarantees.',
    ],
    relevantTerms: ['replication offset', 'replica'],
  },
  '/security': {
    title: 'Security & Access Control (ACL)',
    tips: [
      'Viewer role is strictly read-only and will block all write commands at the gateway level.',
      'Dangerous commands (FLUSHALL, SHUTDOWN, DEBUG) require explicit administrative unlocking.',
      'Audit log tracks every executed write operation with execution duration and user role.',
    ],
    relevantTerms: ['acl'],
  },
  '/config': {
    title: 'Runtime Server Configuration',
    tips: [
      'Runtime parameters can be inspected via CONFIG GET and updated on-the-fly without downtime.',
      'Critical parameters like maxmemory and slowlog thresholds take effect immediately.',
      'Export active configuration files for reproducible deployments.',
    ],
    relevantTerms: ['maxmemory', 'slowlog'],
  },
  '/metrics': {
    title: 'OpenMetrics & SRE Telemetry',
    tips: [
      'Native metrics server exports 12 OpenMetrics parameters on HTTP port 9121 for Prometheus scraping.',
      'Grafana dashboards on port 3000 display 10 SRE Golden Signal performance analytics.',
      'Inspect scrape overhead duration to ensure sub-millisecond metrics export latency.',
    ],
    relevantTerms: ['hit rate', 'pipelining'],
  },
  '/monitor': {
    title: 'Live Real-time Command Monitor',
    tips: [
      'MONITOR streams every single command received by the engine via WebSockets in real time.',
      'Caution: Heavy production traffic monitored continuously can reduce database throughput by up to 50%.',
      'Use pattern filters to isolate specific key namespaces or client connection IDs.',
    ],
    relevantTerms: ['slowlog'],
  },
  '/pubsub': {
    title: 'Pub/Sub Messaging Stream',
    tips: [
      'Pub/Sub messages are delivered ephemeral in memory with zero storage overhead.',
      'Use SUBSCRIBE for exact channel matching and PSUBSCRIBE for glob-pattern subscriptions.',
      'Subscribed clients enter subscriber mode and cannot execute regular keyspace read/write commands.',
    ],
    relevantTerms: ['pub/sub'],
  },
  '/learn': {
    title: 'Database Internals & Guided Labs',
    tips: [
      'Walk through the end-to-end event loop pipeline: TCP Socket -> epoll -> RESP parser -> keyspace.',
      'Step through interactive labs to observe atomic transactions, key TTL expirations, and failovers.',
      'Review C++20 data structures that eliminate heap fragmentation in low-latency systems.',
    ],
    relevantTerms: ['listpack', 'rehash', 'rdb snapshot'],
  },
  '/learn/tour': {
    title: 'Architecture Tour & Reactor Loop',
    tips: [
      'The event loop uses non-blocking Linux epoll to achieve sub-millisecond median latencies.',
      'Incoming TCP chunks are incrementally parsed using zero-copy RESP2/RESP3 streaming state machines.',
      'Commands execute single-threaded, eliminating mutex contention on in-memory hashtables.',
    ],
    relevantTerms: ['rehash', 'pipelining'],
  },
  '/learn/commands': {
    title: 'Command Reference & Complexities',
    tips: [
      'Prefer O(1) commands like GET, SET, HGET, and LPUSH for high-frequency low-latency code paths.',
      'Be careful with O(N) operations (e.g. KEYS, SMEMBERS on large sets) which block the epoll reactor.',
      'Use SCAN, HSCAN, and SSCAN to incrementally iterate over collections without latency stalls.',
    ],
    relevantTerms: ['pipelining', 'slowlog'],
  },
  '/learn/labs': {
    title: 'Guided Database Internals Labs',
    tips: [
      'Test multi-replica failovers and simulate network partitions with zero data loss.',
      'Experiment with active vs. passive key TTL expiration under heavy simulated write loads.',
      'Verify ACID transaction semantics with MULTI, EXEC, DISCARD, and WATCH optimistic locking.',
    ],
    relevantTerms: ['eviction', 'ttl', 'replication offset'],
  },
};

export const HelpDrawer: React.FC<HelpDrawerProps> = ({ isOpen, onClose, currentPath }) => {
  if (!isOpen) return null;

  const currentInfo = ROUTE_TIPS[currentPath] || ROUTE_TIPS['/dashboard'];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#0c1220] border-l border-[#1e293b] text-slate-100 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-[#1e293b] flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Context Guide & Tips</h2>
                <p className="text-[11px] text-slate-400">{currentInfo.title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              aria-label="Close Help Drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Practical Tips */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                Engineering Insights
              </h3>
              <div className="space-y-3">
                {currentInfo.tips.map((tip, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 leading-relaxed flex items-start gap-2.5"
                  >
                    <span className="h-5 w-5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Relevant Glossary Terms */}
            {currentInfo.relevantTerms.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-blue-400" />
                  Key Concepts On This Page
                </h3>
                <div className="flex flex-wrap gap-2">
                  {currentInfo.relevantTerms.map((term) => (
                    <div
                      key={term}
                      className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300"
                    >
                      <span>{term}</span>
                      <InfoTip term={term} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Link into Architecture Tour */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-red-950/30 border border-red-500/20">
              <h4 className="text-xs font-bold text-white mb-1">Want to explore engine internals?</h4>
              <p className="text-[11px] text-slate-400 mb-3">
                Visit the interactive Architecture Tour to inspect the non-blocking epoll reactor pipeline.
              </p>
              <a
                href="/learn/tour"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition"
              >
                <span>Launch Architecture Tour</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#1e293b] bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-500">
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('redisx_restart_tour'));
                onClose();
              }}
              className="text-xs text-red-400 hover:text-red-300 font-medium hover:underline transition"
            >
              Replay Onboarding Tour
            </button>
            <button
              onClick={onClose}
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1 rounded bg-slate-800 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
