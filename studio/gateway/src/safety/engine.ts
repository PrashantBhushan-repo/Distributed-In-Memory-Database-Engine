import { UserRole, AuditEntry, CommandExecutionResult, RespKind } from '../types.js';

const DANGEROUS_COMMANDS = new Set([
  'KEYS', 'FLUSHALL', 'FLUSHDB', 'DEBUG', 'SHUTDOWN',
  'CONFIG', 'REPLICAOF', 'SLAVEOF', 'BGSAVE', 'SAVE'
]);

const READ_ONLY_COMMANDS = new Set([
  'GET', 'MGET', 'HGET', 'HMGET', 'HGETALL', 'HEXISTS', 'HLEN', 'HKEYS', 'HVALS',
  'LRANGE', 'LINDEX', 'LLEN', 'SMEMBERS', 'SISMEMBER', 'SCARD', 'SINTER', 'SUNION', 'SDIFF',
  'ZRANGE', 'ZREVRANGE', 'ZSCORE', 'ZCARD', 'ZRANK', 'ZREVRANK', 'TYPE', 'TTL', 'PTTL',
  'EXISTS', 'STRLEN', 'PING', 'ECHO', 'INFO', 'DBSIZE', 'SLOWLOG', 'COMMAND', 'SCAN'
]);

export class SafetyEngine {
  private auditRing: AuditEntry[] = [];
  private maxAuditEntries = 1000;

  public validateCommand(
    command: string,
    args: string[],
    role: UserRole,
    unlocked = false
  ): { allowed: boolean; reason?: string } {
    const cmdUpper = command.toUpperCase();

    // 1. Dangerous command check
    if (DANGEROUS_COMMANDS.has(cmdUpper)) {
      if (role !== 'admin') {
        return {
          allowed: false,
          reason: `Command '${cmdUpper}' is restricted to Administrators only.`,
        };
      }
      if (!unlocked) {
        return {
          allowed: false,
          reason: `Command '${cmdUpper}' is potentially destructive. You must enable 'Confirm & Unlock' before executing.`,
        };
      }
    }

    // 2. Viewer role check (strictly read-only)
    if (role === 'viewer') {
      if (!READ_ONLY_COMMANDS.has(cmdUpper)) {
        return {
          allowed: false,
          reason: `User with 'Viewer' role is restricted to read-only commands. '${cmdUpper}' writes or modifies database state.`,
        };
      }
    }

    // 3. Operator role check (can execute all except un-unlocked dangerous commands)
    if (role === 'operator' && DANGEROUS_COMMANDS.has(cmdUpper)) {
      return {
        allowed: false,
        reason: `Command '${cmdUpper}' is restricted to Administrators. Operators may only execute standard keyspace writes.`,
      };
    }

    return { allowed: true };
  }

  public formatExecutionResult(rawReply: any, durationMs: number, rawCommand: string): CommandExecutionResult {
    let kind: RespKind = 'string';
    let truncated = false;
    let reply = rawReply;

    if (rawReply === null || rawReply === undefined) {
      kind = 'null';
      reply = '(nil)';
    } else if (typeof rawReply === 'number') {
      kind = 'integer';
    } else if (typeof rawReply === 'string') {
      kind = rawReply === 'OK' || rawReply === 'PONG' ? 'status' : 'string';
    } else if (Array.isArray(rawReply)) {
      kind = 'array';
      if (rawReply.length > 500) {
        reply = rawReply.slice(0, 500);
        truncated = true;
      }
    } else if (typeof rawReply === 'object') {
      kind = 'table';
    }

    return {
      reply,
      kind,
      truncated,
      durationMs,
      rawCommand,
    };
  }

  public recordAudit(
    username: string,
    role: UserRole,
    args: string[],
    durationMs: number,
    status: 'success' | 'blocked' | 'error',
    error?: string
  ) {
    const cmd = args[0]?.toUpperCase() ?? 'UNKNOWN';
    const keysTouched = args.length > 1 ? [args[1]] : [];

    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      username,
      role,
      command: cmd,
      args,
      keysTouched,
      durationMs,
      status,
      error,
    };

    this.auditRing.unshift(entry);
    if (this.auditRing.length > this.maxAuditEntries) {
      this.auditRing.pop();
    }
  }

  public getAuditLog(limit = 50): AuditEntry[] {
    return this.auditRing.slice(0, Math.min(limit, 200));
  }
}
