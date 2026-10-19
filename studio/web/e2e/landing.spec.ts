import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('public landing: no hydration errors, functional sandbox, navigation and theme', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A Redis-compatible databaseyou can see inside.');
  await expect(page.getByRole('textbox', { name: 'Redis demo command' })).toBeVisible();
  await expect(page.locator('.lp-bento a')).toHaveCount(16);
  const studioButton = page.getByRole('link', { name: 'Open Studio', exact: true });
  await expect(studioButton).toHaveAttribute('href', '/dashboard');
  const studioBounds = await studioButton.boundingBox();
  expect(studioBounds!.height).toBeGreaterThanOrEqual(44);
  expect(await studioButton.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe('rgb(207, 53, 43)');
  await expect(page.locator('.lp-activity .lp-trace-signal')).toHaveCSS('animation-name', 'lp-trace-flow');
  await expect(page.getByText('1. Categorized Navigation Sidebar')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Redis demo command' }).fill('SET test:landing "hello browser"');
  await page.getByRole('button', { name: 'Run command' }).click();
  await page.getByRole('textbox', { name: 'Redis demo command' }).fill('GET test:landing');
  await page.getByRole('button', { name: 'Run command' }).click();
  await expect(page.getByRole('log')).toContainText('"hello browser"');
  expect(requests.some((url) => url.includes('/api/command') || url.includes('/ws/metrics'))).toBe(false);
  await page.getByRole('searchbox').fill('security');
  await expect(page.locator('.lp-bento a')).toHaveCount(1);
  await expect(page.locator('.lp-bento a')).toHaveAttribute('href', '/security');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('.lp')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('.lp')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await page.getByRole('button', { name: 'Pause animations' }).click();
  await expect(page.locator('.lp')).toHaveAttribute('data-paused', 'true');
  await page.locator('#studio-preview').scrollIntoViewIfNeeded();
  await expect(page.locator('.lp-activity polyline')).toBeVisible();
  await expect(page.locator('.lp-activity .lp-trace-signal')).toHaveCSS('animation-name', 'none');
  const points = await page.locator('.lp-activity polyline').getAttribute('points');
  await page.waitForTimeout(2200);
  expect(await page.locator('.lp-activity polyline').getAttribute('points')).toBe(points);
  await page.getByText('Is it production-ready?', { exact: true }).click();
  await expect(page.getByText(/Treat this as a learning and portfolio-grade implementation/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('dark and light themes have no WCAG AA violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Redis demo command' }).waitFor();
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Toggle color theme' }).click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) }))).toEqual([]);
  }
});
test('reduced motion, keyboard palette, mobile menu and comparison route', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.lp')).toHaveAttribute('data-paused', 'true');
  if (isMobile) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('.lp-nav-links')).toBeVisible();
    await page.locator('.lp-nav-links').getByRole('link', { name: 'Features' }).click();
    await expect(page.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute('aria-expanded', 'false');
  }
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder(/Type a command, page name/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/compare/redis');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Inspired by Redis');
  await expect(page.getByRole('table')).toBeVisible();
});
test('prerendered content is useful without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL!);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('you can see inside.');
  await expect(page.locator('.lp-bento a')).toHaveCount(16);
  await expect(page.getByRole('table')).toBeVisible();
  await context.close();
});



test('existing security and configuration deep links keep the Studio shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('redisx_tour_completed', 'true'));
  for (const route of ['/security', '/config']) {
    await page.goto(route);
    await expect(page.locator('.lp')).toHaveCount(0);
    await expect(page.locator('aside')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(route);
  }
  expect(errors.filter((error) => /hydrat|Minified React error/.test(error))).toEqual([]);
});
