export interface MemoryTypeBreakdown {
  type: string;
  count: number;
  bytes: number;
  percentage: number;
}

export interface MemoryPrefixBreakdown {
  prefix: string;
  count: number;
  bytes: number;
  percentage: number;
}

export interface MemoryOverview {
  used_memory: number;
  used_memory_peak: number;
  maxmemory: number;
  maxmemory_policy: string;
  mem_fragmentation_ratio: number;
  evicted_keys: number;
  per_type: MemoryTypeBreakdown[];
  per_prefix: MemoryPrefixBreakdown[];
  estimated: boolean;
  sampled_keys: number;
}

export interface TopKey {
  name: string;
  type: string;
  memoryBytes: number;
  encoding?: string;
  ttl: number;
}

export interface EvictionSimulationResult {
  targetMaxmemory: number;
  targetPolicy: string;
  currentUsedMemory: number;
  deficitBytes: number;
  keysAtRisk: number;
  shareAtRiskPercent: number;
  writesBlocked: boolean;
  summary: string;
  method: string;
  equivalentCommand: string[];
}

export interface EvictionPolicyInfo {
  id: string;
  name: string;
  description: string;
  tag: string;
  isVolatile: boolean;
}

export const EVICTION_POLICIES: EvictionPolicyInfo[] = [
  {
    id: 'noeviction',
    name: 'noeviction',
    description: 'Returns OOM errors on write commands when memory limit is reached. Never deletes any keys.',
    tag: 'Strict Storage / No Data Loss',
    isVolatile: false,
  },
  {
    id: 'allkeys-lru',
    name: 'allkeys-lru',
    description: 'Evicts least recently used keys out of all keys in the database.',
    tag: 'Recommended General Cache',
    isVolatile: false,
  },
  {
    id: 'allkeys-lfu',
    name: 'allkeys-lfu',
    description: 'Evicts least frequently accessed keys out of all keys using logarithmic access counter.',
    tag: 'Power-Law / Zipfian Cache',
    isVolatile: false,
  },
  {
    id: 'allkeys-random',
    name: 'allkeys-random',
    description: 'Evicts random keys across the entire keyspace.',
    tag: 'Uniform Access Patterns',
    isVolatile: false,
  },
  {
    id: 'volatile-lru',
    name: 'volatile-lru',
    description: 'Evicts least recently used keys among those with an expiration (TTL) set.',
    tag: 'Mixed Store & Cache',
    isVolatile: true,
  },
  {
    id: 'volatile-lfu',
    name: 'volatile-lfu',
    description: 'Evicts least frequently used keys among those with an expiration (TTL) set.',
    tag: 'Volatile with Access Frequency',
    isVolatile: true,
  },
  {
    id: 'volatile-random',
    name: 'volatile-random',
    description: 'Evicts random keys among those with an expiration set.',
    tag: 'Volatile Uniform Eviction',
    isVolatile: true,
  },
  {
    id: 'volatile-ttl',
    name: 'volatile-ttl',
    description: 'Evicts keys with the shortest remaining time to live (nearest TTL).',
    tag: 'Time-Decaying Workloads',
    isVolatile: true,
  },
];
