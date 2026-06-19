// tests/dashboard.spec.mjs — Playwright assertions for the dashboard.
// Run against a static server: `bash scripts/preview.sh` (http://localhost:8080).
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8080/index.html';

test('renders three lanes with exact counts', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('count-in')).toHaveText('(17)');
  await expect(page.getByTestId('count-out')).toHaveText('(21)');
  await expect(page.getByTestId('count-watch')).toHaveText('(17)');
});

test('renders themes, action queue, baskets, full table', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('themes').locator('> div')).toHaveCount(6);
  await expect(page.getByTestId('action-queue').locator('> div')).toHaveCount(16);
  await expect(page.getByTestId('basket-10').locator('> div')).toHaveCount(10);
  await expect(page.getByTestId('basket-25').locator('> div')).toHaveCount(25);
  await expect(page.getByTestId('ticker-rows').locator('tr')).toHaveCount(71);
});

test('flags the unmapped P row', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('tr[data-unmapped="true"]')).toHaveCount(1);
});

test('graceful price degradation: foreign + missing show em dash', async ({ page }) => {
  await page.goto(URL);
  const ifx = page.locator('tr', { hasText: 'IFX.DE' });
  await expect(ifx.locator('td').last()).toHaveText('—');
});
