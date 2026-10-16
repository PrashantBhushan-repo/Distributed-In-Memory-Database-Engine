import { ParsedRedisInfo } from '../types.js';

export function parseRedisInfo(rawInfo: string): ParsedRedisInfo {
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = 'default';

  for (const line of rawInfo.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      currentSection = trimmed.replace(/^#\s*/, '').toLowerCase();
      sections[currentSection] = {};
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim();
      if (!sections[currentSection]) {
        sections[currentSection] = {};
      }
      sections[currentSection][key] = val;
    }
  }

  const s = (sec: string, key: string, fallback = '') => sections[sec]?.[key] ?? fallback;
  const n = (sec: string, key: string, fallback = 0) => {
    const val = sections[sec]?.[key];
    if (val === undefined || val === '') return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };

  const hits = n('stats', 'keyspace_hits', 0);
  const misses = n('stats', 'keyspace_misses', 0);
  const totalLookups = hits + misses;
  const hitRate = totalLookups > 0 ? Number(((hits / totalLookups) * 100).toFixed(1)) : 100.0;

  // Parse keyspace (db0:keys=100,expires=10,avg_ttl=5000)
  const keyspace: Record<string, { keys: number; expires: number; avg_ttl: number }> = {};
  if (sections['keyspace']) {
    for (const [db, details] of Object.entries(sections['keyspace'])) {
      const dbInfo = { keys: 0, expires: 0, avg_ttl: 0 };
      for (const part of details.split(',')) {
        const [k, v] = part.split('=');
        if (k === 'keys') dbInfo.keys = Number(v) || 0;
        if (k === 'expires') dbInfo.expires = Number(v) || 0;
        if (k === 'avg_ttl') dbInfo.avg_ttl = Number(v) || 0;
      }
      keyspace[db] = dbInfo;
    }
  }

  return {
    server: {
      redis_version: s('server', 'redis_version', '0.1.0-redisx'),
      uptime_in_seconds: n('server', 'uptime_in_seconds', 0),
      tcp_port: n('server', 'tcp_port', 6379),
      role: s('replication', 'role', s('server', 'role', 'master')),
      os: s('server', 'os', 'Linux (epoll reactor)'),
    },
    clients: {
      connected_clients: n('clients', 'connected_clients', 1),
      blocked_clients: n('clients', 'blocked_clients', 0),
      maxclients: n('clients', 'maxclients', 10000),
    },
    memory: {
      used_memory: n('memory', 'used_memory', 1048576),
      used_memory_human: s('memory', 'used_memory_human', '1.00M'),
      used_memory_peak: n('memory', 'used_memory_peak', 1048576),
      maxmemory: n('memory', 'maxmemory', 0),
      maxmemory_policy: s('memory', 'maxmemory_policy', 'noeviction'),
    },
    stats: {
      total_connections_received: n('stats', 'total_connections_received', 0),
      total_commands_processed: n('stats', 'total_commands_processed', 0),
      instantaneous_ops_per_sec: n('stats', 'instantaneous_ops_per_sec', 0),
      keyspace_hits: hits,
      keyspace_misses: misses,
      hit_rate: hitRate,
    },
    replication: {
      role: s('replication', 'role', 'master'),
      connected_slaves: n('replication', 'connected_slaves', 0),
      master_repl_offset: n('replication', 'master_repl_offset', 0),
      repl_backlog_size: n('replication', 'repl_backlog_size', 1048576),
    },
    persistence: {
      rdb_last_bgsave_status: s('persistence', 'rdb_last_bgsave_status', 'ok'),
      rdb_changes_since_last_save: n('persistence', 'rdb_changes_since_last_save', 0),
      aof_enabled: s('persistence', 'aof_enabled', '0') === '1',
    },
    keyspace,
  };
}
