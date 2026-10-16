export interface CommandMeta {
  name: string;
  summary: string;
  syntax: string;
  group: 'string' | 'list' | 'hash' | 'set' | 'zset' | 'generic' | 'server' | 'transactions' | 'pubsub' | 'replication' | 'security';
  complexity: string;
  arity: number;
  flags: string[];
  example: string;
  dangerous?: boolean;
  dangerReason?: string;
}

export type RespKind = 'string' | 'integer' | 'array' | 'table' | 'error' | 'null' | 'status';

export interface PipelineSubReply {
  command: string;
  reply: any;
  kind: RespKind;
  durationMs: number;
  error?: string;
}

export interface ConsoleEntry {
  id: string;
  timestamp: string;
  command: string;
  isPipeline?: boolean;
  pipelineReplies?: PipelineSubReply[];
  reply?: any;
  kind: RespKind;
  durationMs: number;
  error?: string;
  hint?: string;
  truncated?: boolean;
}
