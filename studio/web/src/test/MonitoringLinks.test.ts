import { describe, expect, it } from 'vitest';
import { monitoringLinks } from '../features/metrics/monitoring';

describe('Public monitoring destinations', () => {
  it('uses the current host and opens the configured Grafana time range', () => {
    const links = monitoringLinks('http://127.0.0.1:3000');
    expect(links.prometheus).toBe('http://127.0.0.1:9090/query');
    expect(links.targets).toBe('http://127.0.0.1:9090/targets');
    const grafana = new URL(links.grafana);
    expect(grafana.origin).toBe('http://127.0.0.1:3002');
    expect(grafana.searchParams.get('refresh')).toBe('5s');
    expect(grafana.searchParams.get('from')).toBe('now-15m');
  });
  it('supports deployment URLs including reverse-proxy prefixes', () => {
    const links = monitoringLinks('https://studio.example.com', { prometheus: 'https://monitor.example.com/prometheus', grafana: 'https://monitor.example.com/grafana/' });
    expect(links.prometheus).toBe('https://monitor.example.com/prometheus/query');
    expect(links.grafana).toContain('https://monitor.example.com/grafana/d/redisx-overview/');
  });
  it('falls back to the local destination for invalid URL schemes', () => {
    const links = monitoringLinks('http://localhost:3000', { prometheus: 'javascript:alert(1)', grafana: 'not a URL' });
    expect(links.prometheus).toBe('http://localhost:9090/query');
    expect(links.grafana).toContain('http://localhost:3002/');
  });
});
