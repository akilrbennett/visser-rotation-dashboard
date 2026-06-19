// tests/dashboard.spec.mjs — Playwright assertions for the dashboard.
// Run against a static server: `bash scripts/preview.sh` (http://localhost:8080).
// (Verified during the build via the playwright-skill universal executor.)
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8080/index.html';

test('three lanes with exact counts', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('count-in')).toHaveText('(17)');
  await expect(page.getByTestId('count-out')).toHaveText('(21)');
  await expect(page.getByTestId('count-watch')).toHaveText('(17)');
});

test('themes, action queue, baskets, full table', async ({ page }) => {
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

test('graceful price degradation: foreign shows em dash', async ({ page }) => {
  await page.goto(URL);
  const ifx = page.locator('tr', { hasText: 'IFX.DE' });
  await expect(ifx.locator('td').last()).toHaveText('—');
});

test('listing filter: US hides foreign (54 visible), Foreign shows 17', async ({ page }) => {
  await page.goto(URL);
  const listing = page.locator('.fgroup', { hasText: 'Listing' });
  await listing.getByRole('button', { name: 'US', exact: true }).click();
  await expect(page.locator('[data-testid="ticker-rows"] tr[data-us="false"]:not(.hidden)')).toHaveCount(0);
  await expect(page.locator('[data-testid="ticker-rows"] tr:not(.hidden)')).toHaveCount(54);
  await listing.getByRole('button', { name: 'Foreign', exact: true }).click();
  await expect(page.locator('[data-testid="ticker-rows"] tr:not(.hidden)')).toHaveCount(17);
});

test('rotation filter: IN shows 17', async ({ page }) => {
  await page.goto(URL);
  await page.locator('.fgroup', { hasText: 'Rotation' }).getByRole('button', { name: 'IN', exact: true }).click();
  await expect(page.locator('[data-testid="ticker-rows"] tr:not(.hidden)')).toHaveCount(17);
});

test('sort by score: descending puts max (100) first', async ({ page }) => {
  await page.goto(URL);
  await page.locator('th[data-sort="score"]').click(); // ascending
  await page.locator('th[data-sort="score"]').click(); // descending
  await expect(page.locator('[data-testid="ticker-rows"] tr').first()).toHaveAttribute('data-score', '100');
});
