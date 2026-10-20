import fs from 'fs';
import path from 'path';
import { Redis } from 'ioredis';
import {
  ConnectionStatus,
  ParsedRedisInfo,
  KeySummary,
  KeyDetailResponse,
  CommandMeta,
  PipelineResult,
  PipelineReplyItem,
  UserContext,
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
import { parseRedisInfo } from './info.js';
import { DemoRedisEngine } from './demo.js';
import { SafetyEngine } from '../safety/engine.js';
import { ACL_CATEGORIES, parseAclListLine, buildAclSetUserArgs } from '../security/acl.js';
import { loadConfigMetadata, validateConfigParam, generateRedisConfExport } from '../config/meta.js';
import { env } from '../config/env.js';
import { databaseContext } from './context.js';
import { discoverCapabilities } from './capabilities.js';

let cachedCommands: CommandMeta[] | null = null;

function loadBundledCommands(): CommandMeta[] {
  if (cachedCommands) return cachedCommands;
  try {
    const candidates = [
      path.resolve(process.cwd(), '../../packages/shared/command-meta.json'),
      path.resolve(process.cwd(), '../packages/shared/command-meta.json'),
      path.resolve(process.cwd(), 'packages/shared/command-meta.json'),
      'D:\\pbRedisDB\\packages\\shared\\command-meta.json',
      'C:\\Users\\prash\\OneDrive\\Desktop\\pbRedisDB\\packages\\shared\\command-meta.json',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        cachedCommands = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return cachedCommands!;
      }
    }
  } catch (err) {
    console.error('Error loading command-meta.json:', err);
  }
  return [];
}

export class RedisGatewayClient {
  private primaryRedis: Redis | null = null;
  private databases = new Map<number, Redis>();
  private get redis(): Redis | null {
    const db = databaseContext.getStore() ?? 0;
    if (db === 0 || !this.primaryRedis || this.status === 'demo') return this.primaryRedis;
    if (this.primaryRedis.status !== 'ready') throw Object.assign(new Error('The engine is reconnecting. Retry this database request shortly.'), { statusCode: 503 });
    let client = this.databases.get(db);
    if (!client) {
      client = this.primaryRedis.duplicate({ db, lazyConnect: false, enableOfflineQueue: true });
      client.on('error', () => {});
      this.databases.set(db, client);
    }
    return client;
  }
  private set redis(client: Redis | null) { this.primaryRedis = client; }
  private demo = new DemoRedisEngine();
  private get demoEngine(): DemoRedisEngine {
    if (this.status === 'demo' && (databaseContext.getStore() ?? 0) !== 0) {
      throw Object.assign(new Error('The demo dataset uses database 0. Select database 0 or connect a live engine.'), { statusCode: 400 });
    }
    if (this.status !== 'demo') {
      throw Object.assign(new Error('This operation is unavailable on the connected engine. No sample data has been substituted.'), {
        statusCode: this.status === 'connected' ? 501 : 503,
        code: this.status === 'connected' ? 'ENGINE_UNSUPPORTED' : 'ENGINE_UNAVAILABLE',
      });
    }
    return this.demo;
  }
  private host: string;
  private port: number;
  private password?: string;
  private tls = env.REDIS_TLS;
  private isDemoMode = false;
  private status: 'connected' | 'connecting' | 'error' | 'demo' = 'connecting';
  private capabilities: Set<string> = new Set();
  private lastError?: string;
  private lastPingMs = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private connectionGeneration = 0;
  private capabilitiesState: 'pending' | 'ready' | 'error' = 'pending';

  constructor() {
    this.host = env.REDIS_HOST;
    this.port = env.REDIS_PORT;
    this.password = env.REDIS_PASSWORD || undefined;
    this.isDemoMode = env.DEMO_MODE;

    if (this.isDemoMode) {
      this.status = 'demo';
      this.initDemoCapabilities();
    } else {
      this.connect();
      this.startReconnectHeartbeat();
    }
  }

  private initDemoCapabilities() {
    const defaultCaps = [
      'PING', 'ECHO', 'INFO', 'DBSIZE', 'SELECT', 'GET', 'SET', 'MGET', 'MSET',
      'INCR', 'DECR', 'DEL', 'EXISTS', 'TYPE', 'EXPIRE', 'TTL', 'PERSIST',
      'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'HSET', 'HGET',
      'HMSET', 'HMGET', 'HDEL', 'HEXISTS', 'HLEN', 'HGETALL', 'SADD', 'SREM',
      'SMEMBERS', 'SISMEMBER', 'SCARD', 'ZADD', 'ZREM', 'ZSCORE', 'ZRANGE',
      'ZCARD', 'ZRANK', 'MULTI', 'EXEC', 'DISCARD', 'WATCH', 'UNWATCH',
      'PUBLISH', 'PUBSUB', 'SUBSCRIBE', 'PSYNC', 'SAVE', 'BGSAVE', 'SLOWLOG', 'SCAN', 'PTTL', 'PERSIST', 'CLIENT', 'ACL', 'CONFIG', 'COMMAND', 'MEMORY', 'OBJECT'
    ];
    this.capabilities = new Set(defaultCaps);
    this.capabilitiesState = 'ready';
  }

  private isConnecting = false;

  private connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    const generation = ++this.connectionGeneration;
    this.primaryRedis?.disconnect(false);
    for (const database of this.databases.values()) database.disconnect();
    this.databases.clear();
    this.status = 'connecting';
    this.capabilitiesState = 'pending';
    this.capabilities = new Set();
    const client = new Redis({
      host: this.host, port: this.port, password: this.password,
      tls: this.tls ? {} : undefined, enableOfflineQueue: false,
      connectTimeout: 2000, commandTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true,
      retryStrategy: times => {
        if (generation !== this.connectionGeneration || this.isDemoMode) return null;
        if (env.DEMO_FALLBACK) { this.status = 'demo'; this.initDemoCapabilities(); }
        return Math.min(times * 300, 3000);
      },
    });
    this.primaryRedis = client;
    const active = () => generation === this.connectionGeneration && this.primaryRedis === client && !this.isDemoMode;
    client.on('ready', () => {
      if (!active()) return;
      this.status = 'connected'; this.lastError = undefined; this.isConnecting = false;
      void this.probeCapabilities(client, generation);
    });
    client.on('close', () => {
      if (!active()) return;
      this.isConnecting = false;
      if (env.DEMO_FALLBACK) { this.status = 'demo'; this.initDemoCapabilities(); }
      else { this.status = 'connecting'; this.capabilitiesState = 'pending'; }
    });
    client.on('error', (error: Error) => {
      if (!active()) return;
      this.lastError = error.message;
      if (env.DEMO_FALLBACK) { this.status = 'demo'; this.initDemoCapabilities(); }
    });
    client.connect().catch((error: Error) => {
      if (!active()) return;
      this.lastError = error.message; this.isConnecting = false;
      if (env.DEMO_FALLBACK) { this.status = 'demo'; this.initDemoCapabilities(); }
      else this.status = 'error';
    });
  }

  private startReconnectHeartbeat() {
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = setInterval(() => {
      if (this.isDemoMode) return;
      const client = this.primaryRedis;
      if (client?.status === 'ready') {
        if (this.capabilitiesState === 'error') void this.probeCapabilities(client, this.connectionGeneration);
        return;
      }
      if (!client || client.status === 'end' || client.status === 'wait') this.connect();
    }, 3000);
  }

  private async probeCapabilities(client: Redis, generation: number) {
    this.capabilitiesState = 'pending';
    try {
      const discovered = await discoverCapabilities({ call: (command, ...args) => client.call(command, ...args) });
      if (generation !== this.connectionGeneration || this.primaryRedis !== client || client.status !== 'ready') return;
      this.capabilities = discovered;
      this.capabilitiesState = 'ready';
    } catch {
      if (generation !== this.connectionGeneration || this.primaryRedis !== client) return;
      this.capabilitiesState = 'error';
      this.lastError = 'Feature discovery is temporarily unavailable. Retrying automatically.';
    }
  }
  public close() {
    this.connectionGeneration++;
    this.isConnecting = false;
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = undefined;
    for (const client of this.databases.values()) client.disconnect();
    this.databases.clear();
    this.primaryRedis?.disconnect();
    this.primaryRedis = null;
  }

  public async testConnection(options: { host: string; port: number; password?: string; tls: boolean }) {
    const client = new Redis({ ...options, tls: options.tls ? {} : undefined, lazyConnect: true,
      connectTimeout: 3000, commandTimeout: 3000, retryStrategy: () => null });
    client.on('error', () => {});
    try {
      await client.connect();
      const start = performance.now();
      const response = await client.ping();
      if (response !== 'PONG') throw new Error('The server did not return PONG.');
      return { ok: true, latencyMs: Math.round((performance.now() - start) * 100) / 100 };
    } finally { client.disconnect(); }
  }

  public async configure(options: { host: string; port: number; password?: string; tls: boolean }) {
    return databaseContext.run(0, async () => {
    await this.testConnection(options);
    this.close();
    this.databases.clear();
    this.host = options.host; this.port = options.port; this.password = options.password; this.tls = options.tls;
    this.isDemoMode = false; this.isConnecting = false; this.capabilities.clear();
    this.connect(); this.startReconnectHeartbeat();
    const generation = this.connectionGeneration;
    const deadline = Date.now() + 20000;
    while (this.connectionGeneration === generation && (this.status !== 'connected' || this.capabilitiesState === 'pending')) {
      if (Date.now() > deadline) throw new Error('The engine did not finish connecting in time.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (this.connectionGeneration !== generation) throw new Error('The connection was replaced by a newer request.');
    return this.getStatus();
    });
  }

  public useDemo() {
    this.isDemoMode = true; this.close(); this.databases.clear();
    this.status = 'demo'; this.lastError = undefined; this.initDemoCapabilities();
    return this.getStatus();
  }

  public getStatus(): ConnectionStatus {
    return {
      status: this.status,
      capabilitiesState: this.capabilitiesState,
      tlsEnabled: this.tls,
      host: this.host,
      port: this.port,
      isDemo: this.status === 'demo',
      capabilities: Array.from(this.capabilities),
      latencyMs: this.lastPingMs,
      error: this.lastError,
    };
  }

  private networkStreams = new WeakMap<object, { inputBytes: number; outputBytes: number }>();
  private gatewayTraffic = { inputBytes: 0, outputBytes: 0 };

  public getNetworkCounters(): { inputBytes: number; outputBytes: number } | null {
    if (this.status !== 'connected') return null;
    for (const client of [this.primaryRedis, ...this.databases.values()]) {
      const stream = client?.stream;
      if (!stream || client.status !== 'ready') continue;
      // Direction is relative to the engine. These sockets cover Studio traffic
      // only; they cannot establish whole-engine traffic from other clients.
      const current = { inputBytes: stream.bytesWritten, outputBytes: stream.bytesRead };
      const previous = this.networkStreams.get(stream) ?? { inputBytes: 0, outputBytes: 0 };
      this.gatewayTraffic.inputBytes += Math.max(0, current.inputBytes - previous.inputBytes);
      this.gatewayTraffic.outputBytes += Math.max(0, current.outputBytes - previous.outputBytes);
      this.networkStreams.set(stream, current);
    }
    return { ...this.gatewayTraffic };
  }

  public async getInfo(): Promise<ParsedRedisInfo> {
    if (this.status === 'demo') {
      return this.demoEngine.getParsedInfo();
    }
    if (this.redis) {
      try {
        const raw = await this.redis.info();
        return parseRedisInfo(raw);
      } catch (err) {
        throw Object.assign(new Error('The engine did not return INFO. Check its address, credentials, and availability.'), { statusCode: 503, code: 'ENGINE_UNAVAILABLE' });
      }
    }
    throw Object.assign(new Error('The engine is not connected.'), { statusCode: 503, code: 'ENGINE_UNAVAILABLE' });
  }

  public async getKeys(cursor = 0, match = '*', count = 100, type?: string): Promise<{ cursor: number; keys: KeySummary[]; totalApprox: number }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getKeys(cursor, match, count, type);
    }

    try {
      const clampedCount = Math.min(Math.max(count, 1), 1000);
      const res = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', clampedCount);
      const nextCursor = Number(res[0]);
      const keyNames = res[1];

      if (keyNames.length === 0) {
        const total = await this.redis.dbsize().catch(() => 0);
        return { cursor: nextCursor, keys: [], totalApprox: total };
      }

      // Batch with pipelined execution
      const pipeline = this.redis.pipeline();
      for (const name of keyNames) {
        pipeline.type(name);
        pipeline.pttl(name);
        pipeline.call('MEMORY', 'USAGE', name);
      }

      const results = await pipeline.exec();
      const summaries: KeySummary[] = [];

      for (let i = 0; i < keyNames.length; i++) {
        const name = keyNames[i];
        const typeRes = results ? results[i * 3] : null;
        const pttlRes = results ? results[i * 3 + 1] : null;
        const memoryRes = results ? results[i * 3 + 2] : null;

        const ktype = (typeRes && !typeRes[0]) ? String(typeRes[1]) : 'string';
        const pttlMs = (pttlRes && !pttlRes[0]) ? Number(pttlRes[1]) : -1;
        const ttlSec = pttlMs > 0 ? Math.ceil(pttlMs / 1000) : pttlMs;

        if (ktype === 'none' || pttlMs === -2) continue;
        if (type && type !== 'all' && ktype !== type) continue;

        summaries.push({
          name,
          type: ktype as any,
          ttl: ttlSec,
          ttlMs: pttlMs,
          memoryBytes: memoryRes && !memoryRes[0] && typeof memoryRes[1] === 'number' ? memoryRes[1] : undefined,
        });
      }

      const total = await this.redis.dbsize().catch(() => summaries.length);
      return { cursor: nextCursor, keys: summaries, totalApprox: total };
    } catch {
      return this.demoEngine.getKeys(cursor, match, count, type);
    }
  }

  public async getKeyTree(prefix = '', delimiter = ':', maxScan = 2000): Promise<{ prefix: string; delimiter: string; nodes: any[]; totalScanned: number; approximate: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getKeyTree(prefix, delimiter);
    }

    try {
      let cur = 0;
      let scanned = 0;
      const groups: Map<string, { count: number; hasChildren: boolean }> = new Map();
      const leaves: any[] = [];
      let isApprox = false;

      do {
        const res = await this.redis.scan(cur, 'MATCH', `${prefix}*`, 'COUNT', 250);
        cur = Number(res[0]);
        const keys = res[1];
        scanned += keys.length;

        for (const name of keys) {
          const remainder = name.slice(prefix.length);
          const idx = remainder.indexOf(delimiter);

          if (idx !== -1) {
            const folder = remainder.slice(0, idx);
            const entry = groups.get(folder) || { count: 0, hasChildren: true };
            entry.count += 1;
            groups.set(folder, entry);
          } else if (remainder.length > 0) {
            leaves.push({
              name: remainder,
              fullPath: name,
              isLeaf: true,
              keyCount: 1,
              hasChildren: false,
            });
          }
        }

        if (scanned >= maxScan && cur !== 0) {
          isApprox = true;
          break;
        }
      } while (cur !== 0);

      const folderNodes = Array.from(groups.entries()).map(([fName, info]) => ({
        name: fName,
        fullPath: prefix + fName + delimiter,
        isLeaf: false,
        keyCount: info.count,
        hasChildren: true,
      }));

      folderNodes.sort((a, b) => a.name.localeCompare(b.name));
      leaves.sort((a, b) => a.name.localeCompare(b.name));

      return {
        prefix,
        delimiter,
        nodes: [...folderNodes, ...leaves],
        totalScanned: scanned,
        approximate: isApprox,
      };
    } catch {
      return this.demoEngine.getKeyTree(prefix, delimiter);
    }
  }

  public async getDbSize(): Promise<{ dbsize: number; dbs: Record<number, number> }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getDbSize();
    }

    try {
      const dbsize = await this.redis.dbsize();
      const info = await this.redis.info('keyspace');
      const dbs: Record<number, number> = {};

      for (let i = 0; i < 16; i++) {
        dbs[i] = 0;
      }
      dbs[databaseContext.getStore() ?? 0] = dbsize;

      const lines = info.split('\r\n');
      for (const line of lines) {
        const match = line.match(/^db(\d+):keys=(\d+)/);
        if (match) {
          dbs[Number(match[1])] = Number(match[2]);
        }
      }

      return { dbsize, dbs };
    } catch {
      return this.demoEngine.getDbSize();
    }
  }

  public async getKeyDetail(
    name: string,
    options: { page?: number; limit?: number; cursor?: number; scoreMin?: number; scoreMax?: number; filter?: string } = {}
  ): Promise<KeyDetailResponse | null> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getKeyDetail(name, options);
    }

    try {
      const type = await this.redis.type(name);
      if (type === 'none') {
        return null;
      }

      const [pttl, encoding, mem] = await Promise.all([
        this.redis.pttl(name).catch(() => -1),
        (this.redis as any).call('OBJECT', 'ENCODING', name).catch(() => 'unknown'),
        (this.redis as any).call('MEMORY', 'USAGE', name).catch(() => 0),
      ]);

      const ttlSec = pttl > 0 ? Math.ceil(pttl / 1000) : pttl;
      const memoryBytes = typeof mem === 'number' ? mem : 0;
      const encStr = String(encoding || 'unknown');

      const page = Math.max(1, Number(options.page) || 1);
      const limit = Math.min(Math.max(1, Number(options.limit) || 50), 200);
      const startIdx = (page - 1) * limit;

      const base = {
        name,
        type: type as any,
        encoding: encStr,
        memoryBytes,
        ttl: ttlSec,
        ttlMs: pttl,
      };

      if (type === 'string') {
        const val = (await this.redis.get(name)) || '';
        const formatHint = this.demo.detectFormatHint(val);
        return {
          ...base,
          type: 'string',
          value: val,
          formatHint,
          length: Buffer.byteLength(val),
        };
      }

      if (type === 'list') {
        const total = await this.redis.llen(name);
        const stopIdx = startIdx + limit - 1;
        const rawList = await this.redis.lrange(name, startIdx, stopIdx);
        const listItems = rawList.map((val, idx) => ({
          index: startIdx + idx,
          value: val,
        }));
        return {
          ...base,
          type: 'list',
          length: total,
          listItems,
          listPage: {
            page,
            limit,
            total,
            hasMore: startIdx + limit < total,
          },
        };
      }

      if (type === 'hash') {
        const total = await this.redis.hlen(name);
        if (!this.capabilities.has('HSCAN') && total > 1000) throw new Error('This engine does not support HSCAN for large hashes.');
        const hscanRes = this.capabilities.has('HSCAN')
          ? await this.redis.hscan(name, options.cursor || 0, 'COUNT', limit)
          : [String(startIdx + limit < total ? startIdx + limit : 0), Object.entries(await this.redis.hgetall(name)).slice(startIdx, startIdx + limit).flat()] as [string, string[]];
        const nextCursor = Number(hscanRes[0]);
        const kvs = hscanRes[1];
        const hashEntries: Array<{ field: string; value: string }> = [];
        for (let i = 0; i < kvs.length; i += 2) {
          const f = kvs[i];
          const v = kvs[i + 1];
          if (!options.filter || f.toLowerCase().includes(options.filter.toLowerCase())) {
            hashEntries.push({ field: f, value: v });
          }
        }
        return {
          ...base,
          type: 'hash',
          length: total,
          hashEntries,
          hashPage: {
            nextCursor,
            page,
            limit,
            total,
            hasMore: nextCursor !== 0,
          },
        };
      }

      if (type === 'set') {
        const total = await this.redis.scard(name);
        if (!this.capabilities.has('SSCAN') && total > 1000) throw new Error('This engine does not support SSCAN for large sets.');
        const sscanRes = this.capabilities.has('SSCAN')
          ? await this.redis.sscan(name, options.cursor || 0, 'COUNT', limit)
          : [String(startIdx + limit < total ? startIdx + limit : 0), (await this.redis.smembers(name)).slice(startIdx, startIdx + limit)] as [string, string[]];
        const nextCursor = Number(sscanRes[0]);
        let setMembers = sscanRes[1];
        if (options.filter) {
          setMembers = setMembers.filter((m) => m.toLowerCase().includes(options.filter!.toLowerCase()));
        }
        return {
          ...base,
          type: 'set',
          length: total,
          setMembers,
          setPage: {
            nextCursor,
            page,
            limit,
            total,
            hasMore: nextCursor !== 0,
          },
        };
      }

      if (type === 'zset') {
        const total = await this.redis.zcard(name);
        const stopIdx = startIdx + limit - 1;
        const rawWithScores = await this.redis.zrange(name, startIdx, stopIdx, 'WITHSCORES');
        const zsetMembers: Array<{ rank: number; member: string; score: number }> = [];
        for (let i = 0; i < rawWithScores.length; i += 2) {
          zsetMembers.push({
            rank: startIdx + Math.floor(i / 2) + 1,
            member: rawWithScores[i],
            score: parseFloat(rawWithScores[i + 1]),
          });
        }
        return {
          ...base,
          type: 'zset',
          length: total,
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
    } catch {
      return this.demoEngine.getKeyDetail(name, options);
    }
  }

  public async setString(name: string, value: string, ttl?: number, keepTtl = false): Promise<{ command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.setString(name, value, ttl);
    }
    const cmd = keepTtl ? `SET ${name} ${JSON.stringify(value)} KEEPTTL` : ttl && ttl > 0 ? `SET ${name} "${value}" EX ${ttl}` : `SET ${name} "${value}"`;
    if (keepTtl) {
      await this.redis.set(name, value, 'KEEPTTL');
    } else if (ttl && ttl > 0) {
      await this.redis.set(name, value, 'EX', ttl);
    } else {
      await this.redis.set(name, value);
    }
    return { command: cmd };
  }

  public async pushList(name: string, direction: 'left' | 'right', value: string): Promise<{ command: string; length: number }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.pushList(name, direction, value);
    }
    const len = direction === 'left' ? await this.redis.lpush(name, value) : await this.redis.rpush(name, value);
    const cmd = direction === 'left' ? `LPUSH ${name} "${value}"` : `RPUSH ${name} "${value}"`;
    return { command: cmd, length: len };
  }

  public async popList(name: string, direction: 'left' | 'right'): Promise<{ command: string; value: string | null }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.popList(name, direction);
    }
    const val = direction === 'left' ? await this.redis.lpop(name) : await this.redis.rpop(name);
    const cmd = direction === 'left' ? `LPOP ${name}` : `RPOP ${name}`;
    return { command: cmd, value: val ?? null };
  }

  public async deleteListIndex(name: string, index: number): Promise<{ command: string; success: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.deleteListIndex(name, index);
    }
    throw Object.assign(new Error('Atomic deletion by list index is unavailable on this engine. Pop from the left or right instead.'), { statusCode: 501, code: 'ENGINE_UNSUPPORTED' });
  }

  public async setHashField(name: string, field: string, value: string): Promise<{ command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.setHashField(name, field, value);
    }
    await this.redis.hset(name, field, value);
    return { command: `HSET ${name} "${field}" "${value}"` };
  }

  public async deleteHashField(name: string, field: string): Promise<{ command: string; deleted: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.deleteHashField(name, field);
    }
    const count = await this.redis.hdel(name, field);
    return { command: `HDEL ${name} "${field}"`, deleted: count > 0 };
  }

  public async addSetMember(name: string, member: string): Promise<{ command: string; added: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.addSetMember(name, member);
    }
    const count = await this.redis.sadd(name, member);
    return { command: `SADD ${name} "${member}"`, added: count > 0 };
  }

  public async removeSetMember(name: string, member: string): Promise<{ command: string; removed: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.removeSetMember(name, member);
    }
    const count = await this.redis.srem(name, member);
    return { command: `SREM ${name} "${member}"`, removed: count > 0 };
  }

  public async addZSetMember(name: string, member: string, score: number): Promise<{ command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.addZSetMember(name, member, score);
    }
    await this.redis.zadd(name, score, member);
    return { command: `ZADD ${name} ${score} "${member}"` };
  }

  public async removeZSetMember(name: string, member: string): Promise<{ command: string; removed: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.removeZSetMember(name, member);
    }
    const count = await this.redis.zrem(name, member);
    return { command: `ZREM ${name} "${member}"`, removed: count > 0 };
  }

  public async setTtl(name: string, ttl: number): Promise<{ command: string; success: boolean }> {
    if (this.status !== 'connected' || !this.redis) {
      return this.demoEngine.setTtl(name, ttl);
    }
    if (ttl === -1) {
      const res = await this.redis.persist(name);
      return { command: `PERSIST ${name}`, success: res === 1 };
    }
    const res = await this.redis.expire(name, ttl);
    return { command: `EXPIRE ${name} ${ttl}`, success: res === 1 };
  }

  public async deleteKey(name: string): Promise<{ command: string; deleted: boolean }> {
    if (this.status !== 'connected' || !this.redis) {
      return this.demoEngine.deleteKey(name);
    }
    const count = await this.redis.del(name);
    return { command: `DEL ${name}`, deleted: count > 0 };
  }

  public async bulkDeleteKeys(keys: string[], dryRun = false): Promise<{ dryRun: boolean; count: number; sample: string[]; command: string }> {
    if (this.status !== 'connected' || !this.redis) {
      return this.demoEngine.bulkDeleteKeys(keys, dryRun);
    }
    keys = [...new Set(keys)];
    if (dryRun && keys.length) {
      const results = await this.redis.pipeline(keys.map(key => ['EXISTS', key])).exec();
      keys = keys.filter((_key, index) => results?.[index]?.[1] === 1);
    }
    const sample = keys.slice(0, 5);
    const command = `DEL ${keys.slice(0, 10).join(' ')}${keys.length > 10 ? ' ...' : ''}`;
    if (dryRun) {
      return { dryRun: true, count: keys.length, sample, command };
    }
    const count = keys.length > 0 ? await this.redis.del(...keys) : 0;
    return { dryRun: false, count, sample, command };
  }

  public async createKey(name: string, type: 'string' | 'list' | 'hash' | 'set' | 'zset', payload: any, ttl?: number): Promise<{ commands: string[]; success: boolean }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.createKey(name, type, payload, ttl);
    }
    const commands: string[] = [];
    const resolvedTtl = ttl && ttl > 0 ? ttl : -1;

    if (type === 'string') {
      const val = String(payload.value ?? '');
      await this.setString(name, val, resolvedTtl);
      commands.push(resolvedTtl > 0 ? `SET ${name} "${val}" EX ${resolvedTtl}` : `SET ${name} "${val}"`);
    } else if (type === 'list') {
      const items: string[] = Array.isArray(payload.items) ? payload.items : [String(payload.value ?? 'item')];
      await this.redis.rpush(name, ...items);
      commands.push(`RPUSH ${name} ${items.map((i) => `"${i}"`).join(' ')}`);
      if (resolvedTtl > 0) {
        await this.redis.expire(name, resolvedTtl);
        commands.push(`EXPIRE ${name} ${resolvedTtl}`);
      }
    } else if (type === 'hash') {
      const entries: Record<string, string> = payload.entries || { field: 'value' };
      const flat = Object.entries(entries).flat();
      await this.redis.hset(name, ...flat);
      commands.push(`HSET ${name} ${Object.entries(entries).map(([f, v]) => `"${f}" "${v}"`).join(' ')}`);
      if (resolvedTtl > 0) {
        await this.redis.expire(name, resolvedTtl);
        commands.push(`EXPIRE ${name} ${resolvedTtl}`);
      }
    } else if (type === 'set') {
      const members: string[] = Array.isArray(payload.members) ? payload.members : ['member'];
      await this.redis.sadd(name, ...members);
      commands.push(`SADD ${name} ${members.map((m) => `"${m}"`).join(' ')}`);
      if (resolvedTtl > 0) {
        await this.redis.expire(name, resolvedTtl);
        commands.push(`EXPIRE ${name} ${resolvedTtl}`);
      }
    } else if (type === 'zset') {
      const members: [string, number][] = Array.isArray(payload.members) ? payload.members : [['member', 100]];
      const flat: (string | number)[] = [];
      members.forEach(([m, s]) => {
        flat.push(s, m);
      });
      await this.redis.zadd(name, ...(flat as any));
      commands.push(`ZADD ${name} ${members.map(([m, s]) => `${s} "${m}"`).join(' ')}`);
      if (resolvedTtl > 0) {
        await this.redis.expire(name, resolvedTtl);
        commands.push(`EXPIRE ${name} ${resolvedTtl}`);
      }
    }

    return { commands, success: true };
  }

  public async getCommands(): Promise<CommandMeta[]> {
    return loadBundledCommands();
  }

  public async executePipeline(
    commands: string[][],
    safetyEngine: SafetyEngine,
    user: UserContext,
    unlock = false
  ): Promise<PipelineResult> {
    const startAll = performance.now();
    const clampedCommands = commands.slice(0, 200);
    const replies: PipelineReplyItem[] = [];

    if (this.status === 'demo' || !this.redis) {
      for (const cmdArgs of clampedCommands) {
        if (!cmdArgs || cmdArgs.length === 0) continue;
        const cmd = cmdArgs[0].toUpperCase();
        const check = safetyEngine.validateCommand(cmd, cmdArgs, user.role, unlock);

        if (!check.allowed) {
          safetyEngine.recordAudit(user.username, user.role, cmdArgs, 0, 'blocked', check.reason);
          replies.push({
            command: cmdArgs.join(' '),
            reply: check.reason,
            kind: 'error',
            durationMs: 0,
            error: check.reason,
          });
          continue;
        }

        const start = performance.now();
        try {
          const res = this.demoEngine.execute(cmdArgs);
          const dur = Math.round(performance.now() - start);
          const formatted = safetyEngine.formatExecutionResult(res, dur, cmdArgs.join(' '));
          safetyEngine.recordAudit(user.username, user.role, cmdArgs, dur, 'success');
          replies.push({
            command: cmdArgs.join(' '),
            reply: formatted.reply,
            kind: formatted.kind,
            durationMs: dur,
          });
        } catch (err: any) {
          const dur = Math.round(performance.now() - start);
          safetyEngine.recordAudit(user.username, user.role, cmdArgs, dur, 'error', err.message);
          replies.push({
            command: cmdArgs.join(' '),
            reply: err.message,
            kind: 'error',
            durationMs: dur,
            error: err.message,
          });
        }
      }

      const totalDurationMs = Math.round(performance.now() - startAll);
      return {
        replies,
        totalDurationMs,
        executedCount: replies.length,
      };
    }

    // Live Redis pipeline execution
    const pipeline = this.redis.pipeline();
    const commandMetaList: { cmdArgs: string[]; checkPassed: boolean; reason?: string }[] = [];

    for (const cmdArgs of clampedCommands) {
      if (!cmdArgs || cmdArgs.length === 0) continue;
      const cmd = cmdArgs[0].toUpperCase();
      const check = safetyEngine.validateCommand(cmd, cmdArgs, user.role, unlock);

      if (!check.allowed) {
        safetyEngine.recordAudit(user.username, user.role, cmdArgs, 0, 'blocked', check.reason);
        commandMetaList.push({ cmdArgs, checkPassed: false, reason: check.reason });
      } else {
        commandMetaList.push({ cmdArgs, checkPassed: true });
        const [c, ...rest] = cmdArgs;
        (pipeline as any).call(c, ...rest);
      }
    }

    const execStart = performance.now();
    const rawResults = await pipeline.exec().catch(() => []);
    const execDuration = Math.round(performance.now() - execStart);

    let resultIdx = 0;
    for (const meta of commandMetaList) {
      const rawCmd = meta.cmdArgs.join(' ');
      if (!meta.checkPassed) {
        replies.push({
          command: rawCmd,
          reply: meta.reason,
          kind: 'error',
          durationMs: 0,
          error: meta.reason,
        });
      } else {
        const itemRes = rawResults ? rawResults[resultIdx++] : null;
        if (!itemRes || itemRes[0]) {
          const errMsg = itemRes ? String(itemRes[0]) : 'Pipeline execution error';
          safetyEngine.recordAudit(user.username, user.role, meta.cmdArgs, execDuration, 'error', errMsg);
          replies.push({
            command: rawCmd,
            reply: errMsg,
            kind: 'error',
            durationMs: execDuration,
            error: errMsg,
          });
        } else {
          const val = itemRes[1];
          const formatted = safetyEngine.formatExecutionResult(val, execDuration, rawCmd);
          safetyEngine.recordAudit(user.username, user.role, meta.cmdArgs, execDuration, 'success');
          replies.push({
            command: rawCmd,
            reply: formatted.reply,
            kind: formatted.kind,
            durationMs: execDuration,
          });
        }
      }
    }

    const totalDurationMs = Math.round(performance.now() - startAll);
    return {
      replies,
      totalDurationMs,
      executedCount: replies.length,
    };
  }

  public async executeRaw(args: string[]): Promise<any> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.execute(args);
    }

    const start = performance.now();
    try {
      const [command, ...cmdArgs] = args;
      const res = await (this.redis as any).call(command, ...cmdArgs);
      this.lastPingMs = Math.round(performance.now() - start);
      return res;
    } catch (err: any) {
      throw new Error(err.message || 'Redis execution error');
    }
  }

  // ==========================================
  // Step 7: Memory & Eviction, Expiration Methods
  // ==========================================

  public async getMemoryOverview(): Promise<MemoryOverviewResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getMemoryOverview();
    }

    try {
      const info = await this.getInfo();
      const rawMem = info.memory;
      const rawStats = info.stats;

      // Sample keyspace up to 500 keys
      const [nextCursor, sampleKeys] = await this.redis.scan(0, 'MATCH', '*', 'COUNT', 500);
      const typeMap: Record<string, { count: number; bytes: number }> = {
        string: { count: 0, bytes: 0 },
        hash: { count: 0, bytes: 0 },
        list: { count: 0, bytes: 0 },
        set: { count: 0, bytes: 0 },
        zset: { count: 0, bytes: 0 },
      };
      const prefixMap: Record<string, { count: number; bytes: number }> = {};
      let totalSampledBytes = 0;

      if (sampleKeys.length > 0) {
        const pipe = this.redis.pipeline();
        sampleKeys.forEach((k) => {
          pipe.type(k);
          pipe.call('MEMORY', 'USAGE', k);
        });
        const pipeResults = await pipe.exec();

        for (let i = 0; i < sampleKeys.length; i++) {
          const k = sampleKeys[i];
          const type = (pipeResults?.[i * 2]?.[1] as string) || 'string';
          const measurement = pipeResults?.[i * 2 + 1];
          if (!measurement || measurement[0] || typeof measurement[1] !== 'number') continue;
          const mem = measurement[1];

          totalSampledBytes += mem;

          if (!typeMap[type]) typeMap[type] = { count: 0, bytes: 0 };
          typeMap[type].count++;
          typeMap[type].bytes += mem;

          const colonIdx = k.indexOf(':');
          const prefix = colonIdx !== -1 ? k.substring(0, colonIdx) : 'unprefixed';
          if (!prefixMap[prefix]) prefixMap[prefix] = { count: 0, bytes: 0 };
          prefixMap[prefix].count++;
          prefixMap[prefix].bytes += mem;
        }
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
        used_memory: rawMem.used_memory,
        used_memory_peak: rawMem.used_memory_peak,
        maxmemory: rawMem.maxmemory,
        maxmemory_policy: rawMem.maxmemory_policy || 'noeviction',
        mem_fragmentation_ratio: 0,
        evicted_keys: rawStats.evicted_keys ?? 0,
        per_type,
        per_prefix,
        estimated: true,
        sampled_keys: sampleKeys.length,
      };
    } catch {
      return this.demoEngine.getMemoryOverview();
    }
  }

  public async getTopKeys(n = 20): Promise<TopKeysResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getTopKeys(n);
    }

    try {
      const [, sampleKeys] = await this.redis.scan(0, 'MATCH', '*', 'COUNT', 500);
      if (sampleKeys.length === 0) {
        return { top_keys: [], sampled_keys: 0, capped: false };
      }

      const pipe = this.redis.pipeline();
      sampleKeys.forEach((k) => {
        pipe.call('MEMORY', 'USAGE', k);
        pipe.type(k);
        pipe.ttl(k);
      });
      const results = await pipe.exec();

      const items: Array<{ name: string; type: string; memoryBytes: number; ttl: number }> = [];
      for (let i = 0; i < sampleKeys.length; i++) {
        const k = sampleKeys[i];
        const measured = results?.[i * 3];
        if (!measured || measured[0] || typeof measured[1] !== 'number') continue;
        const mem = measured[1];
        const type = (results?.[i * 3 + 1]?.[1] as string) || 'string';
        const ttl = Number(results?.[i * 3 + 2]?.[1]) || -1;
        items.push({ name: k, type, memoryBytes: mem, ttl });
      }

      items.sort((a, b) => b.memoryBytes - a.memoryBytes);
      return {
        top_keys: items.slice(0, n),
        sampled_keys: sampleKeys.length,
        capped: true,
      };
    } catch {
      return this.demoEngine.getTopKeys(n);
    }
  }

  public async simulateEviction(maxmemoryBytes: number, policy: string): Promise<MemorySimulateResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.simulateEviction(maxmemoryBytes, policy);
    }
    const info = await this.getInfo();
    const sample = await this.sampleKeys(1000);
    const eligible = policy.startsWith('volatile-') ? sample.filter(key => key.ttlMs >= 0) : sample;
    const measured = eligible.filter(key => key.memoryBytes !== undefined);
    const average = measured.length ? measured.reduce((sum, key) => sum + key.memoryBytes!, 0) / measured.length : 0;
    const deficit = maxmemoryBytes > 0 ? Math.max(0, info.memory.used_memory - maxmemoryBytes) : 0;
    const total = (await this.getDbSize()).dbsize;
    const atRisk = average > 0 && policy !== 'noeviction' ? Math.min(total, Math.ceil(deficit / average)) : 0;
    return { targetMaxmemory: maxmemoryBytes, targetPolicy: policy, currentUsedMemory: info.memory.used_memory,
      deficitBytes: deficit, keysAtRisk: atRisk, shareAtRiskPercent: total ? atRisk / total * 100 : 0,
      writesBlocked: deficit > 0 && (policy === 'noeviction' || eligible.length === 0),
      summary: !average && deficit > 0 ? 'The engine does not provide enough key-size measurements to estimate keys at risk.' : `Estimated ${atRisk} keys at risk based on the current sample.`,
      method: `Bounded SCAN of ${sample.length} keys; mean MEMORY USAGE of ${measured.length} eligible keys. Estimate only; selection order is not predicted.`,
      equivalentCommand: [`CONFIG SET maxmemory ${maxmemoryBytes}`, `CONFIG SET maxmemory-policy ${policy}`] };
  }

  public async getSoonestExpiringKeys(n = 50): Promise<ExpirationSoonestResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getSoonestExpiringKeys(n);
    }

    try {
      const [, sampleKeys] = await this.redis.scan(0, 'MATCH', '*', 'COUNT', 500);
      if (sampleKeys.length === 0) {
        return { keys: [], totalWithTtl: 0, totalSampled: 0 };
      }

      const pipe = this.redis.pipeline();
      sampleKeys.forEach((k) => {
        pipe.ttl(k);
        pipe.type(k);
      });
      const results = await pipe.exec();

      const withTtl: any[] = [];
      const now = Date.now();
      for (let i = 0; i < sampleKeys.length; i++) {
        const k = sampleKeys[i];
        const ttl = Number(results?.[i * 2]?.[1]) || -1;
        const type = (results?.[i * 2 + 1]?.[1] as string) || 'string';
        if (ttl > 0) {
          withTtl.push({
            name: k,
            type,
            ttl,
            ttlMs: ttl * 1000,
            expiresAt: new Date(now + ttl * 1000).toISOString(),
          });
        }
      }

      withTtl.sort((a, b) => a.ttl - b.ttl);
      return {
        keys: withTtl.slice(0, n),
        totalWithTtl: withTtl.length,
        totalSampled: sampleKeys.length,
      };
    } catch {
      return this.demoEngine.getSoonestExpiringKeys(n);
    }
  }

  public async getExpirationHistogram(): Promise<ExpirationHistogramResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getExpirationHistogram();
    }
    const keys = await this.sampleKeys(2000);
    const counts = [0, 0, 0, 0, 0, 0];
    for (const key of keys) {
      if (key.ttlMs === -1) counts[5]++;
      else if (key.ttlMs >= 0) counts[key.ttlMs < 60000 ? 0 : key.ttlMs < 3600000 ? 1 : key.ttlMs < 86400000 ? 2 : key.ttlMs < 604800000 ? 3 : 4]++;
    }
    const labels = ['< 1 minute', '< 1 hour', '< 1 day', '< 7 days', '7 days or more', 'No TTL'];
    return { totalSampled: keys.length, withTtlCount: keys.length - counts[5], noTtlCount: counts[5],
      buckets: labels.map((label, index) => ({ label, range: label, count: counts[index], percentage: keys.length ? counts[index] / keys.length * 100 : 0 })) };
  }

  private async sampleKeys(cap: number): Promise<KeySummary[]> {
    const found = new Map<string, KeySummary>();
    let cursor = 0;
    for (let rounds = 0; rounds < 100; rounds++) {
      const page = await this.getKeys(cursor, '*', Math.min(cap, 500));
      page.keys.forEach(key => { if (found.size < cap) found.set(key.name, key); });
      cursor = page.cursor;
      if (!cursor || found.size >= cap) break;
    }
    return [...found.values()];
  }

  public async bulkSetTtl(pattern: string, ttl: number, dryRun = false): Promise<BulkSetTtlResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.bulkSetTtl(pattern, ttl, dryRun);
    }

    try {
      const [, matchedKeys] = await this.redis.scan(0, 'MATCH', pattern, 'COUNT', 500);
      const sample = matchedKeys.slice(0, 5);
      const command = ttl === -1
        ? `PERSIST ${pattern} (${matchedKeys.length} keys)`
        : `EXPIRE ${pattern} ${ttl} (${matchedKeys.length} keys)`;

      if (!dryRun && matchedKeys.length > 0) {
        const pipe = this.redis.pipeline();
        matchedKeys.forEach((k) => {
          if (ttl === -1) pipe.persist(k);
          else pipe.expire(k, ttl);
        });
        await pipe.exec();
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
    } catch {
      return this.demoEngine.bulkSetTtl(pattern, ttl, dryRun);
    }
  }

  public async updateMemoryConfig(maxmemory?: number, policy?: string): Promise<{ success: boolean; commands: string[]; previous: { maxmemory: number; policy: string } }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.updateMemoryConfig(maxmemory, policy);
    }

    try {
      const prevMaxmem = await this.redis.config('GET', 'maxmemory');
      const prevPolicy = await this.redis.config('GET', 'maxmemory-policy');
      const previous = {
        maxmemory: Number((prevMaxmem as any)?.[1]) || 0,
        policy: String((prevPolicy as any)?.[1]) || 'noeviction',
      };
      const commands: string[] = [];

      if (maxmemory !== undefined && maxmemory >= 0) {
        await this.redis.config('SET', 'maxmemory', String(maxmemory));
        commands.push(`CONFIG SET maxmemory ${maxmemory}`);
      }
      if (policy) {
        await this.redis.config('SET', 'maxmemory-policy', policy);
        commands.push(`CONFIG SET maxmemory-policy "${policy}"`);
      }

      return { success: true, commands, previous };
    } catch {
      return this.demoEngine.updateMemoryConfig(maxmemory, policy);
    }
  }

  // ==========================================
  // Step 8: Client Management & Slow Log Methods
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

  public async getClients(): Promise<ClientsResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getClients();
    }

    try {
      const rawList = await (this.redis as any).client('LIST');
      if (!rawList || typeof rawList !== 'string') {
        return this.demoEngine.getClients();
      }

      const lines = rawList.trim().split('\n').filter((l) => l.trim().length > 0);
      const parsedClients: ClientInfoItem[] = lines.map((line) => {
        const map: Record<string, string> = {};
        line.split(/\s+/).forEach((token) => {
          const idx = token.indexOf('=');
          if (idx !== -1) {
            map[token.substring(0, idx)] = token.substring(idx + 1);
          }
        });

        const id = map.id || '0';
        const addr = map.addr || '127.0.0.1:0';
        const name = map.name || `client_${id}`;
        const age = Number(map.age) || 0;
        const idle = Number(map.idle) || 0;
        const db = Number(map.db) || 0;
        const cmd = map.cmd || 'idle';
        const flags = map.flags || 'N';
        const qbuf = Number(map.qbuf) || 0;
        const qbufFree = Number(map['qbuf-free']) || 0;
        const obl = Number(map.obl) || 0;
        const oll = Number(map.oll) || 0;
        const omem = Number(map.omem) || 0;
        const events = map.events || 'r';
        const user = map.user || 'default';

        const isBlocked = flags.includes('b');
        const isSubscribed = flags.includes('P') || flags.includes('S') || Number(map.sub || 0) > 0;
        const isHighBuffer = omem > 1048576 || obl > 1024;
        const isHighIdle = idle > 300;

        return {
          id,
          addr,
          name,
          age,
          idle,
          db,
          cmd,
          flags,
          qbuf,
          qbufFree,
          obl,
          oll,
          omem,
          events,
          user,
          isBlocked,
          isSubscribed,
          isHighBuffer,
          isHighIdle,
        };
      });

      return {
        clients: parsedClients,
        total: parsedClients.length,
        blockedCount: parsedClients.filter((c) => c.isBlocked).length,
        subscribedCount: parsedClients.filter((c) => c.isSubscribed).length,
        maxClients: 10000,
        highBufferCount: parsedClients.filter((c) => c.isHighBuffer).length,
        highIdleCount: parsedClients.filter((c) => c.isHighIdle).length,
      };
    } catch {
      return this.demoEngine.getClients();
    }
  }

  public async killClient(id: string): Promise<{ success: boolean; id: string; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.killClient(id);
    }
    try {
      await (this.redis as any).client('KILL', 'ID', id);
      return { success: true, id, command: `CLIENT KILL ID ${id}` };
    } catch {
      return this.demoEngine.killClient(id);
    }
  }

  public async renameClient(id: string, name: string): Promise<{ success: boolean; id: string; name: string; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.renameClient(id, name);
    }
    try {
      await (this.redis as any).client('SETNAME', name);
      return { success: true, id, name, command: `CLIENT SETNAME "${name}"` };
    } catch {
      return this.demoEngine.renameClient(id, name);
    }
  }

  public async getSlowLog(n = 50): Promise<SlowLogResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getSlowLog(n);
    }

    try {
      const rawEntries = await (this.redis as any).slowlog('GET', n);
      const thresholdConf = await (this.redis as any).config('GET', 'slowlog-log-slower-than');
      const thresholdUs = Number((thresholdConf as any)?.[1]) || 10000;

      const entries: SlowLogItem[] = (rawEntries || []).map((tuple: any) => {
        const id = Number(tuple[0]);
        const timestamp = Number(tuple[1]);
        const durationUs = Number(tuple[2]);
        const rawArgs = Array.isArray(tuple[3]) ? tuple[3].map(String) : [String(tuple[3])];
        const cmdStr = rawArgs.join(' ');
        const clientAddr = tuple[4] ? String(tuple[4]) : 'unknown';
        const clientName = tuple[5] ? String(tuple[5]) : '';

        return {
          id,
          timestamp,
          timestampIso: new Date(timestamp * 1000).toISOString(),
          durationUs,
          durationMs: Math.round(durationUs / 10) / 100,
          command: cmdStr,
          args: rawArgs,
          clientAddr,
          clientName,
          causeHint: this.findCauseHint(cmdStr),
        };
      });

      return {
        entries,
        count: entries.length,
        len: entries.length,
        thresholdUs,
        thresholdMs: Math.round(thresholdUs / 1000),
      };
    } catch {
      return this.demoEngine.getSlowLog(n);
    }
  }

  public async getSlowLogLen(): Promise<{ len: number }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getSlowLogLen();
    }
    try {
      const len = await (this.redis as any).slowlog('LEN');
      return { len: Number(len) || 0 };
    } catch {
      return this.demoEngine.getSlowLogLen();
    }
  }

  public async resetSlowLog(): Promise<{ success: boolean; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.resetSlowLog();
    }
    try {
      await (this.redis as any).slowlog('RESET');
      return { success: true, command: 'SLOWLOG RESET' };
    } catch {
      return this.demoEngine.resetSlowLog();
    }
  }

  public async setSlowLogThreshold(microseconds: number): Promise<{ success: boolean; thresholdUs: number; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.setSlowLogThreshold(microseconds);
    }
    try {
      await (this.redis as any).config('SET', 'slowlog-log-slower-than', String(microseconds));
      return {
        success: true,
        thresholdUs: microseconds,
        command: `CONFIG SET slowlog-log-slower-than ${microseconds}`,
      };
    } catch {
      return this.demoEngine.setSlowLogThreshold(microseconds);
    }
  }

  // ==========================================
  // Step 9: Persistence & Replication Client
  // ==========================================

  public async getPersistenceInfo(): Promise<PersistenceInfoResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getPersistenceInfo();
    }
    try {
      const infoStr = await this.redis.info('persistence');
      let fsyncPolicy: 'always' | 'everysec' | 'no' = 'everysec';
      try {
        const fsyncConfig = await (this.redis as any).config('GET', 'appendfsync');
        if (Array.isArray(fsyncConfig) && fsyncConfig.length >= 2) {
          fsyncPolicy = fsyncConfig[1] as any;
        }
      } catch {}

      const lines = infoStr.split('\r\n');
      const map: Record<string, string> = {};
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 2) map[parts[0].trim()] = parts.slice(1).join(':').trim();
      }

      return {
        loading: map['loading'] === '1',
        rdbLastSaveTime: Number(map['rdb_last_save_time']) || 0,
        rdbLastSaveTimeIso: map['rdb_last_save_time'] && Number(map['rdb_last_save_time']) > 0 ? new Date(Number(map['rdb_last_save_time']) * 1000).toISOString() : '',
        rdbLastBgsaveStatus: map['rdb_last_bgsave_status'] === 'ok' ? 'ok' : map['rdb_last_bgsave_status'] === 'err' ? 'err' : 'unknown',
        rdbLastBgsaveTimeSec: Number(map['rdb_last_bgsave_time_sec']) || 0,
        rdbCurrentBgsaveTimeSec: Number(map['rdb_current_bgsave_time_sec']) || -1,
        rdbBgsaveInProgress: map['rdb_bgsave_in_progress'] === '1',
        rdbChangesSinceLastSave: Number(map['rdb_changes_since_last_save']) || 0,
        rdbSizeBytes: Number(map['rdb_last_save_size']) || 0,
        aofEnabled: map['aof_enabled'] === '1',
        aofRewriteInProgress: map['aof_rewrite_in_progress'] === '1',
        aofRewriteScheduled: map['aof_rewrite_scheduled'] === '1',
        aofLastRewriteTimeSec: Number(map['aof_last_rewrite_time_sec']) || 0,
        aofCurrentRewriteTimeSec: Number(map['aof_current_rewrite_time_sec']) || -1,
        aofLastBgrewriteStatus: map['aof_last_bgrewrite_status'] === 'ok' ? 'ok' : map['aof_last_bgrewrite_status'] === 'err' ? 'err' : 'unknown',
        aofCurrentSize: Number(map['aof_current_size']) || 0,
        aofBaseSize: Number(map['aof_base_size']) || 0,
        aofBufferDelay: Number(map['aof_buffer_delayed_fsync']) || 0,
        aofFsyncPolicy: fsyncPolicy,
        saveTimeline: [],
      };
    } catch {
      return this.demoEngine.getPersistenceInfo();
    }
  }

  public async bgsave(): Promise<{ success: boolean; command: string; inProgress: boolean; message?: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.bgsave();
    }
    try {
      const res = await this.redis.bgsave();
      return {
        success: true,
        command: 'BGSAVE',
        inProgress: true,
        message: typeof res === 'string' ? res : 'Background saving started',
      };
    } catch (err: any) {
      return {
        success: false,
        command: 'BGSAVE',
        inProgress: false,
        message: err.message,
      };
    }
  }

  public async bgrewriteaof(): Promise<{ success: boolean; command: string; inProgress: boolean; message?: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.bgrewriteaof();
    }
    try {
      const res = await this.redis.bgrewriteaof();
      return {
        success: true,
        command: 'BGREWRITEAOF',
        inProgress: true,
        message: typeof res === 'string' ? res : 'Background append only file rewriting started',
      };
    } catch (err: any) {
      return {
        success: false,
        command: 'BGREWRITEAOF',
        inProgress: false,
        message: err.message,
      };
    }
  }

  public async setFsyncPolicy(policy: 'always' | 'everysec' | 'no'): Promise<{ success: boolean; policy: string; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.setFsyncPolicy(policy);
    }
    try {
      await (this.redis as any).config('SET', 'appendfsync', policy);
      return {
        success: true,
        policy,
        command: `CONFIG SET appendfsync ${policy}`,
      };
    } catch {
      return this.demoEngine.setFsyncPolicy(policy);
    }
  }

  public async inspectSnapshot(filePath: string): Promise<SnapshotInspectResponse> {
    return this.demoEngine.inspectSnapshot(filePath);
  }

  public async getReplicationTopology(): Promise<ReplicationTopologyResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getReplicationTopology();
    }
    try {
      const infoStr = await this.redis.info('replication');
      const lines = infoStr.split('\r\n');
      const map: Record<string, string> = {};
      const slaves: ReplicaNodeInfo[] = [];

      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(':').trim();
          map[key] = val;

          if (key.startsWith('slave')) {
            const subParts = val.split(',');
            const sMap: Record<string, string> = {};
            for (const sp of subParts) {
              const [k, v] = sp.split('=');
              if (k && v) sMap[k.trim()] = v.trim();
            }
            const masterOff = Number(map['master_repl_offset']) || 0;
            const sOff = Number(sMap['offset']) || 0;
            slaves.push({
              id: key,
              ip: sMap['ip'] || 'unknown',
              port: Number(sMap['port']) || 6380,
              state: (sMap['state'] as any) || 'online',
              offset: sOff,
              lagSeconds: Number(sMap['lag']) || 0,
              lagBytes: Math.max(0, masterOff - sOff),
              lastAckSecondsAgo: Number(sMap['lag']) || 0,
              syncType: 'partial_resync',
            });
          }
        }
      }

      const role = (map['role'] as 'master' | 'slave') || 'master';
      const backlogSize = Number(map['repl_backlog_size']) || 0;
      const masterOff = Number(map['master_repl_offset']) || 0;
      const backlogHistlen = Number(map['repl_backlog_histlen']) || 0;

      return {
        role,
        connectedSlaves: Number(map['connected_slaves']) || slaves.length,
        masterReplId: map['master_replid'] || '0000000000000000000000000000000000000000',
        masterReplId2: map['master_replid2'] || '0000000000000000000000000000000000000000',
        masterReplOffset: masterOff,
        secondReplOffset: Number(map['second_repl_offset']) || -1,
        replBacklogActive: map['repl_backlog_active'] === '1',
        replBacklogSize: backlogSize,
        replBacklogFirstByteOffset: Number(map['repl_backlog_first_byte_offset']) || 0,
        replBacklogHistlen: backlogHistlen,
        backlogCoverageSeconds: 0,
        masterHost: map['master_host'],
        masterPort: map['master_port'] ? Number(map['master_port']) : undefined,
        masterLinkStatus: map['master_link_status'] as any,
        masterLastIoSecondsAgo: map['master_last_io_seconds_ago'] ? Number(map['master_last_io_seconds_ago']) : undefined,
        masterSyncInProgress: map['master_sync_in_progress'] === '1',
        replicas: slaves,
      };
    } catch {
      return this.demoEngine.getReplicationTopology();
    }
  }

  public async getReplicationPreflight(action: 'replicaof' | 'promote', host?: string, port?: number): Promise<ReplicationPreflightResponse> {
    return this.demoEngine.getReplicationPreflight(action, host, port);
  }

  public async replicaOf(host: string, port: number): Promise<{ success: boolean; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.replicaOf(host, port);
    }
    try {
      await this.redis.replicaof(host, port);
      return { success: true, command: `REPLICAOF ${host} ${port}` };
    } catch {
      return this.demoEngine.replicaOf(host, port);
    }
  }

  public async promote(): Promise<{ success: boolean; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.promote();
    }
    try {
      await this.redis.replicaof('NO', 'ONE');
      return { success: true, command: 'REPLICAOF NO ONE' };
    } catch {
      return this.demoEngine.promote();
    }
  }

  // ==========================================
  // Step 10: Security & ACL, Configuration Client
  // ==========================================

  private configRollbackStack: ConfigRollbackItem[] = [];

  public async getAclUsers(): Promise<AclUserItem[]> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getAclUsers();
    }
    try {
      const list = await (this.redis as any).acl('LIST');
      if (Array.isArray(list)) {
        return list.map((l: string) => parseAclListLine(l));
      }
      return this.demoEngine.getAclUsers();
    } catch {
      return this.demoEngine.getAclUsers();
    }
  }

  public async setAclUser(rule: AclRuleObject): Promise<{ success: boolean; username: string; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.setAclUser(rule);
    }
    try {
      const rawArgs = buildAclSetUserArgs(rule);
      await (this.redis as any).acl('SETUSER', ...rawArgs);
      return {
        success: true,
        username: rule.username,
        command: `ACL SETUSER ${rawArgs.join(' ')}`,
      };
    } catch (err: any) {
      if (err.message && !err.message.includes('ERR')) throw err;
      return this.demoEngine.setAclUser(rule);
    }
  }

  public async deleteAclUser(name: string): Promise<{ success: boolean; username: string; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.deleteAclUser(name);
    }
    try {
      await (this.redis as any).acl('DELUSER', name);
      return { success: true, username: name, command: `ACL DELUSER ${name}` };
    } catch {
      return this.demoEngine.deleteAclUser(name);
    }
  }

  public getAclCategories(): AclCategoryInfo[] {
    return ACL_CATEGORIES;
  }

  public async testAclUser(username: string, rawCommand: string): Promise<AclTestResult> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.testAclUser(username, rawCommand);
    }
    try {
      const parts = rawCommand.trim().split(/\s+/);
      const dryRunRes = await (this.redis as any).call('ACL', 'DRYRUN', username, ...parts);
      if (dryRunRes === 'OK') {
        return {
          user: username,
          command: rawCommand,
          allowed: true,
          reason: 'Command allowed by Redis ACL engine.',
          decidingRule: 'ACL DRYRUN: OK',
        };
      } else {
        return {
          user: username,
          command: rawCommand,
          allowed: false,
          reason: String(dryRunRes),
          decidingRule: 'ACL DRYRUN: DENIED',
        };
      }
    } catch {
      return this.demoEngine.testAclUser(username, rawCommand);
    }
  }

  public async getSecurityStatus(): Promise<SecurityStatusResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getSecurityStatus();
    }
    try {
      const passRes = await (this.redis as any).config('GET', 'requirepass');
      const hasRequirePass = Array.isArray(passRes) && passRes[1] && passRes[1].length > 0;
      const defaultUserRaw = await (this.redis as any).acl('GETUSER', 'default');
      const flagsIndex = Array.isArray(defaultUserRaw) ? defaultUserRaw.indexOf('flags') : -1;
      const flags: string[] = flagsIndex >= 0 && Array.isArray(defaultUserRaw[flagsIndex + 1]) ? defaultUserRaw[flagsIndex + 1] : [];
      const isDefaultNopass = flags.includes('nopass');
      const authRequired = hasRequirePass || !isDefaultNopass;

      return {
        authRequired,
        tlsEnabled: this.tls,
        defaultUserState: {
          enabled: flags.includes('on'),
          hasPassword: !isDefaultNopass,
          isDangerousAllowed: true,
          summary: isDefaultNopass
            ? "Default user is unprotected with 'nopass'."
            : 'Default user is password protected.',
        },
        recommendations: [
          isDefaultNopass ? "Default user has 'nopass'. Set a password or switch to named ACL accounts." : 'Auth is configured.',
          'Connections over public networks should have TLS enabled.',
        ],
      };
    } catch {
      return this.demoEngine.getSecurityStatus();
    }
  }

  public async getConfigParams(): Promise<ConfigParamItem[]> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getConfigParams();
    }
    try {
      const metaList = loadConfigMetadata();
      const rawAll = await (this.redis as any).config('GET', '*');
      const map: Record<string, string> = {};
      if (Array.isArray(rawAll)) {
        for (let i = 0; i < rawAll.length; i += 2) {
          map[rawAll[i]] = rawAll[i + 1];
        }
      }
      return metaList.filter(meta => map[meta.name] !== undefined).map((meta) => {
        let current = map[meta.name] !== undefined ? map[meta.name] : meta.default;
        if (meta.type === 'integer' || meta.type === 'bytes') {
          const parsed = Number(current);
          if (!isNaN(parsed)) current = parsed;
        }
        if (meta.type === 'boolean') {
          current = current === 'yes' || current === true || current === '1';
        }
        return {
          ...meta,
          currentValue: /pass|secret|token/i.test(meta.name) && current ? '********' : current,
          isChangedFromDefault: JSON.stringify(current) !== JSON.stringify(meta.default),
        };
      });
    } catch {
      return this.demoEngine.getConfigParams();
    }
  }

  public async setConfigParam(param: string, value: any): Promise<{ success: boolean; parameter: string; previousValue: any; newValue: any; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.setConfigParam(param, value);
    }
    try {
      const metaList = loadConfigMetadata();
      const validation = validateConfigParam(param, value, metaList);
      if (!validation.valid) throw new Error(validation.error);

      const prev = await (this.redis as any).config('GET', param);
      const prevVal = Array.isArray(prev) && prev.length >= 2 ? prev[1] : undefined;
      await (this.redis as any).config('SET', param, validation.normalizedValue);
      this.configRollbackStack.push({
        parameter: param,
        previousValue: prevVal,
        timestamp: Date.now(),
      });

      const sensitive = /pass|secret|token/i.test(param);
      return {
        success: true,
        parameter: param,
        previousValue: sensitive ? '********' : prevVal,
        newValue: sensitive ? '********' : validation.normalizedValue,
        command: `CONFIG SET ${param} ${sensitive ? '********' : validation.normalizedValue}`,
      };
    } catch (err: any) {
      if (err.message && !err.message.includes('ERR')) throw err;
      return this.demoEngine.setConfigParam(param, value);
    }
  }

  public async rollbackConfig(): Promise<{ success: boolean; parameter?: string; rolledBackTo?: any; command?: string; message?: string }> {
    if (this.status === 'demo') return this.demoEngine.rollbackConfig();
    const item = this.configRollbackStack[this.configRollbackStack.length - 1];
    if (!item) {
      return { success: false, message: 'There are no gateway configuration changes to undo.' };
    }
    if (!this.redis) throw Object.assign(new Error('The engine is unavailable.'), { statusCode: 503 });
    try {
      if (item.previousValue !== undefined) {
        await (this.redis as any).config('SET', item.parameter, String(item.previousValue));
      }
      this.configRollbackStack.pop();
      const masked = /pass|secret|token/i.test(item.parameter) ? '********' : item.previousValue;
      return {
        success: true,
        parameter: item.parameter,
        rolledBackTo: masked,
        command: `CONFIG SET ${item.parameter} ${masked}`,
      };
    } catch {
      return this.demoEngine.rollbackConfig();
    }
  }

  public async exportConfig(): Promise<string> {
    const items = await this.getConfigParams();
    return generateRedisConfExport(items);
  }

  // ==========================================
  // Step 11: Pub/Sub & Dedicated Client Support
  // ==========================================

  public createDedicatedClient(): Redis | null {
    if (this.status === 'demo' || !this.redis) return null;
    try {
      return new Redis({
        host: this.host,
        port: this.port,
        password: this.password,
        tls: this.tls ? {} : undefined,
        connectTimeout: 5000,
        commandTimeout: 5000,
        lazyConnect: true,
      });
    } catch {
      return null;
    }
  }

  public async getPubSubChannels(pattern = '*'): Promise<PubSubChannelsResponse> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.getPubSubChannels(pattern);
    }
    try {
      const channelNames: string[] = await (this.redis as any).pubsub('CHANNELS', pattern);
      let channels: PubSubChannelItem[] = [];
      if (channelNames && channelNames.length > 0) {
        const numsubReply: any[] = await (this.redis as any).pubsub('NUMSUB', ...channelNames);
        const map = new Map<string, number>();
        for (let i = 0; i < numsubReply.length; i += 2) {
          map.set(String(numsubReply[i]), Number(numsubReply[i + 1]) || 0);
        }
        channels = channelNames.map((name) => ({
          name,
          subscribers: map.get(name) || 0,
        }));
      }
      const numpat: number = await (this.redis as any).pubsub('NUMPAT');
      return {
        channels,
        totalChannels: channels.length,
        patternCount: Number(numpat) || 0,
      };
    } catch {
      return this.demoEngine.getPubSubChannels(pattern);
    }
  }

  public async publishPubSub(channel: string, message: string): Promise<{ success: boolean; channel: string; receivers: number; command: string }> {
    if (this.status === 'demo' || !this.redis) {
      return this.demoEngine.publishPubSub(channel, message);
    }
    try {
      const receivers = await this.redis.publish(channel, message);
      return {
        success: true,
        channel,
        receivers: Number(receivers) || 0,
        command: `PUBLISH "${channel}" "${message.replace(/"/g, '\\"')}"`,
      };
    } catch {
      return this.demoEngine.publishPubSub(channel, message);
    }
  }
}
