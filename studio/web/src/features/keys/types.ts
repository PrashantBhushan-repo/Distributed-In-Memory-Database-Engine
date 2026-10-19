export type KeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'unknown';

export interface KeyItem {
  observedAt?: number;
  name: string;
  type: KeyType;
  ttl: number; // in seconds (-1 = persist, -2 = expired)
  ttlMs: number; // in milliseconds
  encoding?: string;
  size?: number;
  memoryBytes?: number;
}

export interface KeyTreeNode {
  name: string;
  fullPath: string;
  isLeaf: boolean;
  type?: KeyType;
  keyCount: number;
  hasChildren: boolean;
  ttl?: number;
  ttlMs?: number;
  memoryBytes?: number;
}

export type TypeFilter = 'all' | 'string' | 'hash' | 'list' | 'set' | 'zset';
export type TtlFilter = 'all' | 'has_ttl' | 'no_ttl' | 'expiring_1m';
export type ViewMode = 'list' | 'tree';

export type KeyFormatHint = 'json' | 'hex' | 'base64' | 'text';

export interface KeyDetail {
  name: string;
  type: KeyType;
  encoding: string;
  memoryBytes: number;
  ttl: number; // in seconds
  ttlMs: number;
  length: number;
  value?: string;
  formatHint?: KeyFormatHint;
  listItems?: Array<{ index: number; value: string }>;
  listPage?: { page: number; limit: number; total: number; hasMore: boolean };
  hashEntries?: Array<{ field: string; value: string }>;
  hashPage?: { page: number; limit: number; total: number; hasMore: boolean; nextCursor?: number };
  setMembers?: string[];
  setPage?: { page: number; limit: number; total: number; hasMore: boolean; nextCursor?: number };
  zsetMembers?: Array<{ rank: number; member: string; score: number }>;
  zsetPage?: { page: number; limit: number; total: number; hasMore: boolean };
}

export interface CreateKeyPayload {
  name: string;
  type: 'string' | 'list' | 'hash' | 'set' | 'zset';
  payload: any;
  ttl?: number;
}
