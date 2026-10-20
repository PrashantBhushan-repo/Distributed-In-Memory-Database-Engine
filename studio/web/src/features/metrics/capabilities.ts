import type { EngineStatus } from './MetricsContext';

export function isCapabilityUnavailable(engine: EngineStatus | null, required?: string): boolean {
  if (!engine || !required || !['connected', 'demo'].includes(engine.status)) return false;
  const discovery = engine.capabilitiesState ?? (engine.capabilities.length ? 'ready' : 'pending');
  return discovery === 'ready' && !engine.capabilities.includes(required);
}
