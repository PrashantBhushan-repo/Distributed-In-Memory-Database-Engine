import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('account-free Studio: create, edit, expire, delete, console, themes and palette', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('redisx_tour_completed', 'true'); localStorage.setItem('redisx_theme', 'dark'); });
  await page.goto('/dashboard');
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0);
  await expect(page.getByTitle('Sign out')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Dashboard.' })).toBeVisible();
  await expect(page.locator('.studio-source-badge')).toHaveText('Live engine', { timeout: 15000 });
  await expect(page.locator('.studio-server')).toContainText(process.env.ENGINE_PORT || '16379');
  await page.screenshot({ path: '../../build-studio-verify/studio-dark.png', fullPage: true });
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  }
  await page.screenshot({ path: '../../build-studio-verify/studio-light.png', fullPage: true });
  await page.getByRole('link', { name: 'Explore data' }).click();
  const key = `studio:browser:${Date.now()}`;
  await page.getByRole('button', { name: 'New Key', exact: true }).click();
  await page.getByPlaceholder('e.g. user:1001:profile or session:token').fill(key);
  await page.getByPlaceholder('String or JSON payload...').fill('first value');
  await page.getByRole('button', { name: 'Create Key', exact: true }).click();
  await expect(page.getByPlaceholder('Key string value...')).toHaveValue('first value');
  await page.getByPlaceholder('Key string value...').fill('saved in C++');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const headers = {};
  expect((await (await page.request.get(`/api/key/${encodeURIComponent(key)}`, { headers })).json()).value).toBe('saved in C++');
  await page.getByTitle('Change TTL', { exact: true }).click();
  await page.getByRole('button', { name: '1 Hour (3600s)' }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/key/${encodeURIComponent(key)}`, { headers })).json()).ttl).toBeGreaterThan(3500);
  await page.getByTitle('Delete this key', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete Key', exact: true }).click();
  await expect.poll(async () => (await page.request.get(`/api/key/${encodeURIComponent(key)}`, { headers })).status()).toBe(404);
  await page.locator('.studio-sidebar').getByRole('link', { name: 'Console', exact: true }).click();
  const editor = page.locator('.cm-content[contenteditable=true]');
  await editor.fill('PING'); await editor.press('Enter');
  await expect(page.locator('#studio-main')).toContainText('PONG');
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder(/Type a command, page name/i)).toBeVisible();
  await page.keyboard.press('Escape');
  expect(failures).toEqual([]);
});

test('mobile workspace fits and disconnects keep verified readings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('redisx_tour_completed', 'true'); });
  await page.goto('/dashboard');
  await expect(page.locator('.studio-source-badge')).toHaveText('Live engine', { timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../build-studio-verify/studio-mobile.png', fullPage: true });
  await page.context().setOffline(true);
  await expect(page.locator('.studio-stale-notice')).toBeVisible({ timeout: 10000 });
  const values = await page.locator('.studio-kpi-value').allTextContents();
  await page.waitForTimeout(2000);
  expect(await page.locator('.studio-kpi-value').allTextContents()).toEqual(values);
  await page.context().setOffline(false);
});

test('every Studio route renders without runtime failures', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('redisx_tour_completed', 'true'); });
  for (const route of ['dashboard', 'keys', 'console', 'playground', 'memory', 'expiration', 'clients', 'slowlog', 'persistence', 'replication', 'security', 'config', 'metrics', 'monitor', 'pubsub', 'learn/tour', 'learn/commands', 'learn/labs']) {
    await page.goto(`/${route}`);
    await expect(page.locator('#studio-main h1').first()).toBeVisible();
    await expect(page.locator('.studio-source-badge')).toHaveText('Live engine', { timeout: 15000 });
    await expect(page.getByText(/This engine does not/)).toHaveCount(0);
    expect(failures, route).toEqual([]);
  }
});

test('key scans advance through empty pages once and remain usable after metrics updates', async ({ page }) => {
  const cursors: string[] = [];
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('redisx_tour_completed', 'true'); });
  await page.route('**/api/keys?**', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor') || '0';
    cursors.push(cursor);
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: { cursor: cursor === '0' ? 1 : cursor === '1' ? 2 : 0,
      keys: cursor === '2' ? [{ name: 'scan:verified', type: 'string', ttl: -1, ttlMs: -1, memoryBytes: 80 }] : [], totalApprox: 1 } });
  });
  await page.goto('/keys');
  await expect(page.getByText('scan:verified', { exact: true })).toBeVisible();
  await page.waitForTimeout(3500);
  // Development StrictMode can start and cancel an initial request twice.
  expect(cursors.filter(cursor => cursor === '0').length).toBeLessThanOrEqual(2);
  expect(cursors.filter(cursor => cursor !== '0')).toEqual(['1', '2']);
  await expect(page.getByRole('button', { name: 'New Key', exact: true })).toBeVisible();
  await expect(page.getByText(/This engine does not/)).toHaveCount(0);
});

test('metrics show real readings and support pause, ranges, thresholds, export and recovery', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('redisx_tour_completed', 'true'); });
  await page.goto('/metrics');
  const status = page.getByTestId('metrics-status');
  const ops = page.getByTestId('metric-ops');
  const value = ops.getByTestId('metric-value');
  await expect(status).toContainText('Live');
  await expect(page.getByRole('button', { name: 'Refresh metrics' })).toBeEnabled();
  await expect(page.getByTestId('metric-latency').getByTestId('metric-value')).toHaveText(/[\d.]+ ms/);
  await expect(page.getByTestId('metric-memory')).toContainText('No maxmemory limit');
  await expect(page.getByTestId('metric-network').getByTestId('metric-value')).not.toContainText('Unavailable');
  await expect(page.getByTestId('metric-ops').locator('.recharts-line-curve').first()).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozenValue = await value.textContent();
  const frozenCards = await page.getByTestId('metric-value').allTextContents();
  const frozenStatus = await status.textContent();
  await page.waitForTimeout(2200);
  expect(await value.textContent()).toBe(frozenValue);
  expect(await page.getByTestId('metric-value').allTextContents()).toEqual(frozenCards);
  expect(await status.textContent()).toBe(frozenStatus);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(status).toContainText('Live');
  for (const range of ['15m', '6h', '24h', '1h']) {
    const response = page.waitForResponse(response => response.url().includes(`/api/metrics/history?range=${range}`));
    await page.getByRole('button', { name: range, exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByRole('button', { name: range, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Compare Previous', exact: true }).click();
  await expect(page.getByText(/preceding 1h/)).toBeVisible();
  await ops.getByRole('button', { name: 'Set threshold for Command throughput' }).click();
  await ops.getByRole('spinbutton').fill('0');
  await ops.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ops).toContainText('above 0 ops/s');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('redisx_metrics_thresholds') || '{}')['ops:ops/s'])).toBe(0);
  const download = page.waitForEvent('download');
  await ops.getByRole('button', { name: 'Download Command throughput CSV' }).click();
  const csv = await download;
  expect(csv.suggestedFilename()).toMatch(/redis-ops.*\.csv/);
  const { readFile } = await import('node:fs/promises');
  const text = await readFile((await csv.path())!, 'utf8');
  expect(text).toContain('Timestamp (UTC)');
  expect(text).toContain('Total (ops/s)');
  expect(text.split('\n').length).toBeGreaterThan(1);
  await ops.getByRole('button', { name: 'Set threshold for Command throughput' }).click();
  await ops.getByRole('button', { name: 'Clear threshold', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('redisx_metrics_thresholds') || '{}')['ops:ops/s'])).toBeUndefined();
  await page.route('**/api/metrics/history?**', route => route.fulfill({ status: 503, json: { error: 'Temporary test failure' } }));
  await expect(page.getByRole('button', { name: 'Refresh metrics' })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh metrics' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Metric history could not be loaded' })).toBeVisible();
  await page.unroute('**/api/metrics/history?**');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Metric history could not be loaded' })).toHaveCount(0);
  await page.screenshot({ path: '../../build-studio-verify/studio-metrics.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(failures).toEqual([]);
});

test('monitoring quick start provides tool links, copyable queries and a complete first-use walkthrough', async ({ page, context }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('redisx_tour_completed', 'true'); localStorage.setItem('redisx_theme', 'dark'); });
  await page.goto('/metrics');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
  const panel = page.getByRole('region', { name: 'Go from a number to an answer.' });
  const prometheus = panel.getByRole('link', { name: 'Open Prometheus in a new tab' });
  const grafana = panel.getByRole('link', { name: 'Open Grafana in a new tab' });
  await expect(prometheus).toHaveAttribute('href', /:9090\/query$/);
  await expect(grafana).toHaveAttribute('href', /:3002\/d\/redisx-overview\/redisx-overview\?from=now-15m/);
  await expect(prometheus).toHaveAttribute('target', '_blank');
  await expect(grafana).toHaveAttribute('rel', 'noopener noreferrer');
  await panel.getByRole('button', { name: 'New here? Quick start' }).click();
  await panel.getByRole('button', { name: 'Copy connection query' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('up{job="redisx"}');
  await expect(panel.getByText('Expected result:', { exact: false })).toBeVisible();
  await panel.screenshot({ path: '../../build-studio-verify/studio-monitoring-dark.png' });
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    const result = await new AxeBuilder({ page }).include('#monitoring-tools').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map(violation => violation.id)).toEqual([]);
  }
  await panel.screenshot({ path: '../../build-studio-verify/studio-monitoring-light.png' });
  await panel.getByRole('button', { name: 'Next: create activity' }).click();
  await panel.getByRole('button', { name: 'Copy sample engine commands' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('SET studio:monitoring:counter 0 EX 120');
  await expect(panel.getByRole('link', { name: 'Studio Console' })).toHaveAttribute('href', '/console');
  await panel.getByRole('button', { name: 'Next: explore graphs' }).click();
  await panel.getByRole('button', { name: 'Copy throughput query' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('rate(redis_commands_processed_total{job="redisx"}[1m])');
  await panel.getByText('A tool will not open, or the graphs show no data?').click();
  await panel.getByRole('button', { name: 'Copy monitoring startup command' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('docker-compose.monitoring.yml up -d --wait');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByRole('button', { name: 'Close quick start' }).click();
  await expect(panel.getByRole('navigation', { name: 'Monitoring quick start steps' })).toHaveCount(0);
  if (process.env.MONITORING_LIVE === 'true') {
    const prometheusUrl = new URL((await prometheus.getAttribute('href'))!);
    const response = await page.request.get(new URL('/api/v1/query', prometheusUrl).href, { params: { query: 'up{job="redisx"}' } });
    expect(response.status()).toBe(200);
    expect((await response.json()).data.result.some((result: { value: [number, string] }) => result.value[1] === '1')).toBe(true);
    const popup = page.waitForEvent('popup');
    await grafana.click();
    const dashboard = await popup;
    await dashboard.waitForLoadState('domcontentloaded');
    await expect(dashboard).toHaveURL(/\/d\/redisx-overview\/redisx-overview/);
    await dashboard.close();
  }
});
