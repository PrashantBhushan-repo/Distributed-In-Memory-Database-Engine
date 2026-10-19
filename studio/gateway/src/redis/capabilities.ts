interface CommandReader {
  call(command: string, ...args: string[]): Promise<unknown>;
}

function namesFromReply(reply: unknown): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(reply)) return names;
  for (const item of reply) {
    const name = Array.isArray(item) ? item[0] : item;
    if (typeof name === 'string' && /^[a-z][a-z0-9_]*$/i.test(name)) names.add(name.toUpperCase());
  }
  return names;
}

// Older RedisX binaries return [] from COMMAND even when commands work. Probe
// only small read operations; never discover support by executing a write.
export async function discoverCapabilities(client: CommandReader): Promise<Set<string>> {
  for (const args of [[], ['LIST']]) {
    try {
      const names = namesFromReply(await client.call('COMMAND', ...args));
      if (names.size) return names;
    } catch { /* Restricted or incomplete command introspection. */ }
  }
  const probes = [
    ['PING'], ['INFO', 'server'], ['DBSIZE'], ['SCAN', '0', 'COUNT', '1'],
    ['TTL', '__redisx_studio_probe__'], ['PTTL', '__redisx_studio_probe__'],
    ['CLIENT', 'LIST'], ['SLOWLOG', 'LEN'], ['CONFIG', 'GET', 'maxmemory'],
    ['ACL', 'LIST'], ['PUBSUB', 'NUMPAT'], ['MEMORY', 'STATS'],
    ['HSCAN', '__redisx_studio_probe__', '0', 'COUNT', '1'],
    ['SSCAN', '__redisx_studio_probe__', '0', 'COUNT', '1'],
  ];
  const supported = new Set<string>();
  await Promise.all(probes.map(async ([command, ...args]) => {
    try { await client.call(command, ...args); supported.add(command); }
    catch (error) {
      // A transport failure cannot establish that a command is unsupported.
      if (error instanceof Error && /timeout|timed?\s*out|connection|socket|ECONN|closed|offline|stream/i.test(error.message)) throw error;
    }
  }));
  if (!supported.size) throw new Error('Could not determine engine capabilities.');
  return supported;
}
