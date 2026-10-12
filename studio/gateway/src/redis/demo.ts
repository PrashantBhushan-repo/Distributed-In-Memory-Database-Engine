import fs from 'fs';
import path from 'path';
import {
  ParsedRedisInfo,
  KeySummary,
  KeyFormatHint,
  KeyDetailResponse,
  MemoryOverviewResponse,
  TopKeysResponse,
  MemorySimulateResponse,
  ExpirationSoonestResponse,
  ExpirationHistogramResponse,
  BulkSetTtlResponse,
  ClientInfoItem,
  ClientsResponse,
  SlowLogItem,
  SlowLogResponse,
  SlowLogCauseHint,
  SaveTimelineItem,
  PersistenceInfoResponse,
  SnapshotInspectResponse,
  ReplicaNodeInfo,
  ReplicationTopologyResponse,
  ReplicationPreflightResponse,
  PreflightCheckItem,
  AclRuleObject,
  AclUserItem,
  AclCategoryInfo,
  AclTestResult,
  SecurityStatusResponse,
  ConfigParamMeta,
  ConfigParamItem,
  ConfigRollbackItem,
  PubSubChannelItem,
  PubSubChannelsResponse,
} from '../types.js';
import { inspectorRegistry } from '../persistence/inspector.js';
import { ACL_CATEGORIES, parseAclListLine, buildAclSetUserArgs } from '../security/acl.js';
import { loadConfigMetadata, validateConfigParam, generateRedisConfExport } from '../config/meta.js';

interface DemoItem {
  type: 'string' | 'list' | 'hash' | 'set' | 'zset';
  value: any;
  ttl: number; // seconds, -1 = infinite
  createdAt: number;
  encoding: string;
}

export class DemoRedisEngine {
  private data: Map<string, DemoItem> = new Map();
  private startTime = Date.now();
  private totalCommands = 12450;
  private hits = 8940;
  private misses = 320;
  private maxmemory = 268435456; // 256MB
  private maxmemoryPolicy = 'volatile-lru';
  private evictedKeys = 0;
  private demoClients: ClientInfoItem[] = [];
  private demoSlowLog: SlowLogItem[] = [];
  private slowlogThresholdUs = 10000; // 10ms

  // Step 9: Persistence state
  private rdbBgsaveInProgress = false;
  private aofRewriteInProgress = false;
  private rdbLastSaveTime = Math.floor(Date.now() / 1000) - 184;
  private rdbLastBgsaveStatus: 'ok' | 'err' = 'ok';
  private rdbLastBgsaveTimeSec = 2;
  private rdbChangesSinceLastSave = 342;
  private aofFsyncPolicy: 'always' | 'everysec' | 'no' = 'everysec';
  private demoSaveTimeline: SaveTimelineItem[] = [
    {
      id: 'snap-104',
      type: 'rdb',
      timestamp: Math.floor(Date.now() / 1000) - 184,
      timestampIso: new Date(Date.now() - 184000).toISOString(),
      durationSec: 2,
      sizeBytes: 1843200,
      status: 'ok',
      keysCount: 12480,
    },
    {
      id: 'snap-103',
      type: 'aof',
      timestamp: Math.floor(Date.now() / 1000) - 1800,
      timestampIso: new Date(Date.now() - 1800000).toISOString(),
      durationSec: 3,
      sizeBytes: 4194304,
      status: 'ok',
      keysCount: 12210,
    },
    {
      id: 'snap-102',
      type: 'rdb',
      timestamp: Math.floor(Date.now() / 1000) - 3600,
      timestampIso: new Date(Date.now() - 3600000).toISOString(),
      durationSec: 2,
      sizeBytes: 1780000,
      status: 'ok',
      keysCount: 11950,
    },
    {
      id: 'snap-101',
      type: 'rdb',
      timestamp: Math.floor(Date.now() / 1000) - 7200,
      timestampIso: new Date(Date.now() - 7200000).toISOString(),
      durationSec: 3,
      sizeBytes: 1690000,
      status: 'ok',
      keysCount: 11400,
    },
  ];

  // Step 9: Replication state
  private replicationRole: 'master' | 'slave' = 'master';
  private masterHost?: string;
  private masterPort?: number;
  private masterReplId = 'c4e9b81f9a2345bc88e1049ad7f6e21094038a12';
  private masterReplOffset = 18420950;
  private replBacklogSize = 1048576; // 1 MB
  private replBacklogHistlen = 840000;

  // Step 10: Security & ACL, Config state
  private demoAclUsers: AclUserItem[] = [
    {
      username: 'default',
      enabled: true,
      hasPassword: false,
      isNoPass: true,
      passwordCount: 0,
      keysSummary: 'All keys (~*)',
      channelsSummary: 'All channels (&*)',
      allowedCategories: ['all'],
      deniedCategories: [],
      allowedCommands: [],
      deniedCommands: [],
      rawRule: 'user default on nopass ~* &* +@all',
      isDefault: true,
    },
    {
      username: 'app_worker',
      enabled: true,
      hasPassword: true,
      isNoPass: false,
      passwordCount: 1,
      keysSummary: '~cache:*, ~tasks:*',
      channelsSummary: 'All channels (&*)',
      allowedCategories: ['read', 'write'],
      deniedCategories: ['dangerous', 'admin'],
      allowedCommands: [],
      deniedCommands: [],
      rawRule: 'user app_worker on #a1f89bc44d ~cache:* ~tasks:* &* +@read +@write -@dangerous -@admin',
      isDefault: false,
    },
    {
      username: 'bi_analytics',
      enabled: true,
      hasPassword: true,
      isNoPass: false,
      passwordCount: 1,
      keysSummary: 'All keys (~*)',
      channelsSummary: 'All channels (&*)',
      allowedCategories: ['read', 'slow'],
      deniedCategories: ['write', 'dangerous'],
      allowedCommands: [],
      deniedCommands: [],
      rawRule: 'user bi_analytics on #b2e77cc12a ~* &* +@read +@slow -@write -@dangerous',
      isDefault: false,
    },
    {
      username: 'billing_cron',
      enabled: false,
      hasPassword: true,
      isNoPass: false,
      passwordCount: 1,
      keysSummary: '~billing:*',
      channelsSummary: 'No channels',
      allowedCategories: ['read', 'write'],
      deniedCategories: [],
      allowedCommands: [],
      deniedCommands: [],
      rawRule: 'user billing_cron off #c3d91aa90f ~billing:* +@read +@write',
      isDefault: false,
    },
  ];

  private demoConfigValues: Map<string, any> = new Map<string, any>([
    ['maxmemory', 268435456],
    ['maxmemory-policy', 'volatile-lru'],
    ['maxmemory-samples', 5],
    ['active-defrag-ignore-bytes', 104857600],
    ['active-defrag-threshold-lower', 10],
    ['appendonly', true],
    ['appendfsync', 'everysec'],
    ['auto-aof-rewrite-percentage', 100],
    ['auto-aof-rewrite-min-size', 67108864],
    ['save', '3600 1 300 100 60 10000'],
    ['rdbcompression', true],
    ['rdbchecksum', true],
    ['timeout', 0],
    ['tcp-keepalive', 300],
    ['maxclients', 10000],
    ['slowlog-log-slower-than', 10000],
    ['slowlog-max-len', 128],
    ['latency-monitor-threshold', 0],
    ['requirepass', ''],
    ['protected-mode', true],
    ['repl-backlog-size', 1048576],
    ['repl-backlog-ttl', 3600],
    ['repl-ping-replica-period', 10],
    ['repl-timeout', 60],
    ['replica-read-only', true],
    ['hash-max-listpack-entries', 512],
    ['hash-max-listpack-value', 64],
    ['zset-max-listpack-entries', 128],
    ['zset-max-listpack-value', 64],
    ['databases', 16],
    ['port', 6379],
  ]);

  private configRollbackStack: ConfigRollbackItem[] = [];

  // Step 11: Pub/Sub state
  private demoChannels: Map<string, number> = new Map([
    ['notifications:user', 14],
    ['order:events', 8],
    ['system:health', 3],
    ['chat:general', 22],
    ['metrics:stream', 5],
    ['cache:invalidation', 19],
    ['billing:invoices', 4],
  ]);

  constructor() {
    this.seedRealisticDataset();
    this.seedRealisticClients();
    this.seedRealisticSlowLog();
  }

  private seedRealisticDataset() {
    // 1. User Profiles (Hashes)
    const tiers = ['free', 'pro', 'enterprise'];
    const roles = ['developer', 'sre', 'architect', 'manager'];
    for (let i = 1001; i <= 1250; i++) {
      this.data.set(`user:${i}:profile`, {
        type: 'hash',
        value: {
          id: String(i),
          username: `engineer_${i}`,
          email: `engineer_${i}@cloudscale.internal`,
          tier: tiers[i % tiers.length],
          role: roles[i % roles.length],
          created_at: new Date(Date.now() - (i * 3600000)).toISOString(),
          last_login_ip: `192.168.1.${(i % 250) + 1}`,
        },
        ttl: -1,
        createdAt: Date.now(),
        encoding: 'listpack',
      });
    }

    // 2. Active Session Tokens (Strings with TTL)
    for (let i = 1; i <= 300; i++) {
      const ttl = Math.floor(Math.random() * 3500) + 120;
      this.data.set(`session:sess_${Math.random().toString(36).substring(2, 12)}`, {
        type: 'string',
        value: JSON.stringify({ userId: 1000 + (i % 250), device: 'Chrome/macOS', issuedAt: Date.now() }),
        ttl,
        createdAt: Date.now(),
        encoding: 'raw',
      });
    }

    // 3. Rate Limit Windows (Strings with fast TTL)
    for (let i = 1; i <= 150; i++) {
      this.data.set(`rate_limit:ip:10.0.4.${i}`, {
        type: 'string',
        value: String(Math.floor(Math.random() * 8) + 1),
        ttl: Math.floor(Math.random() * 60) + 5,
        createdAt: Date.now(),
        encoding: 'int',
      });
    }

    // 4. Cache Entries (Strings & JSON)
    for (let i = 1; i <= 200; i++) {
      this.data.set(`cache:catalog:item_${i}`, {
        type: 'string',
        value: JSON.stringify({ sku: `SKU-${10000 + i}`, stock: Math.floor(Math.random() * 500), price: (Math.random() * 100).toFixed(2) }),
        ttl: Math.floor(Math.random() * 7200) + 300,
        createdAt: Date.now(),
        encoding: 'raw',
      });
    }

    // 5. Job & Event Queues (Lists)
    const taskTypes = ['send_email', 'process_webhook', 'sync_metric', 'generate_pdf', 'flush_cdn'];
    for (const q of ['queue:high_priority', 'queue:default', 'queue:dlq', 'events:stream_buffer']) {
      const tasks = [];
      const count = Math.floor(Math.random() * 30) + 5;
      for (let j = 0; j < count; j++) {
        tasks.push(JSON.stringify({ id: `job_${j}_${Date.now()}`, task: taskTypes[j % taskTypes.length], retry: 0 }));
      }
      this.data.set(q, {
        type: 'list',
        value: tasks,
        ttl: -1,
        createdAt: Date.now(),
        encoding: 'quicklist',
      });
    }

    // 6. Security & ACL Sets (Sets)
    this.data.set('auth:active_admins', {
      type: 'set',
      value: new Set(['1001', '1005', '1012', '1044', '1088', '1100']),
      ttl: -1,
      createdAt: Date.now(),
      encoding: 'intset',
    });
    this.data.set('features:beta_testers', {
      type: 'set',
      value: new Set(['user_1002', 'user_1009', 'user_1050', 'user_1099', 'user_1155']),
      ttl: -1,
      createdAt: Date.now(),
      encoding: 'listpack',
    });

    // 7. Global Leaderboards & Latency Histograms (Sorted Sets)
    const players: [string, number][] = [
      ['player_alex', 98500], ['player_sara', 92100], ['player_chen', 88400],
      ['player_zane', 83120], ['player_elena', 79300], ['player_marcus', 74500],
      ['player_priya', 69800], ['player_liam', 65200], ['player_sofia', 61000],
    ];
    this.data.set('leaderboard:global_highscores', {
      type: 'zset',
      value: players,
      ttl: -1,
      createdAt: Date.now(),
      encoding: 'skiplist',
    });

    this.data.set('telemetry:p99_latency_samples', {
      type: 'zset',
      value: [
        ['sample_1001', 0.82], ['sample_1002', 0.89], ['sample_1003', 1.05],
        ['sample_1004', 1.24], ['sample_1005', 1.71], ['sample_1006', 2.04],
      ],
      ttl: 3600,
      createdAt: Date.now(),
      encoding: 'skiplist',
    });
  }

  public getKeys(cursor = 0, match = '*', count = 100, typeFilter?: string): { cursor: number; keys: KeySummary[]; totalApprox: number } {
    const regex = new RegExp('^' + match.replace(/\*/g, '.*') + '$');
    const matched: KeySummary[] = [];

    const now = Date.now();
    for (const [name, item] of this.data.entries()) {
      if (!regex.test(name)) continue;
      if (typeFilter && typeFilter !== 'all' && item.type !== typeFilter) continue;

      let remainingTtl = -1;
      if (item.ttl > 0) {
        const elapsed = Math.floor((now - item.createdAt) / 1000);
        remainingTtl = Math.max(0, item.ttl - elapsed);
        if (remainingTtl === 0) {
          this.data.delete(name);
          continue;
        }
      }

      let size = 1;
      if (item.type === 'string') size = String(item.value).length;
      else if (item.type === 'list') size = item.value.length;
      else if (item.type === 'hash') size = Object.keys(item.value).length;
      else if (item.type === 'set') size = (item.value as Set<string>).size;
      else if (item.type === 'zset') size = item.value.length;

      matched.push({
        name,
        type: item.type,
        ttl: remainingTtl,
        ttlMs: remainingTtl > 0 ? remainingTtl * 1000 : remainingTtl,
        encoding: item.encoding,
        size,
        memoryBytes: size * 32 + 64,
      });
    }

    const start = cursor;
    const slice = matched.slice(start, start + count);
    const nextCursor = start + count >= matched.length ? 0 : start + count;

    return { cursor: nextCursor, keys: slice, totalApprox: matched.length };
  }

  public getKeyTree(prefix = '', delimiter = ':'): { prefix: string; delimiter: string; nodes: any[]; totalScanned: number; approximate: boolean } {
    const groups: Map<string, { count: number; hasChildren: boolean }> = new Map();
    const leaves: any[] = [];
    const now = Date.now();

    for (const [name, item] of this.data.entries()) {
      if (!name.startsWith(prefix)) continue;

      const remainder = name.slice(prefix.length);
      const delimiterIndex = remainder.indexOf(delimiter);

      if (delimiterIndex !== -1) {
        // Folder branch
        const folderName = remainder.slice(0, delimiterIndex);
        const folderPath = prefix + folderName + delimiter;
        const existing = groups.get(folderName) || { count: 0, hasChildren: true };
        existing.count += 1;
        groups.set(folderName, existing);
      } else if (remainder.length > 0) {
        // Direct leaf key
        let remainingTtl = -1;
        if (item.ttl > 0) {
          const elapsed = Math.floor((now - item.createdAt) / 1000);
          remainingTtl = Math.max(0, item.ttl - elapsed);
        }
        leaves.push({
          name: remainder,
          fullPath: name,
          isLeaf: true,
          type: item.type,
          keyCount: 1,
          hasChildren: false,
          ttl: remainingTtl,
          ttlMs: remainingTtl > 0 ? remainingTtl * 1000 : remainingTtl,
          memoryBytes: 128,
        });
      }
    }

    const folderNodes = Array.from(groups.entries()).map(([fName, info]) => ({
      name: fName,
      fullPath: prefix + fName + delimiter,
      isLeaf: false,
      keyCount: info.count,
      hasChildren: true,
    }));

    // Sort folders alphabetically, then leaves alphabetically
    folderNodes.sort((a, b) => a.name.localeCompare(b.name));
    leaves.sort((a, b) => a.name.localeCompare(b.name));

    return {
      prefix,
      delimiter,
      nodes: [...folderNodes, ...leaves],
      totalScanned: this.data.size,
      approximate: false,
    };
  }

  public getDbSize(): { dbsize: number; dbs: Record<number, number> } {
    const dbs: Record<number, number> = { 0: this.data.size };
    for (let i = 1; i < 16; i++) {
      dbs[i] = 0;
    }
    return {
      dbsize: this.data.size,
      dbs,
    };
  }

  public detectFormatHint(val: string): KeyFormatHint {
    if (!val || typeof val !== 'string') return 'text';
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }
    if (/^[0-9a-fA-F\s]{4,}$/.test(trimmed) && trimmed.replace(/\s/g, '').length % 2 === 0) {
      return 'hex';
    }
    if (/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(trimmed) && trimmed.length >= 8) {
      return 'base64';
    }
    return 'text';
  }

  public getKeyDetail(name: string, options: { page?: number; limit?: number; cursor?: number; scoreMin?: number; scoreMax?: number; filter?: string } = {}): KeyDetailResponse | null {
    const item = this.data.get(name);
    if (!item) return null;

    const now = Date.now();
    let remainingTtl = -1;
    if (item.ttl > 0) {
      const elapsed = Math.floor((now - item.createdAt) / 1000);
      remainingTtl = Math.max(0, item.ttl - elapsed);
      if (remainingTtl === 0) {
        this.data.delete(name);
        return null;
      }
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(Math.max(1, Number(options.limit) || 50), 200);
    const startIdx = (page - 1) * limit;

    const base = {
      name,
      type: item.type,
      encoding: item.encoding,
      ttl: remainingTtl,
      ttlMs: remainingTtl > 0 ? remainingTtl * 1000 : remainingTtl,
    };

    if (item.type === 'string') {
      const strVal = String(item.value);
      const formatHint = this.detectFormatHint(strVal);
      return {
        ...base,
        type: 'string',
        value: strVal,
        formatHint,
        length: strVal.length,
        memoryBytes: 56 + strVal.length,
      };
    }

    if (item.type === 'list') {
      const arr: string[] = Array.isArray(item.value) ? item.value : [];
      const total = arr.length;
      const sliced = arr.slice(startIdx, startIdx + limit);
      const listItems = sliced.map((val, idx) => ({
        index: startIdx + idx,
        value: String(val),
      }));

      return {
        ...base,
        type: 'list',
        length: total,
        memoryBytes: 80 + total * 32,
        listItems,
        listPage: {
          page,
          limit,
          total,
          hasMore: startIdx + limit < total,
        },
      };
    }

    if (item.type === 'hash') {
      const obj = item.value || {};
      let keys = Object.keys(obj);
      if (options.filter) {
        const f = options.filter.toLowerCase();
        keys = keys.filter(k => k.toLowerCase().includes(f));
      }
      const total = keys.length;
      const slicedKeys = keys.slice(startIdx, startIdx + limit);
      const hashEntries = slicedKeys.map(k => ({
        field: k,
        value: String(obj[k]),
      }));

      return {
        ...base,
        type: 'hash',
        length: Object.keys(obj).length,
        memoryBytes: 64 + total * 48,
        hashEntries,
        hashPage: {
          page,
          limit,
          total,
          hasMore: startIdx + limit < total,
        },
      };
    }

    if (item.type === 'set') {
      const setObj: Set<string> = item.value instanceof Set ? item.value : new Set(Array.isArray(item.value) ? item.value : []);
      let arr = Array.from(setObj);
      if (options.filter) {
        const f = options.filter.toLowerCase();
        arr = arr.filter(m => m.toLowerCase().includes(f));
      }
      const total = arr.length;
      const sliced = arr.slice(startIdx, startIdx + limit);

      return {
        ...base,
        type: 'set',
        length: setObj.size,
        memoryBytes: 64 + setObj.size * 32,
        setMembers: sliced,
        setPage: {
          page,
          limit,
          total,
          hasMore: startIdx + limit < total,
        },
      };
    }

    if (item.type === 'zset') {
      const zlist: [string, number][] = Array.isArray(item.value) ? item.value : [];
      let filtered = zlist;
      if (options.scoreMin !== undefined) {
        filtered = filtered.filter(item => item[1] >= options.scoreMin!);
      }
      if (options.scoreMax !== undefined) {
        filtered = filtered.filter(item => item[1] <= options.scoreMax!);
      }
      if (options.filter) {
        const f = options.filter.toLowerCase();
        filtered = filtered.filter(item => item[0].toLowerCase().includes(f));
      }

      const total = filtered.length;
      const sliced = filtered.slice(startIdx, startIdx + limit);
      const zsetMembers = sliced.map((item, idx) => ({
        rank: startIdx + idx + 1,
        member: item[0],
        score: item[1],
      }));

      return {
        ...base,
        type: 'zset',
        length: zlist.length,
        memoryBytes: 96 + zlist.length * 48,
        zsetMembers,
        zsetPage: {
          page,
          limit,
          total,
          hasMore: startIdx + limit < total,
        },
      };
    }

    return null;
  }

  // Mutations
  public setString(name: string, value: string, ttl?: number): { command: string } {
    let item = this.data.get(name);
    let resolvedTtl = ttl !== undefined ? ttl : (item ? item.ttl : -1);
    this.data.set(name, {
      type: 'string',
      value,
      ttl: resolvedTtl,
      createdAt: Date.now(),
      encoding: /^\d+$/.test(value) && value.length < 18 ? 'int' : (value.length < 44 ? 'embstr' : 'raw'),
    });
    const cmd = resolvedTtl > 0 ? `SET ${name} "${value}" EX ${resolvedTtl}` : `SET ${name} "${value}"`;
    return { command: cmd };
  }

  public pushList(name: string, direction: 'left' | 'right', value: string): { command: string; length: number } {
    let item = this.data.get(name);
    if (!item) {
      item = { type: 'list', value: [], ttl: -1, createdAt: Date.now(), encoding: 'quicklist' };
      this.data.set(name, item);
    }
    if (direction === 'left') {
      item.value.unshift(value);
    } else {
      item.value.push(value);
    }
    const cmd = direction === 'left' ? `LPUSH ${name} "${value}"` : `RPUSH ${name} "${value}"`;
    return { command: cmd, length: item.value.length };
  }

  public popList(name: string, direction: 'left' | 'right'): { command: string; value: string | null } {
    const item = this.data.get(name);
    if (!item || item.type !== 'list' || item.value.length === 0) {
      const cmd = direction === 'left' ? `LPOP ${name}` : `RPOP ${name}`;
      return { command: cmd, value: null };
    }
    const val = direction === 'left' ? item.value.shift() : item.value.pop();
    const cmd = direction === 'left' ? `LPOP ${name}` : `RPOP ${name}`;
    return { command: cmd, value: val ?? null };
  }

  public deleteListIndex(name: string, index: number): { command: string; success: boolean } {
    const item = this.data.get(name);
    if (!item || item.type !== 'list') {
      return { command: `LREM ${name} 1 ...`, success: false };
    }
    if (index >= 0 && index < item.value.length) {
      const removed = item.value[index];
      item.value.splice(index, 1);
      return { command: `LREM ${name} 1 "${removed}"`, success: true };
    }
    return { command: `LREM ${name} 1 ...`, success: false };
  }

  public setHashField(name: string, field: string, value: string): { command: string } {
    let item = this.data.get(name);
    if (!item) {
      item = { type: 'hash', value: {}, ttl: -1, createdAt: Date.now(), encoding: 'listpack' };
      this.data.set(name, item);
    }
    item.value[field] = value;
    if (Object.keys(item.value).length > 128) {
      item.encoding = 'hashtable';
    }
    return { command: `HSET ${name} "${field}" "${value}"` };
  }

  public deleteHashField(name: string, field: string): { command: string; deleted: boolean } {
    const item = this.data.get(name);
    if (!item || item.type !== 'hash') {
      return { command: `HDEL ${name} "${field}"`, deleted: false };
    }
    const deleted = delete item.value[field];
    return { command: `HDEL ${name} "${field}"`, deleted };
  }

  public addSetMember(name: string, member: string): { command: string; added: boolean } {
    let item = this.data.get(name);
    if (!item) {
      item = { type: 'set', value: new Set<string>(), ttl: -1, createdAt: Date.now(), encoding: 'intset' };
      this.data.set(name, item);
    }
    const before = item.value.size;
    item.value.add(member);
    const added = item.value.size > before;
    if (!/^\d+$/.test(member)) {
      item.encoding = 'listpack';
    }
    return { command: `SADD ${name} "${member}"`, added };
  }

  public removeSetMember(name: string, member: string): { command: string; removed: boolean } {
    const item = this.data.get(name);
    if (!item || item.type !== 'set') {
      return { command: `SREM ${name} "${member}"`, removed: false };
    }
    const removed = item.value.delete(member);
    return { command: `SREM ${name} "${member}"`, removed };
  }

  public addZSetMember(name: string, member: string, score: number): { command: string } {
    let item = this.data.get(name);
    if (!item) {
      item = { type: 'zset', value: [], ttl: -1, createdAt: Date.now(), encoding: 'skiplist' };
      this.data.set(name, item);
    }
    const list: [string, number][] = item.value;
    const existingIdx = list.findIndex(i => i[0] === member);
    if (existingIdx !== -1) {
      list[existingIdx][1] = score;
    } else {
      list.push([member, score]);
    }
    list.sort((a, b) => b[1] - a[1]); // Descending by default for leaderboards
    return { command: `ZADD ${name} ${score} "${member}"` };
  }

  public removeZSetMember(name: string, member: string): { command: string; removed: boolean } {
    const item = this.data.get(name);
    if (!item || item.type !== 'zset') {
      return { command: `ZREM ${name} "${member}"`, removed: false };
    }
    const list: [string, number][] = item.value;
    const idx = list.findIndex(i => i[0] === member);
    if (idx !== -1) {
      list.splice(idx, 1);
      return { command: `ZREM ${name} "${member}"`, removed: true };
    }
    return { command: `ZREM ${name} "${member}"`, removed: false };
  }

  public setTtl(name: string, ttl: number): { command: string; success: boolean } {
    const item = this.data.get(name);
    if (!item) {
      return { command: ttl === -1 ? `PERSIST ${name}` : `EXPIRE ${name} ${ttl}`, success: false };
    }
    if (ttl === -1) {
      item.ttl = -1;
      return { command: `PERSIST ${name}`, success: true };
    }
    item.ttl = ttl;
    item.createdAt = Date.now();
    return { command: `EXPIRE ${name} ${ttl}`, success: true };
  }

  public deleteKey(name: string): { command: string; deleted: boolean } {
    const deleted = this.data.delete(name);
    return { command: `DEL ${name}`, deleted };
  }

  public bulkDeleteKeys(keys: string[], dryRun = false): { dryRun: boolean; count: number; sample: string[]; command: string } {
    const sample = keys.slice(0, 5);
    const command = `DEL ${keys.slice(0, 10).join(' ')}${keys.length > 10 ? ' ...' : ''}`;
    if (dryRun) {
      return { dryRun: true, count: keys.length, sample, command };
    }
    let count = 0;
    for (const k of keys) {
      if (this.data.delete(k)) count++;
    }
    return { dryRun: false, count, sample, command };
  }

  public createKey(name: string, type: 'string' | 'list' | 'hash' | 'set' | 'zset', payload: any, ttl?: number): { commands: string[]; success: boolean } {
    const commands: string[] = [];
    const resolvedTtl = ttl && ttl > 0 ? ttl : -1;

    if (type === 'string') {
      const val = String(payload.value ?? '');
      this.setString(name, val, resolvedTtl);
      commands.push(resolvedTtl > 0 ? `SET ${name} "${val}" EX ${resolvedTtl}` : `SET ${name} "${val}"`);
    } else if (type === 'list') {
      const items: string[] = Array.isArray(payload.items) ? payload.items : [String(payload.value ?? 'initial_item')];
      this.data.set(name, { type: 'list', value: [...items], ttl: resolvedTtl, createdAt: Date.now(), encoding: 'quicklist' });
      commands.push(`RPUSH ${name} ${items.map(i => `"${i}"`).join(' ')}`);
      if (resolvedTtl > 0) commands.push(`EXPIRE ${name} ${resolvedTtl}`);
    } else if (type === 'hash') {
      const entries: Record<string, string> = payload.entries || { default_field: 'default_value' };
      this.data.set(name, { type: 'hash', value: { ...entries }, ttl: resolvedTtl, createdAt: Date.now(), encoding: 'listpack' });
      const args = Object.entries(entries).map(([f, v]) => `"${f}" "${v}"`).join(' ');
      commands.push(`HSET ${name} ${args}`);
      if (resolvedTtl > 0) commands.push(`EXPIRE ${name} ${resolvedTtl}`);
    } else if (type === 'set') {
      const members: string[] = Array.isArray(payload.members) ? payload.members : ['member_1'];
      this.data.set(name, { type: 'set', value: new Set(members), ttl: resolvedTtl, createdAt: Date.now(), encoding: 'intset' });
      commands.push(`SADD ${name} ${members.map(m => `"${m}"`).join(' ')}`);
      if (resolvedTtl > 0) commands.push(`EXPIRE ${name} ${resolvedTtl}`);
    } else if (type === 'zset') {
      const members: [string, number][] = Array.isArray(payload.members) ? payload.members : [['member_1', 100]];
      this.data.set(name, { type: 'zset', value: members, ttl: resolvedTtl, createdAt: Date.now(), encoding: 'skiplist' });
      const args = members.map(([m, s]) => `${s} "${m}"`).join(' ');
      commands.push(`ZADD ${name} ${args}`);
      if (resolvedTtl > 0) commands.push(`EXPIRE ${name} ${resolvedTtl}`);
    }

    return { commands, success: true };
  }

  public execute(args: string[]): any {
    this.totalCommands++;
    if (args.length === 0) return null;
    const cmd = args[0].toUpperCase();

    if (cmd === 'PING') return 'PONG';
    if (cmd === 'ECHO') return args[1] ?? '';
    if (cmd === 'DBSIZE') return this.data.size;

    if (cmd === 'GET') {
      const item = this.data.get(args[1]);
      if (item && item.type === 'string') {
        this.hits++;
        return item.value;
      }
      this.misses++;
      return null;
    }

    if (cmd === 'SET') {
      const key = args[1];
      const val = args[2] ?? '';
      let ttl = -1;
      if (args[3]?.toUpperCase() === 'EX' && args[4]) {
        ttl = parseInt(args[4], 10);
      }
      this.setString(key, val, ttl);
      return 'OK';
    }

    if (cmd === 'DEL') {
      let count = 0;
      for (let i = 1; i < args.length; i++) {
        if (this.data.delete(args[i])) count++;
      }
      return count;
    }

    if (cmd === 'EXPIRE') {
      const res = this.setTtl(args[1], parseInt(args[2], 10));
      return res.success ? 1 : 0;
    }

    if (cmd === 'PERSIST') {
      const res = this.setTtl(args[1], -1);
      return res.success ? 1 : 0;
    }

    if (cmd === 'LPUSH') {
      const key = args[1];
      let len = 0;
      for (let i = 2; i < args.length; i++) {
        const res = this.pushList(key, 'left', args[i]);
        len = res.length;
      }
      return len;
    }

    if (cmd === 'RPUSH') {
      const key = args[1];
      let len = 0;
      for (let i = 2; i < args.length; i++) {
        const res = this.pushList(key, 'right', args[i]);
        len = res.length;
      }
      return len;
    }

    if (cmd === 'LPOP') {
      return this.popList(args[1], 'left').value;
    }

    if (cmd === 'RPOP') {
      return this.popList(args[1], 'right').value;
    }

    if (cmd === 'HSET') {
      const key = args[1];
      for (let i = 2; i < args.length; i += 2) {
        if (args[i] && args[i + 1] !== undefined) {
          this.setHashField(key, args[i], args[i + 1]);
        }
      }
      return 1;
    }

    if (cmd === 'HDEL') {
      const key = args[1];
      let deleted = 0;
      for (let i = 2; i < args.length; i++) {
        if (this.deleteHashField(key, args[i]).deleted) deleted++;
      }
      return deleted;
    }

    if (cmd === 'SADD') {
      const key = args[1];
      let added = 0;
      for (let i = 2; i < args.length; i++) {
        if (this.addSetMember(key, args[i]).added) added++;
      }
      return added;
    }

    if (cmd === 'SREM') {
      const key = args[1];
      let removed = 0;
      for (let i = 2; i < args.length; i++) {
        if (this.removeSetMember(key, args[i]).removed) removed++;
      }
      return removed;
    }

    if (cmd === 'ZADD') {
      const key = args[1];
      for (let i = 2; i < args.length; i += 2) {
        const score = parseFloat(args[i]);
        const member = args[i + 1];
        if (!isNaN(score) && member) {
          this.addZSetMember(key, member, score);
        }
      }
      return 1;
    }

    if (cmd === 'ZREM') {
      const key = args[1];
      let removed = 0;
      for (let i = 2; i < args.length; i++) {
        if (this.removeZSetMember(key, args[i]).removed) removed++;
      }
      return removed;
    }

    if (cmd === 'HGETALL') {
      const item = this.data.get(args[1]);
      if (!item || item.type !== 'hash') return {};
      return item.value;
    }

    if (cmd === 'LRANGE') {
      const item = this.data.get(args[1]);
      if (!item || item.type !== 'list') return [];
      const start = parseInt(args[2], 10) || 0;
      const stop = parseInt(args[3], 10);
      return item.value.slice(start, stop === -1 ? undefined : stop + 1);
    }

    if (cmd === 'OBJECT' && args[1]?.toUpperCase() === 'ENCODING') {
      const item = this.data.get(args[2]);
      return item ? item.encoding : null;
    }

    if (cmd === 'MEMORY' && args[1]?.toUpperCase() === 'USAGE') {
      const item = this.data.get(args[2]);
      return item ? 128 : null;
    }

    return `OK (Demo processed ${cmd})`;
  }

  public getParsedInfo(): ParsedRedisInfo {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const wave = Math.sin(Date.now() / 10000);
    const ops = Math.floor(11500 + wave * 3200);
    const usedBytes = 48500000 + Math.floor(wave * 2500000);

    return {
      server: {
        redis_version: '0.1.0-redisx (demo simulation)',
        uptime_in_seconds: uptime,
        tcp_port: 6379,
        role: 'master',
        os: 'Linux 6.6.0 (epoll reactor)',
      },
      clients: {
        connected_clients: 42 + Math.floor(Math.abs(wave) * 15),
        blocked_clients: 2,
        maxclients: 10000,
      },
      memory: {
        used_memory: usedBytes,
        used_memory_human: (usedBytes / (1024 * 1024)).toFixed(2) + 'M',
        used_memory_peak: 56200000,
        maxmemory: 268435456, // 256MB
        maxmemory_policy: 'volatile-lru',
      },
      stats: {
        total_connections_received: 1850,
        total_commands_processed: this.totalCommands,
        instantaneous_ops_per_sec: ops,
        keyspace_hits: this.hits,
        keyspace_misses: this.misses,
        hit_rate: 96.5,
      },
      replication: {
        role: 'master',
        connected_slaves: 2,
        master_repl_offset: 4982310 + uptime * 128,
        repl_backlog_size: 1048576,
      },
      persistence: {
        rdb_last_bgsave_status: 'ok',
        rdb_changes_since_last_save: 42,
        aof_enabled: true,
      },
      keyspace: {
        db0: { keys: this.data.size, expires: 450, avg_ttl: 1840 },
      },
    };
  }

  private computeKeyMemory(item: DemoItem): number {
    let raw = 64;
    if (item.type === 'string') {
      raw += String(item.value).length + 32;
    } else if (item.type === 'hash') {
      const keys = Object.keys(item.value || {});
      raw += keys.reduce((acc, k) => acc + k.length + String(item.value[k] || '').length + 32, 64);
    } else if (item.type === 'list') {
      raw += (item.value || []).reduce((acc: number, val: any) => acc + String(val).length + 24, 64);
    } else if (item.type === 'set') {
      const arr = item.value instanceof Set ? Array.from(item.value) : (item.value || []);
      raw += arr.reduce((acc: number, val: any) => acc + String(val).length + 24, 64);
    } else if (item.type === 'zset') {
      raw += (item.value || []).reduce((acc: number, pair: any) => acc + String(pair[0]).length + 32, 64);
    }
    return raw;
  }

  public getMemoryOverview(): MemoryOverviewResponse {
    const info = this.getParsedInfo();
    const typeMap: Record<string, { count: number; bytes: number }> = {
      string: { count: 0, bytes: 0 },
      hash: { count: 0, bytes: 0 },
      list: { count: 0, bytes: 0 },
      set: { count: 0, bytes: 0 },
      zset: { count: 0, bytes: 0 },
    };
    const prefixMap: Record<string, { count: number; bytes: number }> = {};
    let totalSampledBytes = 0;

    for (const [keyName, item] of this.data.entries()) {
      const bytes = this.computeKeyMemory(item);
      totalSampledBytes += bytes;

      // Type breakdown
      if (!typeMap[item.type]) {
        typeMap[item.type] = { count: 0, bytes: 0 };
      }
      typeMap[item.type].count++;
      typeMap[item.type].bytes += bytes;

      // Prefix breakdown (first ':' token)
      const colonIdx = keyName.indexOf(':');
      const prefix = colonIdx !== -1 ? keyName.substring(0, colonIdx) : 'unprefixed';
      if (!prefixMap[prefix]) {
        prefixMap[prefix] = { count: 0, bytes: 0 };
      }
      prefixMap[prefix].count++;
      prefixMap[prefix].bytes += bytes;
    }

    const per_type = Object.entries(typeMap).map(([type, stats]) => ({
      type,
      count: stats.count,
      bytes: stats.bytes,
      percentage: totalSampledBytes > 0 ? Math.round((stats.bytes / totalSampledBytes) * 1000) / 10 : 0,
    })).sort((a, b) => b.bytes - a.bytes);

    const per_prefix = Object.entries(prefixMap).map(([prefix, stats]) => ({
      prefix,
      count: stats.count,
      bytes: stats.bytes,
      percentage: totalSampledBytes > 0 ? Math.round((stats.bytes / totalSampledBytes) * 1000) / 10 : 0,
    })).sort((a, b) => b.bytes - a.bytes);

    return {
      used_memory: info.memory.used_memory,
      used_memory_peak: info.memory.used_memory_peak,
      maxmemory: this.maxmemory,
      maxmemory_policy: this.maxmemoryPolicy,
      mem_fragmentation_ratio: 1.12,
      evicted_keys: this.evictedKeys,
      per_type,
      per_prefix,
      estimated: false,
      sampled_keys: this.data.size,
    };
  }

  public getTopKeys(n = 20): TopKeysResponse {
    const list: Array<{ name: string; type: string; memoryBytes: number; encoding?: string; ttl: number }> = [];
    const now = Date.now();

    for (const [keyName, item] of this.data.entries()) {
      let remainingTtl = -1;
      if (item.ttl > 0) {
        const elapsed = Math.floor((now - item.createdAt) / 1000);
        remainingTtl = Math.max(0, item.ttl - elapsed);
      }
      list.push({
        name: keyName,
        type: item.type,
        memoryBytes: this.computeKeyMemory(item),
        encoding: item.encoding,
        ttl: remainingTtl,
      });
    }

    list.sort((a, b) => b.memoryBytes - a.memoryBytes);
    const top = list.slice(0, Math.min(100, Math.max(1, n)));

    return {
      top_keys: top,
      sampled_keys: this.data.size,
      capped: false,
    };
  }

  public simulateEviction(maxmemoryBytes: number, policy: string): MemorySimulateResponse {
    const currentUsed = this.getParsedInfo().memory.used_memory;
    const deficitBytes = Math.max(0, currentUsed - maxmemoryBytes);
    const totalKeys = this.data.size;

    let eligibleKeysCount = 0;
    let eligibleBytesTotal = 0;
    const now = Date.now();

    for (const [, item] of this.data.entries()) {
      const bytes = this.computeKeyMemory(item);
      const hasTtl = item.ttl > 0 && Math.max(0, item.ttl - Math.floor((now - item.createdAt) / 1000)) > 0;

      if (policy.startsWith('volatile-')) {
        if (hasTtl) {
          eligibleKeysCount++;
          eligibleBytesTotal += bytes;
        }
      } else if (policy.startsWith('allkeys-')) {
        eligibleKeysCount++;
        eligibleBytesTotal += bytes;
      }
    }

    let keysAtRisk = 0;
    let writesBlocked = false;
    let summary = '';

    if (deficitBytes === 0) {
      summary = `Target maxmemory (${(maxmemoryBytes / (1024 * 1024)).toFixed(1)} MB) is above currently used memory (${(currentUsed / (1024 * 1024)).toFixed(1)} MB). No existing keys will be evicted under current keyspace volume.`;
    } else if (policy === 'noeviction') {
      keysAtRisk = 0;
      writesBlocked = true;
      summary = `With 'noeviction', Redis will NOT evict any keys. All new write commands (SET, HSET, LPUSH, etc.) will fail immediately with OOM errors until memory drops below maxmemory.`;
    } else if (policy.startsWith('volatile-')) {
      if (eligibleKeysCount === 0) {
        keysAtRisk = 0;
        writesBlocked = true;
        summary = `Policy '${policy}' only evicts keys with a TTL, but none of the sampled keys have a TTL configured. Writes will be blocked immediately!`;
      } else {
        const avgKeyBytes = eligibleBytesTotal / eligibleKeysCount || 1024;
        keysAtRisk = Math.min(eligibleKeysCount, Math.ceil(deficitBytes / avgKeyBytes));
        writesBlocked = eligibleBytesTotal < deficitBytes;
        summary = writesBlocked
          ? `All ${eligibleKeysCount} volatile keys (~${(eligibleBytesTotal / (1024 * 1024)).toFixed(1)} MB) will be evicted, but that is insufficient to cover the ${(deficitBytes / (1024 * 1024)).toFixed(1)} MB deficit. Subsequent writes will fail.`
          : `Estimated ~${keysAtRisk.toLocaleString()} keys with TTL (${Math.round((keysAtRisk / totalKeys) * 100)}% of total keyspace) will be evicted to recover ${(deficitBytes / (1024 * 1024)).toFixed(1)} MB.`;
      }
    } else {
      // allkeys
      const avgKeyBytes = eligibleBytesTotal / eligibleKeysCount || 1024;
      keysAtRisk = Math.min(eligibleKeysCount, Math.ceil(deficitBytes / avgKeyBytes));
      summary = `Estimated ~${keysAtRisk.toLocaleString()} keys (${Math.round((keysAtRisk / totalKeys) * 100)}% of total keyspace) will be evicted according to '${policy}' order to recover ${(deficitBytes / (1024 * 1024)).toFixed(1)} MB.`;
    }

    const shareAtRiskPercent = totalKeys > 0 ? Math.round((keysAtRisk / totalKeys) * 1000) / 10 : 0;

    return {
      targetMaxmemory: maxmemoryBytes,
      targetPolicy: policy,
      currentUsedMemory: currentUsed,
      deficitBytes,
      keysAtRisk,
      shareAtRiskPercent,
      writesBlocked,
      summary,
      method: `Calculated from a representative sample of ${totalKeys} keys using exact memory footprints and '${policy}' eligibility criteria.`,
      equivalentCommand: [
        `CONFIG SET maxmemory ${maxmemoryBytes}`,
        `CONFIG SET maxmemory-policy ${policy}`,
      ],
    };
  }

  public getSoonestExpiringKeys(n = 50): ExpirationSoonestResponse {
    const now = Date.now();
    const list: Array<{ name: string; type: string; ttl: number; ttlMs: number; expiresAt: string; memoryBytes?: number }> = [];

    for (const [keyName, item] of this.data.entries()) {
      if (item.ttl > 0) {
        const elapsed = Math.floor((now - item.createdAt) / 1000);
        const remainingTtl = Math.max(0, item.ttl - elapsed);
        if (remainingTtl > 0) {
          list.push({
            name: keyName,
            type: item.type,
            ttl: remainingTtl,
            ttlMs: remainingTtl * 1000,
            expiresAt: new Date(now + remainingTtl * 1000).toISOString(),
            memoryBytes: this.computeKeyMemory(item),
          });
        }
      }
    }

    list.sort((a, b) => a.ttl - b.ttl);
    const top = list.slice(0, Math.min(100, Math.max(1, n)));

    return {
      keys: top,
      totalWithTtl: list.length,
      totalSampled: this.data.size,
    };
  }

  public getExpirationHistogram(): ExpirationHistogramResponse {
    const now = Date.now();
    let b1m = 0;   // <= 60s
    let b1h = 0;   // <= 3600s
    let b1d = 0;   // <= 86400s
    let b7d = 0;   // <= 604800s
    let bMore = 0; // > 7d
    let noTtl = 0;

    for (const [, item] of this.data.entries()) {
      if (item.ttl <= 0) {
        noTtl++;
        continue;
      }
      const elapsed = Math.floor((now - item.createdAt) / 1000);
      const remaining = Math.max(0, item.ttl - elapsed);
      if (remaining === 0) {
        noTtl++;
      } else if (remaining <= 60) {
        b1m++;
      } else if (remaining <= 3600) {
        b1h++;
      } else if (remaining <= 86400) {
        b1d++;
      } else if (remaining <= 604800) {
        b7d++;
      } else {
        bMore++;
      }
    }

    const total = this.data.size;
    const withTtlCount = total - noTtl;

    const buckets = [
      { label: '< 1 min', range: '0s - 60s', count: b1m, percentage: total > 0 ? Math.round((b1m / total) * 1000) / 10 : 0 },
      { label: '< 1 hour', range: '1m - 1h', count: b1h, percentage: total > 0 ? Math.round((b1h / total) * 1000) / 10 : 0 },
      { label: '< 1 day', range: '1h - 24h', count: b1d, percentage: total > 0 ? Math.round((b1d / total) * 1000) / 10 : 0 },
      { label: '< 7 days', range: '1d - 7d', count: b7d, percentage: total > 0 ? Math.round((b7d / total) * 1000) / 10 : 0 },
      { label: '> 7 days', range: '> 7d', count: bMore, percentage: total > 0 ? Math.round((bMore / total) * 1000) / 10 : 0 },
      { label: 'No TTL (Persist)', range: 'Persistent', count: noTtl, percentage: total > 0 ? Math.round((noTtl / total) * 1000) / 10 : 0 },
    ];

    return {
      buckets,
      totalSampled: total,
      withTtlCount,
      noTtlCount: noTtl,
    };
  }

  public bulkSetTtl(pattern: string, ttl: number, dryRun = false): BulkSetTtlResponse {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matchedKeys: string[] = [];

    for (const [keyName] of this.data.entries()) {
      if (regex.test(keyName)) {
        matchedKeys.push(keyName);
      }
    }

    const sample = matchedKeys.slice(0, 5);
    const command = ttl === -1
      ? `PERSIST ${pattern} (${matchedKeys.length} keys)`
      : `EXPIRE ${pattern} ${ttl} (${matchedKeys.length} keys)`;

    if (!dryRun) {
      for (const k of matchedKeys) {
        this.setTtl(k, ttl);
      }
    }

    return {
      success: true,
      pattern,
      ttl,
      matchedCount: matchedKeys.length,
      sample,
      command,
      dryRun,
    };
  }

  public updateMemoryConfig(maxmemory?: number, policy?: string): { success: boolean; commands: string[]; previous: { maxmemory: number; policy: string } } {
    const previous = {
      maxmemory: this.maxmemory,
      policy: this.maxmemoryPolicy,
    };
    const commands: string[] = [];

    if (maxmemory !== undefined && maxmemory >= 0) {
      this.maxmemory = maxmemory;
      commands.push(`CONFIG SET maxmemory ${maxmemory}`);
    }
    if (policy && typeof policy === 'string') {
      this.maxmemoryPolicy = policy;
      commands.push(`CONFIG SET maxmemory-policy "${policy}"`);
    }

    return {
      success: true,
      commands,
      previous,
    };
  }

  // ==========================================
  // Step 8: Client Management & Slow Log Logic
  // ==========================================

  private loadBundledCauses(): SlowLogCauseHint[] {
    try {
      const candidates = [
        path.resolve(process.cwd(), '../../packages/shared/slowlog-causes.json'),
        path.resolve(process.cwd(), '../packages/shared/slowlog-causes.json'),
        path.resolve(process.cwd(), 'packages/shared/slowlog-causes.json'),
        'D:\\pbRedisDB\\packages\\shared\\slowlog-causes.json',
        'C:\\Users\\prash\\OneDrive\\Desktop\\pbRedisDB\\packages\\shared\\slowlog-causes.json',
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
      }
    } catch {}
    return [];
  }

  private findCauseHint(cmdStr: string): SlowLogCauseHint | undefined {
    const causes = this.loadBundledCauses();
    for (const c of causes) {
      try {
        const regex = new RegExp(c.pattern, 'i');
        if (regex.test(cmdStr)) return c;
      } catch {}
    }
    return undefined;
  }

  private seedRealisticClients() {
    this.demoClients = [
      {
        id: '101',
        addr: '10.0.1.12:43210',
        name: 'webapp_web_primary_1',
        age: 3420,
        idle: 1,
        db: 0,
        cmd: 'GET',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'default',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '102',
        addr: '10.0.1.13:43212',
        name: 'webapp_web_primary_2',
        age: 3100,
        idle: 0,
        db: 0,
        cmd: 'SET',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'default',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '103',
        addr: '10.0.2.45:51200',
        name: 'order_checkout_service',
        age: 7200,
        idle: 4,
        db: 0,
        cmd: 'HGETALL',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 64,
        events: 'r',
        user: 'service_order',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '104',
        addr: '10.0.3.88:38900',
        name: 'analytics_aggregator',
        age: 14200,
        idle: 12,
        db: 0,
        cmd: 'SMEMBERS',
        flags: 'N',
        qbuf: 0,
        qbufFree: 40960,
        obl: 128,
        oll: 2,
        omem: 245000,
        events: 'rw',
        user: 'analytics',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '105',
        addr: '10.0.4.10:49120',
        name: 'billing_cron_job',
        age: 620,
        idle: 450,
        db: 0,
        cmd: 'LRANGE',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'cron_worker',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: true,
      },
      {
        id: '106',
        addr: '10.0.5.21:33400',
        name: 'pubsub_order_events',
        age: 18200,
        idle: 0,
        db: 0,
        cmd: 'SUBSCRIBE',
        flags: 'P',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'pubsub_listener',
        isBlocked: false,
        isSubscribed: true,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '107',
        addr: '10.0.5.22:33402',
        name: 'pubsub_notifications_feed',
        age: 18200,
        idle: 0,
        db: 0,
        cmd: 'PSUBSCRIBE',
        flags: 'P',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'pubsub_listener',
        isBlocked: false,
        isSubscribed: true,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '108',
        addr: '10.0.6.14:52110',
        name: 'worker_task_consumer_1',
        age: 5400,
        idle: 42,
        db: 0,
        cmd: 'BLPOP',
        flags: 'b',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'queue_worker',
        isBlocked: true,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '109',
        addr: '10.0.6.15:52112',
        name: 'worker_task_consumer_2',
        age: 5400,
        idle: 18,
        db: 0,
        cmd: 'BLPOP',
        flags: 'b',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'queue_worker',
        isBlocked: true,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '110',
        addr: '10.0.8.2:6380',
        name: 'replica_sync_us_east',
        age: 86400,
        idle: 0,
        db: 0,
        cmd: 'PSYNC',
        flags: 'S',
        qbuf: 0,
        qbufFree: 40960,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'replication_user',
        isBlocked: false,
        isSubscribed: true,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '111',
        addr: '127.0.0.1:58210',
        name: 'datadog_redis_agent',
        age: 43200,
        idle: 3,
        db: 0,
        cmd: 'INFO',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'monitoring',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
      {
        id: '112',
        addr: '10.0.9.101:39010',
        name: 'stale_pool_connection_1',
        age: 9200,
        idle: 720,
        db: 0,
        cmd: 'PING',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'default',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: true,
      },
      {
        id: '113',
        addr: '10.0.9.102:39012',
        name: 'stale_pool_connection_2',
        age: 9200,
        idle: 1240,
        db: 0,
        cmd: 'PING',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'default',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: true,
      },
      {
        id: '114',
        addr: '10.0.11.5:41200',
        name: 'reporting_export_dumper',
        age: 120,
        idle: 2,
        db: 0,
        cmd: 'KEYS',
        flags: 'N',
        qbuf: 0,
        qbufFree: 65536,
        obl: 16384,
        oll: 120,
        omem: 12500000,
        events: 'rw',
        user: 'admin',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: true,
        isHighIdle: false,
      },
      {
        id: '115',
        addr: '127.0.0.1:59910',
        name: 'redis_cli_admin_ssh',
        age: 45,
        idle: 0,
        db: 0,
        cmd: 'CLIENT',
        flags: 'N',
        qbuf: 0,
        qbufFree: 20474,
        obl: 0,
        oll: 0,
        omem: 0,
        events: 'r',
        user: 'admin',
        isBlocked: false,
        isSubscribed: false,
        isHighBuffer: false,
        isHighIdle: false,
      },
    ];
  }

  private seedRealisticSlowLog() {
    const now = Date.now();
    const rawSlow = [
      {
        id: 142,
        timestamp: Math.floor((now - 120000) / 1000),
        durationUs: 124500, // 124.5 ms
        command: 'KEYS *',
        args: ['KEYS', '*'],
        clientAddr: '10.0.11.5:41200',
        clientName: 'reporting_export_dumper',
      },
      {
        id: 141,
        timestamp: Math.floor((now - 340000) / 1000),
        durationUs: 74200, // 74.2 ms
        command: 'KEYS user:*:tokens',
        args: ['KEYS', 'user:*:tokens'],
        clientAddr: '10.0.1.12:43210',
        clientName: 'webapp_web_primary_1',
      },
      {
        id: 140,
        timestamp: Math.floor((now - 560000) / 1000),
        durationUs: 89100, // 89.1 ms
        command: 'HGETALL user:all_profiles',
        args: ['HGETALL', 'user:all_profiles'],
        clientAddr: '10.0.3.88:38900',
        clientName: 'analytics_aggregator',
      },
      {
        id: 139,
        timestamp: Math.floor((now - 780000) / 1000),
        durationUs: 64300, // 64.3 ms
        command: 'SMEMBERS large_tag_index',
        args: ['SMEMBERS', 'large_tag_index'],
        clientAddr: '10.0.3.88:38900',
        clientName: 'analytics_aggregator',
      },
      {
        id: 138,
        timestamp: Math.floor((now - 920000) / 1000),
        durationUs: 52800, // 52.8 ms
        command: 'LRANGE queue:events:archived 0 -1',
        args: ['LRANGE', 'queue:events:archived', '0', '-1'],
        clientAddr: '10.0.4.10:49120',
        clientName: 'billing_cron_job',
      },
      {
        id: 137,
        timestamp: Math.floor((now - 1100000) / 1000),
        durationUs: 112000, // 112.0 ms
        command: 'SORT analytics:scores BY weight_*',
        args: ['SORT', 'analytics:scores', 'BY', 'weight_*'],
        clientAddr: '10.0.3.88:38900',
        clientName: 'analytics_aggregator',
      },
      {
        id: 136,
        timestamp: Math.floor((now - 1340000) / 1000),
        durationUs: 78400, // 78.4 ms
        command: 'SUNION group:all_members group:global',
        args: ['SUNION', 'group:all_members', 'group:global'],
        clientAddr: '10.0.3.88:38900',
        clientName: 'analytics_aggregator',
      },
      {
        id: 135,
        timestamp: Math.floor((now - 1580000) / 1000),
        durationUs: 45200, // 45.2 ms
        command: 'DEL giant_cache_blob',
        args: ['DEL', 'giant_cache_blob'],
        clientAddr: '10.0.6.14:52110',
        clientName: 'worker_task_consumer_1',
      },
      {
        id: 134,
        timestamp: Math.floor((now - 1800000) / 1000),
        durationUs: 38900, // 38.9 ms
        command: 'MGET key1 key2 ... key100',
        args: ['MGET', 'key1', 'key2', 'key3', 'key4'],
        clientAddr: '10.0.1.13:43212',
        clientName: 'webapp_web_primary_2',
      },
      {
        id: 133,
        timestamp: Math.floor((now - 2100000) / 1000),
        durationUs: 152000, // 152.0 ms
        command: 'FLUSHDB',
        args: ['FLUSHDB'],
        clientAddr: '127.0.0.1:59910',
        clientName: 'redis_cli_admin_ssh',
      },
      {
        id: 132,
        timestamp: Math.floor((now - 2500000) / 1000),
        durationUs: 28500, // 28.5 ms
        command: 'HGETALL product:catalog:full',
        args: ['HGETALL', 'product:catalog:full'],
        clientAddr: '10.0.2.45:51200',
        clientName: 'order_checkout_service',
      },
      {
        id: 131,
        timestamp: Math.floor((now - 3100000) / 1000),
        durationUs: 18200, // 18.2 ms
        command: 'KEYS session:stale:*',
        args: ['KEYS', 'session:stale:*'],
        clientAddr: '10.0.4.10:49120',
        clientName: 'billing_cron_job',
      },
    ];

    this.demoSlowLog = rawSlow.map((item) => ({
      ...item,
      timestampIso: new Date(item.timestamp * 1000).toISOString(),
      durationMs: Math.round(item.durationUs / 10) / 100,
      causeHint: this.findCauseHint(item.command),
    }));
  }

  public getClients(): ClientsResponse {
    const clients = this.demoClients;
    const blockedCount = clients.filter((c) => c.isBlocked).length;
    const subscribedCount = clients.filter((c) => c.isSubscribed).length;
    const highBufferCount = clients.filter((c) => c.isHighBuffer).length;
    const highIdleCount = clients.filter((c) => c.isHighIdle).length;

    return {
      clients,
      total: clients.length,
      blockedCount,
      subscribedCount,
      maxClients: 10000,
      highBufferCount,
      highIdleCount,
    };
  }

  public killClient(id: string): { success: boolean; id: string; command: string } {
    const idx = this.demoClients.findIndex((c) => c.id === String(id));
    if (idx !== -1) {
      this.demoClients.splice(idx, 1);
      return { success: true, id, command: `CLIENT KILL ID ${id}` };
    }
    return { success: false, id, command: `CLIENT KILL ID ${id}` };
  }

  public renameClient(id: string, name: string): { success: boolean; id: string; name: string; command: string } {
    const client = this.demoClients.find((c) => c.id === String(id));
    if (client) {
      client.name = name;
      return { success: true, id, name, command: `CLIENT SETNAME "${name}"` };
    }
    return { success: false, id, name, command: `CLIENT SETNAME "${name}"` };
  }

  public getSlowLog(n = 50): SlowLogResponse {
    const entries = this.demoSlowLog.slice(0, Math.min(200, Math.max(1, n)));
    return {
      entries,
      count: entries.length,
      len: this.demoSlowLog.length,
      thresholdUs: this.slowlogThresholdUs,
      thresholdMs: Math.round(this.slowlogThresholdUs / 1000),
    };
  }

  public getSlowLogLen(): { len: number } {
    return { len: this.demoSlowLog.length };
  }

  public resetSlowLog(): { success: boolean; command: string } {
    this.demoSlowLog = [];
    return { success: true, command: 'SLOWLOG RESET' };
  }

  public setSlowLogThreshold(microseconds: number): { success: boolean; thresholdUs: number; command: string } {
    this.slowlogThresholdUs = microseconds;
    return {
      success: true,
      thresholdUs: microseconds,
      command: `CONFIG SET slowlog-log-slower-than ${microseconds}`,
    };
  }

  // ==========================================
  // Step 9: Persistence & Replication
  // ==========================================

  public getPersistenceInfo(): PersistenceInfoResponse {
    return {
      loading: false,
      rdbLastSaveTime: this.rdbLastSaveTime,
      rdbLastSaveTimeIso: new Date(this.rdbLastSaveTime * 1000).toISOString(),
      rdbLastBgsaveStatus: this.rdbLastBgsaveStatus,
      rdbLastBgsaveTimeSec: this.rdbLastBgsaveTimeSec,
      rdbCurrentBgsaveTimeSec: this.rdbBgsaveInProgress ? 1 : -1,
      rdbBgsaveInProgress: this.rdbBgsaveInProgress,
      rdbChangesSinceLastSave: this.rdbChangesSinceLastSave,
      rdbSizeBytes: 1843200,

      aofEnabled: true,
      aofRewriteInProgress: this.aofRewriteInProgress,
      aofRewriteScheduled: false,
      aofLastRewriteTimeSec: 3,
      aofCurrentRewriteTimeSec: this.aofRewriteInProgress ? 1 : -1,
      aofLastBgrewriteStatus: 'ok',
      aofCurrentSize: 4194304,
      aofBaseSize: 3145728,
      aofBufferDelay: 0,
      aofFsyncPolicy: this.aofFsyncPolicy,

      saveTimeline: this.demoSaveTimeline,
    };
  }

  public bgsave(): { success: boolean; command: string; inProgress: boolean; message?: string } {
    if (this.rdbBgsaveInProgress) {
      return {
        success: true,
        command: 'BGSAVE',
        inProgress: true,
        message: 'Background saving is already in progress.',
      };
    }

    this.rdbBgsaveInProgress = true;
    setTimeout(() => {
      this.rdbBgsaveInProgress = false;
      this.rdbLastSaveTime = Math.floor(Date.now() / 1000);
      this.rdbChangesSinceLastSave = 0;
      this.demoSaveTimeline.unshift({
        id: `snap-${Date.now()}`,
        type: 'rdb',
        timestamp: this.rdbLastSaveTime,
        timestampIso: new Date().toISOString(),
        durationSec: 2,
        sizeBytes: 1843200 + Math.floor(Math.random() * 20000),
        status: 'ok',
        keysCount: this.data.size,
      });
    }, 2500);

    return {
      success: true,
      command: 'BGSAVE',
      inProgress: true,
      message: 'Background saving started',
    };
  }

  public bgrewriteaof(): { success: boolean; command: string; inProgress: boolean; message?: string } {
    if (this.aofRewriteInProgress) {
      return {
        success: true,
        command: 'BGREWRITEAOF',
        inProgress: true,
        message: 'Background AOF rewrite already in progress.',
      };
    }

    this.aofRewriteInProgress = true;
    setTimeout(() => {
      this.aofRewriteInProgress = false;
      this.demoSaveTimeline.unshift({
        id: `aof-${Date.now()}`,
        type: 'aof',
        timestamp: Math.floor(Date.now() / 1000),
        timestampIso: new Date().toISOString(),
        durationSec: 3,
        sizeBytes: 3145728,
        status: 'ok',
        keysCount: this.data.size,
      });
    }, 3000);

    return {
      success: true,
      command: 'BGREWRITEAOF',
      inProgress: true,
      message: 'Background append only file rewriting started',
    };
  }

  public setFsyncPolicy(policy: 'always' | 'everysec' | 'no'): { success: boolean; policy: string; command: string } {
    this.aofFsyncPolicy = policy;
    return {
      success: true,
      policy,
      command: `CONFIG SET appendfsync ${policy}`,
    };
  }

  public async inspectSnapshot(filePath: string): Promise<SnapshotInspectResponse> {
    return inspectorRegistry.inspectFile(filePath);
  }

  public getReplicationTopology(): ReplicationTopologyResponse {
    // Advance master offset slightly to simulate live active traffic
    this.masterReplOffset += Math.floor(Math.random() * 280) + 70;

    const currentWriteRateBytesSec = 24500;
    const coverageSec = Math.max(1, Math.round(this.replBacklogSize / currentWriteRateBytesSec));

    if (this.replicationRole === 'slave') {
      return {
        role: 'slave',
        connectedSlaves: 0,
        masterReplId: this.masterReplId,
        masterReplId2: '0000000000000000000000000000000000000000',
        masterReplOffset: this.masterReplOffset,
        secondReplOffset: -1,
        replBacklogActive: true,
        replBacklogSize: this.replBacklogSize,
        replBacklogFirstByteOffset: Math.max(1, this.masterReplOffset - this.replBacklogHistlen),
        replBacklogHistlen: this.replBacklogHistlen,
        backlogCoverageSeconds: coverageSec,
        masterHost: this.masterHost || '10.0.1.10',
        masterPort: this.masterPort || 6379,
        masterLinkStatus: 'up',
        masterLastIoSecondsAgo: 0,
        masterSyncInProgress: false,
        replicas: [],
      };
    }

    // Master role with 2 connected replicas
    // Replica 1 is tightly synced
    const rep1Offset = this.masterReplOffset - Math.floor(Math.random() * 80);
    const rep1LagBytes = Math.max(0, this.masterReplOffset - rep1Offset);

    // Replica 2 occasionally has minor lag
    const isRep2Lagging = (Math.floor(Date.now() / 1000) % 18) > 13;
    const rep2LagBytes = isRep2Lagging ? 16384 + Math.floor(Math.random() * 8192) : Math.floor(Math.random() * 320);
    const rep2Offset = this.masterReplOffset - rep2LagBytes;

    const replicas: ReplicaNodeInfo[] = [
      {
        id: 'replica-1-prod',
        ip: '10.0.1.24',
        port: 6380,
        state: 'online',
        offset: rep1Offset,
        lagSeconds: 0,
        lagBytes: rep1LagBytes,
        lastAckSecondsAgo: 0,
        syncType: 'partial_resync',
      },
      {
        id: 'replica-2-dr',
        ip: '10.0.2.105',
        port: 6380,
        state: isRep2Lagging ? 'wait_bgsave' : 'online',
        offset: rep2Offset,
        lagSeconds: isRep2Lagging ? 2 : 0,
        lagBytes: rep2LagBytes,
        lastAckSecondsAgo: isRep2Lagging ? 2 : 0,
        syncType: isRep2Lagging ? 'full_sync' : 'partial_resync',
      },
    ];

    return {
      role: 'master',
      connectedSlaves: replicas.length,
      masterReplId: this.masterReplId,
      masterReplId2: '0000000000000000000000000000000000000000',
      masterReplOffset: this.masterReplOffset,
      secondReplOffset: -1,
      replBacklogActive: true,
      replBacklogSize: this.replBacklogSize,
      replBacklogFirstByteOffset: Math.max(1, this.masterReplOffset - this.replBacklogHistlen),
      replBacklogHistlen: this.replBacklogHistlen,
      backlogCoverageSeconds: coverageSec,
      replicas,
    };
  }

  public getReplicationPreflight(action: 'replicaof' | 'promote', host?: string, port?: number): ReplicationPreflightResponse {
    if (action === 'replicaof') {
      const targetHost = host || '10.0.1.99';
      const targetPort = port || 6379;

      const checklist: PreflightCheckItem[] = [
        {
          name: 'Target Master Reachability',
          passed: true,
          message: `Target ${targetHost}:${targetPort} responded to TCP handshake.`,
          severity: 'info',
        },
        {
          name: 'Local Keyspace Eviction Warning',
          passed: false,
          message: `This node is currently MASTER with ${this.data.size} keys. Becoming a replica will FLUSH the current keyspace and replace all data with the master stream.`,
          severity: 'critical',
        },
        {
          name: 'Active Write Traffic Detection',
          passed: false,
          message: 'Client connections are actively issuing writes to this node. Transitioning roles will drop client writes.',
          severity: 'warning',
        },
        {
          name: 'PSYNC Backlog Synchronization',
          passed: true,
          message: 'Replication backlog is ready for initial PSYNC handshake.',
          severity: 'info',
        },
      ];

      return {
        action: 'replicaof',
        targetHost,
        targetPort,
        replicaCaughtUp: false,
        maxLagBytes: 0,
        maxLagSeconds: 0,
        writesInFlight: 14,
        dataLossRisk: 'high',
        checklist,
        explanation: `Changing role to REPLICAOF ${targetHost} ${targetPort} will immediately discard local keys and start an asynchronous full synchronization from the new primary.`,
      };
    } else {
      // Promote action (REPLICAOF NO ONE)
      const checklist: PreflightCheckItem[] = [
        {
          name: 'Replication Stream Synchronization',
          passed: true,
          message: 'Replica offset is within 0 bytes of primary master. No replication lag.',
          severity: 'info',
        },
        {
          name: 'In-Flight Replication Ack',
          passed: true,
          message: 'Last replication ACK received 0 seconds ago.',
          severity: 'info',
        },
        {
          name: 'Primary Promotion Confirmation',
          passed: true,
          message: 'Node will transition from read-only replica to read-write master without restarting.',
          severity: 'info',
        },
      ];

      return {
        action: 'promote',
        replicaCaughtUp: true,
        maxLagBytes: 0,
        maxLagSeconds: 0,
        writesInFlight: 0,
        dataLossRisk: 'none',
        checklist,
        explanation: 'Promoting this replica executes "REPLICAOF NO ONE". The node stops following the primary master and immediately accepts local writes.',
      };
    }
  }

  public replicaOf(host: string, port: number): { success: boolean; command: string } {
    this.replicationRole = 'slave';
    this.masterHost = host;
    this.masterPort = port;
    return {
      success: true,
      command: `REPLICAOF ${host} ${port}`,
    };
  }

  public promote(): { success: boolean; command: string } {
    this.replicationRole = 'master';
    this.masterHost = undefined;
    this.masterPort = undefined;
    return {
      success: true,
      command: 'REPLICAOF NO ONE',
    };
  }

  // ==========================================
  // Step 10: Security & ACL, Configuration
  // ==========================================

  public getAclUsers(): AclUserItem[] {
    return [...this.demoAclUsers];
  }

  public setAclUser(rule: AclRuleObject): { success: boolean; username: string; command: string } {
    const rawArgs = buildAclSetUserArgs(rule);
    const line = `user ${rawArgs.join(' ')}`;
    const parsed = parseAclListLine(line);

    const idx = this.demoAclUsers.findIndex((u) => u.username === rule.username);
    if (idx !== -1) {
      this.demoAclUsers[idx] = parsed;
    } else {
      this.demoAclUsers.push(parsed);
    }

    return {
      success: true,
      username: rule.username,
      command: `ACL SETUSER ${rawArgs.join(' ')}`,
    };
  }

  public deleteAclUser(name: string): { success: boolean; username: string; command: string } {
    if (name === 'default') {
      throw new Error("Cannot delete the 'default' user in Redis.");
    }
    const idx = this.demoAclUsers.findIndex((u) => u.username === name);
    if (idx !== -1) {
      this.demoAclUsers.splice(idx, 1);
    }
    return {
      success: true,
      username: name,
      command: `ACL DELUSER ${name}`,
    };
  }

  public getAclCategories(): AclCategoryInfo[] {
    return [...ACL_CATEGORIES];
  }

  public testAclUser(username: string, rawCommand: string): AclTestResult {
    const user = this.demoAclUsers.find((u) => u.username === username);
    if (!user) {
      return {
        user: username,
        command: rawCommand,
        allowed: false,
        reason: `User '${username}' does not exist in ACL keyspace.`,
        decidingRule: 'user-not-found',
      };
    }

    if (!user.enabled) {
      return {
        user: username,
        command: rawCommand,
        allowed: false,
        reason: `User account '${username}' is disabled ('off').`,
        decidingRule: 'off',
      };
    }

    const trimmed = rawCommand.trim();
    const parts = trimmed.split(/\s+/);
    const verb = (parts[0] || '').toUpperCase();

    // Default user allows all
    if (user.username === 'default' && user.allowedCategories.includes('all')) {
      return {
        user: username,
        command: rawCommand,
        allowed: true,
        reason: 'Default user has full +@all permission.',
        decidingRule: '+@all',
      };
    }

    // Dangerous commands check
    const dangerousCommands = ['KEYS', 'FLUSHALL', 'FLUSHDB', 'SHUTDOWN', 'DEBUG', 'SAVE', 'CONFIG', 'REPLICAOF'];
    if (dangerousCommands.includes(verb)) {
      if (user.deniedCategories.includes('dangerous') || user.deniedCategories.includes('admin') || user.deniedCommands.includes(verb)) {
        return {
          user: username,
          command: rawCommand,
          allowed: false,
          reason: `Command '${verb}' belongs to the dangerous/admin category which is explicitly denied for ${username}.`,
          decidingRule: `-@dangerous`,
        };
      }
    }

    // Write commands check
    const writeCommands = ['SET', 'DEL', 'HSET', 'RPUSH', 'LPUSH', 'SADD', 'ZADD', 'INCR', 'DECR'];
    if (writeCommands.includes(verb)) {
      if (user.deniedCategories.includes('write') || user.deniedCommands.includes(verb)) {
        return {
          user: username,
          command: rawCommand,
          allowed: false,
          reason: `Write command '${verb}' is denied by rule -@write.`,
          decidingRule: `-@write`,
        };
      }
    }

    // Key pattern check
    if (parts.length > 1 && !user.keysSummary.includes('All keys')) {
      const keyArg = parts[1];
      const patterns = user.keysSummary.split(',').map((s) => s.trim().replace(/^~/, ''));
      const matchesAny = patterns.some((pat) => {
        if (pat === '*') return true;
        if (pat.endsWith('*')) return keyArg.startsWith(pat.slice(0, -1));
        return keyArg === pat;
      });

      if (!matchesAny) {
        return {
          user: username,
          command: rawCommand,
          allowed: false,
          reason: `Key '${keyArg}' violates restricted key pattern (${user.keysSummary}).`,
          decidingRule: `keyspace-restriction: ${user.keysSummary}`,
        };
      }
    }

    return {
      user: username,
      command: rawCommand,
      allowed: true,
      reason: `Command allowed under rules for ${username}.`,
      decidingRule: user.allowedCategories.length > 0 ? `+@${user.allowedCategories[0]}` : '+command',
    };
  }

  public getSecurityStatus(): SecurityStatusResponse {
    const defaultUser = this.demoAclUsers.find((u) => u.username === 'default');
    const isDefaultNopass = defaultUser ? defaultUser.isNoPass : true;
    const isDangerousAllowed = defaultUser ? !defaultUser.deniedCategories.includes('dangerous') : true;

    return {
      authRequired: !isDefaultNopass,
      tlsEnabled: false,
      defaultUserState: {
        enabled: defaultUser ? defaultUser.enabled : true,
        hasPassword: !isDefaultNopass,
        isDangerousAllowed,
        summary: isDefaultNopass
          ? "Default user is unprotected with 'nopass' and has access to all commands (+@all)."
          : 'Default user is password protected.',
      },
      recommendations: [
        "Default user has 'nopass'. Set a strong password or switch clients to dedicated named ACL accounts.",
        "Default user permits '+@dangerous' (e.g. KEYS, FLUSHALL). Restrict default permissions to +@read +@write.",
        'Connections currently use plaintext TCP without TLS encryption.',
      ],
    };
  }

  public getConfigParams(): ConfigParamItem[] {
    const metaList = loadConfigMetadata();
    return metaList.map((meta) => {
      const current = this.demoConfigValues.has(meta.name)
        ? this.demoConfigValues.get(meta.name)
        : meta.default;

      return {
        ...meta,
        currentValue: current,
        isChangedFromDefault: JSON.stringify(current) !== JSON.stringify(meta.default),
      };
    });
  }

  public setConfigParam(param: string, value: any): { success: boolean; parameter: string; previousValue: any; newValue: any; command: string } {
    const metaList = loadConfigMetadata();
    const validation = validateConfigParam(param, value, metaList);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const current = this.demoConfigValues.has(param) ? this.demoConfigValues.get(param) : undefined;
    this.configRollbackStack.push({
      parameter: param,
      previousValue: current,
      timestamp: Date.now(),
    });

    const meta = metaList.find((m) => m.name.toLowerCase() === param.toLowerCase());
    let parsedVal: any = validation.normalizedValue;
    if (meta?.type === 'integer' || meta?.type === 'bytes') parsedVal = Number(validation.normalizedValue);
    if (meta?.type === 'boolean') parsedVal = validation.normalizedValue === 'yes';

    this.demoConfigValues.set(param, parsedVal);

    return {
      success: true,
      parameter: param,
      previousValue: current,
      newValue: parsedVal,
      command: `CONFIG SET ${param} ${parsedVal}`,
    };
  }

  public rollbackConfig(): { success: boolean; parameter?: string; rolledBackTo?: any; command?: string; message?: string } {
    const item = this.configRollbackStack.pop();
    if (!item) {
      return { success: false, message: 'Nothing to rollback.' };
    }

    if (item.previousValue !== undefined) {
      this.demoConfigValues.set(item.parameter, item.previousValue);
    } else {
      this.demoConfigValues.delete(item.parameter);
    }

    return {
      success: true,
      parameter: item.parameter,
      rolledBackTo: item.previousValue,
      command: `CONFIG SET ${item.parameter} ${item.previousValue}`,
    };
  }

  public exportConfig(): string {
    const items = this.getConfigParams();
    return generateRedisConfExport(items);
  }

  // ==========================================
  // Step 11: Pub/Sub & Live Monitor
  // ==========================================

  public getPubSubChannels(pattern = '*'): PubSubChannelsResponse {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const channels: PubSubChannelItem[] = [];
    for (const [name, subs] of this.demoChannels.entries()) {
      if (pattern === '*' || regex.test(name)) {
        channels.push({ name, subscribers: subs });
      }
    }
    channels.sort((a, b) => b.subscribers - a.subscribers);
    return {
      channels,
      totalChannels: this.demoChannels.size,
      patternCount: 3,
    };
  }

  public publishPubSub(channel: string, message: string): { success: boolean; channel: string; receivers: number; command: string } {
    const existing = this.demoChannels.get(channel);
    const receivers = existing !== undefined ? existing : 1;
    if (existing === undefined) {
      this.demoChannels.set(channel, 1);
    }
    return {
      success: true,
      channel,
      receivers,
      command: `PUBLISH "${channel}" "${message.replace(/"/g, '\\"')}"`,
    };
  }
}




