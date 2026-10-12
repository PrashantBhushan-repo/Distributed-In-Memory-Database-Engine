import { AclRuleObject, AclUserItem, AclCategoryInfo, AclTestResult } from '../types.js';

export const ACL_CATEGORIES: AclCategoryInfo[] = [
  { name: 'read', description: 'Read-only keyspace commands (e.g. GET, LRANGE, HGET)' },
  { name: 'write', description: 'State-mutating keyspace write commands (e.g. SET, RPUSH, HSET)' },
  { name: 'admin', description: 'Administrative operations (e.g. CONFIG, SAVE, SHUTDOWN, REPLICAOF)' },
  { name: 'dangerous', description: 'High-risk commands that can block or flush the server (e.g. KEYS, FLUSHALL, DEBUG)' },
  { name: 'fast', description: 'Constant or logarithmic complexity commands (O(1) / O(log N))' },
  { name: 'slow', description: 'O(N) operations that can block the single thread on large collections' },
  { name: 'blocking', description: 'Commands that can block the connection waiting for items (e.g. BLPOP, BRPOP)' },
  { name: 'pubsub', description: 'Publish/subscribe management commands (e.g. PUBLISH, SUBSCRIBE)' },
  { name: 'connection', description: 'Connection and authentication commands (e.g. AUTH, CLIENT, ECHO, PING)' },
  { name: 'transaction', description: 'Transaction management commands (e.g. MULTI, EXEC, WATCH, DISCARD)' },
  { name: 'scripting', description: 'Server-side Lua scripts and Redis Functions (e.g. EVAL, FUNCTION)' },
  { name: 'string', description: 'Commands operating on Redis strings' },
  { name: 'hash', description: 'Commands operating on Redis hashes' },
  { name: 'list', description: 'Commands operating on Redis lists' },
  { name: 'set', description: 'Commands operating on Redis sets' },
  { name: 'sortedset', description: 'Commands operating on Redis sorted sets (zsets)' },
  { name: 'stream', description: 'Commands operating on Redis streams' },
  { name: 'bitmap', description: 'Commands operating on bitfields and bit arrays' },
  { name: 'hyperloglog', description: 'Probabilistic cardinality estimation commands' },
  { name: 'geo', description: 'Geospatial indexing and radius search commands' },
];

export function parseAclListLine(line: string): AclUserItem {
  const tokens = line.trim().split(/\s+/);
  const username = tokens[1] || 'unknown';
  let enabled = true;
  let hasPassword = false;
  let isNoPass = false;
  let passwordCount = 0;
  const keys: string[] = [];
  const channels: string[] = [];
  const allowedCategories: string[] = [];
  const deniedCategories: string[] = [];
  const allowedCommands: string[] = [];
  const deniedCommands: string[] = [];

  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === 'on') {
      enabled = true;
    } else if (token === 'off') {
      enabled = false;
    } else if (token === 'nopass') {
      isNoPass = true;
    } else if (token.startsWith('#')) {
      hasPassword = true;
      passwordCount++;
    } else if (token.startsWith('~')) {
      keys.push(token);
    } else if (token === 'allkeys') {
      keys.push('~*');
    } else if (token.startsWith('&')) {
      channels.push(token);
    } else if (token === 'allchannels') {
      channels.push('&*');
    } else if (token.startsWith('+@')) {
      allowedCategories.push(token.substring(2));
    } else if (token.startsWith('-@')) {
      deniedCategories.push(token.substring(2));
    } else if (token.startsWith('+')) {
      allowedCommands.push(token.substring(1));
    } else if (token.startsWith('-')) {
      deniedCommands.push(token.substring(1));
    }
  }

  const keysSummary = keys.length === 0 ? 'No keys' : keys.includes('~*') ? 'All keys (~*)' : keys.join(', ');
  const channelsSummary = channels.length === 0 ? 'No channels' : channels.includes('&*') ? 'All channels (&*)' : channels.join(', ');

  return {
    username,
    enabled,
    hasPassword,
    isNoPass,
    passwordCount,
    keysSummary,
    channelsSummary,
    allowedCategories,
    deniedCategories,
    allowedCommands,
    deniedCommands,
    rawRule: line,
    isDefault: username === 'default',
  };
}

export function buildAclSetUserArgs(rule: AclRuleObject): string[] {
  const cleanUser = (rule.username || '').trim();
  if (!cleanUser || !/^[a-zA-Z0-9_\-\.]+$/.test(cleanUser)) {
    throw new Error('Username must contain only alphanumeric characters, dashes, and underscores.');
  }

  const args: string[] = [cleanUser];

  // 1. Enabled status
  args.push(rule.enabled ? 'on' : 'off');

  // 2. Passwords (masked in audit)
  if (rule.nopass) {
    args.push('nopass');
  } else if (rule.password && rule.password.trim()) {
    // Escape or directly pass password token
    args.push(`>${rule.password.trim()}`);
  }

  // 3. Keyspace patterns
  if (rule.keys && rule.keys.length > 0) {
    args.push('resetkeys');
    for (const k of rule.keys) {
      const cleanKey = k.trim();
      if (!cleanKey) continue;
      if (cleanKey === 'allkeys' || cleanKey === '~*') {
        args.push('~*');
      } else {
        args.push(cleanKey.startsWith('~') ? cleanKey : `~${cleanKey}`);
      }
    }
  }

  // 4. Channel patterns
  if (rule.channels && rule.channels.length > 0) {
    args.push('resetchannels');
    for (const ch of rule.channels) {
      const cleanCh = ch.trim();
      if (!cleanCh) continue;
      if (cleanCh === 'allchannels' || cleanCh === '&*') {
        args.push('&*');
      } else {
        args.push(cleanCh.startsWith('&') ? cleanCh : `&${cleanCh}`);
      }
    }
  }

  // 5. Categories
  if (rule.categories) {
    for (const cat of rule.categories.allowed || []) {
      const clean = cat.replace(/^[@+]/, '').trim();
      if (clean) args.push(`+@${clean}`);
    }
    for (const cat of rule.categories.denied || []) {
      const clean = cat.replace(/^[@-]/, '').trim();
      if (clean) args.push(`-@${clean}`);
    }
  }

  // 6. Commands
  if (rule.commands) {
    for (const cmd of rule.commands.allowed || []) {
      const clean = cmd.replace(/^[+]/, '').trim();
      if (clean) args.push(`+${clean}`);
    }
    for (const cmd of rule.commands.denied || []) {
      const clean = cmd.replace(/^[-]/, '').trim();
      if (clean) args.push(`-${clean}`);
    }
  }

  return args;
}

export function maskAclArgsForAudit(args: string[]): string[] {
  return args.map((arg) => {
    if (arg.startsWith('>') || arg.startsWith('#')) {
      return '>********';
    }
    return arg;
  });
}
