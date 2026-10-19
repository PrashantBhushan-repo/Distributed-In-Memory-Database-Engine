import { test, expect } from '@playwright/test';
import { rendererPrivateMegabytes } from '../scripts/browser-memory.mjs';

test('metrics remain bounded under large history, comparisons, scrolling and repeated navigation', async ({ page, browser }) => {
  const failures: string[] = [];
  page.on('crash', () => failures.push('Renderer crashed'));
  page.on('pageerror', error => failures.push(error.message));
  const now = Date.now();
  const fixture = Array.from({ length: 10000 }, (_, index) => ({ timestamp: now - (10000 - index) * 1000,
    opsPerSec: index % 20, usedMemory: 10368, maxMemory: 0, hitRate: 95, expiredKeysPerSec: 0, evictedKeysPerSec: 0,
    p99LatencyMs: null, infoLatencyMs: 1.2, replicationOffsetBytes: index, networkAvailable: true, networkScope: 'gateway',
    networkInputBytesPerSec: 120, networkOutputBytesPerSec: 450 }));
  const body = JSON.stringify({ points: fixture, previousPoints: fixture.map(point => ({ ...point, timestamp: point.timestamp - 86400000 })) });
  await page.route('**/api/metrics/history?**', route => route.fulfill({ contentType: 'application/json', body }));
  await page.addInitScript(() => localStorage.setItem('redisx_tour_completed', 'true'));
  const cdp = await page.context().newCDPSession(page);
  const system = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  await page.goto('/metrics');
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await page.getByRole('button', { name: 'Compare Previous', exact: true }).click();
  await expect(page.getByText(/recorded samples from the preceding 24h/)).toBeVisible();
  const memory: { heapMB: number; privateMB?: number }[] = [];
  for (let index = 0; index < 12; index++) {
    const card = page.getByTestId(['metric-ops', 'metric-memory', 'metric-repl'][index % 3]);
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.recharts-wrapper')).toBeVisible();
    // A valid flat SVG path has a zero-height bounding box. Check its actual
    // geometry rather than treating that as an invisible/broken chart.
    await expect(card.locator('.recharts-line-curve').first()).toHaveAttribute('d', /^M/);
    await page.waitForTimeout(5000);
    const metrics = (await cdp.send('Performance.getMetrics')).metrics;
    const heapMB = metrics.find(item => item.name === 'JSHeapUsedSize')!.value / 1048576;
    const privateMB = await rendererPrivateMegabytes(system);
    memory.push({ heapMB, privateMB });
    // Do not force GC: that hides the native formatter allocation regression.
    expect(heapMB).toBeLessThan(128);
    if (privateMB !== undefined) expect(privateMB).toBeLessThan(512);
    // Adjacent rows can be within the 80px prefetch margin while scrolling.
    expect(await page.locator('.recharts-wrapper').count()).toBeLessThan(7);
    if (index % 3 === 0) console.log(JSON.stringify({ seconds: (index + 1) * 5, heapMB: Math.round(heapMB), privateMB }));
    const text = await page.getByTestId('metrics-status').textContent();
    expect(Number(text?.match(/(\d+) samples/)?.[1])).toBeLessThanOrEqual(360);
  }
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
  await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByTestId('metric-repl').locator('.recharts-wrapper')).toBeVisible();
  for (let index = 0; index < 3; index++) {
    await page.locator('.studio-sidebar').getByRole('link', { name: 'Console', exact: true }).click();
    await page.locator('.studio-sidebar').getByRole('link', { name: 'Metrics', exact: true }).click();
    await page.getByTestId('metric-ops').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('metric-ops').locator('.recharts-line-curve').first()).toBeVisible();
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const final = (await cdp.send('Performance.getMetrics')).metrics;
  expect(final.find(item => item.name === 'JSHeapUsedSize')!.value / 1048576).toBeLessThan(64);
  expect(failures).toEqual([]);
  await test.info().attach('metrics-memory.json', { body: JSON.stringify(memory, null, 2), contentType: 'application/json' });
});
