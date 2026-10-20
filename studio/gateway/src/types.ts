import { z } from 'zod';

export type UserRole = 'viewer' | 'operator' | 'admin';

export interface UserContext {
  username: string;
  role: UserRole;
}

export interface ConnectionStatus {
  capabilitiesState?: 'pending' | 'ready' | 'error';
  tlsEnabled?: boolean;
  status: 'connected' | 'connecting' | 'error' | 'demo';
  host: string;
  port: number;
  isDemo: boolean;
  capabilities: string[];
  latencyMs: number;
  lastConnectedAt?: string;
  error?: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  username: string;
  role: UserRole;
  command: string;
  args: string[];
  keysTouched: string[];
  durationMs: number;
  status: 'success' | 'blocked' | 'error';
  error?: string;
}

export type RespKind = 'string' | 'integer' | 'array' | 'table' | 'error' | 'null' | 'status';

export interface CommandExecutionResult {
  reply: any;
  kind: RespKind;
  truncated: boolean;
  durationMs: number;
  rawCommand: string;
}

export interface ParsedRedisInfo {
  server: {
    redis_version: string;
    uptime_in_seconds: number;
    tcp_port: number;
    role: string;
    os?: string;
    process_id?: number;
    redis_mode?: string;
  };
  clients: {
    connected_clients: number;
    blocked_clients: number;
    maxclients: number;
  };
  memory: {
    used_memory: number;
    used_memory_human: string;
    used_memory_peak: number;
    maxmemory: number;
    maxmemory_policy: string;
  };
  stats: {
    total_connections_received: number;
    total_commands_processed: number;
    instantaneous_ops_per_sec: number;
    keyspace_hits: number;
    keyspace_misses: number;
    hit_rate: number;
    evicted_keys?: number;
    expired_keys?: number;
    rejected_connections?: number;
    total_net_input_bytes?: number;
    total_net_output_bytes?: number;
  };
  replication: {
    role: string;
    connected_slaves: number;
    master_repl_offset: number;
    repl_backlog_size: number;
  };
  persistence: {
    rdb_last_bgsave_status: string;
    rdb_changes_since_last_save: number;
    aof_enabled: boolean;
  };
  keyspace: Record<string, { keys: number; expires: number; avg_ttl: number }>;
}

export interface KeySummary {
  name: string;
  type: 'string' | 'list' | 'hash' | 'set' | 'zset' | 'stream' | 'unknown';
  ttl: number; // in seconds (-1 = persist, -2 = expired/not found)
  ttlMs: number; // in milliseconds (-1 = persist, -2 = expired/not found)
  encoding?: string;
  size?: number; // length or member count
  memoryBytes?: number;
}

export interface KeyTreeNode {
  name: string;
  fullPath: string;
  isLeaf: boolean;
  type?: string;
  keyCount: number;
  hasChildren: boolean;
  ttl?: number;
  memoryBytes?: number;
}

export interface MetricSample {
  timestamp: number;
  opsPerSec: number;
  hitRate: number;
  usedMemory: number;
  usedMemoryHuman: string;
  maxMemory: number;
  memoryPercent: number;
  connectedClients: number;
  blockedClients: number;
  totalKeys: number;
  evictedKeysPerSec: number;
  expiredKeysPerSec: number;
  networkInputBytesPerSec: number;
  networkOutputBytesPerSec: number;
  networkAvailable?: boolean;
  networkScope?: 'engine' | 'gateway';
  p99LatencyMs: number | null;
  infoLatencyMs?: number;
  replicationOffsetBytes?: number;
  p50LatencyMs?: number;
  p90LatencyMs?: number;
  opsByCommand?: Record<string, number>;
  replicationLagSeconds?: number;
  replicationLagBytes?: number;
  rehashActive?: boolean;
}

export interface HealthIssue {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  fixSuggestion: string;
  deepLink: string;
}

export interface HealthSummary {
  status: 'healthy' | 'warning' | 'critical';
  topIssue?: HealthIssue;
  thingsToLookAt: HealthIssue[];
  checkedAt: string;
}

export type KeyFormatHint = 'json' | 'hex' | 'base64' | 'text';

export interface KeyDetailResponse {
  name: string;
  type: 'string' | 'list' | 'hash' | 'set' | 'zset';
  encoding: string;
  memoryBytes: number;
  ttl: number; // in seconds (-1 = infinite, -2 = not found)
  ttlMs: number;
  length: number;
  value?: string;
  formatHint?: KeyFormatHint;
  listItems?: Array<{ index: number; value: string }>;
  listPage?: { page: number; limit: number; total: number; hasMore: boolean };
  hashEntries?: Array<{ field: string; value: string }>;
  hashPage?: { page: number; limit: number; total: number; hasMore: boolean; nextCursor?: number };
  setMembers?: string[];
  setPage?: { page: number; limit: number; total: number; hasMore: boolean; nextCursor?: number };
  zsetMembers?: Array<{ rank: number; member: string; score: number }>;
  zsetPage?: { page: number; limit: number; total: number; hasMore: boolean };
}

export interface MutationResult {
  success: boolean;
  command: string;
  commands?: string[];
  message?: string;
  key?: string;
  affected?: number;
}

export interface CommandMeta {
  name: string;
  summary: string;
  syntax: string;
  group: 'string' | 'list' | 'hash' | 'set' | 'zset' | 'generic' | 'server' | 'transactions' | 'pubsub' | 'replication' | 'security';
  complexity: string;
  arity: number;
  flags: string[];
  example: string;
  dangerous?: boolean;
  dangerReason?: string;
}

export interface PipelineReplyItem {
  command: string;
  reply: any;
  kind: RespKind;
  durationMs: number;
  error?: string;
}

export interface PipelineResult {
  replies: PipelineReplyItem[];
  totalDurationMs: number;
  executedCount: number;
}

// ==========================================
// Step 7: Memory & Eviction, Expiration Types
// ==========================================

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

export interface MemoryOverviewResponse {
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

export interface TopKeyItem {
  name: string;
  type: string;
  memoryBytes: number;
  encoding?: string;
  ttl: number;
}

export interface TopKeysResponse {
  top_keys: TopKeyItem[];
  sampled_keys: number;
  capped: boolean;
}

export interface MemorySimulateResponse {
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

export interface ExpiringKeyItem {
  name: string;
  type: string;
  ttl: number; // in seconds
  ttlMs: number; // in milliseconds
  expiresAt: string;
  memoryBytes?: number;
}

export interface ExpirationSoonestResponse {
  keys: ExpiringKeyItem[];
  totalWithTtl: number;
  totalSampled: number;
}

export interface HistogramBucket {
  label: string;
  range: string;
  count: number;
  percentage: number;
}

export interface ExpirationHistogramResponse {
  buckets: HistogramBucket[];
  totalSampled: number;
  withTtlCount: number;
  noTtlCount: number;
}

export interface ExpirationStatsTimelineItem {
  timestamp: number;
  timeLabel: string;
  expiredRate: number;
  evictedRate: number;
  usedMemory: number;
}

export interface ExpirationStatsResponse {
  expired_keys: number;
  evicted_keys: number;
  expired_rate: number;
  evicted_rate: number;
  active_expire_enabled: boolean;
  timeline: ExpirationStatsTimelineItem[];
}

export interface BulkSetTtlResponse {
  success: boolean;
  pattern: string;
  ttl: number;
  matchedCount: number;
  sample: string[];
  command: string;
  dryRun: boolean;
}

// ==========================================
// Step 8: Clients & Slow Log Types
// ==========================================

export interface ClientInfoItem {
  id: string;
  addr: string;
  name: string;
  age: number; // seconds
  idle: number; // seconds
  db: number;
  cmd: string;
  flags: string;
  qbuf: number;
  qbufFree: number;
  obl: number;
  oll: number;
  omem: number;
  events: string;
  user: string;
  isBlocked: boolean;
  isSubscribed: boolean;
  isHighBuffer: boolean;
  isHighIdle: boolean;
}

export interface ClientsResponse {
  clients: ClientInfoItem[];
  total: number;
  blockedCount: number;
  subscribedCount: number;
  maxClients: number;
  highBufferCount: number;
  highIdleCount: number;
}

export interface SlowLogCauseHint {
  command: string;
  pattern: string;
  cause: string;
  fix: string;
  alternative: string;
  severity: 'warning' | 'critical';
}

export interface SlowLogItem {
  id: number;
  timestamp: number;
  timestampIso: string;
  durationUs: number; // microseconds
  durationMs: number; // milliseconds
  command: string;
  args: string[];
  clientAddr: string;
  clientName: string;
  causeHint?: SlowLogCauseHint;
}

export interface SlowLogResponse {
  entries: SlowLogItem[];
  count: number;
  len: number;
  thresholdUs: number;
  thresholdMs: number;
}

export interface SlowLogGroupedEntry {
  command: string;
  count: number;
  avgDurationUs: number;
  avgDurationMs: number;
  maxDurationUs: number;
  maxDurationMs: number;
  totalDurationMs: number;
  causeHint?: SlowLogCauseHint;
  samples: SlowLogItem[];
}

// ==========================================
// Step 9: Persistence & Replication Types
// ==========================================

export interface SaveTimelineItem {
  id: string;
  type: 'rdb' | 'aof';
  timestamp: number;
  timestampIso: string;
  durationSec: number;
  sizeBytes: number;
  status: 'ok' | 'err';
  keysCount?: number;
}

export interface PersistenceInfoResponse {
  loading: boolean;
  rdbLastSaveTime: number;
  rdbLastSaveTimeIso: string;
  rdbLastBgsaveStatus: 'ok' | 'err' | 'unknown';
  rdbLastBgsaveTimeSec: number;
  rdbCurrentBgsaveTimeSec: number;
  rdbBgsaveInProgress: boolean;
  rdbChangesSinceLastSave: number;
  rdbSizeBytes: number;

  aofEnabled: boolean;
  aofRewriteInProgress: boolean;
  aofRewriteScheduled: boolean;
  aofLastRewriteTimeSec: number;
  aofCurrentRewriteTimeSec: number;
  aofLastBgrewriteStatus: 'ok' | 'err' | 'unknown';
  aofCurrentSize: number;
  aofBaseSize: number;
  aofBufferDelay: number;
  aofFsyncPolicy: 'always' | 'everysec' | 'no';

  saveTimeline: SaveTimelineItem[];
}

export interface SnapshotRecordCount {
  type: string;
  count: number;
  estimatedBytes: number;
  percentage: number;
}

export interface SnapshotInspectResponse {
  valid: boolean;
  format: string; // e.g. "RDB"
  version: number; // e.g. 11
  crcValid: boolean;
  crcExpected?: string;
  crcActual?: string;
  fileSizeBytes: number;
  filePath: string;
  totalKeys: number;
  auxFields: {
    redisVersion: string;
    redisBits: number;
    ctime: number;
    ctimeIso: string;
    usedMemoryBytes: number;
  };
  recordCounts: SnapshotRecordCount[];
  error?: string;
}

export interface ReplicaNodeInfo {
  id: string;
  ip: string;
  port: number;
  state: 'online' | 'wait_bgsave' | 'send_bulk';
  offset: number;
  lagSeconds: number;
  lagBytes: number;
  lastAckSecondsAgo: number;
  syncType: 'partial_resync' | 'full_sync';
}

export interface ReplicationTopologyResponse {
  role: 'master' | 'slave';
  connectedSlaves: number;
  masterReplId: string;
  masterReplId2: string;
  masterReplOffset: number;
  secondReplOffset: number;
  replBacklogActive: boolean;
  replBacklogSize: number;
  replBacklogFirstByteOffset: number;
  replBacklogHistlen: number;
  backlogCoverageSeconds: number;

  // if slave:
  masterHost?: string;
  masterPort?: number;
  masterLinkStatus?: 'up' | 'down';
  masterLastIoSecondsAgo?: number;
  masterSyncInProgress?: boolean;

  replicas: ReplicaNodeInfo[];
}

export interface PreflightCheckItem {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ReplicationPreflightResponse {
  action: 'replicaof' | 'promote';
  targetHost?: string;
  targetPort?: number;
  replicaCaughtUp: boolean;
  maxLagBytes: number;
  maxLagSeconds: number;
  writesInFlight: number;
  dataLossRisk: 'none' | 'low' | 'high';
  checklist: PreflightCheckItem[];
  explanation: string;
}

// ==========================================
// Step 10: Security & ACL, Configuration Types
// ==========================================

export interface AclCategoryInfo {
  name: string;
  description: string;
}

export interface AclRuleObject {
  username: string;
  enabled: boolean;
  password?: string;
  nopass?: boolean;
  keys: string[];
  channels: string[];
  categories: {
    allowed: string[];
    denied: string[];
  };
  commands: {
    allowed: string[];
    denied: string[];
  };
}

export interface AclUserItem {
  username: string;
  enabled: boolean;
  hasPassword: boolean;
  isNoPass: boolean;
  passwordCount: number;
  keysSummary: string;
  channelsSummary: string;
  allowedCategories: string[];
  deniedCategories: string[];
  allowedCommands: string[];
  deniedCommands: string[];
  rawRule: string;
  isDefault: boolean;
}

export interface AclTestResult {
  user: string;
  command: string;
  allowed: boolean;
  reason: string;
  decidingRule: string;
}

export interface SecurityStatusResponse {
  authRequired: boolean;
  tlsEnabled: boolean;
  defaultUserState: {
    enabled: boolean;
    hasPassword: boolean;
    isDangerousAllowed: boolean;
    summary: string;
  };
  recommendations: string[];
}

export interface ConfigParamMeta {
  name: string;
  group: string;
  type: 'boolean' | 'integer' | 'string' | 'enum' | 'bytes';
  default: any;
  min?: number;
  max?: number;
  enumOptions?: string[];
  unit?: string;
  mutableAtRuntime: boolean;
  description: string;
}

export interface ConfigParamItem extends ConfigParamMeta {
  currentValue: any;
  isChangedFromDefault: boolean;
}

export interface ConfigRollbackItem {
  parameter: string;
  previousValue: any;
  timestamp: number;
}

// ==========================================
// Step 11: Metrics, Monitor & Pub/Sub Types
// ==========================================

export interface MonitorFilter {
  command?: string;
  client?: string;
  keyPattern?: string;
}

export interface MonitorEntry {
  id: string;
  timestamp: number;
  timeStr: string;
  db: number;
  client: string;
  command: string;
  args: string[];
  raw: string;
}

export interface PubSubChannelItem {
  name: string;
  subscribers: number;
}

export interface PubSubChannelsResponse {
  channels: PubSubChannelItem[];
  totalChannels: number;
  patternCount: number;
}

export interface PubSubMessageEvent {
  type: 'message' | 'pmessage';
  channel: string;
  pattern?: string;
  payload: string;
  timestamp: number;
  timeStr: string;
}

// ==========================================
// Step 12: Data Types Playground Types
// ==========================================

export type PlaygroundDataType = 'string' | 'list' | 'hash' | 'set' | 'zset' | 'none';

export type PlaygroundEncoding =
  | 'embstr'
  | 'raw'
  | 'int'
  | 'listpack'
  | 'quicklist'
  | 'intset'
  | 'hashtable'
  | 'skiplist'
  | 'unknown';

export interface StringStructure {
  type: 'string';
  encoding: 'embstr' | 'raw' | 'int';
  value: string;
  length: number;
  sdsType: 'sdshdr8' | 'sdshdr16' | 'sdshdr32' | 'sdshdr64';
  sdsLen: number;
  sdsAlloc: number;
  isNumeric: boolean;
  numericValue?: number;
  contiguousWithRobj: boolean;
  explanation: string;
}

export interface ListStructure {
  type: 'list';
  encoding: 'listpack' | 'quicklist';
  totalEntries: number;
  entries: string[];
  listpackThreshold: number;
  byteThreshold: number;
  quicklistNodes?: Array<{
    nodeIndex: number;
    entries: string[];
    sizeBytes: number;
  }>;
  explanation: string;
}

export interface HashStructure {
  type: 'hash';
  encoding: 'listpack' | 'hashtable';
  fieldCount: number;
  fields: Array<{ field: string; value: string }>;
  threshold: number;
  bucketCount?: number;
  bucketOccupancy?: number;
  buckets?: Array<{ bucketIndex: number; items: Array<{ field: string; value: string }> }>;
  explanation: string;
}

export interface SetStructure {
  type: 'set';
  encoding: 'intset' | 'hashtable';
  memberCount: number;
  members: Array<string | number>;
  elementWidthBits?: 16 | 32 | 64;
  threshold: number;
  reason?: string;
  explanation: string;
}

export interface ZSetStructure {
  type: 'zset';
  encoding: 'listpack' | 'skiplist';
  count: number;
  items: Array<{ member: string; score: number; level?: number }>;
  threshold: number;
  maxLevel?: number;
  explanation: string;
}

export type PlaygroundStructure =
  | StringStructure
  | ListStructure
  | HashStructure
  | SetStructure
  | ZSetStructure;

export interface PlaygroundInspectResponse {
  key: string;
  exists: boolean;
  type: PlaygroundDataType;
  encoding: PlaygroundEncoding;
  length: number;
  memoryBytes: number;
  ttl: number;
  structure?: PlaygroundStructure;
  encodingAvailable: boolean;
  sandboxDb: number;
}

export interface PlaygroundExecRequest {
  command: string;
  db?: number;
}

export interface PlaygroundExecResponse {
  success: boolean;
  command: string;
  reply: any;
  rawReply?: string;
  durationMs: number;
  touchedKeys: string[];
  inspectedKey?: string;
  inspection?: PlaygroundInspectResponse;
}

export interface PlaygroundResetPreviewResponse {
  sandboxDb: number;
  count: number;
  keys: string[];
}

export interface PlaygroundResetResponse {
  success: boolean;
  sandboxDb: number;
  count: number;
  command: string;
}
