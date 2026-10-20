import { execFileSync } from 'node:child_process';

export async function rendererPrivateMegabytes(system) {
  if (process.platform !== 'win32') return undefined;
  const ids = (await system.send('SystemInfo.getProcessInfo')).processInfo.filter(item => item.type === 'renderer').map(item => Math.trunc(item.id));
  const command = `@(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64) | ConvertTo-Json -Compress`;
  const values = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8', windowsHide: true }) || '[]');
  return Math.round([values].flat().filter(Boolean).reduce((sum, item) => sum + item.PrivateMemorySize64, 0) / 1048576);
}
