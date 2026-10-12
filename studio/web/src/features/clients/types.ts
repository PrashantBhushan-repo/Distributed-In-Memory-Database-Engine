export interface ClientInfo {
  id: string;
  addr: string;
  name: string;
  age: number; // seconds
  idle: number; // seconds
  db: number;
  cmd: string;
  flags: string;
  qbuf: number;
  qbufFree: number;
  obl: number;
  oll: number;
  omem: number;
  events: string;
  user: string;
  isBlocked: boolean;
  isSubscribed: boolean;
  isHighBuffer: boolean;
  isHighIdle: boolean;
}

export interface ClientsSummary {
  total: number;
  blockedCount: number;
  subscribedCount: number;
  maxClients: number;
  highBufferCount: number;
  highIdleCount: number;
}
