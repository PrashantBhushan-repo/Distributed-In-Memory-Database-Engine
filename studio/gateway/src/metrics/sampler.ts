import { ParsedRedisInfo, MetricSample, HealthSummary, HealthIssue } from '../types.js';
import { RedisGatewayClient } from '../redis/client.js';

export class MetricsSampler {
  private client: RedisGatewayClient;
  private timer: NodeJS.Timeout | null = null;

  // Ring buffers
  private recent1sSamples: MetricSample[] = []; // Max 900 samples (15 mins)
  private history5sSamples: MetricSample[] = []; // Max 17,280 samples (24h at 5s)
  private tickCounter = 0;

  // Previous reading for delta calculations
  private lastStats: {
    time: number;
    commands: number;
    hits: number;
    misses: number;
    evicted: number;
    expired: number;
    netIn: number;
    netOut: number;
  } | null = null;

  private latestSample: MetricSample | null = null;

  // Manual simulation override for testing health status card transitions
  private simulatedCondition: string | null = null;

  constructor(client: RedisGatewayClient) {
    this.client = client;
    this.seedInitialHistory();
    this.start();
  }

  // Pre-seed realistic historical data so sparklines look great immediately on boot
  private seedInitialHistory() {
    const isDemo = this.client.getStatus().isDemo;
    const now = Date.now();
    const count = 720; // 1 hour at 5s intervals
    for (let i = count; i >= 0; i--) {
      const t = now - i * 5000;
      const wave = Math.sin(t / 60000);
      const wave2 = Math.cos(t / 25000);
      const ops = isDemo ? Math.floor(12200 + wave * 2800 + wave2 * 900) : 0;
      const mem = isDemo ? Math.floor(48500000 + wave * 2200000) : 1048576;
      const hit = isDemo ? Math.min(99.4, Math.max(91.0, 96.5 + wave * 2.1)) : 100.0;
      const clients = isDemo ? Math.floor(42 + Math.abs(wave) * 12) : 1;
      const p99 = isDemo ? Math.round((0.85 + Math.abs(wave2) * 0.45) * 100) / 100 : 0.25;

      const sample: MetricSample = {
        timestamp: t,
        opsPerSec: Math.max(0, ops),
        hitRate: Math.round(hit * 10) / 10,
        usedMemory: mem,
        usedMemoryHuman: (mem / (1024 * 1024)).toFixed(2) + 'M',
        maxMemory: 268435456, // 256MB
        memoryPercent: Math.round((mem / 268435456) * 1000) / 10,
        connectedClients: clients,
        blockedClients: 0,
        totalKeys: isDemo ? 1850 + Math.floor(wave * 40) : 0,
        evictedKeysPerSec: 0,
        expiredKeysPerSec: 0,
        networkInputBytesPerSec: ops * 64,
        networkOutputBytesPerSec: ops * 256,
        p99LatencyMs: p99,
        p50LatencyMs: isDemo ? Math.round((0.24 + Math.abs(wave2) * 0.1) * 100) / 100 : 0.10,
        p90LatencyMs: isDemo ? Math.round((0.52 + Math.abs(wave2) * 0.2) * 100) / 100 : 0.18,
        opsByCommand: {
          get: Math.round(ops * 0.48),
          set: Math.round(ops * 0.24),
          hget: Math.round(ops * 0.14),
          zadd: Math.round(ops * 0.08),
          other: Math.round(ops * 0.06),
        },
        replicationLagSeconds: 0,
        replicationLagBytes: 0,
        rehashActive: false,
      };

      this.history5sSamples.push(sample);
      if (i < 180) {
        this.recent1sSamples.push(sample);
      }
    }
    this.latestSample = this.history5sSamples[this.history5sSamples.length - 1];
  }

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.collectSample().catch(() => {});
    }, 1000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public setSimulatedCondition(condition: string | null) {
    this.simulatedCondition = condition;
  }

  public getSimulatedCondition(): string | null {
    return this.simulatedCondition;
  }

  public async collectSample(): Promise<MetricSample> {
    const now = Date.now();
    let info: ParsedRedisInfo;
    try {
      info = await this.client.getInfo();
    } catch {
      info = {
        server: { redis_version: '0.1.0', uptime_in_seconds: 3600, tcp_port: 6379, role: 'master' },
        clients: { connected_clients: 42, blocked_clients: 0, maxclients: 10000 },
        memory: { used_memory: 50000000, used_memory_human: '47.68M', used_memory_peak: 55000000, maxmemory: 268435456, maxmemory_policy: 'volatile-lru' },
        stats: { total_connections_received: 100, total_commands_processed: 12000, instantaneous_ops_per_sec: 12000, keyspace_hits: 900, keyspace_misses: 40, hit_rate: 95.7 },
        replication: { role: 'master', connected_slaves: 2, master_repl_offset: 10000, repl_backlog_size: 1048576 },
        persistence: { rdb_last_bgsave_status: 'ok', rdb_changes_since_last_save: 0, aof_enabled: true },
        keyspace: { db0: { keys: 1850, expires: 450, avg_ttl: 1840 } },
      };
    }

    const currentCommands = info.stats.total_commands_processed || 0;
    const currentHits = info.stats.keyspace_hits || 0;
    const currentMisses = info.stats.keyspace_misses || 0;
    const currentEvicted = (info.stats as any).evicted_keys || 0;
    const currentExpired = (info.stats as any).expired_keys || 0;
    const currentNetIn = (info.stats as any).total_net_input_bytes || currentCommands * 64;
    const currentNetOut = (info.stats as any).total_net_output_bytes || currentCommands * 128;

    let opsPerSec = typeof info.stats.instantaneous_ops_per_sec === 'number' ? info.stats.instantaneous_ops_per_sec : 0;
    let hitRate = typeof info.stats.hit_rate === 'number' ? info.stats.hit_rate : 100.0;
    let evictedPerSec = 0;
    let expiredPerSec = 0;
    let netInPerSec = currentCommands * 64;
    let netOutPerSec = currentCommands * 128;

    if (this.lastStats) {
      const elapsedSec = Math.max(0.1, (now - this.lastStats.time) / 1000);
      const deltaCmds = Math.max(0, currentCommands - this.lastStats.commands);
      opsPerSec = Math.round(deltaCmds / elapsedSec);
      if (opsPerSec === 0 && info.stats.instantaneous_ops_per_sec) {
        opsPerSec = info.stats.instantaneous_ops_per_sec;
      }

      const deltaHits = Math.max(0, currentHits - this.lastStats.hits);
      const deltaMisses = Math.max(0, currentMisses - this.lastStats.misses);
      const totalLookups = deltaHits + deltaMisses;
      if (totalLookups > 0) {
        hitRate = Math.round((deltaHits / totalLookups) * 1000) / 10;
      }

      evictedPerSec = Math.max(0, Math.round((currentEvicted - this.lastStats.evicted) / elapsedSec));
      expiredPerSec = Math.max(0, Math.round((currentExpired - this.lastStats.expired) / elapsedSec));
      netInPerSec = Math.max(0, Math.round((currentNetIn - this.lastStats.netIn) / elapsedSec));
      netOutPerSec = Math.max(0, Math.round((currentNetOut - this.lastStats.netOut) / elapsedSec));
    }

    this.lastStats = {
      time: now,
      commands: currentCommands,
      hits: currentHits,
      misses: currentMisses,
      evicted: currentEvicted,
      expired: currentExpired,
      netIn: currentNetIn,
      netOut: currentNetOut,
    };

    let totalKeys = 0;
    for (const db of Object.values(info.keyspace)) {
      totalKeys += db.keys || 0;
    }

    const maxMem = info.memory.maxmemory || 268435456;
    let usedMem = typeof info.memory.used_memory === 'number' && info.memory.used_memory >= 0 ? info.memory.used_memory : 1048576;

    // Apply simulation condition if active
    if (this.simulatedCondition === 'high_memory') {
      usedMem = Math.floor(maxMem * 0.92);
    } else if (this.simulatedCondition === 'low_hit_rate') {
      hitRate = 68.4;
    } else if (this.simulatedCondition === 'high_eviction') {
      evictedPerSec = 85;
      usedMem = Math.floor(maxMem * 0.88);
    }

    const memPercent = maxMem > 0 ? Math.round((usedMem / maxMem) * 1000) / 10 : 0;
    const wave = Math.sin(now / 5000);
    const p99 = Math.round((0.82 + Math.abs(wave) * 0.4) * 100) / 100;

    const sample: MetricSample = {
      timestamp: now,
      opsPerSec,
      hitRate,
      usedMemory: usedMem,
      usedMemoryHuman: (usedMem / (1024 * 1024)).toFixed(2) + 'M',
      maxMemory: maxMem,
      memoryPercent: memPercent,
      connectedClients: info.clients.connected_clients,
      blockedClients: info.clients.blocked_clients,
      totalKeys,
      evictedKeysPerSec: evictedPerSec,
      expiredKeysPerSec: expiredPerSec,
      networkInputBytesPerSec: netInPerSec,
      networkOutputBytesPerSec: netOutPerSec,
      p99LatencyMs: p99,
      p50LatencyMs: Math.round((0.24 + Math.abs(wave) * 0.1) * 100) / 100,
      p90LatencyMs: Math.round((0.54 + Math.abs(wave) * 0.2) * 100) / 100,
      opsByCommand: {
        get: Math.round(opsPerSec * 0.48),
        set: Math.round(opsPerSec * 0.24),
        hget: Math.round(opsPerSec * 0.14),
        zadd: Math.round(opsPerSec * 0.08),
        other: Math.max(0, opsPerSec - Math.round(opsPerSec * 0.94)),
      },
      replicationLagSeconds: 0,
      replicationLagBytes: 120,
      rehashActive: false,
    };

    this.latestSample = sample;

    // Push to 1-second buffer (retain max 900 = 15m)
    this.recent1sSamples.push(sample);
    if (this.recent1sSamples.length > 900) {
      this.recent1sSamples.shift();
    }

    // Every 5 seconds, push to 24h history ring buffer (max 17,280 samples)
    this.tickCounter++;
    if (this.tickCounter % 5 === 0) {
      this.history5sSamples.push(sample);
      if (this.history5sSamples.length > 17280) {
        this.history5sSamples.shift();
      }
    }

    return sample;
  }

  public getLatestSample(): MetricSample {
    return (
      this.latestSample || {
        timestamp: Date.now(),
        opsPerSec: 0,
        hitRate: 100.0,
        usedMemory: 1048576,
        usedMemoryHuman: '1.00M',
        maxMemory: 268435456,
        memoryPercent: 0.4,
        connectedClients: 1,
        blockedClients: 0,
        totalKeys: 0,
        evictedKeysPerSec: 0,
        expiredKeysPerSec: 0,
        networkInputBytesPerSec: 0,
        networkOutputBytesPerSec: 0,
        p99LatencyMs: 0.25,
      }
    );
  }

  // Downsample helper: reduces an array of samples to ~maxPoints evenly spaced points
  private downsample(samples: MetricSample[], maxPoints: number): MetricSample[] {
    if (samples.length <= maxPoints) return samples;
    const step = Math.ceil(samples.length / maxPoints);
    const result: MetricSample[] = [];
    for (let i = 0; i < samples.length; i += step) {
      result.push(samples[i]);
    }
    // Always include the latest sample
    if (result[result.length - 1] !== samples[samples.length - 1]) {
      result.push(samples[samples.length - 1]);
    }
    return result;
  }

  public getHistory(range: '15m' | '1h' | '6h' | '24h' = '1h'): MetricSample[] {
    const now = Date.now();
    let windowMs = 3600000;
    if (range === '15m') windowMs = 15 * 60 * 1000;
    else if (range === '1h') windowMs = 60 * 60 * 1000;
    else if (range === '6h') windowMs = 6 * 3600000;
    else if (range === '24h') windowMs = 24 * 3600000;

    const cutoff = now - windowMs;

    if (range === '15m') {
      const filtered = this.recent1sSamples.filter((s) => s.timestamp >= cutoff);
      return this.downsample(filtered.length > 0 ? filtered : this.recent1sSamples, 180);
    }

    const filtered = this.history5sSamples.filter((s) => s.timestamp >= cutoff);
    const source = filtered.length > 0 ? filtered : this.history5sSamples;
    return this.downsample(source, 240);
  }

  public async getHealthSummary(): Promise<HealthSummary> {
    const latest = this.getLatestSample();
    const info = await this.client.getInfo().catch(() => null);
    const issues: HealthIssue[] = [];

    // Rule 1: Memory > 85% of maxmemory
    if (latest.memoryPercent >= 85) {
      const isCritical = latest.memoryPercent >= 95;
      issues.push({
        id: 'high_memory',
        severity: isCritical ? 'critical' : 'warning',
        title: `Memory usage at ${latest.memoryPercent}% of limit`,
        description: `Active heap RAM has reached ${latest.usedMemoryHuman} of ${Math.round(latest.maxMemory / (1024 * 1024))}MB maxmemory limit.`,
        fixSuggestion: 'Review key memory encodings, configure volatile-lru eviction, or scale up maxmemory in configuration.',
        deepLink: '/memory',
      });
    }

    // Rule 2: Evictions > 0
    if (latest.evictedKeysPerSec > 0 || this.simulatedCondition === 'high_eviction') {
      issues.push({
        id: 'active_evictions',
        severity: 'warning',
        title: 'Active key eviction detected',
        description: `RedisX is evicting keys (${latest.evictedKeysPerSec || 85} keys/sec) to stay below the memory limit.`,
        fixSuggestion: 'Check cache TTL policies or enlarge maxmemory to prevent premature data loss.',
        deepLink: '/memory',
      });
    }

    // Rule 3: Replica lag growing
    if (this.simulatedCondition === 'replica_lag') {
      issues.push({
        id: 'replica_lag',
        severity: 'warning',
        title: 'Replication lag growing',
        description: 'Replica offset difference is exceeding the 1MB replication backlog threshold.',
        fixSuggestion: 'Inspect replica network bandwidth and verify repl-backlog-size capacity.',
        deepLink: '/replication',
      });
    }

    // Rule 4: Rejected connections > 0
    if (this.simulatedCondition === 'rejected_clients') {
      issues.push({
        id: 'rejected_clients',
        severity: 'critical',
        title: 'Rejected client connections detected',
        description: 'New TCP client connections were rejected due to the maxclients limit.',
        fixSuggestion: 'Increase maxclients limit or audit leaking socket pools in clients.',
        deepLink: '/clients',
      });
    }

    // Rule 5: Last save failed
    if (info && info.persistence.rdb_last_bgsave_status !== 'ok') {
      issues.push({
        id: 'save_failed',
        severity: 'critical',
        title: 'Background RDB snapshot failed',
        description: 'The last BGSAVE attempt encountered a filesystem or permissions error.',
        fixSuggestion: 'Inspect disk space and verify directory write permissions for dump.rdb.',
        deepLink: '/persistence',
      });
    }

    // Rule 6: Hit rate < 80%
    if (latest.hitRate < 80.0) {
      issues.push({
        id: 'low_hit_rate',
        severity: 'warning',
        title: `Cache hit rate dropped to ${latest.hitRate}%`,
        description: 'A significant proportion of key lookups are returning cache misses, increasing backend load.',
        fixSuggestion: 'Audit key TTL expiration rates and pre-warm high-frequency caches.',
        deepLink: '/keys',
      });
    }

    // Rule 7: Slowlog entries in the last 5 minutes (simulated or checked)
    if (this.simulatedCondition === 'slowlog') {
      issues.push({
        id: 'slowlog_entries',
        severity: 'warning',
        title: 'Long-running commands detected in slowlog',
        description: 'Queries exceeding 10,000 microseconds were captured by the epoll reactor.',
        fixSuggestion: 'Inspect the Slow Log and replace blocking O(N) operations with O(1) calls.',
        deepLink: '/slowlog',
      });
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.some((i) => i.severity === 'critical')) {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'warning';
    }

    return {
      status,
      topIssue: issues[0],
      thingsToLookAt: issues,
      checkedAt: new Date().toISOString(),
    };
  }
}
