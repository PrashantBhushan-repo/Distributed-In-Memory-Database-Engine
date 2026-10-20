import { parseCommandLine } from '../../../../packages/shared/command-parser.mjs';
import {
  PlaygroundDataType,
  PlaygroundEncoding,
  PlaygroundInspectResponse,
  PlaygroundStructure,
  PlaygroundExecResponse,
  PlaygroundResetPreviewResponse,
  PlaygroundResetResponse,
  StringStructure,
  ListStructure,
  HashStructure,
  SetStructure,
  ZSetStructure,
} from '../types.js';

interface SandboxItem {
  type: PlaygroundDataType;
  value: any;
  createdAt: number;
}

export class PlaygroundEngine {
  private sandboxDb = 15;
  // Isolated scratch storage for DB 15
  private data: Map<string, SandboxItem> = new Map();

  constructor() {
    this.seedDefaultSandbox();
  }

  private seedDefaultSandbox() {
    // Seed initial pedagogical keys for each type
    this.data.set('play:greeting', {
      type: 'string',
      value: 'Hello Redis!',
      createdAt: Date.now(),
    });

    this.data.set('play:tasks', {
      type: 'list',
      value: ['Review pull request', 'Run integration tests', 'Deploy to staging'],
      createdAt: Date.now(),
    });

    this.data.set('play:user:101', {
      type: 'hash',
      value: {
        name: 'Grace Hopper',
        role: 'Systems Architect',
        language: 'Cobol',
        logins: '42',
      },
      createdAt: Date.now(),
    });

    this.data.set('play:ports', {
      type: 'set',
      value: [80, 443, 6379, 8080],
      createdAt: Date.now(),
    });

    this.data.set('play:leaderboard', {
      type: 'zset',
      value: [
        { member: 'charlie', score: 120 },
        { member: 'alice', score: 350 },
        { member: 'bob', score: 500 },
      ],
      createdAt: Date.now(),
    });
  }

  // Parses command line string like redis-cli (handles "quotes", 'quotes', escapes)
  public parseCommandTokens(commandLine: string): string[] { return parseCommandLine(commandLine); }

  // Extracts key arguments and verifies all keys start with "play:"
  public extractAndValidateKeys(tokens: string[]): string[] {
    if (tokens.length === 0) return [];
    const verb = tokens[0].toUpperCase();

    // Dangerous server-level command guard
    const forbidden = [
      'FLUSHALL', 'SHUTDOWN', 'CONFIG', 'REPLICAOF', 'SLAVEOF',
      'DEBUG', 'CLIENT', 'MONITOR', 'CLUSTER', 'MIGRATE', 'RESTORE'
    ];
    if (forbidden.includes(verb)) {
      throw new Error(`Command '${verb}' is forbidden in the Playground sandbox.`);
    }

    if (verb === 'SELECT') {
      const dbArg = Number(tokens[1]);
      if (dbArg !== this.sandboxDb) {
        throw new Error(
          `Playground commands must run strictly in sandbox DB ${this.sandboxDb} (attempted DB ${dbArg}).`
        );
      }
      return [];
    }

    const keys: string[] = [];

    // Commands where first argument is key
    const singleKeyVerbs = [
      'GET', 'SET', 'SETNX', 'SETEX', 'PSETEX', 'GETSET', 'STRLEN', 'APPEND', 'GETRANGE', 'SETRANGE',
      'INCR', 'DECR', 'INCRBY', 'DECRBY', 'INCRBYFLOAT',
      'LPUSH', 'RPUSH', 'LPUSHX', 'RPUSHX', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'LINDEX', 'LSET', 'LTRIM', 'LREM',
      'HSET', 'HGET', 'HMSET', 'HMGET', 'HDEL', 'HEXISTS', 'HLEN', 'HKEYS', 'HVALS', 'HGETALL', 'HINCRBY', 'HINCRBYFLOAT', 'HSETNX',
      'SADD', 'SREM', 'SMEMBERS', 'SISMEMBER', 'SCARD', 'SPOP', 'SRANDMEMBER',
      'ZADD', 'ZREM', 'ZSCORE', 'ZRANGE', 'ZREVRANGE', 'ZCARD', 'ZRANK', 'ZREVRANK', 'ZINCRBY', 'ZRANGEBYSCORE',
      'TYPE', 'OBJECT', 'TTL', 'PTTL', 'PERSIST', 'EXPIRE', 'PEXPIRE', 'MEMORY', 'DUMP'
    ];

    if (singleKeyVerbs.includes(verb)) {
      if (verb === 'OBJECT' || verb === 'MEMORY') {
        if (tokens.length >= 3) keys.push(tokens[2]);
      } else if (tokens.length >= 2) {
        keys.push(tokens[1]);
      }
    } else if (['DEL', 'UNLINK', 'EXISTS', 'MGET'].includes(verb)) {
      keys.push(...tokens.slice(1));
    } else if (verb === 'MSET') {
      for (let i = 1; i < tokens.length; i += 2) {
        keys.push(tokens[i]);
      }
    }

    // Verify all keys start with play:
    for (const k of keys) {
      if (!k.startsWith('play:')) {
        throw new Error(
          `Playground sandbox restriction: all keys must be prefixed with 'play:' (received '${k}').`
        );
      }
    }

    return keys;
  }

  // Executes command in sandbox and returns execution result
  public async executeSandboxCommand(rawCommand: string, targetDb = 15): Promise<PlaygroundExecResponse> {
    const trimmed = rawCommand.trim();
    if (!trimmed) {
      throw new Error('Command string cannot be empty.');
    }

    if (targetDb !== this.sandboxDb) {
      throw new Error(`Playground commands must run strictly in sandbox DB ${this.sandboxDb}.`);
    }

    const tokens = this.parseCommandTokens(trimmed);
    const touchedKeys = this.extractAndValidateKeys(tokens);

    const start = performance.now();
    const verb = (tokens[0] || '').toUpperCase();
    const args = tokens.slice(1);

    let reply: any = null;
    let rawReply = '';

    // Execute internal command logic for sandbox
    try {
      const res = this.dispatchSandboxCommand(verb, args);
      reply = res.reply;
      rawReply = res.rawReply;
    } catch (err: any) {
      throw err;
    }

    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const inspectedKey = touchedKeys[0];
    const inspection = inspectedKey ? this.inspectKey(inspectedKey) : undefined;

    return {
      success: true,
      command: trimmed,
      reply,
      rawReply,
      durationMs,
      touchedKeys,
      inspectedKey,
      inspection,
    };
  }

  private dispatchSandboxCommand(verb: string, args: string[]): { reply: any; rawReply: string } {
    switch (verb) {
      case 'PING':
        return { reply: 'PONG', rawReply: 'PONG' };

      case 'ECHO':
        return { reply: args.join(' '), rawReply: `"${args.join(' ')}"` };

      case 'SELECT':
        return { reply: 'OK', rawReply: 'OK' };

      // STRING COMMANDS
      case 'SET': {
        const key = args[0];
        const val = args[1] ?? '';
        this.data.set(key, { type: 'string', value: String(val), createdAt: Date.now() });
        return { reply: 'OK', rawReply: 'OK' };
      }

      case 'GET': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'string') return { reply: null, rawReply: '(nil)' };
        return { reply: item.value, rawReply: `"${item.value}"` };
      }

      case 'APPEND': {
        const key = args[0];
        const appendVal = args[1] ?? '';
        let item = this.data.get(key);
        if (!item) {
          item = { type: 'string', value: appendVal, createdAt: Date.now() };
          this.data.set(key, item);
        } else {
          item.value = String(item.value) + appendVal;
        }
        const len = String(item.value).length;
        return { reply: len, rawReply: `(integer) ${len}` };
      }

      case 'STRLEN': {
        const item = this.data.get(args[0]);
        const len = item && item.type === 'string' ? String(item.value).length : 0;
        return { reply: len, rawReply: `(integer) ${len}` };
      }

      case 'GETRANGE': {
        const item = this.data.get(args[0]);
        const start = parseInt(args[1], 10) || 0;
        const end = parseInt(args[2], 10) || -1;
        if (!item || item.type !== 'string') return { reply: '', rawReply: '""' };
        const str = String(item.value);
        const sub = end === -1 ? str.slice(start) : str.slice(start, end + 1);
        return { reply: sub, rawReply: `"${sub}"` };
      }

      case 'INCR':
      case 'INCRBY': {
        const key = args[0];
        const delta = verb === 'INCR' ? 1 : parseInt(args[1], 10) || 1;
        let item = this.data.get(key);
        let num = 0;
        if (!item) {
          num = delta;
          this.data.set(key, { type: 'string', value: String(num), createdAt: Date.now() });
        } else {
          num = parseInt(String(item.value), 10) || 0;
          num += delta;
          item.value = String(num);
        }
        return { reply: num, rawReply: `(integer) ${num}` };
      }

      case 'DECR':
      case 'DECRBY': {
        const key = args[0];
        const delta = verb === 'DECR' ? 1 : parseInt(args[1], 10) || 1;
        let item = this.data.get(key);
        let num = 0;
        if (!item) {
          num = -delta;
          this.data.set(key, { type: 'string', value: String(num), createdAt: Date.now() });
        } else {
          num = parseInt(String(item.value), 10) || 0;
          num -= delta;
          item.value = String(num);
        }
        return { reply: num, rawReply: `(integer) ${num}` };
      }

      // LIST COMMANDS
      case 'LPUSH':
      case 'RPUSH': {
        const key = args[0];
        const vals = args.slice(1);
        let item = this.data.get(key);
        if (!item || item.type !== 'list') {
          item = { type: 'list', value: [], createdAt: Date.now() };
          this.data.set(key, item);
        }
        if (verb === 'LPUSH') {
          for (const v of vals) item.value.unshift(String(v));
        } else {
          for (const v of vals) item.value.push(String(v));
        }
        return { reply: item.value.length, rawReply: `(integer) ${item.value.length}` };
      }

      case 'LPOP':
      case 'RPOP': {
        const key = args[0];
        const item = this.data.get(key);
        if (!item || item.type !== 'list' || item.value.length === 0) {
          return { reply: null, rawReply: '(nil)' };
        }
        const val = verb === 'LPOP' ? item.value.shift() : item.value.pop();
        return { reply: val, rawReply: `"${val}"` };
      }

      case 'LLEN': {
        const item = this.data.get(args[0]);
        const len = item && item.type === 'list' ? item.value.length : 0;
        return { reply: len, rawReply: `(integer) ${len}` };
      }

      case 'LRANGE': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'list') return { reply: [], rawReply: '(empty array)' };
        const start = parseInt(args[1], 10) || 0;
        const stop = parseInt(args[2], 10) || -1;
        const res = stop === -1 ? item.value.slice(start) : item.value.slice(start, stop + 1);
        return {
          reply: res,
          rawReply: res.map((r: string, idx: number) => `${idx + 1}) "${r}"`).join('\n') || '(empty array)',
        };
      }

      // HASH COMMANDS
      case 'HSET': {
        const key = args[0];
        let item = this.data.get(key);
        if (!item || item.type !== 'hash') {
          item = { type: 'hash', value: {}, createdAt: Date.now() };
          this.data.set(key, item);
        }
        let added = 0;
        for (let i = 1; i < args.length; i += 2) {
          const f = args[i];
          const v = args[i + 1] ?? '';
          if (item.value[f] === undefined) added++;
          item.value[f] = String(v);
        }
        return { reply: added, rawReply: `(integer) ${added}` };
      }

      case 'HGET': {
        const item = this.data.get(args[0]);
        const f = args[1];
        if (!item || item.type !== 'hash' || item.value[f] === undefined) {
          return { reply: null, rawReply: '(nil)' };
        }
        return { reply: item.value[f], rawReply: `"${item.value[f]}"` };
      }

      case 'HGETALL': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'hash') return { reply: {}, rawReply: '(empty array)' };
        const flat: string[] = [];
        for (const [k, v] of Object.entries(item.value)) {
          flat.push(k, String(v));
        }
        return {
          reply: item.value,
          rawReply: flat.map((s, idx) => `${idx + 1}) "${s}"`).join('\n') || '(empty array)',
        };
      }

      case 'HDEL': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'hash') return { reply: 0, rawReply: '(integer) 0' };
        let removed = 0;
        for (let i = 1; i < args.length; i++) {
          if (delete item.value[args[i]]) removed++;
        }
        return { reply: removed, rawReply: `(integer) ${removed}` };
      }

      case 'HINCRBY': {
        const key = args[0];
        const field = args[1];
        const delta = parseInt(args[2], 10) || 1;
        let item = this.data.get(key);
        if (!item || item.type !== 'hash') {
          item = { type: 'hash', value: {}, createdAt: Date.now() };
          this.data.set(key, item);
        }
        const current = parseInt(item.value[field] || '0', 10);
        const next = current + delta;
        item.value[field] = String(next);
        return { reply: next, rawReply: `(integer) ${next}` };
      }

      // SET COMMANDS
      case 'SADD': {
        const key = args[0];
        let item = this.data.get(key);
        if (!item || item.type !== 'set') {
          item = { type: 'set', value: [], createdAt: Date.now() };
          this.data.set(key, item);
        }
        let added = 0;
        const setObj = new Set<string>((item.value as any[]).map(String));
        for (let i = 1; i < args.length; i++) {
          const m = String(args[i]);
          if (!setObj.has(m)) {
            setObj.add(m);
            added++;
          }
        }
        // Preserve numbers as numbers if valid integers
        item.value = Array.from(setObj).map((val) => (/^-?\d+$/.test(val) ? parseInt(val, 10) : val));
        return { reply: added, rawReply: `(integer) ${added}` };
      }

      case 'SMEMBERS': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'set') return { reply: [], rawReply: '(empty array)' };
        return {
          reply: item.value,
          rawReply: item.value.map((v: any, idx: number) => `${idx + 1}) "${v}"`).join('\n') || '(empty array)',
        };
      }

      case 'SREM': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'set') return { reply: 0, rawReply: '(integer) 0' };
        const toRem = new Set(args.slice(1).map(String));
        const initial = item.value.length;
        item.value = item.value.filter((v: any) => !toRem.has(String(v)));
        const removed = initial - item.value.length;
        return { reply: removed, rawReply: `(integer) ${removed}` };
      }

      case 'SCARD': {
        const item = this.data.get(args[0]);
        const len = item && item.type === 'set' ? item.value.length : 0;
        return { reply: len, rawReply: `(integer) ${len}` };
      }

      // ZSET COMMANDS
      case 'ZADD': {
        const key = args[0];
        let item = this.data.get(key);
        if (!item || item.type !== 'zset') {
          item = { type: 'zset', value: [], createdAt: Date.now() };
          this.data.set(key, item);
        }
        let added = 0;
        for (let i = 1; i < args.length; i += 2) {
          const score = parseFloat(args[i]);
          const member = String(args[i + 1] ?? '');
          const existingIdx = item.value.findIndex((x: any) => x.member === member);
          if (existingIdx !== -1) {
            item.value[existingIdx].score = score;
          } else {
            item.value.push({ member, score });
            added++;
          }
        }
        item.value.sort((a: any, b: any) => a.score - b.score || a.member.localeCompare(b.member));
        return { reply: added, rawReply: `(integer) ${added}` };
      }

      case 'ZRANGE': {
        const item = this.data.get(args[0]);
        if (!item || item.type !== 'zset') return { reply: [], rawReply: '(empty array)' };
        const start = parseInt(args[1], 10) || 0;
        const stop = parseInt(args[2], 10) || -1;
        const withScores = args.slice(3).some((a) => a.toUpperCase() === 'WITHSCORES');
        const slice = stop === -1 ? item.value.slice(start) : item.value.slice(start, stop + 1);

        if (withScores) {
          const flat: any[] = [];
          for (const s of slice) flat.push(s.member, s.score);
          return {
            reply: flat,
            rawReply: flat.map((f, idx) => `${idx + 1}) "${f}"`).join('\n') || '(empty array)',
          };
        }
        const members = slice.map((s: any) => s.member);
        return {
          reply: members,
          rawReply: members.map((m: string, idx: number) => `${idx + 1}) "${m}"`).join('\n') || '(empty array)',
        };
      }

      case 'ZCARD': {
        const item = this.data.get(args[0]);
        const len = item && item.type === 'zset' ? item.value.length : 0;
        return { reply: len, rawReply: `(integer) ${len}` };
      }

      // GENERIC
      case 'DEL': {
        let count = 0;
        for (const k of args) {
          if (this.data.delete(k)) count++;
        }
        return { reply: count, rawReply: `(integer) ${count}` };
      }

      case 'TYPE': {
        const item = this.data.get(args[0]);
        const t = item ? item.type : 'none';
        return { reply: t, rawReply: t };
      }

      case 'OBJECT': {
        const sub = (args[0] || '').toUpperCase();
        const key = args[1];
        if (sub === 'ENCODING') {
          const inspected = this.inspectKey(key);
          return { reply: inspected.encoding, rawReply: inspected.encoding };
        }
        return { reply: 'OK', rawReply: 'OK' };
      }

      default:
        throw new Error(`Command '${verb}' is not supported in the Playground sandbox.`);
    }
  }

  // Deep structural introspection of any sandbox key
  public inspectKey(key: string): PlaygroundInspectResponse {
    const item = this.data.get(key);
    if (!item) {
      return {
        key,
        exists: false,
        type: 'none',
        encoding: 'unknown',
        length: 0,
        memoryBytes: 0,
        ttl: -1,
        encodingAvailable: true,
        sandboxDb: this.sandboxDb,
      };
    }

    switch (item.type) {
      case 'string':
        return this.inspectString(key, item);
      case 'list':
        return this.inspectList(key, item);
      case 'hash':
        return this.inspectHash(key, item);
      case 'set':
        return this.inspectSet(key, item);
      case 'zset':
        return this.inspectZSet(key, item);
      default:
        return {
          key,
          exists: true,
          type: item.type,
          encoding: 'raw',
          length: 0,
          memoryBytes: 64,
          ttl: -1,
          encodingAvailable: true,
          sandboxDb: this.sandboxDb,
        };
    }
  }

  private inspectString(key: string, item: SandboxItem): PlaygroundInspectResponse {
    const valStr = String(item.value);
    const len = Buffer.byteLength(valStr, 'utf-8');
    const isNum = /^-?\d+$/.test(valStr) && !isNaN(Number(valStr)) && Number(valStr) <= Number.MAX_SAFE_INTEGER;
    const numVal = isNum ? parseInt(valStr, 10) : undefined;

    let encoding: PlaygroundEncoding = 'embstr';
    let sdsType: 'sdshdr8' | 'sdshdr16' | 'sdshdr32' | 'sdshdr64' = 'sdshdr8';
    let contiguous = true;
    let explanation = '';

    if (isNum && numVal !== undefined && numVal >= -2147483648 && numVal <= 2147483647) {
      encoding = 'int';
      contiguous = true;
      explanation = 'Integer representation: the value is stored directly inside the robj ptr field as a long integer, requiring 0 extra memory allocation for an SDS struct.';
    } else if (len <= 44) {
      encoding = 'embstr';
      contiguous = true;
      explanation = `Embedded String (embstr): string length (${len}B) is ≤ 44 bytes. Redis allocates the redisObject (16B) and sdshdr8 + buffer in a single contiguous jemalloc chunk (≤ 64 bytes total), saving memory and cache lines.`;
    } else {
      encoding = 'raw';
      contiguous = false;
      explanation = `Raw SDS String: string length (${len}B) exceeds 44 bytes. Redis allocates the redisObject header and the dynamic SDS buffer in two separate heap chunks, allowing dynamic reallocations without moving the redisObject pointer.`;
      if (len > 65535) sdsType = 'sdshdr32';
      else if (len > 255) sdsType = 'sdshdr16';
    }

    const structure: StringStructure = {
      type: 'string',
      encoding: encoding as any,
      value: valStr,
      length: len,
      sdsType,
      sdsLen: len,
      sdsAlloc: len <= 44 ? 44 : Math.max(len, 64),
      isNumeric: isNum,
      numericValue: numVal,
      contiguousWithRobj: contiguous,
      explanation,
    };

    return {
      key,
      exists: true,
      type: 'string',
      encoding,
      length: len,
      memoryBytes: contiguous ? 64 : 16 + 24 + len,
      ttl: -1,
      structure,
      encodingAvailable: true,
      sandboxDb: this.sandboxDb,
    };
  }

  private inspectList(key: string, item: SandboxItem): PlaygroundInspectResponse {
    const list: string[] = item.value || [];
    const totalEntries = list.length;
    const hasLargeElement = list.some((el) => Buffer.byteLength(String(el), 'utf-8') > 64);
    const exceedsThreshold = totalEntries > 512 || hasLargeElement;

    const encoding: PlaygroundEncoding = exceedsThreshold ? 'quicklist' : 'listpack';

    let quicklistNodes: Array<{ nodeIndex: number; entries: string[]; sizeBytes: number }> | undefined;
    let explanation = '';

    if (!exceedsThreshold) {
      explanation = `Compact Listpack: small list (${totalEntries} elements, all ≤ 64 bytes). Elements are serialized consecutively into a single contiguous byte array with back-pointers, maximizing cache locality and zero pointer overhead.`;
    } else {
      explanation = `Quicklist (Doubly-Linked List of Listpacks): threshold exceeded (${totalEntries > 512 ? `${totalEntries} > 512 elements` : 'element size > 64B'}). Redis links individual listpack chunks to allow O(1) push/pop without enormous contiguous reallocations.`;

      // Partition into quicklist nodes (up to 8 elements per node)
      quicklistNodes = [];
      const chunkSize = 8;
      for (let i = 0; i < list.length; i += chunkSize) {
        const slice = list.slice(i, i + chunkSize);
        quicklistNodes.push({
          nodeIndex: Math.floor(i / chunkSize),
          entries: slice,
          sizeBytes: slice.reduce((acc, s) => acc + Buffer.byteLength(String(s), 'utf-8') + 4, 16),
        });
      }
    }

    const structure: ListStructure = {
      type: 'list',
      encoding: encoding as any,
      totalEntries,
      entries: list.slice(0, 50),
      listpackThreshold: 512,
      byteThreshold: 64,
      quicklistNodes,
      explanation,
    };

    return {
      key,
      exists: true,
      type: 'list',
      encoding,
      length: totalEntries,
      memoryBytes: 48 + totalEntries * 16,
      ttl: -1,
      structure,
      encodingAvailable: true,
      sandboxDb: this.sandboxDb,
    };
  }

  private inspectHash(key: string, item: SandboxItem): PlaygroundInspectResponse {
    const obj = item.value || {};
    const entries = Object.entries(obj).map(([field, val]) => ({ field, value: String(val) }));
    const fieldCount = entries.length;
    const hasLargeField = entries.some(
      (e) => Buffer.byteLength(e.field, 'utf-8') > 64 || Buffer.byteLength(e.value, 'utf-8') > 64
    );
    const exceedsThreshold = fieldCount > 512 || hasLargeField;

    const encoding: PlaygroundEncoding = exceedsThreshold ? 'hashtable' : 'listpack';
    let buckets: Array<{ bucketIndex: number; items: Array<{ field: string; value: string }> }> | undefined;
    let explanation = '';

    if (!exceedsThreshold) {
      explanation = `Compact Listpack: hash has ${fieldCount} fields (≤ 512) and all fields/values are ≤ 64 bytes. Stored as contiguous key-value pairs without dictionary buckets overhead.`;
    } else {
      explanation = `Hash Table (dict): converted to a full hash table (${fieldCount > 512 ? `${fieldCount} > 512 fields` : 'field or value > 64B'}). Provides O(1) random key lookups via murmur2 hash buckets.`;

      // Bucket simulation across 8 buckets
      const numBuckets = 8;
      buckets = Array.from({ length: numBuckets }, (_, i) => ({ bucketIndex: i, items: [] }));
      entries.forEach((e) => {
        let hash = 0;
        for (let i = 0; i < e.field.length; i++) hash = (hash * 31 + e.field.charCodeAt(i)) % numBuckets;
        buckets![Math.abs(hash)].items.push(e);
      });
    }

    const structure: HashStructure = {
      type: 'hash',
      encoding: encoding as any,
      fieldCount,
      fields: entries.slice(0, 50),
      threshold: 512,
      bucketCount: exceedsThreshold ? 8 : undefined,
      bucketOccupancy: exceedsThreshold ? Math.round((fieldCount / 8) * 10) / 10 : undefined,
      buckets,
      explanation,
    };

    return {
      key,
      exists: true,
      type: 'hash',
      encoding,
      length: fieldCount,
      memoryBytes: exceedsThreshold ? 128 + fieldCount * 48 : 32 + fieldCount * 14,
      ttl: -1,
      structure,
      encodingAvailable: true,
      sandboxDb: this.sandboxDb,
    };
  }

  private inspectSet(key: string, item: SandboxItem): PlaygroundInspectResponse {
    const members: any[] = item.value || [];
    const memberCount = members.length;
    const allInts = members.every((m) => /^-?\d+$/.test(String(m)) && !isNaN(Number(m)));
    const exceedsThreshold = memberCount > 512 || !allInts;

    const encoding: PlaygroundEncoding = exceedsThreshold ? 'hashtable' : 'intset';
    let elementWidthBits: 16 | 32 | 64 | undefined;
    let explanation = '';

    if (!exceedsThreshold) {
      const maxVal = Math.max(...members.map((m) => Math.abs(Number(m))));
      if (maxVal <= 32767) elementWidthBits = 16;
      else if (maxVal <= 2147483647) elementWidthBits = 32;
      else elementWidthBits = 64;

      explanation = `Integer Set (intset): all ${memberCount} members are integers and count ≤ 512. Memory layout is a sorted binary array with element width of ${elementWidthBits} bits (INTSET_ENC_INT${elementWidthBits}). Lookups use O(log N) binary search.`;
    } else {
      explanation = `Hash Table (dict): converted to hash table because ${
        !allInts ? 'a non-integer string element was inserted' : `${memberCount} > 512 members limit exceeded`
      }. Members are stored as keys in a hash table with NULL values.`;
    }

    const structure: SetStructure = {
      type: 'set',
      encoding: encoding as any,
      memberCount,
      members: members.slice(0, 50),
      elementWidthBits,
      threshold: 512,
      reason: !allInts ? 'Non-integer element detected' : undefined,
      explanation,
    };

    return {
      key,
      exists: true,
      type: 'set',
      encoding,
      length: memberCount,
      memoryBytes: encoding === 'intset' ? 16 + memberCount * ((elementWidthBits || 16) / 8) : 64 + memberCount * 32,
      ttl: -1,
      structure,
      encodingAvailable: true,
      sandboxDb: this.sandboxDb,
    };
  }

  private inspectZSet(key: string, item: SandboxItem): PlaygroundInspectResponse {
    const list: Array<{ member: string; score: number }> = item.value || [];
    const count = list.length;
    const hasLargeElement = list.some((el) => Buffer.byteLength(el.member, 'utf-8') > 64);
    const exceedsThreshold = count > 128 || hasLargeElement;

    const encoding: PlaygroundEncoding = exceedsThreshold ? 'skiplist' : 'listpack';
    let explanation = '';

    const itemsWithLevel = list.slice(0, 50).map((it, idx) => {
      // Deterministic pseudo-random skiplist tower level (1 to 6)
      let level = 1;
      let hash = it.member.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + idx;
      while (hash % 2 === 0 && level < 6) {
        level++;
        hash = Math.floor(hash / 2);
      }
      return { ...it, level };
    });

    if (!exceedsThreshold) {
      explanation = `Compact Listpack: sorted set has ${count} items (≤ 128) and all members ≤ 64 bytes. Stored as contiguous member-score pairs in sorted order within a single byte array.`;
    } else {
      explanation = `SkipList + Hash Table: sorted set exceeded listpack threshold (${count > 128 ? `${count} > 128 items` : 'member length > 64B'}). Redis combines a probabilistic multi-level skiplist for O(log N) range traversals and a hash table for O(1) score lookups.`;
    }

    const structure: ZSetStructure = {
      type: 'zset',
      encoding: encoding as any,
      count,
      items: itemsWithLevel,
      threshold: 128,
      maxLevel: 6,
      explanation,
    };

    return {
      key,
      exists: true,
      type: 'zset',
      encoding,
      length: count,
      memoryBytes: exceedsThreshold ? 128 + count * 64 : 32 + count * 20,
      ttl: -1,
      structure,
      encodingAvailable: true,
      sandboxDb: this.sandboxDb,
    };
  }

  public previewReset(): PlaygroundResetPreviewResponse {
    const keys: string[] = [];
    for (const [k] of this.data.entries()) {
      if (k.startsWith('play:')) {
        keys.push(k);
      }
    }
    return {
      sandboxDb: this.sandboxDb,
      count: keys.length,
      keys,
    };
  }

  public resetSandbox(): PlaygroundResetResponse {
    let deletedCount = 0;
    for (const [k] of Array.from(this.data.entries())) {
      if (k.startsWith('play:')) {
        this.data.delete(k);
        deletedCount++;
      }
    }

    // Re-seed default keys so the sandbox is immediately ready for exploration
    this.seedDefaultSandbox();

    return {
      success: true,
      sandboxDb: this.sandboxDb,
      count: deletedCount,
      command: `DEL play:* (${deletedCount} keys purged, default sandbox keys restored)`,
    };
  }
}

export const playgroundEngine = new PlaygroundEngine();
