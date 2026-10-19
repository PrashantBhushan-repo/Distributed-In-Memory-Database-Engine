import { describe, expect, it, vi } from 'vitest';
import { discoverCapabilities } from '../src/redis/capabilities.js';

describe('Engine capability discovery', () => {
  it('reads structured command metadata without executing probes', async () => {
    const call = vi.fn(async () => [['scan', -2], ['get', 2]]);
    expect(await discoverCapabilities({ call })).toEqual(new Set(['SCAN', 'GET']));
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('accepts COMMAND LIST when COMMAND is unavailable', async () => {
    const call = vi.fn(async (_command: string, ...args: string[]) => args.length ? ['scan', 'info'] : []);
    expect(await discoverCapabilities({ call })).toEqual(new Set(['SCAN', 'INFO']));
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('discovers working reads on older engines that return empty command lists', async () => {
    const call = vi.fn(async (command: string) => {
      if (command === 'COMMAND') return [];
      if (command === 'SCAN') return ['0', ['existing:key']];
      if (command === 'INFO') return '# Server';
      throw new Error('ERR unknown command');
    });
    expect(await discoverCapabilities({ call })).toEqual(new Set(['INFO', 'SCAN']));
    expect(call.mock.calls.map(([command]) => command)).not.toEqual(expect.arrayContaining(['SET', 'DEL', 'SAVE', 'KEYS', 'PUBLISH']));
    expect(call).toHaveBeenCalledWith('SCAN', '0', 'COUNT', '1');
  });
  it('reports failed discovery instead of claiming the engine supports nothing', async () => {
    await expect(discoverCapabilities({ call: async () => { throw new Error('ERR unknown command'); } })).rejects.toThrow('Could not determine');
  });
  it('retries discovery after a transport failure instead of disabling working features', async () => {
    await expect(discoverCapabilities({ call: async command => {
      if (command === 'COMMAND') return [];
      if (command === 'PING') return 'PONG';
      throw new Error('Command timed out');
    } })).rejects.toThrow('Command timed out');
  });
});
