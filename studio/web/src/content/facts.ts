export const repository = 'https://github.com/PrashantBhushan-repo/Distributed-In-Memory-Database-Engine';
export interface Fact { value: string | null; source: string; }
export const facts = {
  language: { value: 'C++20', source: 'CMakeLists.txt: CMAKE_CXX_STANDARD 20' },
  version: { value: 'v0.1.0', source: 'CMakeLists.txt: project VERSION 0.1.0' },
  areas: { value: '16', source: 'studio/web/src/App.tsx: sixteen product areas, Learn grouped as one' },
  differential: { value: null, source: 'tests/compat: no aggregate verified result supplied' },
  fuzzing: { value: null, source: 'tests/fuzz: no recorded execution duration supplied' },
  compatibility: { value: null, source: 'tests/compat: no current verified command count supplied' },
  throughput: { value: null, source: 'benchmarks: no reproducible measured report selected' },
  safety: { value: null, source: 'studio/gateway/src/safety/engine.ts: no current matrix result supplied' },
  recovery: { value: null, source: 'tests/integration: no current kill-point report supplied' },
} satisfies Record<string, Fact>;
export const compatibility = [
  { name: 'redis-cli', verified: false }, { name: 'redis-py', verified: false },
  { name: 'ioredis', verified: false }, { name: 'Prometheus', verified: false },
  { name: 'Grafana', verified: false }, { name: 'Docker', verified: false },
];
export const evidence = [
  { title: 'Differential tests', fact: facts.differential, description: 'Compare command replies against Redis.', path: '/tree/main/tests/compat' },
  { title: 'Parser fuzzing', fact: facts.fuzzing, description: 'Probe malformed inputs and protocol boundaries.', path: '/tree/main/tests/fuzz' },
  { title: 'Client compatibility', fact: facts.compatibility, description: 'Inspect the compatibility test suite.', path: '/tree/main/tests/compat' },
  { title: 'Reproducible benchmarks', fact: facts.throughput, description: 'Read the workloads before judging the numbers.', path: '/tree/main/benchmarks' },
  { title: 'Command safety', fact: facts.safety, description: 'Review the gateway command policy.', path: '/blob/main/studio/gateway/src/safety/engine.ts' },
  { title: 'Recovery tests', fact: facts.recovery, description: 'Explore persistence and recovery scenarios.', path: '/tree/main/tests/integration' },
];
export const demo = {
  source: 'Illustrative, browser-local sample data. These values are not engine benchmarks.',
  stats: [{ label: 'Total keys', value: '1,850', detail: 'Across your keyspace' }, { label: 'Memory used', value: '46.2', unit: 'MB', detail: 'Of 256 MB allocated' }, { label: 'Commands / sec', value: '12,408', detail: 'Illustrative workload' }, { label: 'Connected clients', value: '8', detail: 'Sample connections' }],
  keys: [{ name: 'user:1', type: 'string', ttl: 'No expiry', value: 'Prashant' }, { name: 'session:8f2a', type: 'hash', ttl: '24m', value: '{ user: "Prashant", active: true }' }, { name: 'queue:emails', type: 'list', ttl: 'No expiry', value: '[ "welcome", "receipt" ]' }, { name: 'leaderboard:weekly', type: 'zset', ttl: '6d', value: 'Prashant → 420' }],
  chart: [32, 37, 34, 48, 42, 59, 53, 49, 67, 57, 74, 62, 68, 54, 73, 66, 84, 71, 80, 69, 88, 78, 91, 82, 95, 85, 99, 89],
};
