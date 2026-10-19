export interface SaveTimelineItem {
  id: string;
  type: 'rdb' | 'aof';
  timestamp: number;
  timestampIso: string;
  durationSec: number;
  sizeBytes: number;
  status: 'ok' | 'err';
  keysCount?: number;
}

export interface PersistenceInfo {
  loading: boolean;
  rdbLastSaveTime: number;
  rdbLastSaveTimeIso: string;
  rdbLastBgsaveStatus: 'ok' | 'err' | 'unknown';
  rdbLastBgsaveTimeSec: number;
  rdbCurrentBgsaveTimeSec: number;
  rdbBgsaveInProgress: boolean;
  rdbChangesSinceLastSave: number;
  rdbSizeBytes: number;

  aofEnabled: boolean;
  aofRewriteInProgress: boolean;
  aofRewriteScheduled: boolean;
  aofLastRewriteTimeSec: number;
  aofCurrentRewriteTimeSec: number;
  aofLastBgrewriteStatus: 'ok' | 'err' | 'unknown';
  aofCurrentSize: number;
  aofBaseSize: number;
  aofBufferDelay: number;
  aofFsyncPolicy: 'always' | 'everysec' | 'no';

  saveTimeline: SaveTimelineItem[];
}

export interface SnapshotRecordCount {
  type: string;
  count: number;
  estimatedBytes: number;
  percentage: number;
}

export interface SnapshotInspectResult {
  valid: boolean;
  format: string;
  version: number;
  crcValid: boolean;
  crcExpected?: string;
  crcActual?: string;
  fileSizeBytes: number;
  filePath: string;
  totalKeys: number;
  auxFields: {
    redisVersion: string;
    redisBits: number;
    ctime: number;
    ctimeIso: string;
    usedMemoryBytes: number;
  };
  recordCounts: SnapshotRecordCount[];
  error?: string;
}
