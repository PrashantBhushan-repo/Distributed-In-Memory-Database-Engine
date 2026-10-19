import { useMetrics } from '../features/metrics/MetricsContext';

export function useEngineAddress() {
  const { engine } = useMetrics();
  return engine ? `${engine.host}:${engine.port}` : 'Waiting for engine';
}
