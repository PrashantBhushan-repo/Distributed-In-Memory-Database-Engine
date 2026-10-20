import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radio, RefreshCw, Send, Layers, Info } from 'lucide-react';
import { PubSubChannelItem, PubSubMessageEvent, SubscriptionItem } from '../features/pubsub/types';
import { ChannelList } from '../features/pubsub/ChannelList';
import { SubscriptionManager } from '../features/pubsub/SubscriptionManager';
import { PublishPanel } from '../features/pubsub/PublishPanel';
import { MessageStream } from '../features/pubsub/MessageStream';

export const PubSubPage: React.FC = () => {
  const [channels, setChannels] = useState<PubSubChannelItem[]>([]);
  const [totalChannels, setTotalChannels] = useState(0);
  const [patternCount, setPatternCount] = useState(0);
  const [channelsLoading, setChannelsLoading] = useState(false);

  // Subscriptions & Messages state
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([
    { target: 'notifications:user', isPattern: false, addedAt: Date.now() },
    { target: 'order:*', isPattern: true, addedAt: Date.now() },
  ]);
  const [messages, setMessages] = useState<PubSubMessageEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [quickFillChannel, setQuickFillChannel] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch active channels from /api/pubsub/channels
  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const token = localStorage.getItem('redisx_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/pubsub/channels', { headers });
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
        setTotalChannels(data.totalChannels || 0);
        setPatternCount(data.patternCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch pubsub channels:', err);
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Connect to /ws/pubsub WebSocket
  useEffect(() => {
    const token = localStorage.getItem('redisx_token');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const port = '4000';
    const url = `${protocol}//${host}:${port}/ws/pubsub${token ? `?token=${token}` : ''}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send initial subscriptions
      subscriptions.forEach((sub) => {
        ws.send(
          JSON.stringify({
            action: sub.isPattern ? 'psubscribe' : 'subscribe',
            channel: sub.target,
          })
        );
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' || data.type === 'pmessage') {
          if (!isPaused) {
            setMessages((prev) => {
              const next = [...prev, data];
              return next.length > 1000 ? next.slice(next.length - 1000) : next;
            });
          }
        }
      } catch (err) {
        console.error('Error handling pubsub message:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const handleSubscribe = (target: string, isPattern: boolean) => {
    // Avoid duplicate subscriptions
    const exists = subscriptions.some(
      (s) => s.target.toLowerCase() === target.toLowerCase() && s.isPattern === isPattern
    );
    if (exists) return;

    setSubscriptions((prev) => [...prev, { target, isPattern, addedAt: Date.now() }]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: isPattern ? 'psubscribe' : 'subscribe',
          channel: target,
        })
      );
    }
  };

  const handleUnsubscribe = (target: string, isPattern: boolean) => {
    setSubscriptions((prev) =>
      prev.filter(
        (s) => !(s.target.toLowerCase() === target.toLowerCase() && s.isPattern === isPattern)
      )
    );

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: isPattern ? 'punsubscribe' : 'unsubscribe',
          channel: target,
        })
      );
    }
  };

  const handleSelectChannel = (channelName: string) => {
    setQuickFillChannel(channelName);
  };

  const handleQuickSubscribe = (channelName: string) => {
    handleSubscribe(channelName, channelName.includes('*'));
  };

  const handleClearMessages = () => {
    setMessages([]);
  };

  const handleExportMessages = () => {
    const jsonStr = JSON.stringify(messages, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `redis-pubsub-messages-${new Date().toISOString().slice(0, 19)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <><div className="studio-feature-heading"><h1>Pub/Sub</h1><p>Subscribe to channels and publish messages through the connected engine.</p></div>
    <div className="flex flex-col lg:flex-row h-[calc(100dvh-15rem)] min-h-[32rem] gap-4">
      {/* LEFT PANE: Active Channels List */}
      <div className="w-full lg:w-72 shrink-0 h-64 lg:h-full">
        <ChannelList
          channels={channels}
          totalChannels={totalChannels}
          patternCount={patternCount}
          loading={channelsLoading}
          onRefresh={fetchChannels}
          onSelectChannel={handleSelectChannel}
          onQuickSubscribe={handleQuickSubscribe}
        />
      </div>

      {/* RIGHT PANE: Subscriptions + Publish + Message Stream */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
        {/* Top Split: Subscriptions Manager & Publish Panel */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 shrink-0">
          <SubscriptionManager
            subscriptions={subscriptions}
            onSubscribe={handleSubscribe}
            onUnsubscribe={handleUnsubscribe}
            quickFillChannel={quickFillChannel}
          />
          <PublishPanel
            initialChannel={quickFillChannel}
            onPublishSuccess={() => fetchChannels()}
          />
        </div>

        {/* Bottom: Real-Time Message Stream */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <MessageStream
            messages={messages}
            isPaused={isPaused}
            onTogglePause={() => setIsPaused(!isPaused)}
            onClear={handleClearMessages}
            onExport={handleExportMessages}
          />
        </div>
      </div>
    </div></>
  );
};
