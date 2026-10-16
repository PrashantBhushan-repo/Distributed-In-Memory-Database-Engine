export interface SlowLogCauseHint {
  command: string;
  pattern: string;
  cause: string;
  fix: string;
  alternative: string;
  severity: 'warning' | 'critical';
}

export interface SlowLogEntry {
  id: number;
  timestamp: number;
  timestampIso: string;
  durationUs: number; // microseconds
  durationMs: number; // milliseconds
  command: string;
  args: string[];
  clientAddr: string;
  clientName: string;
  causeHint?: SlowLogCauseHint;
}

export interface SlowLogGroupedEntry {
  command: string;
  count: number;
  avgDurationUs: number;
  avgDurationMs: number;
  maxDurationUs: number;
  maxDurationMs: number;
  totalDurationMs: number;
  causeHint?: SlowLogCauseHint;
  samples: SlowLogEntry[];
}
