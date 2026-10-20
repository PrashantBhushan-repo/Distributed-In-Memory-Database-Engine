import { chromium } from '@playwright/test';
import { rendererPrivateMegabytes } from './browser-memory.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Uses an isolated browser, never the user's Chrome session. Run with the app
// already started: node scripts/profile-metrics.mjs
const label = process.env.PROFILE_LABEL || 'metrics';
const count = Number(process.env.PROFILE_SAMPLES || 7);
const interval = Number(process.env.PROFILE_INTERVAL_MS || 10000);
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('crash', () => { throw new Error('Metrics renderer crashed'); });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('redisx_tour_completed', 'true'));
  const cdp = await page.context().newCDPSession(page);
  const system = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  await page.goto(process.env.METRICS_PROFILE_URL || 'http://localhost:3000/metrics');
  await page.getByTestId('metric-ops').locator('.recharts-wrapper').waitFor();
  for (let index = 0; index < count; index++) {
    if (index) await page.waitForTimeout(interval);
    if (process.env.PROFILE_FORCE_GC === 'true') await cdp.send('HeapProfiler.collectGarbage');
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
    const rendererPrivateMB = await rendererPrivateMegabytes(system);
    const sample = { seconds: index * interval / 1000, heapMB: Math.round(metrics.JSHeapUsedSize / 1048576 * 10) / 10,
      rendererPrivateMB, nodes: metrics.Nodes, listeners: metrics.JSEventListeners,
      charts: await page.locator('.recharts-wrapper').count(), status: await page.getByTestId('metrics-status').textContent() };
    results.push(sample);
    console.log(JSON.stringify(sample));
    if (rendererPrivateMB > 1024) { console.log('Stopped profiling at the 1 GiB renderer safety limit.'); break; }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const output = path.resolve(import.meta.dirname, '../../../build-studio-verify');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `profile-${label}.json`), JSON.stringify(results, null, 2));
} finally { await browser.close(); }
