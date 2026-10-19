import { describe, expect, it } from 'vitest';
import { parseCommandLine } from '../features/console/commandUtils';
import { formatTtl } from '../features/keys/formatters';

describe('Shared command parsing and TTL states', () => {
  it('preserves empty arguments and whitespace in quotes', () => {
    expect(parseCommandLine('SET "" ""')).toEqual(['SET', '', '']);
    expect(parseCommandLine('SET "a b" "hello world"')).toEqual(['SET', 'a b', 'hello world']);
  });
  it('decodes supported escapes and rejects unfinished commands', () => {
    expect(parseCommandLine('SET a "one\\ntwo\\x21"')).toEqual(['SET', 'a', 'one\ntwo!']);
    expect(() => parseCommandLine('SET a "unfinished')).toThrow('Close the quoted argument');
    expect(() => parseCommandLine('SET a "\\xQ1"')).toThrow('Hexadecimal');
  });
  it('distinguishes a missing key from a persistent one', () => {
    expect(formatTtl(-2).text).toBe('expired');
    expect(formatTtl(-1).text).toBe('persist');
  });
});
