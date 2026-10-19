export function monitoringLinks(origin: string, configured: { prometheus?: string; grafana?: string } = {}) {
  const base = (port: string, override?: string) => {
    const fallback = new URL(origin);
    fallback.port = port;
    fallback.pathname = '/'; fallback.search = ''; fallback.hash = '';
    try {
      const url = override?.trim() ? new URL(override) : fallback;
      if (!['http:', 'https:'].includes(url.protocol)) return fallback;
      url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
      url.search = ''; url.hash = '';
      return url;
    } catch { return fallback; }
  };
  const prometheus = base('9090', configured.prometheus);
  const grafana = base('3002', configured.grafana);
  return {
    prometheus: new URL('query', prometheus).href,
    targets: new URL('targets', prometheus).href,
    grafana: new URL('d/redisx-overview/redisx-overview?from=now-15m&to=now&timezone=browser&refresh=5s', grafana).href,
    prometheusHost: prometheus.host,
    grafanaHost: grafana.host,
  };
}
