export interface MetricSample {
  timestamp: number;
  opsPerSec: number;
  hitRate: number;
  usedMemory: number;
  usedMemoryHuman: string;
  maxMemory: number;
  memoryPercent: number;
  connectedClients: number;
  blockedClients: number;
  totalKeys: number;
  evictedKeysPerSec: number;
  expiredKeysPerSec: number;
  networkInputBytesPerSec: number;
  networkOutputBytesPerSec: number;
  p99LatencyMs: number;
  p50LatencyMs?: number;
  p90LatencyMs?: number;
  opsByCommand?: Record<string, number>;
  replicationLagSeconds?: number;
  replicationLagBytes?: number;
  rehashActive?: boolean;
}

export interface HealthIssue {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  fixSuggestion: string;
  deepLink: string;
}

export interface HealthSummary {
  status: 'healthy' | 'warning' | 'critical';
  topIssue?: HealthIssue;
  thingsToLookAt: HealthIssue[];
  checkedAt: string;
}

export type TimeRangeOption = '15m' | '1h' | '6h' | '24h' | 'custom';

export interface AlertThreshold {
  chartId: string;
  threshold: number;
  label: string;
  condition: 'above' | 'below';
}

export interface ChartSeriesConfig {
  key: string;
  name: string;
  color: string;
  unit: string;
}
