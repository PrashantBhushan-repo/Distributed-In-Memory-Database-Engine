interface PlaygroundConfig {
  STUDIO_PLAYGROUND: boolean;
  NODE_ENV: string;
  HOST: string;
}
const loopback = (host: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(host);

// Enable account-free access only on an explicitly local development server.
// Check the direct peer; do not trust forwarded IP headers.
export function isLocalPlayground(config: PlaygroundConfig, peer: string): boolean {
  return config.STUDIO_PLAYGROUND && config.NODE_ENV === 'development' && loopback(config.HOST) && loopback(peer);
}
