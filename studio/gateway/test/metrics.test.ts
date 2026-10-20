import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetricsSampler } from '../src/metrics/sampler.js';
import { parseRedisInfo } from '../src/redis/info.js';
import type { RedisGatewayClient } from '../src/redis/client.js';

afterEach(() => vi.useRealTimers());
const rawInfo = (commands: number) => `# Memory\nused_memory:10368\nmaxmemory:0\n# Stats\ntotal_commands_processed:${commands}\nkeyspace_hits:4\nkeyspace_misses:1\ntotal_net_input_bytes:${commands * 10}\ntotal_net_output_bytes:${commands * 20}\n# Replication\nmaster_repl_offset:636\n`;
function fixture() {
  const getInfo = vi.fn().mockResolvedValue(parseRedisInfo(rawInfo(100)));
  const sampler = new MetricsSampler({ getInfo, getStatus: () => ({ isDemo: false }) } as unknown as RedisGatewayClient);
  sampler.stop();
  return { sampler, getInfo };
}
describe('Recorded metric windows and measurements', () => {
  it('shows the first real sample immediately and records round trip without inventing percentiles', async () => {
    const { sampler } = fixture();
    const sample = await sampler.collectSample();
    expect(sampler.getHistory('1h')).toHaveLength(1);
    expect(sample.usedMemory).toBe(10368);
    expect(sample.maxMemory).toBe(0);
    expect(sample.replicationOffsetBytes).toBe(636);
    expect(sample.infoLatencyMs).toBeGreaterThanOrEqual(0);
    expect(sample.p99LatencyMs).toBeNull();
  });
  it('derives rates from actual counter deltas', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    const { sampler, getInfo } = fixture();
    await sampler.collectSample();
    vi.setSystemTime(Date.now() + 1000);
    getInfo.mockResolvedValue(parseRedisInfo(rawInfo(110)));
    const sample = await sampler.collectSample();
    expect(sample.opsPerSec).toBe(10);
    expect(sample.networkInputBytesPerSec).toBe(100);
    expect(sample.networkOutputBytesPerSec).toBe(200);
  });
  it('keeps current and previous windows separate and never substitutes expired history', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    const { sampler } = fixture();
    await sampler.collectSample();
    vi.setSystemTime(Date.now() + 30 * 60_000);
    const previous = await sampler.collectSample();
    vi.setSystemTime(Date.now() + 16 * 60_000);
    expect(sampler.getHistory('15m')).toEqual([]);
    expect(sampler.getHistory('15m', true)).toEqual([previous]);
  });
  it('labels socket traffic as gateway-only when engine-wide counters are absent', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    let bytes = 100;
    const client = {
      getInfo: async () => parseRedisInfo('# Stats\ntotal_commands_processed:10\n'),
      getStatus: () => ({ isDemo: false }),
      getNetworkCounters: () => ({ inputBytes: bytes, outputBytes: bytes * 2 }),
    };
    const sampler = new MetricsSampler(client as unknown as RedisGatewayClient); sampler.stop();
    await sampler.collectSample();
    vi.setSystemTime(Date.now() + 1000); bytes = 150;
    const sample = await sampler.collectSample();
    expect(sample.networkScope).toBe('gateway');
    expect(sample.networkAvailable).toBe(true);
    expect(sample.networkInputBytesPerSec).toBe(50);
    expect(sample.networkOutputBytesPerSec).toBe(100);
  });
});
