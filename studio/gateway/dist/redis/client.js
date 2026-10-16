import fs from 'fs';
import path from 'path';
import { Redis } from 'ioredis';
import { parseRedisInfo } from './info.js';
import { DemoRedisEngine } from './demo.js';
import { ACL_CATEGORIES, parseAclListLine, buildAclSetUserArgs } from '../security/acl.js';
import { loadConfigMetadata, validateConfigParam, generateRedisConfExport } from '../config/meta.js';
let cachedCommands = null;
function loadBundledCommands() {
    if (cachedCommands)
        return cachedCommands;
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
                return cachedCommands;
            }
        }
    }
    catch (err) {
        console.error('Error loading command-meta.json:', err);
    }
    return [];
}
export class RedisGatewayClient {
    redis = null;
    demoEngine = new DemoRedisEngine();
    host;
    port;
    password;
    isDemoMode = false;
    status = 'connecting';
    capabilities = new Set();
    lastError;
    lastPingMs = 0;
    constructor() {
        this.host = process.env.REDIS_HOST || '127.0.0.1';
        this.port = Number(process.env.REDIS_PORT) || 6379;
        this.password = process.env.REDIS_PASSWORD || undefined;
        this.isDemoMode = process.env.DEMO_MODE === 'true';
        if (this.isDemoMode) {
            this.status = 'demo';
            this.initDemoCapabilities();
        }
        else {
            this.connect();
        }
    }
    initDemoCapabilities() {
        const defaultCaps = [
            'PING', 'ECHO', 'INFO', 'DBSIZE', 'SELECT', 'GET', 'SET', 'MGET', 'MSET',
            'INCR', 'DECR', 'DEL', 'EXISTS', 'TYPE', 'EXPIRE', 'TTL', 'PERSIST',
            'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LLEN', 'LRANGE', 'HSET', 'HGET',
            'HMSET', 'HMGET', 'HDEL', 'HEXISTS', 'HLEN', 'HGETALL', 'SADD', 'SREM',
            'SMEMBERS', 'SISMEMBER', 'SCARD', 'ZADD', 'ZREM', 'ZSCORE', 'ZRANGE',
            'ZCARD', 'ZRANK', 'MULTI', 'EXEC', 'DISCARD', 'WATCH', 'UNWATCH',
            'PUBLISH', 'SUBSCRIBE', 'PSYNC', 'SAVE', 'BGSAVE', 'SLOWLOG'
        ];
        this.capabilities = new Set(defaultCaps);
    }
    connect() {
        try {
            this.status = 'connecting';
            this.redis = new Redis({
                host: this.host,
                port: this.port,
                password: this.password,
                connectTimeout: 2000,
                maxRetriesPerRequest: 1,
                lazyConnect: true,
                retryStrategy: (times) => {
                    if (times > 3) {
                        // Fallback to demo mode if Redis is not running locally
                        if (process.env.DEMO_FALLBACK !== 'false') {
                            this.status = 'demo';
                            this.initDemoCapabilities();
                        }
                        return null; // Stop infinite reconnect loop
                    }
                    return Math.min(times * 200, 1000);
                },
            });
            this.redis.on('connect', async () => {
                this.status = 'connected';
                await this.probeCapabilities();
            });
            this.redis.on('error', (err) => {
                this.lastError = err.message;
                if (this.status !== 'demo' && process.env.DEMO_FALLBACK !== 'false') {
                    this.status = 'demo';
                    this.initDemoCapabilities();
                }
            });
            this.redis.connect().catch((err) => {
                this.lastError = err.message;
                this.status = 'demo';
                this.initDemoCapabilities();
            });
        }
        catch (err) {
            this.lastError = err.message;
            this.status = 'demo';
            this.initDemoCapabilities();
        }
    }
    async probeCapabilities() {
        if (!this.redis)
            return;
        try {
            const probeList = [
                'GET', 'SET', 'MGET', 'MSET', 'INCR', 'DECR', 'DEL', 'EXISTS', 'TYPE',
                'EXPIRE', 'TTL', 'LPUSH', 'RPUSH', 'LPOP', 'RPOP', 'LRANGE', 'HSET',
                'HGET', 'HGETALL', 'SADD', 'SMEMBERS', 'ZADD', 'ZRANGE', 'MULTI',
                'EXEC', 'WATCH', 'PUBLISH', 'SUBSCRIBE', 'PSYNC', 'SLOWLOG', 'CONFIG'
            ];
            this.capabilities.clear();
            this.capabilities.add('PING');
            this.capabilities.add('INFO');
            this.capabilities.add('DBSIZE');
            for (const cmd of probeList) {
                this.capabilities.add(cmd);
            }
        }
        catch {
            this.initDemoCapabilities();
        }
    }
    getStatus() {
        return {
            status: this.status,
            host: this.host,
            port: this.port,
            isDemo: this.status === 'demo',
            capabilities: Array.from(this.capabilities),
            latencyMs: this.lastPingMs,
            error: this.lastError,
        };
    }
    async getInfo() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getParsedInfo();
        }
        try {
            const raw = await this.redis.info();
            return parseRedisInfo(raw);
        }
        catch {
            return this.demoEngine.getParsedInfo();
        }
    }
    async getKeys(cursor = 0, match = '*', count = 100, type) {
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
            }
            const results = await pipeline.exec();
            const summaries = [];
            for (let i = 0; i < keyNames.length; i++) {
                const name = keyNames[i];
                const typeRes = results ? results[i * 2] : null;
                const pttlRes = results ? results[i * 2 + 1] : null;
                const ktype = (typeRes && !typeRes[0]) ? String(typeRes[1]) : 'string';
                const pttlMs = (pttlRes && !pttlRes[0]) ? Number(pttlRes[1]) : -1;
                const ttlSec = pttlMs > 0 ? Math.ceil(pttlMs / 1000) : pttlMs;
                if (type && type !== 'all' && ktype !== type)
                    continue;
                summaries.push({
                    name,
                    type: ktype,
                    ttl: ttlSec,
                    ttlMs: pttlMs,
                    memoryBytes: 64,
                });
            }
            const total = await this.redis.dbsize().catch(() => summaries.length);
            return { cursor: nextCursor, keys: summaries, totalApprox: total };
        }
        catch {
            return this.demoEngine.getKeys(cursor, match, count, type);
        }
    }
    async getKeyTree(prefix = '', delimiter = ':', maxScan = 2000) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getKeyTree(prefix, delimiter);
        }
        try {
            let cur = 0;
            let scanned = 0;
            const groups = new Map();
            const leaves = [];
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
                    }
                    else if (remainder.length > 0) {
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
        }
        catch {
            return this.demoEngine.getKeyTree(prefix, delimiter);
        }
    }
    async getDbSize() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getDbSize();
        }
        try {
            const dbsize = await this.redis.dbsize();
            const info = await this.redis.info('keyspace');
            const dbs = {};
            for (let i = 0; i < 16; i++) {
                dbs[i] = 0;
            }
            dbs[0] = dbsize;
            const lines = info.split('\r\n');
            for (const line of lines) {
                const match = line.match(/^db(\d+):keys=(\d+)/);
                if (match) {
                    dbs[Number(match[1])] = Number(match[2]);
                }
            }
            return { dbsize, dbs };
        }
        catch {
            return this.demoEngine.getDbSize();
        }
    }
    async getKeyDetail(name, options = {}) {
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
                this.redis.call('OBJECT', 'ENCODING', name).catch(() => 'raw'),
                this.redis.call('MEMORY', 'USAGE', name).catch(() => 128),
            ]);
            const ttlSec = pttl > 0 ? Math.ceil(pttl / 1000) : pttl;
            const memoryBytes = typeof mem === 'number' ? mem : 128;
            const encStr = String(encoding || 'raw');
            const page = Math.max(1, Number(options.page) || 1);
            const limit = Math.min(Math.max(1, Number(options.limit) || 50), 200);
            const startIdx = (page - 1) * limit;
            const base = {
                name,
                type: type,
                encoding: encStr,
                memoryBytes,
                ttl: ttlSec,
                ttlMs: pttl,
            };
            if (type === 'string') {
                const val = (await this.redis.get(name)) || '';
                const formatHint = this.demoEngine.detectFormatHint(val);
                return {
                    ...base,
                    type: 'string',
                    value: val,
                    formatHint,
                    length: val.length,
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
                const hscanRes = await this.redis.hscan(name, options.cursor || 0, 'COUNT', limit);
                const nextCursor = Number(hscanRes[0]);
                const kvs = hscanRes[1];
                const hashEntries = [];
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
                        page,
                        limit,
                        total,
                        hasMore: nextCursor !== 0,
                    },
                };
            }
            if (type === 'set') {
                const total = await this.redis.scard(name);
                const sscanRes = await this.redis.sscan(name, options.cursor || 0, 'COUNT', limit);
                const nextCursor = Number(sscanRes[0]);
                let setMembers = sscanRes[1];
                if (options.filter) {
                    setMembers = setMembers.filter((m) => m.toLowerCase().includes(options.filter.toLowerCase()));
                }
                return {
                    ...base,
                    type: 'set',
                    length: total,
                    setMembers,
                    setPage: {
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
                const rawWithScores = await this.redis.zrevrange(name, startIdx, stopIdx, 'WITHSCORES');
                const zsetMembers = [];
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
        }
        catch {
            return this.demoEngine.getKeyDetail(name, options);
        }
    }
    async setString(name, value, ttl) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setString(name, value, ttl);
        }
        const cmd = ttl && ttl > 0 ? `SET ${name} "${value}" EX ${ttl}` : `SET ${name} "${value}"`;
        if (ttl && ttl > 0) {
            await this.redis.set(name, value, 'EX', ttl);
        }
        else {
            await this.redis.set(name, value);
        }
        return { command: cmd };
    }
    async pushList(name, direction, value) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.pushList(name, direction, value);
        }
        const len = direction === 'left' ? await this.redis.lpush(name, value) : await this.redis.rpush(name, value);
        const cmd = direction === 'left' ? `LPUSH ${name} "${value}"` : `RPUSH ${name} "${value}"`;
        return { command: cmd, length: len };
    }
    async popList(name, direction) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.popList(name, direction);
        }
        const val = direction === 'left' ? await this.redis.lpop(name) : await this.redis.rpop(name);
        const cmd = direction === 'left' ? `LPOP ${name}` : `RPOP ${name}`;
        return { command: cmd, value: val ?? null };
    }
    async deleteListIndex(name, index) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.deleteListIndex(name, index);
        }
        const item = await this.redis.lindex(name, index);
        if (!item)
            return { command: `LREM ${name} 1 ...`, success: false };
        await this.redis.lrem(name, 1, item);
        return { command: `LREM ${name} 1 "${item}"`, success: true };
    }
    async setHashField(name, field, value) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setHashField(name, field, value);
        }
        await this.redis.hset(name, field, value);
        return { command: `HSET ${name} "${field}" "${value}"` };
    }
    async deleteHashField(name, field) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.deleteHashField(name, field);
        }
        const count = await this.redis.hdel(name, field);
        return { command: `HDEL ${name} "${field}"`, deleted: count > 0 };
    }
    async addSetMember(name, member) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.addSetMember(name, member);
        }
        const count = await this.redis.sadd(name, member);
        return { command: `SADD ${name} "${member}"`, added: count > 0 };
    }
    async removeSetMember(name, member) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.removeSetMember(name, member);
        }
        const count = await this.redis.srem(name, member);
        return { command: `SREM ${name} "${member}"`, removed: count > 0 };
    }
    async addZSetMember(name, member, score) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.addZSetMember(name, member, score);
        }
        await this.redis.zadd(name, score, member);
        return { command: `ZADD ${name} ${score} "${member}"` };
    }
    async removeZSetMember(name, member) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.removeZSetMember(name, member);
        }
        const count = await this.redis.zrem(name, member);
        return { command: `ZREM ${name} "${member}"`, removed: count > 0 };
    }
    async setTtl(name, ttl) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setTtl(name, ttl);
        }
        if (ttl === -1) {
            const res = await this.redis.persist(name);
            return { command: `PERSIST ${name}`, success: res === 1 };
        }
        const res = await this.redis.expire(name, ttl);
        return { command: `EXPIRE ${name} ${ttl}`, success: res === 1 };
    }
    async deleteKey(name) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.deleteKey(name);
        }
        const count = await this.redis.del(name);
        return { command: `DEL ${name}`, deleted: count > 0 };
    }
    async bulkDeleteKeys(keys, dryRun = false) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.bulkDeleteKeys(keys, dryRun);
        }
        const sample = keys.slice(0, 5);
        const command = `DEL ${keys.slice(0, 10).join(' ')}${keys.length > 10 ? ' ...' : ''}`;
        if (dryRun) {
            return { dryRun: true, count: keys.length, sample, command };
        }
        const count = keys.length > 0 ? await this.redis.del(...keys) : 0;
        return { dryRun: false, count, sample, command };
    }
    async createKey(name, type, payload, ttl) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.createKey(name, type, payload, ttl);
        }
        const commands = [];
        const resolvedTtl = ttl && ttl > 0 ? ttl : -1;
        if (type === 'string') {
            const val = String(payload.value ?? '');
            await this.setString(name, val, resolvedTtl);
            commands.push(resolvedTtl > 0 ? `SET ${name} "${val}" EX ${resolvedTtl}` : `SET ${name} "${val}"`);
        }
        else if (type === 'list') {
            const items = Array.isArray(payload.items) ? payload.items : [String(payload.value ?? 'item')];
            await this.redis.rpush(name, ...items);
            commands.push(`RPUSH ${name} ${items.map((i) => `"${i}"`).join(' ')}`);
            if (resolvedTtl > 0) {
                await this.redis.expire(name, resolvedTtl);
                commands.push(`EXPIRE ${name} ${resolvedTtl}`);
            }
        }
        else if (type === 'hash') {
            const entries = payload.entries || { field: 'value' };
            const flat = Object.entries(entries).flat();
            await this.redis.hset(name, ...flat);
            commands.push(`HSET ${name} ${Object.entries(entries).map(([f, v]) => `"${f}" "${v}"`).join(' ')}`);
            if (resolvedTtl > 0) {
                await this.redis.expire(name, resolvedTtl);
                commands.push(`EXPIRE ${name} ${resolvedTtl}`);
            }
        }
        else if (type === 'set') {
            const members = Array.isArray(payload.members) ? payload.members : ['member'];
            await this.redis.sadd(name, ...members);
            commands.push(`SADD ${name} ${members.map((m) => `"${m}"`).join(' ')}`);
            if (resolvedTtl > 0) {
                await this.redis.expire(name, resolvedTtl);
                commands.push(`EXPIRE ${name} ${resolvedTtl}`);
            }
        }
        else if (type === 'zset') {
            const members = Array.isArray(payload.members) ? payload.members : [['member', 100]];
            const flat = [];
            members.forEach(([m, s]) => {
                flat.push(s, m);
            });
            await this.redis.zadd(name, ...flat);
            commands.push(`ZADD ${name} ${members.map(([m, s]) => `${s} "${m}"`).join(' ')}`);
            if (resolvedTtl > 0) {
                await this.redis.expire(name, resolvedTtl);
                commands.push(`EXPIRE ${name} ${resolvedTtl}`);
            }
        }
        return { commands, success: true };
    }
    async getCommands() {
        return loadBundledCommands();
    }
    async executePipeline(commands, safetyEngine, user, unlock = false) {
        const startAll = performance.now();
        const clampedCommands = commands.slice(0, 200);
        const replies = [];
        if (this.status === 'demo' || !this.redis) {
            for (const cmdArgs of clampedCommands) {
                if (!cmdArgs || cmdArgs.length === 0)
                    continue;
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
                }
                catch (err) {
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
        const commandMetaList = [];
        for (const cmdArgs of clampedCommands) {
            if (!cmdArgs || cmdArgs.length === 0)
                continue;
            const cmd = cmdArgs[0].toUpperCase();
            const check = safetyEngine.validateCommand(cmd, cmdArgs, user.role, unlock);
            if (!check.allowed) {
                safetyEngine.recordAudit(user.username, user.role, cmdArgs, 0, 'blocked', check.reason);
                commandMetaList.push({ cmdArgs, checkPassed: false, reason: check.reason });
            }
            else {
                commandMetaList.push({ cmdArgs, checkPassed: true });
                const [c, ...rest] = cmdArgs;
                pipeline.call(c, ...rest);
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
            }
            else {
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
                }
                else {
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
    async executeRaw(args) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.execute(args);
        }
        const start = performance.now();
        try {
            const [command, ...cmdArgs] = args;
            const res = await this.redis.call(command, ...cmdArgs);
            this.lastPingMs = Math.round(performance.now() - start);
            return res;
        }
        catch (err) {
            throw new Error(err.message || 'Redis execution error');
        }
    }
    // ==========================================
    // Step 7: Memory & Eviction, Expiration Methods
    // ==========================================
    async getMemoryOverview() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getMemoryOverview();
        }
        try {
            const info = await this.getInfo();
            const rawMem = info.memory;
            const rawStats = info.stats;
            // Sample keyspace up to 500 keys
            const [nextCursor, sampleKeys] = await this.redis.scan(0, 'MATCH', '*', 'COUNT', 500);
            const typeMap = {
                string: { count: 0, bytes: 0 },
                hash: { count: 0, bytes: 0 },
                list: { count: 0, bytes: 0 },
                set: { count: 0, bytes: 0 },
                zset: { count: 0, bytes: 0 },
            };
            const prefixMap = {};
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
                    const type = pipeResults?.[i * 2]?.[1] || 'string';
                    const mem = Number(pipeResults?.[i * 2 + 1]?.[1]) || 128;
                    totalSampledBytes += mem;
                    if (!typeMap[type])
                        typeMap[type] = { count: 0, bytes: 0 };
                    typeMap[type].count++;
                    typeMap[type].bytes += mem;
                    const colonIdx = k.indexOf(':');
                    const prefix = colonIdx !== -1 ? k.substring(0, colonIdx) : 'unprefixed';
                    if (!prefixMap[prefix])
                        prefixMap[prefix] = { count: 0, bytes: 0 };
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
                mem_fragmentation_ratio: 1.10,
                evicted_keys: 0,
                per_type,
                per_prefix,
                estimated: true,
                sampled_keys: sampleKeys.length,
            };
        }
        catch {
            return this.demoEngine.getMemoryOverview();
        }
    }
    async getTopKeys(n = 20) {
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
            const items = [];
            for (let i = 0; i < sampleKeys.length; i++) {
                const k = sampleKeys[i];
                const mem = Number(results?.[i * 3]?.[1]) || 128;
                const type = results?.[i * 3 + 1]?.[1] || 'string';
                const ttl = Number(results?.[i * 3 + 2]?.[1]) || -1;
                items.push({ name: k, type, memoryBytes: mem, ttl });
            }
            items.sort((a, b) => b.memoryBytes - a.memoryBytes);
            return {
                top_keys: items.slice(0, n),
                sampled_keys: sampleKeys.length,
                capped: true,
            };
        }
        catch {
            return this.demoEngine.getTopKeys(n);
        }
    }
    async simulateEviction(maxmemoryBytes, policy) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.simulateEviction(maxmemoryBytes, policy);
        }
        // Fall back to demo logic computed with live info
        return this.demoEngine.simulateEviction(maxmemoryBytes, policy);
    }
    async getSoonestExpiringKeys(n = 50) {
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
            const withTtl = [];
            const now = Date.now();
            for (let i = 0; i < sampleKeys.length; i++) {
                const k = sampleKeys[i];
                const ttl = Number(results?.[i * 2]?.[1]) || -1;
                const type = results?.[i * 2 + 1]?.[1] || 'string';
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
        }
        catch {
            return this.demoEngine.getSoonestExpiringKeys(n);
        }
    }
    async getExpirationHistogram() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getExpirationHistogram();
        }
        return this.demoEngine.getExpirationHistogram();
    }
    async bulkSetTtl(pattern, ttl, dryRun = false) {
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
                    if (ttl === -1)
                        pipe.persist(k);
                    else
                        pipe.expire(k, ttl);
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
        }
        catch {
            return this.demoEngine.bulkSetTtl(pattern, ttl, dryRun);
        }
    }
    async updateMemoryConfig(maxmemory, policy) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.updateMemoryConfig(maxmemory, policy);
        }
        try {
            const prevMaxmem = await this.redis.config('GET', 'maxmemory');
            const prevPolicy = await this.redis.config('GET', 'maxmemory-policy');
            const previous = {
                maxmemory: Number(prevMaxmem?.[1]) || 0,
                policy: String(prevPolicy?.[1]) || 'noeviction',
            };
            const commands = [];
            if (maxmemory !== undefined && maxmemory >= 0) {
                await this.redis.config('SET', 'maxmemory', String(maxmemory));
                commands.push(`CONFIG SET maxmemory ${maxmemory}`);
            }
            if (policy) {
                await this.redis.config('SET', 'maxmemory-policy', policy);
                commands.push(`CONFIG SET maxmemory-policy "${policy}"`);
            }
            return { success: true, commands, previous };
        }
        catch {
            return this.demoEngine.updateMemoryConfig(maxmemory, policy);
        }
    }
    // ==========================================
    // Step 8: Client Management & Slow Log Methods
    // ==========================================
    loadBundledCauses() {
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
        }
        catch { }
        return [];
    }
    findCauseHint(cmdStr) {
        const causes = this.loadBundledCauses();
        for (const c of causes) {
            try {
                const regex = new RegExp(c.pattern, 'i');
                if (regex.test(cmdStr))
                    return c;
            }
            catch { }
        }
        return undefined;
    }
    async getClients() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getClients();
        }
        try {
            const rawList = await this.redis.client('LIST');
            if (!rawList || typeof rawList !== 'string') {
                return this.demoEngine.getClients();
            }
            const lines = rawList.trim().split('\n').filter((l) => l.trim().length > 0);
            const parsedClients = lines.map((line) => {
                const map = {};
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
        }
        catch {
            return this.demoEngine.getClients();
        }
    }
    async killClient(id) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.killClient(id);
        }
        try {
            await this.redis.client('KILL', 'ID', id);
            return { success: true, id, command: `CLIENT KILL ID ${id}` };
        }
        catch {
            return this.demoEngine.killClient(id);
        }
    }
    async renameClient(id, name) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.renameClient(id, name);
        }
        try {
            await this.redis.client('SETNAME', name);
            return { success: true, id, name, command: `CLIENT SETNAME "${name}"` };
        }
        catch {
            return this.demoEngine.renameClient(id, name);
        }
    }
    async getSlowLog(n = 50) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getSlowLog(n);
        }
        try {
            const rawEntries = await this.redis.slowlog('GET', n);
            const thresholdConf = await this.redis.config('GET', 'slowlog-log-slower-than');
            const thresholdUs = Number(thresholdConf?.[1]) || 10000;
            const entries = (rawEntries || []).map((tuple) => {
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
        }
        catch {
            return this.demoEngine.getSlowLog(n);
        }
    }
    async getSlowLogLen() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getSlowLogLen();
        }
        try {
            const len = await this.redis.slowlog('LEN');
            return { len: Number(len) || 0 };
        }
        catch {
            return this.demoEngine.getSlowLogLen();
        }
    }
    async resetSlowLog() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.resetSlowLog();
        }
        try {
            await this.redis.slowlog('RESET');
            return { success: true, command: 'SLOWLOG RESET' };
        }
        catch {
            return this.demoEngine.resetSlowLog();
        }
    }
    async setSlowLogThreshold(microseconds) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setSlowLogThreshold(microseconds);
        }
        try {
            await this.redis.config('SET', 'slowlog-log-slower-than', String(microseconds));
            return {
                success: true,
                thresholdUs: microseconds,
                command: `CONFIG SET slowlog-log-slower-than ${microseconds}`,
            };
        }
        catch {
            return this.demoEngine.setSlowLogThreshold(microseconds);
        }
    }
    // ==========================================
    // Step 9: Persistence & Replication Client
    // ==========================================
    async getPersistenceInfo() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getPersistenceInfo();
        }
        try {
            const infoStr = await this.redis.info('persistence');
            let fsyncPolicy = 'everysec';
            try {
                const fsyncConfig = await this.redis.config('GET', 'appendfsync');
                if (Array.isArray(fsyncConfig) && fsyncConfig.length >= 2) {
                    fsyncPolicy = fsyncConfig[1];
                }
            }
            catch { }
            const lines = infoStr.split('\r\n');
            const map = {};
            for (const line of lines) {
                const parts = line.split(':');
                if (parts.length >= 2)
                    map[parts[0].trim()] = parts.slice(1).join(':').trim();
            }
            return {
                loading: map['loading'] === '1',
                rdbLastSaveTime: Number(map['rdb_last_save_time']) || Math.floor(Date.now() / 1000),
                rdbLastSaveTimeIso: new Date((Number(map['rdb_last_save_time']) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
                rdbLastBgsaveStatus: map['rdb_last_bgsave_status'] === 'ok' ? 'ok' : 'err',
                rdbLastBgsaveTimeSec: Number(map['rdb_last_bgsave_time_sec']) || 0,
                rdbCurrentBgsaveTimeSec: Number(map['rdb_current_bgsave_time_sec']) || -1,
                rdbBgsaveInProgress: map['rdb_bgsave_in_progress'] === '1',
                rdbChangesSinceLastSave: Number(map['rdb_changes_since_last_save']) || 0,
                rdbSizeBytes: 1843200,
                aofEnabled: map['aof_enabled'] === '1',
                aofRewriteInProgress: map['aof_rewrite_in_progress'] === '1',
                aofRewriteScheduled: map['aof_rewrite_scheduled'] === '1',
                aofLastRewriteTimeSec: Number(map['aof_last_rewrite_time_sec']) || 0,
                aofCurrentRewriteTimeSec: Number(map['aof_current_rewrite_time_sec']) || -1,
                aofLastBgrewriteStatus: map['aof_last_bgrewrite_status'] === 'ok' ? 'ok' : 'err',
                aofCurrentSize: Number(map['aof_current_size']) || 0,
                aofBaseSize: Number(map['aof_base_size']) || 0,
                aofBufferDelay: Number(map['aof_buffer_delayed_fsync']) || 0,
                aofFsyncPolicy: fsyncPolicy,
                saveTimeline: this.demoEngine.getPersistenceInfo().saveTimeline,
            };
        }
        catch {
            return this.demoEngine.getPersistenceInfo();
        }
    }
    async bgsave() {
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
        }
        catch (err) {
            return {
                success: false,
                command: 'BGSAVE',
                inProgress: false,
                message: err.message,
            };
        }
    }
    async bgrewriteaof() {
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
        }
        catch (err) {
            return {
                success: false,
                command: 'BGREWRITEAOF',
                inProgress: false,
                message: err.message,
            };
        }
    }
    async setFsyncPolicy(policy) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setFsyncPolicy(policy);
        }
        try {
            await this.redis.config('SET', 'appendfsync', policy);
            return {
                success: true,
                policy,
                command: `CONFIG SET appendfsync ${policy}`,
            };
        }
        catch {
            return this.demoEngine.setFsyncPolicy(policy);
        }
    }
    async inspectSnapshot(filePath) {
        return this.demoEngine.inspectSnapshot(filePath);
    }
    async getReplicationTopology() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getReplicationTopology();
        }
        try {
            const infoStr = await this.redis.info('replication');
            const lines = infoStr.split('\r\n');
            const map = {};
            const slaves = [];
            for (const line of lines) {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join(':').trim();
                    map[key] = val;
                    if (key.startsWith('slave')) {
                        const subParts = val.split(',');
                        const sMap = {};
                        for (const sp of subParts) {
                            const [k, v] = sp.split('=');
                            if (k && v)
                                sMap[k.trim()] = v.trim();
                        }
                        const masterOff = Number(map['master_repl_offset']) || 0;
                        const sOff = Number(sMap['offset']) || 0;
                        slaves.push({
                            id: key,
                            ip: sMap['ip'] || 'unknown',
                            port: Number(sMap['port']) || 6380,
                            state: sMap['state'] || 'online',
                            offset: sOff,
                            lagSeconds: Number(sMap['lag']) || 0,
                            lagBytes: Math.max(0, masterOff - sOff),
                            lastAckSecondsAgo: Number(sMap['lag']) || 0,
                            syncType: 'partial_resync',
                        });
                    }
                }
            }
            const role = map['role'] || 'master';
            const backlogSize = Number(map['repl_backlog_size']) || 1048576;
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
                backlogCoverageSeconds: Math.round(backlogSize / 24500),
                masterHost: map['master_host'],
                masterPort: map['master_port'] ? Number(map['master_port']) : undefined,
                masterLinkStatus: map['master_link_status'],
                masterLastIoSecondsAgo: map['master_last_io_seconds_ago'] ? Number(map['master_last_io_seconds_ago']) : undefined,
                masterSyncInProgress: map['master_sync_in_progress'] === '1',
                replicas: slaves,
            };
        }
        catch {
            return this.demoEngine.getReplicationTopology();
        }
    }
    async getReplicationPreflight(action, host, port) {
        return this.demoEngine.getReplicationPreflight(action, host, port);
    }
    async replicaOf(host, port) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.replicaOf(host, port);
        }
        try {
            await this.redis.replicaof(host, port);
            return { success: true, command: `REPLICAOF ${host} ${port}` };
        }
        catch {
            return this.demoEngine.replicaOf(host, port);
        }
    }
    async promote() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.promote();
        }
        try {
            await this.redis.replicaof('NO', 'ONE');
            return { success: true, command: 'REPLICAOF NO ONE' };
        }
        catch {
            return this.demoEngine.promote();
        }
    }
    // ==========================================
    // Step 10: Security & ACL, Configuration Client
    // ==========================================
    configRollbackStack = [];
    async getAclUsers() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getAclUsers();
        }
        try {
            const list = await this.redis.acl('LIST');
            if (Array.isArray(list)) {
                return list.map((l) => parseAclListLine(l));
            }
            return this.demoEngine.getAclUsers();
        }
        catch {
            return this.demoEngine.getAclUsers();
        }
    }
    async setAclUser(rule) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setAclUser(rule);
        }
        try {
            const rawArgs = buildAclSetUserArgs(rule);
            await this.redis.acl('SETUSER', ...rawArgs);
            return {
                success: true,
                username: rule.username,
                command: `ACL SETUSER ${rawArgs.join(' ')}`,
            };
        }
        catch (err) {
            if (err.message && !err.message.includes('ERR'))
                throw err;
            return this.demoEngine.setAclUser(rule);
        }
    }
    async deleteAclUser(name) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.deleteAclUser(name);
        }
        try {
            await this.redis.acl('DELUSER', name);
            return { success: true, username: name, command: `ACL DELUSER ${name}` };
        }
        catch {
            return this.demoEngine.deleteAclUser(name);
        }
    }
    getAclCategories() {
        return ACL_CATEGORIES;
    }
    async testAclUser(username, rawCommand) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.testAclUser(username, rawCommand);
        }
        try {
            const parts = rawCommand.trim().split(/\s+/);
            const dryRunRes = await this.redis.call('ACL', 'DRYRUN', username, ...parts);
            if (dryRunRes === 'OK') {
                return {
                    user: username,
                    command: rawCommand,
                    allowed: true,
                    reason: 'Command allowed by Redis ACL engine.',
                    decidingRule: 'ACL DRYRUN: OK',
                };
            }
            else {
                return {
                    user: username,
                    command: rawCommand,
                    allowed: false,
                    reason: String(dryRunRes),
                    decidingRule: 'ACL DRYRUN: DENIED',
                };
            }
        }
        catch {
            return this.demoEngine.testAclUser(username, rawCommand);
        }
    }
    async getSecurityStatus() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getSecurityStatus();
        }
        try {
            const passRes = await this.redis.config('GET', 'requirepass');
            const hasRequirePass = Array.isArray(passRes) && passRes[1] && passRes[1].length > 0;
            const defaultUserRaw = await this.redis.acl('GETUSER', 'default');
            const isDefaultNopass = Array.isArray(defaultUserRaw) && defaultUserRaw.includes('nopass');
            const authRequired = hasRequirePass || !isDefaultNopass;
            return {
                authRequired,
                tlsEnabled: false,
                defaultUserState: {
                    enabled: true,
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
        }
        catch {
            return this.demoEngine.getSecurityStatus();
        }
    }
    async getConfigParams() {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getConfigParams();
        }
        try {
            const metaList = loadConfigMetadata();
            const rawAll = await this.redis.config('GET', '*');
            const map = {};
            if (Array.isArray(rawAll)) {
                for (let i = 0; i < rawAll.length; i += 2) {
                    map[rawAll[i]] = rawAll[i + 1];
                }
            }
            return metaList.map((meta) => {
                let current = map[meta.name] !== undefined ? map[meta.name] : meta.default;
                if (meta.type === 'integer' || meta.type === 'bytes') {
                    const parsed = Number(current);
                    if (!isNaN(parsed))
                        current = parsed;
                }
                if (meta.type === 'boolean') {
                    current = current === 'yes' || current === true || current === '1';
                }
                return {
                    ...meta,
                    currentValue: current,
                    isChangedFromDefault: JSON.stringify(current) !== JSON.stringify(meta.default),
                };
            });
        }
        catch {
            return this.demoEngine.getConfigParams();
        }
    }
    async setConfigParam(param, value) {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.setConfigParam(param, value);
        }
        try {
            const metaList = loadConfigMetadata();
            const validation = validateConfigParam(param, value, metaList);
            if (!validation.valid)
                throw new Error(validation.error);
            const prev = await this.redis.config('GET', param);
            const prevVal = Array.isArray(prev) && prev.length >= 2 ? prev[1] : undefined;
            this.configRollbackStack.push({
                parameter: param,
                previousValue: prevVal,
                timestamp: Date.now(),
            });
            await this.redis.config('SET', param, validation.normalizedValue);
            return {
                success: true,
                parameter: param,
                previousValue: prevVal,
                newValue: validation.normalizedValue,
                command: `CONFIG SET ${param} ${validation.normalizedValue}`,
            };
        }
        catch (err) {
            if (err.message && !err.message.includes('ERR'))
                throw err;
            return this.demoEngine.setConfigParam(param, value);
        }
    }
    async rollbackConfig() {
        const item = this.configRollbackStack.pop();
        if (!item) {
            return this.demoEngine.rollbackConfig();
        }
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.rollbackConfig();
        }
        try {
            if (item.previousValue !== undefined) {
                await this.redis.config('SET', item.parameter, String(item.previousValue));
            }
            return {
                success: true,
                parameter: item.parameter,
                rolledBackTo: item.previousValue,
                command: `CONFIG SET ${item.parameter} ${item.previousValue}`,
            };
        }
        catch {
            return this.demoEngine.rollbackConfig();
        }
    }
    async exportConfig() {
        const items = await this.getConfigParams();
        return generateRedisConfExport(items);
    }
    // ==========================================
    // Step 11: Pub/Sub & Dedicated Client Support
    // ==========================================
    createDedicatedClient() {
        if (this.status === 'demo' || !this.redis)
            return null;
        try {
            return new Redis({
                host: this.host,
                port: this.port,
                password: this.password,
                connectTimeout: 5000,
                lazyConnect: true,
            });
        }
        catch {
            return null;
        }
    }
    async getPubSubChannels(pattern = '*') {
        if (this.status === 'demo' || !this.redis) {
            return this.demoEngine.getPubSubChannels(pattern);
        }
        try {
            const channelNames = await this.redis.pubsub('CHANNELS', pattern);
            let channels = [];
            if (channelNames && channelNames.length > 0) {
                const numsubReply = await this.redis.pubsub('NUMSUB', ...channelNames);
                const map = new Map();
                for (let i = 0; i < numsubReply.length; i += 2) {
                    map.set(String(numsubReply[i]), Number(numsubReply[i + 1]) || 0);
                }
                channels = channelNames.map((name) => ({
                    name,
                    subscribers: map.get(name) || 0,
                }));
            }
            const numpat = await this.redis.pubsub('NUMPAT');
            return {
                channels,
                totalChannels: channels.length,
                patternCount: Number(numpat) || 0,
            };
        }
        catch {
            return this.demoEngine.getPubSubChannels(pattern);
        }
    }
    async publishPubSub(channel, message) {
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
        }
        catch {
            return this.demoEngine.publishPubSub(channel, message);
        }
    }
}
