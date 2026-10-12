export interface ReplicaNodeInfo {
  id: string;
  ip: string;
  port: number;
  state: 'online' | 'wait_bgsave' | 'send_bulk';
  offset: number;
  lagSeconds: number;
  lagBytes: number;
  lastAckSecondsAgo: number;
  syncType: 'partial_resync' | 'full_sync';
}

export interface ReplicationTopology {
  role: 'master' | 'slave';
  connectedSlaves: number;
  masterReplId: string;
  masterReplId2: string;
  masterReplOffset: number;
  secondReplOffset: number;
  replBacklogActive: boolean;
  replBacklogSize: number;
  replBacklogFirstByteOffset: number;
  replBacklogHistlen: number;
  backlogCoverageSeconds: number;

  masterHost?: string;
  masterPort?: number;
  masterLinkStatus?: 'up' | 'down';
  masterLastIoSecondsAgo?: number;
  masterSyncInProgress?: boolean;

  replicas: ReplicaNodeInfo[];
}

export interface PreflightCheckItem {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ReplicationPreflight {
  action: 'replicaof' | 'promote';
  targetHost?: string;
  targetPort?: number;
  replicaCaughtUp: boolean;
  maxLagBytes: number;
  maxLagSeconds: number;
  writesInFlight: number;
  dataLossRisk: 'none' | 'low' | 'high';
  checklist: PreflightCheckItem[];
  explanation: string;
}
