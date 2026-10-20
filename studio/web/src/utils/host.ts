export function getDisplayHost(): string {
  if (typeof window === 'undefined') return 'pbredisdb.pburls.online:6379';
  const h = window.location.hostname;
  if (!h || h === 'localhost' || h === '127.0.0.1') {
    return '127.0.0.1:6379';
  }
  return `${h}:6379`;
}

export function getDisplayHostname(): string {
  if (typeof window === 'undefined') return 'pbredisdb.pburls.online';
  const h = window.location.hostname;
  if (!h || h === 'localhost' || h === '127.0.0.1') {
    return '127.0.0.1';
  }
  return h;
}
