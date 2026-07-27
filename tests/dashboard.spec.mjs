// tests/dashboard.spec.mjs — Playwright assertions for the dashboard.
// Every expected count is derived from data/rotation_latest.json at run time, so a new
// rotation week can never make the suite stale. Run with `npm run test:e2e`; the config
// starts the static server for you.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const rotation = read('data/rotation_latest.json');
const prices = existsSync(join(ROOT, 'data/prices.json')) ? read('data/prices.json') : { quotes: {} };
const moves = existsSync(join(ROOT, 'data/disclosed_moves.json')) ? read('data/disclosed_moves.json') : null;

// These bucket lists mirror index.html. They are the one thing the suite cannot derive,
// because they define what "rotating in" means rather than describing the data.
const IN_BUCKETS = ['new_buyable'];
const OUT_BUCKETS = ['lost_buyable', 'fell_to_avoid'];
const WATCH_BUCKETS = ['pullback', 'became_extended', 'improved_from_breakdown', 'early_improvement', 'constructive_not_buyable'];
const MOVES_DEFAULT_DATES = 4;

const bucket = (names) => names.flatMap((b) => rotation.signal_changes[b] || []);
const lanes = { in: bucket(IN_BUCKETS), out: bucket(OUT_BUCKETS), watch: bucket(WATCH_BUCKETS) };
const laneOf = {};
for (const [name, items] of Object.entries(lanes)) items.forEach((n) => { laneOf[n.ticker] = name; });

const tickers = rotation.tickers;
const themesLatest = rotation.themes[Object.keys(rotation.themes).sort().reverse()[0]] || [];
const count = (fn) => tickers.filter(fn).length;
const inBasket = (t, b) => (t.baskets || []).includes(b);
const closeOf = (tk) => (prices.quotes && prices.quotes[tk] ? prices.quotes[tk].close : undefined);
const hasPrice = (tk) => typeof closeOf(tk) === 'number';

// Representative rows picked from the data rather than named literally.
const usTicker = tickers.find((t) => t.us_listed).ticker;
const foreignNoPrice = tickers.find((t) => !t.us_listed && !hasPrice(t.ticker)).ticker;
const topTheme = [...new Set(tickers.map((t) => t.theme).filter(Boolean))]
  .map((th) => ({ th, n: count((t) => t.theme === th) }))
  .sort((a, b) => b.n - a.n)[0];
const maxScore = Math.max(...tickers.map((t) => (typeof t.current_score === 'number' ? t.current_score : -Infinity)));
const expectedNavLinks = 5 + (moves && moves.moves && moves.moves.length ? 1 : 0);

const URL = '/index.html';
const rows = (page) => page.locator('[data-testid="ticker-rows"] tr');
const visible = (page) => page.locator('[data-testid="ticker-rows"] tr:not(.hidden)');
const chip = (page, g, v) => page.locator(`.chip[data-group="${g}"][data-val="${v}"]`);

test('three lanes carry the counts the rotation JSON implies', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('count-in')).toHaveText(`(${lanes.in.length})`);
  await expect(page.getByTestId('count-out')).toHaveText(`(${lanes.out.length})`);
  await expect(page.getByTestId('count-watch')).toHaveText(`(${lanes.watch.length})`);
});

test('window stamp matches the rotation meta', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('week-stamp'))
    .toHaveText(`${rotation.meta.current_week} vs. ${rotation.meta.previous_week}`);
});

test('themes, action queue, baskets and table all match the data', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('themes').locator('> div')).toHaveCount(themesLatest.length);
  await expect(page.getByTestId('action-queue').locator('> div')).toHaveCount(rotation.action_queue.length);
  await expect(page.getByTestId('basket-10').locator('> div')).toHaveCount(rotation.baskets['10_name'].length);
  await expect(page.getByTestId('basket-25').locator('> div')).toHaveCount(rotation.baskets['25_name'].length);
  await expect(rows(page)).toHaveCount(tickers.length);
});

test('flags exactly the unmapped rows', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('tr[data-unmapped="true"]'))
    .toHaveCount(count((t) => t.theme === null || t.current_setup === null));
});

test('graceful price degradation: a foreign name with no quote shows an em dash', async ({ page }) => {
  await page.goto(URL);
  await expect(rows(page).filter({ hasText: foreignNoPrice }).locator('td').last()).toHaveText('—');
});

test('listing filter splits US and foreign as the data does', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'us', 'true').click();
  await expect(page.locator('[data-testid="ticker-rows"] tr[data-us="false"]:not(.hidden)')).toHaveCount(0);
  await expect(visible(page)).toHaveCount(count((t) => t.us_listed));
  await chip(page, 'us', 'false').click();
  await expect(visible(page)).toHaveCount(count((t) => !t.us_listed));
});

test('rotation filter shows the IN cohort', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'lane', 'in').click();
  await expect(visible(page)).toHaveCount(count((t) => laneOf[t.ticker] === 'in'));
});

test('theme filter shows that theme only', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'theme', topTheme.th).click();
  await expect(visible(page)).toHaveCount(topTheme.n);
});

test('basket filter shows each basket', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'basket', '25').click();
  await expect(visible(page)).toHaveCount(count((t) => inBasket(t, '25')));
  await chip(page, 'basket', '10').click();
  await expect(visible(page)).toHaveCount(count((t) => inBasket(t, '10')));
});

test('combined filters intersect: top theme plus 25-name', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'theme', topTheme.th).click();
  await chip(page, 'basket', '25').click();
  await expect(visible(page)).toHaveCount(count((t) => t.theme === topTheme.th && inBasket(t, '25')));
});

test('combined filters intersect: rotation IN plus US listing', async ({ page }) => {
  await page.goto(URL);
  await chip(page, 'lane', 'in').click();
  await chip(page, 'us', 'true').click();
  await expect(visible(page)).toHaveCount(count((t) => laneOf[t.ticker] === 'in' && t.us_listed));
});

test('sort by score descending puts the data max first', async ({ page }) => {
  await page.goto(URL);
  await page.locator('th[data-sort="score"]').click(); // ascending
  await page.locator('th[data-sort="score"]').click(); // descending
  await expect(rows(page).first()).toHaveAttribute('data-score', String(maxScore));
});

test('US tickers link to a chart; foreign stay plain text', async ({ page }) => {
  await page.goto(URL);
  const link = rows(page).filter({ hasText: usTicker }).first().locator('td.tkr a.tkr-link');
  await expect(link).toHaveAttribute('href', new RegExp(`tradingview\\.com.*${usTicker}`));
  await expect(rows(page).filter({ hasText: foreignNoPrice }).locator('td.tkr a')).toHaveCount(0);
});

test('WATCH-lane score deltas are neutral, never red or green', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('[data-testid="lane-watch"] .delta.neutral').first()).toBeVisible();
  await expect(page.locator('[data-testid="lane-watch"] .delta.neg')).toHaveCount(0);
  await expect(page.locator('[data-testid="lane-watch"] .delta.pos')).toHaveCount(0);
});

test('a11y: mini-nav, scope=col headers, labeled All filters', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('.mininav a:not(.hidden)')).toHaveCount(expectedNavLinks);
  await expect(page.locator('thead th[scope="col"]')).toHaveCount(7);
  await expect(chip(page, 'lane', 'all')).toHaveAttribute('aria-label', 'Rotation filter: All');
  await expect(chip(page, 'us', 'all')).toHaveAttribute('aria-label', 'Listing filter: All');
});

test('lane-card pending prices carry a tooltip', async ({ page }) => {
  test.skip(!lanes.in.some((n) => !hasPrice(n.ticker)), 'every IN name has a price today');
  await page.goto(URL);
  await expect(page.locator('[data-testid="lane-in"] .nm-px span[title]').first())
    .toHaveAttribute('title', /pending/i);
});

// Smooth scrolling takes longer the further it travels, so wait for the position to stop
// changing rather than for a fixed delay. A fixed wait measures mid-animation and reports
// a landing failure that is really just an unfinished scroll.
async function settleScroll(page, timeout = 6000) {
  const deadline = Date.now() + timeout;
  let prev = null;
  while (Date.now() < deadline) {
    const y = await page.evaluate(() => window.scrollY);
    if (prev !== null && Math.abs(y - prev) < 0.5) return y;
    prev = y;
    await page.waitForTimeout(100);
  }
  return prev;
}

test('every mini-nav anchor lands on its section heading', async ({ page }) => {
  await page.goto(URL);
  const ids = await page.$$eval('.mininav a:not(.hidden)', (els) =>
    els.map((a) => a.getAttribute('href').slice(1)));
  expect(ids.length).toBe(expectedNavLinks);
  for (const id of ids) {
    await page.evaluate(() => window.scrollTo(0, 600));
    await settleScroll(page);
    await page.locator(`.mininav a[href="#${id}"]`).click();
    await settleScroll(page);
    const { top, atEnd } = await page.evaluate((i) => {
      const el = document.getElementById(i);
      const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      return { top: el.getBoundingClientRect().top, atEnd: window.scrollY >= max - 1 };
    }, id);
    // A section short enough to sit at the document end cannot reach the offset.
    if (atEnd) continue;
    expect(top, `${id} landing`).toBeGreaterThanOrEqual(35);
    expect(top, `${id} landing`).toBeLessThanOrEqual(85);
  }
});

test('mini-nav stays on one line at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(URL);
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(200);
  const tops = await page.$$eval('.mininav a:not(.hidden)', (els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});

// ---------- Linear theme ----------

test('Inter is self-hosted, same-origin, and actually shapes the text', async ({ page }) => {
  const fontHits = [];
  const offOrigin = [];
  page.on('response', (r) => {
    if (/\.woff2?($|\?)/i.test(r.url())) fontHits.push({ url: r.url(), status: r.status() });
  });
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('http://localhost:8080/') && !u.startsWith('data:')) offOrigin.push(u);
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  expect(fontHits, 'the subsetted woff2 was requested').toHaveLength(1);
  expect(fontHits[0].status).toBe(200);
  expect(fontHits[0].url).toContain('/fonts/InterVariable-subset.woff2');
  expect(offOrigin, 'no off-origin requests').toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('510 16px "Inter Variable"'))).toBe(true);

  // Width probe: the page stack must measure as Inter, not as the system fallback.
  const w = await page.evaluate(() => {
    const probe = (family) => {
      const s = document.createElement('span');
      s.textContent = 'Rotating In Watch 0123456789';
      s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:48px;font-family:${family}`;
      document.body.appendChild(s);
      const width = s.getBoundingClientRect().width;
      s.remove();
      return width;
    };
    return { stack: probe(getComputedStyle(document.body).fontFamily), inter: probe('"Inter Variable"'), system: probe('system-ui') };
  });
  expect(w.stack).toBeCloseTo(w.inter, 1);
  expect(Math.abs(w.stack - w.system)).toBeGreaterThan(0.5);
});

test('no readable text is left on the retired Ash tier', async ({ page }) => {
  await page.goto(URL);
  const ash = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.textContent.trim()) continue;
      if (getComputedStyle(el).color === 'rgb(98, 102, 109)') hits.push(el.className || el.tagName);
    }
    return hits;
  });
  expect(ash, 'elements still painting text in Ash #62666d').toEqual([]);
});

test('empty header chrome collapses instead of rendering an empty box', async ({ page }) => {
  await page.goto(URL);
  const tone = (rotation.meta.model_tone || '').trim();
  const narrative = ((rotation.meta.research_context || {}).narrative || '').trim();
  await expect(page.getByTestId('model-tone')).toBeHidden({ visible: !!tone });
  if (tone) await expect(page.getByTestId('model-tone')).toHaveText(tone);
  if (narrative) {
    await expect(page.getByTestId('macro-frame')).toBeVisible();
    await expect(page.getByTestId('narrative')).toHaveText(narrative);
  } else {
    await expect(page.getByTestId('macro-frame')).toBeHidden();
  }
});

// ---------- Disclosed moves ----------

test('disclosed moves panel matches its JSON, or hides when there is none', async ({ page }) => {
  await page.goto(URL);
  const section = page.locator('#disclosed-moves-sec');
  if (!moves || !moves.moves || !moves.moves.length) {
    await expect(section).toBeHidden();
    return;
  }
  const dates = [...new Set(moves.moves.map((m) => m.date))].sort().reverse();
  const shown = dates.slice(0, MOVES_DEFAULT_DATES);
  const rowsInShown = moves.moves.filter((m) => shown.includes(m.date)).length;

  await expect(section).toBeVisible();
  await expect(page.locator('[data-testid="moves"] .mv-group')).toHaveCount(shown.length);
  await expect(page.locator('[data-testid="moves"] .mv-row')).toHaveCount(rowsInShown);
  await expect(page.locator('[data-testid="moves"] .mv-date').first()).toContainText(dates[0]);
});

test('show-all reveals every date, and collapsing returns to the default', async ({ page }) => {
  test.skip(!moves || !moves.moves.length, 'no disclosed moves data');
  const dates = [...new Set(moves.moves.map((m) => m.date))];
  test.skip(dates.length <= MOVES_DEFAULT_DATES, 'not enough dates to toggle');

  await page.goto(URL);
  const groups = page.locator('[data-testid="moves"] .mv-group');
  const toggle = page.getByTestId('moves-toggle');
  await expect(toggle).toHaveText(`Show all ${dates.length} dates`);
  await toggle.click();
  await expect(groups).toHaveCount(dates.length);
  await expect(page.locator('[data-testid="moves"] .mv-row')).toHaveCount(moves.moves.length);
  await toggle.click();
  await expect(groups).toHaveCount(MOVES_DEFAULT_DATES);
});

test('medium-confidence rows are de-emphasised but present, and quotes expand', async ({ page }) => {
  test.skip(!moves || !moves.moves.length, 'no disclosed moves data');
  await page.goto(URL);
  const dates = [...new Set(moves.moves.map((m) => m.date))].sort().reverse().slice(0, MOVES_DEFAULT_DATES);
  const shownMoves = moves.moves.filter((m) => dates.includes(m.date));
  const mediums = shownMoves.filter((m) => m.confidence === 'medium').length;
  await expect(page.locator('[data-testid="moves"] .mv-row.dim')).toHaveCount(mediums);

  if (mediums) {
    // Dimming steps down the text ramp; it must not be an opacity fade.
    const dim = page.locator('[data-testid="moves"] .mv-row.dim').first();
    await expect(dim).toHaveCSS('opacity', '1');
    const dimColor = await dim.locator('.mv-asset').evaluate((e) => getComputedStyle(e).color);
    const liveColor = await page.locator('[data-testid="moves"] .mv-row:not(.dim) .mv-asset').first()
      .evaluate((e) => getComputedStyle(e).color);
    expect(dimColor).not.toBe(liveColor);
  }

  const first = page.locator('[data-testid="moves"] .mv-row').first();
  await expect(first.locator('.mv-quote')).toBeHidden();
  await first.locator('summary').click();
  await expect(first.locator('.mv-quote')).toBeVisible();
  await expect(first.locator('.mv-quote')).toHaveText(shownMoves[0].quote);
});
