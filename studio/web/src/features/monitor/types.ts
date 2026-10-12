export interface MonitorEntry {
  id: string;
  timestamp: number;
  timeStr: string;
  db: number;
  client: string;
  command: string;
  args: string[];
  raw: string;
}

export interface MonitorFilter {
  command?: string;
  client?: string;
  keyPattern?: string;
}

export interface MonitorNoticeEvent {
  type: 'notice';
  text: string;
  autoStopSeconds: number;
  rateLimit: number;
  role?: string;
}

export interface MonitorRateLimitEvent {
  type: 'rate_limit';
  droppedCount: number;
}

export interface MonitorStoppedEvent {
  type: 'stopped';
  reason: string;
}
