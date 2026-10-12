import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { parseCommandLine, saveConsoleHistory, loadConsoleHistory, formatKvTable } from '../features/console/commandUtils';
import { OutputBlock } from '../features/console/OutputBlock';
import { ConsoleEntry } from '../features/console/types';

describe('Console Command Parsing & Utilities', () => {
  it('parses standard space-separated commands into tokens', () => {
    const tokens = parseCommandLine('SET mykey "hello world"');
    expect(tokens).toEqual(['SET', 'mykey', 'hello world']);
  });

  it('handles single and double quotes, and escaped quotes properly', () => {
    const tokens = parseCommandLine('HSET users:1 name \'John Doe\' bio "He said \\"Hello\\""');
    expect(tokens).toEqual(['HSET', 'users:1', 'name', 'John Doe', 'bio', 'He said "Hello"']);
  });

  it('handles multiple consecutive whitespace tokens', () => {
    const tokens = parseCommandLine('   MGET   key1   key2    key3   ');
    expect(tokens).toEqual(['MGET', 'key1', 'key2', 'key3']);
  });

  it('formats flat key-value arrays into table records', () => {
    const raw = ['port', '6379', 'databases', '16'];
    const table = formatKvTable(raw);
    expect(table).toEqual([
      { field: 'port', value: '6379' },
      { field: 'databases', value: '16' },
    ]);
  });
});

describe('Console History Management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves console history from localStorage', () => {
    const commands = ['PING', 'SET a 1', 'GET a'];
    saveConsoleHistory(commands);

    const loaded = loadConsoleHistory();
    expect(loaded).toEqual(commands);
  });

  it('bounds history to the last 150 items', () => {
    const many = Array.from({ length: 200 }, (_, i) => `CMD_${i}`);
    saveConsoleHistory(many);

    const loaded = loadConsoleHistory();
    expect(loaded.length).toBe(150);
    expect(loaded[loaded.length - 1]).toBe('CMD_199');
  });
});

describe('OutputBlock Component', () => {
  it('renders command execution block with duration', () => {
    const entry: ConsoleEntry = {
      id: '1',
      timestamp: Date.now(),
      command: 'SET foo bar',
      reply: 'OK',
      kind: 'status',
      durationMs: 2,
    };

    render(<OutputBlock entry={entry} />);
    expect(screen.getByRole('button', { name: /set/i })).toBeInTheDocument();
    expect(screen.getByText('foo bar')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.getByText(/2ms/)).toBeInTheDocument();
  });

  it('renders integer replies and formatting', () => {
    const entry: ConsoleEntry = {
      id: '2',
      timestamp: Date.now(),
      command: 'INCR visitor_count',
      reply: 42,
      durationMs: 1,
    };

    render(<OutputBlock entry={entry} />);
    expect(screen.getByRole('button', { name: /incr/i })).toBeInTheDocument();
    expect(screen.getByText('visitor_count')).toBeInTheDocument();
    expect(screen.getByText('(integer)')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders command execution error with actionable fix hint', () => {
    const entry: ConsoleEntry = {
      id: '3',
      timestamp: Date.now(),
      command: 'HSET my_string_key f1 v1',
      error: 'WRONGTYPE Operation against a key holding the wrong kind of value',
      durationMs: 3,
    };

    render(<OutputBlock entry={entry} />);
    expect(screen.getByText(/WRONGTYPE/)).toBeInTheDocument();
    expect(screen.getByText(/TYPE <key> to inspect its actual data structure/)).toBeInTheDocument();
  });
});
