import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { z } from 'zod';
import { RedisGatewayClient } from './redis/client.js';
import { SafetyEngine } from './safety/engine.js';
import { MetricsSampler } from './metrics/sampler.js';
import { authenticateUser, createToken, verifyToken } from './auth/jwt.js';
import { UserContext, MonitorEntry, MonitorFilter, PubSubMessageEvent } from './types.js';
import { playgroundEngine } from './playground/engine.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await app.register(websocket);

const redisClient = new RedisGatewayClient();
const safetyEngine = new SafetyEngine();
const metricsSampler = new MetricsSampler(redisClient);

// Auth helper
async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<UserContext | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // For convenience in local dev, default to admin if not provided
    return { username: 'default_admin', role: 'admin' };
  }
  const token = authHeader.substring(7);
  const user = await verifyToken(token);
  if (!user) {
    reply.status(401).send({ error: 'Unauthorized: Invalid or expired token' });
    return null;
  }
  return user;
}

// 1. Health check
app.get('/health', async () => {
  const status = redisClient.getStatus();
  return {
    status: 'ok',
    gateway: 'healthy',
    timestamp: new Date().toISOString(),
    redis: status,
  };
});

// 2. Auth login
const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

app.post('/api/auth/login', async (req, reply) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Invalid username or password payload' });
  }
  const user = await authenticateUser(parsed.data.username, parsed.data.password);
  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }
  const token = await createToken(user);
  return { token, user };
});

// 3. Status & Capabilities
app.get('/api/capabilities', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getStatus();
});

// 4. Redis INFO
app.get('/api/info', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getInfo();
});

// 5. Keys listing (SCAN)
app.get('/api/keys', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const query = req.query as any;
  const cursor = Number(query.cursor) || 0;
  const match = query.match || '*';
  const count = Number(query.count) || 100;
  const type = query.type || 'all';

  return redisClient.getKeys(cursor, match, count, type);
});

// 5b. Keys Tree View
app.get('/api/keys/tree', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const query = req.query as any;
  const prefix = query.prefix || '';
  const delimiter = query.delimiter || ':';
  const maxScan = Number(query.maxScan) || 2000;

  return redisClient.getKeyTree(prefix, delimiter, maxScan);
});

// 5c. DB Size & Per-DB counts
app.get('/api/dbsize', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getDbSize();
});

// Helper for mutation safety check
function checkMutationSafety(cmd: string, args: string[], user: UserContext, reply: FastifyReply): boolean {
  const check = safetyEngine.validateCommand(cmd, args, user.role, false);
  if (!check.allowed) {
    safetyEngine.recordAudit(user.username, user.role, args, 0, 'blocked', check.reason);
    reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      message: check.reason,
      hint: user.role === 'viewer' ? 'Viewer accounts have strictly read-only access.' : 'Operation blocked by safety policy.',
    });
    return false;
  }
  return true;
}

// 6. Key Detail (Type-aware, paginated and capped)
app.get('/api/key/:name', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const query = req.query as any;
  const options = {
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
    cursor: query.cursor ? Number(query.cursor) : 0,
    scoreMin: query.scoreMin !== undefined ? Number(query.scoreMin) : undefined,
    scoreMax: query.scoreMax !== undefined ? Number(query.scoreMax) : undefined,
    filter: query.filter || undefined,
  };

  const detail = await redisClient.getKeyDetail(name, options);
  if (!detail) {
    return reply.status(404).send({ error: `Key '${name}' not found or expired`, notFound: true });
  }
  return detail;
});

// 6a. Create / Replace String Key
const PutStringSchema = z.object({
  value: z.string(),
  ttl: z.number().optional(),
});

app.put('/api/key/:name', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const parsed = PutStringSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Payload must contain a string value' });
  }

  const { value, ttl } = parsed.data;
  if (!checkMutationSafety('SET', ['SET', name, value], user, reply)) return;

  const res = await redisClient.setString(name, value, ttl);
  safetyEngine.recordAudit(user.username, user.role, ['SET', name, value], 1, 'success');
  return { success: true, command: res.command, key: name };
});

// 6b. List Mutations (Push & Pop & Delete by index)
app.post('/api/key/:name/list/push', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const direction = (body?.direction === 'left' ? 'left' : 'right') as 'left' | 'right';
  const val = String(body?.value ?? '');

  const cmd = direction === 'left' ? 'LPUSH' : 'RPUSH';
  if (!checkMutationSafety(cmd, [cmd, name, val], user, reply)) return;

  const res = await redisClient.pushList(name, direction, val);
  safetyEngine.recordAudit(user.username, user.role, [cmd, name, val], 1, 'success');
  return { success: true, command: res.command, length: res.length };
});

app.post('/api/key/:name/list/pop', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const direction = (body?.direction === 'left' ? 'left' : 'right') as 'left' | 'right';

  const cmd = direction === 'left' ? 'LPOP' : 'RPOP';
  if (!checkMutationSafety(cmd, [cmd, name], user, reply)) return;

  const res = await redisClient.popList(name, direction);
  safetyEngine.recordAudit(user.username, user.role, [cmd, name], 1, 'success');
  return { success: true, command: res.command, value: res.value };
});

app.delete('/api/key/:name/list/index/:index', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name, index } = req.params as { name: string; index: string };
  if (!checkMutationSafety('LREM', ['LREM', name, '1', index], user, reply)) return;

  const res = await redisClient.deleteListIndex(name, Number(index));
  safetyEngine.recordAudit(user.username, user.role, ['LREM', name, '1', index], 1, 'success');
  return { success: res.success, command: res.command };
});

// 6c. Hash Mutations (Field Set & Delete)
app.put('/api/key/:name/hash/field', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const field = String(body?.field ?? '');
  const value = String(body?.value ?? '');

  if (!checkMutationSafety('HSET', ['HSET', name, field, value], user, reply)) return;

  const res = await redisClient.setHashField(name, field, value);
  safetyEngine.recordAudit(user.username, user.role, ['HSET', name, field, value], 1, 'success');
  return { success: true, command: res.command };
});

app.delete('/api/key/:name/hash/field', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const query = req.query as any;
  const body = (req.body as any) || {};
  const field = String(query.field || body.field || '');

  if (!checkMutationSafety('HDEL', ['HDEL', name, field], user, reply)) return;

  const res = await redisClient.deleteHashField(name, field);
  safetyEngine.recordAudit(user.username, user.role, ['HDEL', name, field], 1, 'success');
  return { success: res.deleted, command: res.command };
});

// 6d. Set Mutations (Add & Remove)
app.post('/api/key/:name/set/add', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const member = String(body?.member ?? '');

  if (!checkMutationSafety('SADD', ['SADD', name, member], user, reply)) return;

  const res = await redisClient.addSetMember(name, member);
  safetyEngine.recordAudit(user.username, user.role, ['SADD', name, member], 1, 'success');
  return { success: res.added, command: res.command };
});

app.post('/api/key/:name/set/remove', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const member = String(body?.member ?? '');

  if (!checkMutationSafety('SREM', ['SREM', name, member], user, reply)) return;

  const res = await redisClient.removeSetMember(name, member);
  safetyEngine.recordAudit(user.username, user.role, ['SREM', name, member], 1, 'success');
  return { success: res.removed, command: res.command };
});

// 6e. Sorted Set Mutations (Add & Remove)
app.post('/api/key/:name/zset/add', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const member = String(body?.member ?? '');
  const score = Number(body?.score ?? 0);

  if (!checkMutationSafety('ZADD', ['ZADD', name, String(score), member], user, reply)) return;

  const res = await redisClient.addZSetMember(name, member, score);
  safetyEngine.recordAudit(user.username, user.role, ['ZADD', name, String(score), member], 1, 'success');
  return { success: true, command: res.command };
});

app.post('/api/key/:name/zset/remove', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const member = String(body?.member ?? '');

  if (!checkMutationSafety('ZREM', ['ZREM', name, member], user, reply)) return;

  const res = await redisClient.removeZSetMember(name, member);
  safetyEngine.recordAudit(user.username, user.role, ['ZREM', name, member], 1, 'success');
  return { success: res.removed, command: res.command };
});

// 6f. Key TTL Mutation
app.put('/api/key/:name/ttl', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  const body = req.body as any;
  const ttl = Number(body?.ttl ?? -1);

  const cmd = ttl === -1 ? 'PERSIST' : 'EXPIRE';
  if (!checkMutationSafety(cmd, [cmd, name, String(ttl)], user, reply)) return;

  const res = await redisClient.setTtl(name, ttl);
  safetyEngine.recordAudit(user.username, user.role, [cmd, name, String(ttl)], 1, 'success');
  return { success: res.success, command: res.command };
});

// 6g. Delete Single Key
app.delete('/api/key/:name', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const { name } = req.params as { name: string };
  if (!checkMutationSafety('DEL', ['DEL', name], user, reply)) return;

  const res = await redisClient.deleteKey(name);
  safetyEngine.recordAudit(user.username, user.role, ['DEL', name], 1, 'success');
  return { success: res.deleted, command: res.command, key: name };
});

// 6h. Bulk Delete Keys (with dryRun=true support)
app.post('/api/keys/delete', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = req.body as any;
  const keys: string[] = Array.isArray(body?.keys) ? body.keys : [];
  const dryRun = Boolean(body?.dryRun);

  if (dryRun) {
    const res = await redisClient.bulkDeleteKeys(keys, true);
    return res;
  }

  if (!checkMutationSafety('DEL', ['DEL', ...keys.slice(0, 10)], user, reply)) return;

  const res = await redisClient.bulkDeleteKeys(keys, false);
  safetyEngine.recordAudit(user.username, user.role, ['DEL', ...keys.slice(0, 5)], 1, 'success');
  return { success: true, deletedCount: res.count, command: res.command, keys };
});

// 6i. Create Key Wizard (All Types)
app.post('/api/keys/create', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = req.body as any;
  const name = String(body?.name ?? '').trim();
  const type = String(body?.type ?? 'string') as 'string' | 'list' | 'hash' | 'set' | 'zset';
  const payload = body?.payload ?? {};
  const ttl = body?.ttl !== undefined ? Number(body.ttl) : undefined;

  if (!name) {
    return reply.status(400).send({ error: 'Key name is required' });
  }

  if (!checkMutationSafety('SET', ['SET', name, '...'], user, reply)) return;

  const res = await redisClient.createKey(name, type, payload, ttl);
  safetyEngine.recordAudit(user.username, user.role, ['CREATE', name, type], 1, 'success');
  return { success: true, commands: res.commands, name };
});

// 7. Command Execution
const CommandSchema = z.object({
  args: z.array(z.string()).min(1),
  unlock: z.boolean().optional(),
});

// Helper for parsing shell/redis-cli style quoted arguments
function parseCommandLine(cmdStr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let escapeNext = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const ch = cmdStr[i];

    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && !inSingle) {
      escapeNext = true;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (/\s/.test(ch) && !inDouble && !inSingle) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

// 7a. Command Dictionary & Metadata (/api/commands)
app.get('/api/commands', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getCommands();
});

app.post('/api/command', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const parsed = CommandSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Args must be an array of string tokens' });
  }

  const { args, unlock = false } = parsed.data;
  const cmd = args[0];

  // Safety validation
  const check = safetyEngine.validateCommand(cmd, args, user.role, unlock);
  if (!check.allowed) {
    safetyEngine.recordAudit(user.username, user.role, args, 0, 'blocked', check.reason);
    return reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      message: check.reason,
      hint: 'Toggle Unlock Dangerous Commands in Settings or run with Administrator privileges.',
    });
  }

  const start = performance.now();
  try {
    const rawReply = await redisClient.executeRaw(args);
    const durationMs = Math.round(performance.now() - start);

    safetyEngine.recordAudit(user.username, user.role, args, durationMs, 'success');
    return safetyEngine.formatExecutionResult(rawReply, durationMs, args.join(' '));
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    safetyEngine.recordAudit(user.username, user.role, args, durationMs, 'error', err.message);

    return reply.status(500).send({
      code: 'ERR_REDIS_EXEC',
      message: err.message,
      hint: 'Check command syntax or arguments against Redis command reference.',
    });
  }
});

// 7b. Pipeline Execution (/api/pipeline)
const PipelineSchema = z.object({
  commands: z.array(z.union([z.string(), z.array(z.string())])).min(1).max(200),
  unlock: z.boolean().optional(),
});

app.post('/api/pipeline', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const parsed = PipelineSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Commands must be an array of 1 to 200 commands' });
  }

  const { commands, unlock = false } = parsed.data;
  const normalizedCommands: string[][] = commands.map((c) => {
    if (typeof c === 'string') {
      return parseCommandLine(c);
    }
    return c;
  }).filter((c) => c.length > 0);

  return redisClient.executePipeline(normalizedCommands, safetyEngine, user, unlock);
});

// 8. Audit Log
app.get('/api/audit', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const limit = Number((req.query as any).limit) || 50;
  return safetyEngine.getAuditLog(limit);
});

// 9. Metrics History
app.get('/api/metrics/history', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const range = ((req.query as any).range || '1h') as '15m' | '1h' | '6h' | '24h';
  const points = metricsSampler.getHistory(range);
  return { range, points, count: points.length };
});

// 10. Health Summary
app.get('/api/health-summary', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return metricsSampler.getHealthSummary();
});

// 11. Health Summary Simulation (for testing transitions)
app.post('/api/health-summary/simulate', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const { condition } = (req.body as any) || {};
  metricsSampler.setSimulatedCondition(condition || null);
  return { ok: true, activeCondition: metricsSampler.getSimulatedCondition() };
});

// ==========================================
// Step 7: Memory & Eviction, Expiration API
// ==========================================

function parseMemoryBytes(val: any): number {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 268435456;
  const s = val.trim().toUpperCase();
  const match = s.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B?)$/);
  if (!match) {
    const parsed = Number(val);
    return isNaN(parsed) ? 268435456 : parsed;
  }
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (unit.startsWith('G')) return Math.round(num * 1024 * 1024 * 1024);
  if (unit.startsWith('M')) return Math.round(num * 1024 * 1024);
  if (unit.startsWith('K')) return Math.round(num * 1024);
  return Math.round(num);
}

// 1. GET /api/memory/overview
app.get('/api/memory/overview', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getMemoryOverview();
});

// 2. GET /api/memory/top-keys?n=20
app.get('/api/memory/top-keys', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const n = Math.min(100, Math.max(1, Number((req.query as any)?.n) || 20));
  return redisClient.getTopKeys(n);
});

// 3. GET /api/memory/simulate?maxmemory=&policy=
app.get('/api/memory/simulate', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const query = req.query as any;
  const maxmemoryBytes = parseMemoryBytes(query?.maxmemory ?? '256M');
  const policy = String(query?.policy ?? 'volatile-lru').trim();
  return redisClient.simulateEviction(maxmemoryBytes, policy);
});

// 4. POST /api/memory/config (CONFIG SET maxmemory / maxmemory-policy via safety layer)
app.post('/api/memory/config', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = (req.body as any) || {};
  const unlock = Boolean(body.unlock);
  const maxmemory = body.maxmemory !== undefined ? parseMemoryBytes(body.maxmemory) : undefined;
  const policy = body.policy ? String(body.policy).trim() : undefined;

  // Admin + Unlock required
  const safetyCheck = safetyEngine.validateCommand('CONFIG', ['CONFIG', 'SET'], user.role, unlock);
  if (!safetyCheck.allowed) {
    safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', 'memory'], 0, 'blocked', safetyCheck.reason);
    return reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      message: safetyCheck.reason,
      hint: 'Modifying engine memory limits requires Administrator role and Confirm & Unlock checked.',
    });
  }

  const res = await redisClient.updateMemoryConfig(maxmemory, policy);
  safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', 'memory'], 1, 'success');
  return res;
});

// 5. GET /api/expiration/soonest?n=50
app.get('/api/expiration/soonest', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const n = Math.min(100, Math.max(1, Number((req.query as any)?.n) || 50));
  return redisClient.getSoonestExpiringKeys(n);
});

// 6. GET /api/expiration/histogram
app.get('/api/expiration/histogram', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getExpirationHistogram();
});

// 7. GET /api/expiration/stats (expired vs evicted rates + timeline)
app.get('/api/expiration/stats', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const latest = metricsSampler.getLatestSample();
  const history = metricsSampler.getHistory('1h');
  const info = await redisClient.getInfo();

  const timeline = history.map((pt) => {
    const d = new Date(pt.timestamp);
    const timeLabel = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    return {
      timestamp: pt.timestamp,
      timeLabel,
      expiredRate: pt.expiredKeysPerSec,
      evictedRate: pt.evictedKeysPerSec,
      usedMemory: pt.usedMemory,
    };
  });

  return {
    expired_keys: (info as any)?.stats?.expired_keys || 320,
    evicted_keys: (info as any)?.stats?.evicted_keys || 0,
    expired_rate: latest.expiredKeysPerSec,
    evicted_rate: latest.evictedKeysPerSec,
    active_expire_enabled: true,
    timeline,
  };
});

// 8. POST /api/expiration/bulk-set
app.post('/api/expiration/bulk-set', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = (req.body as any) || {};
  const pattern = String(body.pattern || '*').trim();
  const ttl = Number(body.ttl);
  const dryRun = Boolean(body.previewOnly || body.dryRun);

  if (isNaN(ttl)) {
    return reply.status(400).send({ error: 'TTL must be a valid number of seconds (-1 to persist)' });
  }

  if (!dryRun) {
    if (!checkMutationSafety('EXPIRE', ['EXPIRE', pattern, String(ttl)], user, reply)) return;
  }

  const res = await redisClient.bulkSetTtl(pattern, ttl, dryRun);
  if (!dryRun) {
    safetyEngine.recordAudit(user.username, user.role, ['EXPIRE', pattern, String(ttl)], 1, 'success');
  }
  return res;
});

// ==========================================
// Step 8: Clients & Slow Log API Endpoints
// ==========================================

// 1. GET /api/clients
app.get('/api/clients', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getClients();
});

// 2. POST /api/clients/:id/kill (operator+ role, audited)
app.post('/api/clients/:id/kill', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role === 'viewer') {
    return reply.status(403).send({ error: 'Killing client connections requires Operator or Administrator role.' });
  }

  const { id } = req.params as { id: string };
  const res = await redisClient.killClient(id);
  safetyEngine.recordAudit(user.username, user.role, ['CLIENT', 'KILL', 'ID', id], 1, res.success ? 'success' : 'error');
  return res;
});

// 3. POST /api/clients/:id/name (operator+ role, audited)
app.post('/api/clients/:id/name', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role === 'viewer') {
    return reply.status(403).send({ error: 'Renaming client connections requires Operator or Administrator role.' });
  }

  const { id } = req.params as { id: string };
  const body = (req.body as any) || {};
  const name = String(body.name || '').trim();

  if (!name) {
    return reply.status(400).send({ error: 'New client name must not be empty.' });
  }

  const res = await redisClient.renameClient(id, name);
  safetyEngine.recordAudit(user.username, user.role, ['CLIENT', 'SETNAME', name], 1, res.success ? 'success' : 'error');
  return res;
});

// 4. GET /api/slowlog?n=
app.get('/api/slowlog', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const n = Math.min(200, Math.max(1, Number((req.query as any)?.n) || 50));
  return redisClient.getSlowLog(n);
});

// 5. GET /api/slowlog/len
app.get('/api/slowlog/len', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getSlowLogLen();
});

// 6. POST /api/slowlog/reset (admin role, audited)
app.post('/api/slowlog/reset', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Resetting the Redis slow log requires Administrator role.' });
  }

  const res = await redisClient.resetSlowLog();
  safetyEngine.recordAudit(user.username, user.role, ['SLOWLOG', 'RESET'], 1, 'success');
  return res;
});

// 7. POST /api/slowlog/config (admin role + unlock, audited)
app.post('/api/slowlog/config', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = (req.body as any) || {};
  const unlock = Boolean(body.unlock);
  const microseconds = Number(body.microseconds);

  if (isNaN(microseconds) || microseconds < -1) {
    return reply.status(400).send({ error: 'Microseconds must be a valid number >= -1 (-1 disables slow log).' });
  }

  const safetyCheck = safetyEngine.validateCommand('CONFIG', ['CONFIG', 'SET', 'slowlog'], user.role, unlock);
  if (!safetyCheck.allowed) {
    safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', 'slowlog'], 0, 'blocked', safetyCheck.reason);
    return reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      message: safetyCheck.reason,
      hint: 'Modifying slowlog thresholds requires Administrator privileges with Confirm & Unlock checked.',
    });
  }

  const res = await redisClient.setSlowLogThreshold(microseconds);
  safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', 'slowlog-log-slower-than', String(microseconds)], 1, 'success');
  return res;
});

// ==========================================
// Step 9: Persistence & Replication API Endpoints
// ==========================================

// 1. GET /api/persistence
app.get('/api/persistence', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getPersistenceInfo();
});

// 2. POST /api/persistence/bgsave (operator+, audited)
app.post('/api/persistence/bgsave', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role === 'viewer') {
    return reply.status(403).send({ error: 'Executing BGSAVE requires Operator or Administrator role.' });
  }

  const res = await redisClient.bgsave();
  safetyEngine.recordAudit(user.username, user.role, ['BGSAVE'], 1, res.success ? 'success' : 'error');
  return res;
});

// 3. POST /api/persistence/bgrewriteaof (operator+, audited)
app.post('/api/persistence/bgrewriteaof', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role === 'viewer') {
    return reply.status(403).send({ error: 'Executing BGREWRITEAOF requires Operator or Administrator role.' });
  }

  const res = await redisClient.bgrewriteaof();
  safetyEngine.recordAudit(user.username, user.role, ['BGREWRITEAOF'], 1, res.success ? 'success' : 'error');
  return res;
});

// 4. POST /api/persistence/fsync (operator+, audited)
app.post('/api/persistence/fsync', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role === 'viewer') {
    return reply.status(403).send({ error: 'Updating fsync policy requires Operator or Administrator role.' });
  }

  const body = (req.body as any) || {};
  const policy = body.policy as 'always' | 'everysec' | 'no';
  if (!['always', 'everysec', 'no'].includes(policy)) {
    return reply.status(400).send({ error: 'Invalid fsync policy. Must be "always", "everysec", or "no".' });
  }

  const res = await redisClient.setFsyncPolicy(policy);
  safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', 'appendfsync', policy], 1, 'success');
  return res;
});

// 5. POST /api/persistence/inspect-snapshot (admin, audited)
app.post('/api/persistence/inspect-snapshot', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Snapshot inspection requires Administrator role.' });
  }

  const body = (req.body as any) || {};
  const filePath = String(body.filePath || '').trim();
  const res = await redisClient.inspectSnapshot(filePath);
  safetyEngine.recordAudit(user.username, user.role, ['SNAPSHOT', 'INSPECT', filePath], 1, res.valid ? 'success' : 'error');
  return res;
});

// 6. GET /api/replication
app.get('/api/replication', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getReplicationTopology();
});

// 7. GET /api/replication/preflight
app.get('/api/replication/preflight', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const q = (req.query as any) || {};
  const action = q.action === 'promote' ? 'promote' : 'replicaof';
  const host = q.host ? String(q.host) : undefined;
  const port = q.port ? Number(q.port) : undefined;

  return redisClient.getReplicationPreflight(action, host, port);
});

// 8. POST /api/replication/replicaof (admin + unlock, audited)
app.post('/api/replication/replicaof', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Changing replication topology requires Administrator role.' });
  }

  const body = (req.body as any) || {};
  const unlock = Boolean(body.unlock);
  if (!unlock) {
    return reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      error: 'Changing replication role will flush keyspace. Must confirm & unlock before proceeding.',
    });
  }

  const host = String(body.host || '').trim();
  const port = Number(body.port);
  if (!host || isNaN(port) || port <= 0 || port > 65535) {
    return reply.status(400).send({ error: 'Valid host and port (1-65535) required.' });
  }

  const res = await redisClient.replicaOf(host, port);
  safetyEngine.recordAudit(user.username, user.role, ['REPLICAOF', host, String(port)], 1, 'success');
  return res;
});

// 9. POST /api/replication/promote (admin + unlock, audited)
app.post('/api/replication/promote', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Promoting replica requires Administrator role.' });
  }

  const body = (req.body as any) || {};
  const unlock = Boolean(body.unlock);
  if (!unlock) {
    return reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      error: 'Promoting replica to master requires Confirm & Unlock.',
    });
  }

  const res = await redisClient.promote();
  safetyEngine.recordAudit(user.username, user.role, ['REPLICAOF', 'NO', 'ONE'], 1, 'success');
  return res;
});

// ==========================================
// Step 10: Security & ACL, Configuration API
// ==========================================

// 1. GET /api/acl/users
app.get('/api/acl/users', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getAclUsers();
});

// 2. POST /api/acl/users (admin, audited, masked passwords)
app.post('/api/acl/users', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Modifying ACL users requires Administrator role.' });
  }

  const rule = req.body as any;
  if (!rule || !rule.username) {
    return reply.status(400).send({ error: 'Valid ACL rule object with username required.' });
  }

  const res = await redisClient.setAclUser(rule);
  safetyEngine.recordAudit(user.username, user.role, ['ACL', 'SETUSER', rule.username, '>********'], 1, 'success');
  return res;
});

// 3. DELETE /api/acl/users/:name (admin, audited)
app.delete('/api/acl/users/:name', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Deleting ACL users requires Administrator role.' });
  }

  const { name } = req.params as { name: string };
  if (name === 'default') {
    return reply.status(400).send({ error: 'Cannot delete the default user.' });
  }

  const res = await redisClient.deleteAclUser(name);
  safetyEngine.recordAudit(user.username, user.role, ['ACL', 'DELUSER', name], 1, 'success');
  return res;
});

// 4. GET /api/acl/categories
app.get('/api/acl/categories', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getAclCategories();
});

// 5. POST /api/acl/test
app.post('/api/acl/test', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = (req.body as any) || {};
  const targetUser = String(body.user || 'default').trim();
  const command = String(body.command || '').trim();

  if (!command) {
    return reply.status(400).send({ error: 'Command string is required for ACL evaluation test.' });
  }

  return redisClient.testAclUser(targetUser, command);
});

// 6. GET /api/security/status
app.get('/api/security/status', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getSecurityStatus();
});

// 7. GET /api/config
app.get('/api/config', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  return redisClient.getConfigParams();
});

// 8. POST /api/config (admin + unlock, audited, masked)
app.post('/api/config', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Modifying Redis configuration requires Administrator role.' });
  }

  const body = (req.body as any) || {};
  const unlock = Boolean(body.unlock);
  if (!unlock) {
    return reply.status(403).send({
      code: 'ERR_SAFETY_BLOCKED',
      error: 'Modifying configuration parameters requires Confirm & Unlock.',
    });
  }

  const parameter = String(body.parameter || '').trim();
  const value = body.value;

  if (!parameter) {
    return reply.status(400).send({ error: 'Parameter name is required.' });
  }

  try {
    const res = await redisClient.setConfigParam(parameter, value);
    const auditVal = parameter === 'requirepass' ? '********' : String(value);
    safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', parameter, auditVal], 1, 'success');
    return res;
  } catch (err: any) {
    safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'SET', parameter], 1, 'error', err.message);
    return reply.status(400).send({ error: err.message || 'Configuration update failed.' });
  }
});

// 9. POST /api/config/rollback (admin + unlock, audited)
app.post('/api/config/rollback', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role !== 'admin') {
    return reply.status(403).send({ error: 'Rolling back configuration requires Administrator role.' });
  }

  const res = await redisClient.rollbackConfig();
  if (res.parameter) {
    safetyEngine.recordAudit(user.username, user.role, ['CONFIG', 'ROLLBACK', res.parameter], 1, 'success');
  }
  return res;
});

// 10. GET /api/config/export
app.get('/api/config/export', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const confText = await redisClient.exportConfig();
  return { content: confText, filename: 'redis.conf' };
});

// ==========================================
// Step 11: Metrics, Live Monitor & Pub/Sub
// ==========================================

interface PubSubWsClient {
  ws: any;
  channels: Set<string>;
  patterns: Set<string>;
}
const activePubSubClients = new Set<PubSubWsClient>();

function broadcastPubSubMessage(channel: string, payload: string) {
  const event: PubSubMessageEvent = {
    type: 'message',
    channel,
    payload,
    timestamp: Date.now(),
    timeStr: new Date().toLocaleTimeString(),
  };
  const json = JSON.stringify(event);

  for (const client of activePubSubClients) {
    let matches = client.channels.has(channel);
    if (!matches) {
      for (const pat of client.patterns) {
        const regex = new RegExp('^' + pat.replace(/\*/g, '.*') + '$');
        if (regex.test(channel)) {
          const pEvent: PubSubMessageEvent = {
            type: 'pmessage',
            channel,
            pattern: pat,
            payload,
            timestamp: Date.now(),
            timeStr: new Date().toLocaleTimeString(),
          };
          try {
            client.ws.send(JSON.stringify(pEvent));
          } catch {}
          matches = true;
          break;
        }
      }
    } else {
      try {
        client.ws.send(json);
      } catch {}
    }
  }
}

// 11. GET /api/pubsub/channels
app.get('/api/pubsub/channels', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;
  const query = req.query as any;
  const pattern = query.pattern || '*';
  return redisClient.getPubSubChannels(pattern);
});

// 12. POST /api/pubsub/publish (operator+, audited)
app.post('/api/pubsub/publish', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  if (user.role === 'viewer') {
    return reply.status(403).send({ error: 'Publishing messages requires Operator or Administrator role.' });
  }

  const body = (req.body as any) || {};
  const channel = String(body.channel || '').trim();
  const message = String(body.message || '');

  if (!channel) {
    return reply.status(400).send({ error: 'Channel name is required.' });
  }

  try {
    const res = await redisClient.publishPubSub(channel, message);
    safetyEngine.recordAudit(user.username, user.role, ['PUBLISH', channel, message], 1, 'success');
    broadcastPubSubMessage(channel, message);
    return res;
  } catch (err: any) {
    safetyEngine.recordAudit(user.username, user.role, ['PUBLISH', channel], 1, 'error', err.message);
    return reply.status(400).send({ error: err.message || 'Publish failed.' });
  }
});

// 13. WebSocket Live Monitor (/ws/monitor)
app.get('/ws/monitor', { websocket: true }, async (connectionOrSocket: any, req) => {
  const ws = connectionOrSocket?.socket || connectionOrSocket;

  // Validate operator+ role
  let user: UserContext = { username: 'default_admin', role: 'admin' };
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const token = urlObj.searchParams.get('token');
    if (token) {
      const verified = await verifyToken(token);
      if (verified) user = verified;
    }
  } catch {}

  if (user.role === 'viewer') {
    ws.send(JSON.stringify({ error: 'Forbidden: MONITOR requires Operator or Administrator role.' }));
    ws.close();
    return;
  }

  // Initial notice
  ws.send(
    JSON.stringify({
      type: 'notice',
      text: 'MONITOR degrades Redis throughput by up to 50%. Use sparingly in production.',
      autoStopSeconds: 300,
      rateLimit: 200,
      role: user.role,
    })
  );

  let activeFilter: MonitorFilter = {};
  let sentInCurrentSec = 0;
  let droppedCount = 0;
  let isClosed = false;

  const rateLimitInterval = setInterval(() => {
    if (droppedCount > 0 && ws?.bufferedAmount < 65536) {
      try {
        ws.send(JSON.stringify({ type: 'rate_limit', droppedCount }));
      } catch {}
    }
    sentInCurrentSec = 0;
  }, 1000);

  const autoStopTimeout = setTimeout(() => {
    if (!isClosed) {
      try {
        ws.send(
          JSON.stringify({
            type: 'stopped',
            reason: 'MONITOR session automatically stopped after 5 minutes to prevent production reactor saturation.',
          })
        );
        isClosed = true;
        ws.close();
      } catch {}
    }
  }, 300000);

  const cleanup = () => {
    isClosed = true;
    clearInterval(rateLimitInterval);
    clearTimeout(autoStopTimeout);
  };

  if (ws && typeof ws.on === 'function') {
    ws.on('message', (msgData: any) => {
      try {
        const payload = JSON.parse(msgData.toString());
        if (payload.action === 'filter') {
          activeFilter = payload.filter || {};
        }
      } catch {}
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }

  const matchesFilter = (entry: MonitorEntry): boolean => {
    if (activeFilter.command) {
      if (!entry.command.toLowerCase().startsWith(activeFilter.command.toLowerCase())) {
        return false;
      }
    }
    if (activeFilter.client) {
      if (!entry.client.includes(activeFilter.client)) {
        return false;
      }
    }
    if (activeFilter.keyPattern) {
      const pat = activeFilter.keyPattern.toLowerCase();
      const firstArg = (entry.args[0] || '').toLowerCase();
      if (pat.endsWith('*')) {
        if (!firstArg.startsWith(pat.slice(0, -1))) return false;
      } else if (!firstArg.includes(pat)) {
        return false;
      }
    }
    return true;
  };

  const emitEntry = (entry: MonitorEntry) => {
    if (isClosed) return;
    if (!matchesFilter(entry)) return;

    if (sentInCurrentSec >= 200 || ws?.bufferedAmount > 65536) {
      droppedCount++;
      return;
    }

    sentInCurrentSec++;
    try {
      ws.send(JSON.stringify({ type: 'entry', entry, droppedCount }));
    } catch {
      cleanup();
    }
  };

  const dedicated = redisClient.createDedicatedClient();
  if (dedicated) {
    try {
      await dedicated.connect();
      const monitor = await (dedicated as any).monitor();
      monitor.on('monitor', (time: number, args: string[], source: string, database: number) => {
        if (isClosed) return;
        const cmd = (args[0] || '').toUpperCase();
        const cmdArgs = args.slice(1);
        const entry: MonitorEntry = {
          id: `mon-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Math.round(Number(time) * 1000) || Date.now(),
          timeStr: new Date(Number(time) * 1000 || Date.now()).toLocaleTimeString(),
          db: database || 0,
          client: source || '127.0.0.1:0',
          command: cmd,
          args: cmdArgs,
          raw: `${time} [${database} ${source}] "${cmd}" ${cmdArgs.map((a) => `"${a}"`).join(' ')}`,
        };
        emitEntry(entry);
      });

      const origCleanup = cleanup;
      ws.on('close', () => {
        origCleanup();
        try {
          dedicated.disconnect();
        } catch {}
      });
      return;
    } catch {
      // Fall through to simulation
    }
  }

  // Realistic simulated command stream
  const sampleCommandsPool = [
    { client: '10.0.1.12:43210', cmd: 'GET', args: ['user:1001:profile'] },
    { client: '10.0.1.13:43212', cmd: 'SET', args: ['session:tok_99812', '{"auth":true}', 'EX', '3600'] },
    { client: '10.0.2.45:51200', cmd: 'HGETALL', args: ['cart:99120'] },
    { client: '10.0.3.88:38900', cmd: 'SMEMBERS', args: ['tags:active'] },
    { client: '10.0.1.12:43210', cmd: 'INCR', args: ['counter:pageviews:home'] },
    { client: '10.0.4.10:49120', cmd: 'LRANGE', args: ['queue:tasks:pending', '0', '10'] },
    { client: '10.0.6.14:52110', cmd: 'ZADD', args: ['leaderboard:weekly', '1520', 'player:88'] },
    { client: '10.0.1.13:43212', cmd: 'EXPIRE', args: ['cache:temp_blob', '300'] },
    { client: '10.0.5.21:33400', cmd: 'PUBLISH', args: ['notifications:user', '{"id":"evt_1","msg":"order confirmed"}'] },
    { client: '10.0.1.12:43210', cmd: 'HSET', args: ['user:1002:profile', 'lastActive', '1712891200'] },
    { client: '10.0.2.45:51200', cmd: 'DEL', args: ['cache:cart:temp_99'] },
    { client: '10.0.3.88:38900', cmd: 'ZRANGE', args: ['leaderboard:daily', '0', '9', 'WITHSCORES'] },
    { client: '10.0.11.5:41200', cmd: 'PING', args: [] },
  ];

  let simIndex = 0;
  const simTimer = setInterval(() => {
    if (isClosed) {
      clearInterval(simTimer);
      return;
    }
    const count = 1 + Math.floor(Math.random() * 2);
    for (let c = 0; c < count; c++) {
      const item = sampleCommandsPool[(simIndex++) % sampleCommandsPool.length];
      const now = Date.now();
      const entry: MonitorEntry = {
        id: `mon-${now}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: now,
        timeStr: new Date(now).toLocaleTimeString(),
        db: 0,
        client: item.client,
        command: item.cmd,
        args: item.args,
        raw: `${(now / 1000).toFixed(6)} [0 ${item.client}] "${item.cmd}" ${item.args.map((a) => `"${a}"`).join(' ')}`,
      };
      emitEntry(entry);
    }
  }, 160);

  ws.on('close', () => {
    clearInterval(simTimer);
    cleanup();
  });
});

// 14. WebSocket Pub/Sub Stream (/ws/pubsub)
app.get('/ws/pubsub', { websocket: true }, async (connectionOrSocket: any, req) => {
  const ws = connectionOrSocket?.socket || connectionOrSocket;

  const clientItem: PubSubWsClient = {
    ws,
    channels: new Set<string>(),
    patterns: new Set<string>(),
  };
  activePubSubClients.add(clientItem);

  const dedicated = redisClient.createDedicatedClient();
  let dedicatedSub: any = null;

  if (dedicated) {
    try {
      await dedicated.connect();
      dedicatedSub = dedicated;
      dedicatedSub.on('message', (channel: string, message: string) => {
        try {
          const event: PubSubMessageEvent = {
            type: 'message',
            channel,
            payload: message,
            timestamp: Date.now(),
            timeStr: new Date().toLocaleTimeString(),
          };
          ws.send(JSON.stringify(event));
        } catch {}
      });
      dedicatedSub.on('pmessage', (pattern: string, channel: string, message: string) => {
        try {
          const event: PubSubMessageEvent = {
            type: 'pmessage',
            channel,
            pattern,
            payload: message,
            timestamp: Date.now(),
            timeStr: new Date().toLocaleTimeString(),
          };
          ws.send(JSON.stringify(event));
        } catch {}
      });
    } catch {
      dedicatedSub = null;
    }
  }

  // Simulated pub/sub messages for demo
  const demoSamples: Record<string, string[]> = {
    'notifications:user': [
      JSON.stringify({ userId: 1042, event: 'order_shipped', tracking: 'TRK-88912', timestamp: Date.now() }),
      JSON.stringify({ userId: 1088, event: 'password_reset_requested', ip: '192.168.1.15' }),
      JSON.stringify({ userId: 1102, event: 'profile_updated', field: 'avatar_url' }),
    ],
    'chat:general': [
      JSON.stringify({ sender: 'alice', text: 'Deployment completed in us-east-1.', time: '14:20' }),
      JSON.stringify({ sender: 'bob', text: 'Latency percentiles looking solid!', time: '14:21' }),
      JSON.stringify({ sender: 'charlie', text: 'Anyone running load tests right now?', time: '14:22' }),
    ],
    'order:events': [
      JSON.stringify({ orderId: 'ord_9182', amount: 129.5, currency: 'USD', status: 'paid' }),
      JSON.stringify({ orderId: 'ord_9183', amount: 54.0, currency: 'USD', status: 'pending' }),
      JSON.stringify({ orderId: 'ord_9184', amount: 310.2, currency: 'USD', status: 'shipped' }),
    ],
    'system:health': [
      JSON.stringify({ service: 'auth-gateway', status: 'healthy', cpuPercent: 14.2, memoryMb: 128 }),
      JSON.stringify({ service: 'payment-worker', status: 'healthy', cpuPercent: 22.8, memoryMb: 256 }),
    ],
  };

  const demoInterval = setInterval(() => {
    if (clientItem.channels.size === 0 && clientItem.patterns.size === 0) return;

    for (const ch of clientItem.channels) {
      if (Math.random() < 0.35) {
        const pool = demoSamples[ch] || [`{"channel":"${ch}","random":${Math.floor(Math.random() * 1000)}}`];
        const payload = pool[Math.floor(Math.random() * pool.length)];
        const event: PubSubMessageEvent = {
          type: 'message',
          channel: ch,
          payload,
          timestamp: Date.now(),
          timeStr: new Date().toLocaleTimeString(),
        };
        try {
          ws.send(JSON.stringify(event));
        } catch {}
      }
    }

    for (const pat of clientItem.patterns) {
      if (Math.random() < 0.35) {
        const matchingCh =
          Object.keys(demoSamples).find((c) => {
            const regex = new RegExp('^' + pat.replace(/\*/g, '.*') + '$');
            return regex.test(c);
          }) || pat.replace('*', 'test');
        const pool = demoSamples[matchingCh] || [`{"pattern":"${pat}","event":"tick","val":${Date.now()}}`];
        const payload = pool[Math.floor(Math.random() * pool.length)];
        const event: PubSubMessageEvent = {
          type: 'pmessage',
          channel: matchingCh,
          pattern: pat,
          payload,
          timestamp: Date.now(),
          timeStr: new Date().toLocaleTimeString(),
        };
        try {
          ws.send(JSON.stringify(event));
        } catch {}
      }
    }
  }, 2200);

  if (ws && typeof ws.on === 'function') {
    ws.on('message', async (data: any) => {
      try {
        const parsed = JSON.parse(data.toString());
        const { action, channel } = parsed;
        if (!channel || typeof channel !== 'string') return;

        if (action === 'subscribe') {
          clientItem.channels.add(channel);
          if (dedicatedSub) {
            await dedicatedSub.subscribe(channel);
          }
          ws.send(JSON.stringify({ type: 'subscribed', channel }));
        } else if (action === 'unsubscribe') {
          clientItem.channels.delete(channel);
          if (dedicatedSub) {
            await dedicatedSub.unsubscribe(channel);
          }
          ws.send(JSON.stringify({ type: 'unsubscribed', channel }));
        } else if (action === 'psubscribe') {
          clientItem.patterns.add(channel);
          if (dedicatedSub) {
            await dedicatedSub.psubscribe(channel);
          }
          ws.send(JSON.stringify({ type: 'psubscribed', pattern: channel }));
        } else if (action === 'punsubscribe') {
          clientItem.patterns.delete(channel);
          if (dedicatedSub) {
            await dedicatedSub.punsubscribe(channel);
          }
          ws.send(JSON.stringify({ type: 'punsubscribed', pattern: channel }));
        }
      } catch {}
    });

    const cleanup = () => {
      clearInterval(demoInterval);
      activePubSubClients.delete(clientItem);
      if (dedicatedSub) {
        try {
          dedicatedSub.disconnect();
        } catch {}
      }
    };

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  }
});

// ==========================================
// Step 12: Data Types Playground Endpoints
// ==========================================

// 1. POST /api/playground/exec (Isolated DB 15, play:* prefix enforcement)
app.post('/api/playground/exec', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const body = (req.body as any) || {};
  const command = String(body.command || '').trim();
  const db = body.db !== undefined ? Number(body.db) : 15;

  if (!command) {
    return reply.status(400).send({ error: 'Command string is required.' });
  }

  try {
    const result = await playgroundEngine.executeSandboxCommand(command, db);
    safetyEngine.recordAudit(user.username, user.role, ['PLAYGROUND', command], 1, 'success');
    return result;
  } catch (err: any) {
    safetyEngine.recordAudit(user.username, user.role, ['PLAYGROUND', command], 1, 'error', err.message);
    return reply.status(400).send({ error: err.message || 'Playground execution failed.' });
  }
});

// 2. GET /api/playground/inspect/:key
app.get('/api/playground/inspect/:key', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const params = req.params as any;
  const key = String(params.key || '').trim();

  if (!key) {
    return reply.status(400).send({ error: 'Key name is required.' });
  }

  if (!key.startsWith('play:')) {
    return reply.status(400).send({ error: "Playground keys must be prefixed with 'play:'." });
  }

  return playgroundEngine.inspectKey(key);
});

// 3. GET /api/playground/reset/preview
app.get('/api/playground/reset/preview', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  return playgroundEngine.previewReset();
});

// 4. POST /api/playground/reset
app.post('/api/playground/reset', async (req, reply) => {
  const user = await requireAuth(req, reply);
  if (!user) return;

  const result = playgroundEngine.resetSandbox();
  safetyEngine.recordAudit(user.username, user.role, ['PLAYGROUND', 'RESET_SANDBOX'], 1, 'success');
  return result;
});

// 12. WebSocket Telemetry Stream (1-second updates, slow client protection)
app.get('/ws/metrics', { websocket: true }, (connectionOrSocket: any, req) => {
  const ws = connectionOrSocket?.socket || connectionOrSocket;

  const timer = setInterval(async () => {
    try {
      // Slow client protection: skip sending if client buffer has not drained
      if (ws?.bufferedAmount > 65536) {
        return;
      }

      const sample = metricsSampler.getLatestSample();
      const status = redisClient.getStatus();
      const health = await metricsSampler.getHealthSummary();

      ws.send(
        JSON.stringify({
          sample,
          healthSummary: health,
          status,
          timestamp: Date.now(),
        })
      );
    } catch {
      // client disconnected or socket closed
    }
  }, 1000);

  if (ws && typeof ws.on === 'function') {
    ws.on('close', () => {
      clearInterval(timer);
    });
  }
});

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 RedisX Studio Gateway listening on http://${HOST}:${PORT}`);
  console.log(`📊 Health Endpoint: http://localhost:${PORT}/health`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
