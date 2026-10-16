import React from 'react';
import {
  FileText,
  Layers,
  ListOrdered,
  CheckSquare,
  TrendingUp,
  Activity,
  HelpCircle,
} from 'lucide-react';
import { KeyType } from './types';

export function middleEllipsis(str: string, maxLength = 34): string {
  if (!str || str.length <= maxLength) return str;
  const half = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

export function formatTtl(ttlSeconds: number): { text: string; isExpiringSoon: boolean; isPersist: boolean } {
  if (ttlSeconds <= -1) {
    return { text: 'persist', isExpiringSoon: false, isPersist: true };
  }
  if (ttlSeconds <= -2 || ttlSeconds === 0) {
    return { text: 'expired', isExpiringSoon: true, isPersist: false };
  }
  if (ttlSeconds < 60) {
    return { text: `${ttlSeconds}s`, isExpiringSoon: true, isPersist: false };
  }
  const m = Math.floor(ttlSeconds / 60);
  const s = ttlSeconds % 60;
  if (m < 60) {
    return { text: `${m}m ${s > 0 ? `${s}s` : ''}`, isExpiringSoon: false, isPersist: false };
  }
  const h = Math.floor(m / 60);
  return { text: `${h}h ${m % 60}m`, isExpiringSoon: false, isPersist: false };
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getTypeBadgeConfig(type?: string): {
  label: string;
  badgeClass: string;
  icon: React.ReactNode;
} {
  const norm = (type || 'unknown').toLowerCase();
  switch (norm) {
    case 'string':
      return {
        label: 'STRING',
        badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        icon: <FileText className="h-3 w-3 text-blue-400 shrink-0" />,
      };
    case 'hash':
      return {
        label: 'HASH',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: <Layers className="h-3 w-3 text-emerald-400 shrink-0" />,
      };
    case 'list':
      return {
        label: 'LIST',
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: <ListOrdered className="h-3 w-3 text-amber-400 shrink-0" />,
      };
    case 'set':
      return {
        label: 'SET',
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        icon: <CheckSquare className="h-3 w-3 text-purple-400 shrink-0" />,
      };
    case 'zset':
      return {
        label: 'ZSET',
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        icon: <TrendingUp className="h-3 w-3 text-rose-400 shrink-0" />,
      };
    case 'stream':
      return {
        label: 'STREAM',
        badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        icon: <Activity className="h-3 w-3 text-cyan-400 shrink-0" />,
      };
    default:
      return {
        label: norm.toUpperCase(),
        badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
        icon: <HelpCircle className="h-3 w-3 text-slate-400 shrink-0" />,
      };
  }
}
