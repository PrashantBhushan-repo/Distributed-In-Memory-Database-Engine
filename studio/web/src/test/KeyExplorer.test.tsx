import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { middleEllipsis, formatTtl, formatBytes, getTypeBadgeConfig } from '../features/keys/formatters';
import { KeyItem } from '../features/keys/types';

describe('Key Explorer Formatters', () => {
  it('middleEllipsis truncates long keys with middle ellipsis', () => {
    const shortKey = 'user:1001';
    expect(middleEllipsis(shortKey, 20)).toBe('user:1001');

    const longKey = 'cache:application:sessions:eu-central-1:cluster:auth:token:99999999';
    const truncated = middleEllipsis(longKey, 30);
    expect(truncated).toContain('...');
    expect(truncated.length).toBeLessThanOrEqual(30);
  });

  it('formatTtl categorizes persist, expired, and countdowns', () => {
    expect(formatTtl(-1)).toEqual({ text: 'persist', isExpiringSoon: false, isPersist: true });
    expect(formatTtl(0)).toEqual({ text: 'expired', isExpiringSoon: true, isPersist: false });
    expect(formatTtl(45)).toEqual({ text: '45s', isExpiringSoon: true, isPersist: false });
    expect(formatTtl(300)).toEqual({ text: '5m ', isExpiringSoon: false, isPersist: false });
  });

  it('formatBytes converts bytes into human-readable units', () => {
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('getTypeBadgeConfig returns appropriate label and styling', () => {
    expect(getTypeBadgeConfig('string').label).toBe('STRING');
    expect(getTypeBadgeConfig('hash').label).toBe('HASH');
    expect(getTypeBadgeConfig('list').label).toBe('LIST');
    expect(getTypeBadgeConfig('set').label).toBe('SET');
    expect(getTypeBadgeConfig('zset').label).toBe('ZSET');
  });
});

describe('Key Explorer Item Filtering & Selection', () => {
  const sampleKeys: KeyItem[] = [
    { name: 'user:1001:profile', type: 'hash', ttl: -1, ttlMs: -1, encoding: 'listpack', size: 5, memoryBytes: 256 },
    { name: 'session:token:abc', type: 'string', ttl: 45, ttlMs: 45000, encoding: 'raw', size: 1, memoryBytes: 64 },
    { name: 'queue:emails', type: 'list', ttl: -1, ttlMs: -1, encoding: 'quicklist', size: 12, memoryBytes: 1024 },
  ];

  it('filters key items by search keyword and type', () => {
    // Filter by keyword 'user'
    const filteredByName = sampleKeys.filter((k) => k.name.includes('user'));
    expect(filteredByName).toHaveLength(1);
    expect(filteredByName[0].name).toBe('user:1001:profile');

    // Filter by type 'string'
    const filteredByType = sampleKeys.filter((k) => k.type === 'string');
    expect(filteredByType).toHaveLength(1);
    expect(filteredByType[0].name).toBe('session:token:abc');

    // Filter by TTL expiring soon (< 60s)
    const filteredByTtl = sampleKeys.filter((k) => k.ttl > 0 && k.ttl <= 60);
    expect(filteredByTtl).toHaveLength(1);
    expect(filteredByTtl[0].name).toBe('session:token:abc');
  });
});
