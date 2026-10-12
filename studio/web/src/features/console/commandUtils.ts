export function parseCommandLine(cmdStr: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let escapeNext = false;

  for (let i = 0; i < cmdStr.length; i++) {
    const ch = cmdStr[i];

    if (escapeNext) {
      current += ch;
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && !inSingle) {
      escapeNext = true;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (/\s/.test(ch) && !inDouble && !inSingle) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function getErrorHint(errorMsg: string): string | undefined {
  if (!errorMsg) return undefined;
  const upper = errorMsg.toUpperCase();

  if (upper.includes('WRONGTYPE')) {
    return 'This key holds a different data type. Use TYPE <key> to inspect its actual data structure.';
  }
  if (upper.includes('NOAUTH') || upper.includes('AUTHENTICATION')) {
    return 'Authentication required. Execute AUTH <password> to authorize this session.';
  }
  if (upper.includes('SYNTAX ERROR')) {
    return 'Syntax error in arguments. Click the command name in the prompt to view expected syntax.';
  }
  if (upper.includes('UNKNOWN COMMAND')) {
    return 'Unknown or unsupported command. Verify command spelling or check supported capabilities.';
  }
  if (upper.includes('OOM') || upper.includes('MAXMEMORY')) {
    return 'Database reached maxmemory limit. Eviction policy could not free memory. Run MEMORY STATS.';
  }
  if (upper.includes('READ-ONLY') || upper.includes('READONLY')) {
    return 'Write command blocked. Connected instance is currently in replica (read-only) mode.';
  }
  if (upper.includes('BLOCKED') || upper.includes('SAFETY')) {
    return 'Potentially destructive command. Requires Administrator role with Confirm & Unlock enabled.';
  }
  return undefined;
}

export function isFlatKvArray(arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0 || arr.length % 2 !== 0) return false;
  // If elements are primitive strings/numbers and length is <= 200, it's often a key-value mapping like HGETALL or CONFIG GET
  return arr.every((item) => typeof item === 'string' || typeof item === 'number');
}

export function formatKvTable(arr: any[]): Array<{ field: string; value: string }> {
  const result: Array<{ field: string; value: string }> = [];
  for (let i = 0; i < arr.length; i += 2) {
    result.push({
      field: String(arr[i]),
      value: String(arr[i + 1]),
    });
  }
  return result;
}

const HISTORY_STORAGE_KEY = 'redisx_console_history_v1';

export function loadConsoleHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConsoleHistory(history: string[]): void {
  try {
    // Keep last 150 commands
    const sliced = history.slice(-150);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sliced));
  } catch {}
}
