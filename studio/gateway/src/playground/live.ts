import { RedisGatewayClient } from '../redis/client.js';
import { databaseContext } from '../redis/context.js';
import { playgroundEngine } from './engine.js';
import { PlaygroundInspectResponse, PlaygroundExecResponse } from '../types.js';

// An allowlist makes unknown commands fail closed: no scripts, global commands,
// key movement, pub/sub, or dynamic key discovery can escape the sandbox.
const singleKey = new Set(['GET', 'SET', 'STRLEN', 'APPEND', 'INCR', 'DECR', 'INCRBY', 'DECRBY',
  'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'LINDEX', 'LSET', 'LTRIM', 'LREM',
  'HSET', 'HGET', 'HDEL', 'HEXISTS', 'HLEN', 'HGETALL', 'SADD', 'SREM', 'SMEMBERS', 'SISMEMBER', 'SCARD',
  'ZADD', 'ZREM', 'ZSCORE', 'ZRANGE', 'ZREVRANGE', 'ZCARD', 'ZRANK', 'TYPE', 'TTL', 'PTTL', 'PERSIST', 'EXPIRE', 'PEXPIRE']);
export function sandboxTokens(command: string) {
  const tokens = playgroundEngine.parseCommandTokens(command);
  const verb = (tokens[0] ?? '').toUpperCase();
  let keys: string[];
  if (singleKey.has(verb)) keys = tokens.slice(1, 2);
  else if (['DEL', 'UNLINK', 'EXISTS', 'MGET'].includes(verb)) keys = tokens.slice(1);
  else if (verb === 'MSET') keys = tokens.filter((_value, index) => index % 2 === 1);
  else if (['PING', 'ECHO'].includes(verb)) keys = [];
  else throw new Error(`Command '${verb}' is not supported in the isolated playground.`);
  if (singleKey.has(verb) && keys.length === 0) throw new Error('Provide a play: key for this command.');
  if (keys.some(key => !key.startsWith('play:'))) throw new Error('All playground keys must start with play:.');
  return { tokens, keys };
}

export class LivePlayground {
  constructor(private client: RedisGatewayClient) {}
  async executeSandboxCommand(command: string, db = 15): Promise<PlaygroundExecResponse> {
    if (db !== 15) throw new Error('The playground runs only in database 15.');
    const { tokens, keys } = sandboxTokens(command);
    return databaseContext.run(15, async () => {
      const start = performance.now();
      const reply: unknown = await this.client.executeRaw(tokens);
      const inspection = keys[0] ? await this.inspectKey(keys[0]) : undefined;
      return { success: true, command, reply, rawReply: typeof reply === 'string' ? reply : JSON.stringify(reply),
        durationMs: performance.now() - start, touchedKeys: keys, inspectedKey: keys[0], inspection };
    });
  }
  async inspectKey(key: string): Promise<PlaygroundInspectResponse & { valuePreview?: unknown }> {
    if (!key.startsWith('play:')) throw new Error('All playground keys must start with play:.');
    return databaseContext.run(15, async () => {
      const detail = await this.client.getKeyDetail(key, { limit: 100 });
      if (!detail) return { key, exists: false, type: 'none', encoding: 'unknown', length: 0, memoryBytes: 0, ttl: -2, encodingAvailable: false, sandboxDb: 15 };
      return { key, exists: true, type: detail.type, encoding: 'unknown', length: detail.length, memoryBytes: detail.memoryBytes,
        ttl: detail.ttl, encodingAvailable: false, sandboxDb: 15,
        valuePreview: detail.value ?? detail.listItems ?? detail.hashEntries ?? detail.setMembers ?? detail.zsetMembers };
    });
  }
  async previewReset() {
    return databaseContext.run(15, async () => {
      let cursor = 0;
      const keys = new Set<string>();
      for (let rounds = 0; rounds < 100; rounds++) {
        const page = await this.client.getKeys(cursor, 'play:*', 500);
        page.keys.forEach(key => keys.add(key.name)); cursor = page.cursor;
        if (keys.size > 10000) throw new Error('More than 10,000 playground keys. Reset in smaller batches using the key explorer.');
        if (!cursor) return { sandboxDb: 15, count: keys.size, keys: [...keys] };
      }
      throw new Error('The scan did not finish within its work limit. Retry when the sandbox is quieter.');
    });
  }
  async resetSandbox() {
    const preview = await this.previewReset();
    const result = await databaseContext.run(15, () => this.client.bulkDeleteKeys(preview.keys));
    return { success: true, sandboxDb: 15, count: result.count, command: result.command };
  }
}
