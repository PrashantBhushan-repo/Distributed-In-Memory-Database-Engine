export interface ExpiringKey {
  name: string;
  type: string;
  ttl: number; // in seconds
  ttlMs: number; // in milliseconds
  expiresAt: string;
  memoryBytes?: number;
}

export interface HistogramBucket {
  label: string;
  range: string;
  count: number;
  percentage: number;
}

export interface ExpirationStatsTimelinePoint {
  timestamp: number;
  timeLabel: string;
  expiredRate: number;
  evictedRate: number;
  usedMemory: number;
}

export interface ExpirationStats {
  expired_keys: number;
  evicted_keys: number;
  expired_rate: number;
  evicted_rate: number;
  active_expire_enabled: boolean;
  timeline: ExpirationStatsTimelinePoint[];
}
