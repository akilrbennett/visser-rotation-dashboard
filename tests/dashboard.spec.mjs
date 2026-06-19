// tests/dashboard.spec.mjs — Playwright assertions for the dashboard.
// Run against a static server: `bash scripts/preview.sh` (http://localhost:8080).
// (Verified during the build via the playwright-skill universal executor.)
import { test, expect } from '@playwright/test';
const URL = 'http://localhost:8080/index.html';
const rows = (page) => page.locator('[data-testid="ticker-rows"] tr');
const visible = (page) => page.locator('[data-testid="ticker-rows"] tr:not(.hidden)');
const chip = (page, g, v) => page.locator(`.chip[data-group="${g}"][data-val="${v}"]`);

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
  await expect(rows(page)).toHaveCount(71);
});

test('flags the unmapped P row', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('tr[data-unmapped="true"]')).toHaveCount(1);
});

test('graceful price degradation: foreign shows em dash', async ({ page }) => {
  await page.goto(URL);
  await expect(rows(page).filter({ hasText: 'IFX.DE' }).locator('td').last()).toHaveText('—');
});

test('listing filter: US hides foreign (54), Foreign shows 17', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'us', 'true').click();
  await expect(page.locator('[data-testid="ticker-rows"] tr[data-us="false"]:not(.hidden)')).toHaveCount(0);
  await expect(visible(page)).toHaveCount(54);
  await chip(page, 'us', 'false').click();
  await expect(visible(page)).toHaveCount(17);
});

test('rotation filter: IN shows 17', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'lane', 'in').click();
  await expect(visible(page)).toHaveCount(17);
});

test('theme filter: Semicon Architecture shows 18', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'theme', 'Semicon Architecture').click();
  await expect(visible(page)).toHaveCount(18);
});

test('basket filter: 25-name shows 25, 10-name shows 10', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'basket', '25').click();
  await expect(visible(page)).toHaveCount(25);
  await chip(page, 'basket', '10').click();
  await expect(visible(page)).toHaveCount(10);
});

test('combined filters intersect: Semicon + 25-name = 7', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'theme', 'Semicon Architecture').click();
  await chip(page, 'basket', '25').click();
  await expect(visible(page)).toHaveCount(7);
});

test('combined filters intersect: rotation IN + listing US = 11', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'lane', 'in').click();
  await chip(page, 'us', 'true').click();
  await expect(visible(page)).toHaveCount(11);
});

test('sort by score: descending puts max (100) first', async ({ page }) => {
  await page.goto(URL);
  await page.locator('th[data-sort="score"]').click(); // ascending
  await page.locator('th[data-sort="score"]').click(); // descending
  await expect(rows(page).first()).toHaveAttribute('data-score', '100');
});

test('US tickers link to a chart; foreign stay plain text', async ({ page }) => {
  await page.goto(URL);
  const nvda = rows(page).filter({ hasText: 'NVDA' }).first().locator('td.tkr a.tkr-link');
  await expect(nvda).toHaveAttribute('href', /tradingview\.com.*NVDA/);
  await expect(rows(page).filter({ hasText: 'IFX.DE' }).locator('td.tkr a')).toHaveCount(0);
});

test('WATCH-lane score deltas are neutral (no red/green)', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('[data-testid="lane-watch"] .delta.neutral').first()).toBeVisible();
  await expect(page.locator('[data-testid="lane-watch"] .delta.neg')).toHaveCount(0);
  await expect(page.locator('[data-testid="lane-watch"] .delta.pos')).toHaveCount(0);
});

test('a11y: mini-nav, scope=col headers, labeled All filters', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('.mininav a')).toHaveCount(5);
  await expect(page.locator('thead th[scope="col"]')).toHaveCount(7);
  await expect(chip(page, 'lane', 'all')).toHaveAttribute('aria-label', 'Rotation filter: All');
  await expect(chip(page, 'us', 'all')).toHaveAttribute('aria-label', 'Listing filter: All');
});

test('lane-card pending prices carry a tooltip', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('[data-testid="lane-in"] .nm-px span[title]').first()).toHaveAttribute('title', /pending/i);
});

test('every mini-nav anchor lands on its section heading', async ({ page }) => {
  await page.goto(URL);
  for (const id of ['rotation', 'themes-sec', 'action-queue-sec', 'baskets-sec', 'all-names']) {
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.locator(`.mininav a[href="#${id}"]`).click();
    await page.waitForTimeout(800);
    const top = await page.evaluate((i) => document.getElementById(i).getBoundingClientRect().top, id);
    expect(top, `${id} landing`).toBeGreaterThanOrEqual(35);
    expect(top, `${id} landing`).toBeLessThanOrEqual(85);
  }
});

test('mini-nav stays on one line at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(URL);
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(200);
  const tops = await page.$$eval('.mininav a', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});
