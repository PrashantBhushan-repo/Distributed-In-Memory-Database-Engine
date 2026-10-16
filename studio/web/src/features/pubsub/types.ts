export interface PubSubChannelItem {
  name: string;
  subscribers: number;
}

export interface PubSubChannelsResponse {
  channels: PubSubChannelItem[];
  totalChannels: number;
  patternCount: number;
}

export interface PubSubMessageEvent {
  type: 'message' | 'pmessage';
  channel: string;
  pattern?: string;
  payload: string;
  timestamp: number;
  timeStr: string;
}

export interface SubscriptionItem {
  target: string;
  isPattern: boolean;
  addedAt: number;
}
