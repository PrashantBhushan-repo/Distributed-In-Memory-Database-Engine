import { describe, expect, it } from 'vitest';
import { isCapabilityUnavailable } from '../features/metrics/capabilities';
import type { EngineStatus } from '../features/metrics/MetricsContext';

const engine: EngineStatus = { status: 'connected', host: '127.0.0.1', port: 6379, isDemo: false, capabilities: [] };
describe('Feature availability during discovery and reconnection', () => {
  it.each(['pending', 'error'] as const)('keeps pages mounted when discovery is %s', capabilitiesState => {
    expect(isCapabilityUnavailable({ ...engine, capabilitiesState }, 'SCAN')).toBe(false);
  });
  it('does not hide pages while reconnecting or waiting for legacy status', () => {
    expect(isCapabilityUnavailable({ ...engine, status: 'connecting', capabilitiesState: 'ready' }, 'SCAN')).toBe(false);
    expect(isCapabilityUnavailable(engine, 'SCAN')).toBe(false);
    expect(isCapabilityUnavailable(null, 'SCAN')).toBe(false);
  });
  it('only blocks a feature after discovery confirms it is missing', () => {
    expect(isCapabilityUnavailable({ ...engine, capabilitiesState: 'ready' }, 'SCAN')).toBe(true);
    expect(isCapabilityUnavailable({ ...engine, capabilitiesState: 'ready', capabilities: ['SCAN'] }, 'SCAN')).toBe(false);
  });
});
