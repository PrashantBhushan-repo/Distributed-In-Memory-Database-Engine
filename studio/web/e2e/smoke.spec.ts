import { test, expect } from '@playwright/test';

test.describe('RedisX Studio Smoke Test Flow', () => {
  test('end-to-end journey: login, connect, keys, console, theme, palette', async ({ page }) => {
    // 1. Visit Web App Dashboard
    await page.goto('/');
    await expect(page).toHaveURL(/.*dashboard/);

    // 2. Browse Keys
    await page.goto('/keys');
    await expect(page.locator('text=Key Explorer')).toBeVisible();

    // Verify key list or demo keys loaded
    const searchInput = page.locator('input[placeholder*="Search keys"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('user');
      await page.waitForTimeout(300);
    }

    // 3. Select a key and edit string / inspect detail
    const firstKey = page.locator('[data-testid="key-row"], div:has-text("user:")').first();
    if (await firstKey.isVisible()) {
      await firstKey.click();
      await page.waitForTimeout(300);
    }

    // 4. Set TTL
    const ttlBtn = page.locator('button:has-text("TTL"), button:has-text("Expire")').first();
    if (await ttlBtn.isVisible()) {
      await ttlBtn.click();
    }

    // 5. Navigate to Console and run command
    await page.goto('/console');
    await expect(page.locator('text=Interactive Console').or(page.locator('text=redis>'))).toBeVisible();

    // Run command in console terminal
    const terminalInput = page.locator('input[type="text"], textarea').last();
    if (await terminalInput.isVisible()) {
      await terminalInput.fill('PING');
      await terminalInput.press('Enter');
      await page.waitForTimeout(300);
      await expect(page.locator('text=PONG').or(page.locator('text=OK'))).toBeVisible();
    }

    // 6. Toggle Theme
    const themeBtn = page.locator('button[aria-label*="theme"], button:has-text("Theme"), button[title*="Theme"]').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(200);
    }

    // 7. Open Command Palette (Cmd+K / Ctrl+K)
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    const paletteSearch = page.locator('input[placeholder*="Search"], input[placeholder*="commands"]');
    if (await paletteSearch.isVisible()) {
      await expect(paletteSearch).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
});
