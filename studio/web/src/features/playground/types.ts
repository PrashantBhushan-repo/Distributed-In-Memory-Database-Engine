export type PlaygroundDataType = 'string' | 'list' | 'hash' | 'set' | 'zset' | 'none';

export type PlaygroundEncoding =
  | 'embstr'
  | 'raw'
  | 'int'
  | 'listpack'
  | 'quicklist'
  | 'intset'
  | 'hashtable'
  | 'skiplist'
  | 'unknown';

export interface StringStructure {
  type: 'string';
  encoding: 'embstr' | 'raw' | 'int';
  value: string;
  length: number;
  sdsType: 'sdshdr8' | 'sdshdr16' | 'sdshdr32' | 'sdshdr64';
  sdsLen: number;
  sdsAlloc: number;
  isNumeric: boolean;
  numericValue?: number;
  contiguousWithRobj: boolean;
  explanation: string;
}

export interface ListStructure {
  type: 'list';
  encoding: 'listpack' | 'quicklist';
  totalEntries: number;
  entries: string[];
  listpackThreshold: number;
  byteThreshold: number;
  quicklistNodes?: Array<{
    nodeIndex: number;
    entries: string[];
    sizeBytes: number;
  }>;
  explanation: string;
}

export interface HashStructure {
  type: 'hash';
  encoding: 'listpack' | 'hashtable';
  fieldCount: number;
  fields: Array<{ field: string; value: string }>;
  threshold: number;
  bucketCount?: number;
  bucketOccupancy?: number;
  buckets?: Array<{ bucketIndex: number; items: Array<{ field: string; value: string }> }>;
  explanation: string;
}

export interface SetStructure {
  type: 'set';
  encoding: 'intset' | 'hashtable';
  memberCount: number;
  members: Array<string | number>;
  elementWidthBits?: 16 | 32 | 64;
  threshold: number;
  reason?: string;
  explanation: string;
}

export interface ZSetStructure {
  type: 'zset';
  encoding: 'listpack' | 'skiplist';
  count: number;
  items: Array<{ member: string; score: number; level?: number }>;
  threshold: number;
  maxLevel?: number;
  explanation: string;
}

export type PlaygroundStructure =
  | StringStructure
  | ListStructure
  | HashStructure
  | SetStructure
  | ZSetStructure;

export interface PlaygroundInspectResponse {
  key: string;
  exists: boolean;
  type: PlaygroundDataType;
  encoding: PlaygroundEncoding;
  length: number;
  memoryBytes: number;
  ttl: number;
  structure?: PlaygroundStructure;
  encodingAvailable: boolean;
  sandboxDb: number;
}

export interface PlaygroundLesson {
  id: string;
  title: string;
  command: string;
  teaches: string;
}
