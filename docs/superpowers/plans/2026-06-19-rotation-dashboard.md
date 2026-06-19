# AI Macro Nexus Rotation Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single self-contained HTML dashboard showing the AI Macro Nexus rotation (IN/OUT/WATCH week-over-week) plus each name's latest close, with a daily GitHub Actions cron that fetches closes server-side and a weekly local rotation sync.

**Architecture:** Static `index.html` (inline CSS/JS, zero runtime deps) `fetch()`es `data/rotation_latest.json` + `data/prices.json` at load and renders. A dependency-free Node script (`fetch_prices.mjs`) pulls current-day closes from Massive/Polygon (key in env only) and writes `data/prices.json`; a GitHub Actions cron runs it daily after close and commits the result. Pages serves the repo via deploy-from-branch, so the daily commit auto-republishes.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no CDN), Node 20 built-in `fetch` + `node --test`, Bash, GitHub Actions, GitHub Pages. Visual layer via the **ui-ux-pro-max** skill. Browser verification via the **playwright-skill**.

**Spec:** `docs/superpowers/specs/2026-06-19-rotation-dashboard-design.md`

**Authoritative data counts (used as test assertions):**
- Rotation lanes: **IN = 17** (`new_buyable`), **OUT = 21** (`lost_buyable` 12 + `fell_to_avoid` 9), **WATCH = 17** (`pullback` 5 + `became_extended` 2 + `improved_from_breakdown` 6 + `early_improvement` 2 + `constructive_not_buyable` 2)
- Themes (current week) = **6**; Action queue = **16**; Basket 10 = **10**; Basket 25 = **25**; Full ticker table = **71**

---

## Task 1: Project scaffolding & data

**Files:**
- Create: `data/rotation_latest.json` (copy of root `rotation_2026-06-12.json`)
- Create: `data/rotation_2026-06-12.json` (dated archive — same content)
- Create: `package.json`
- Create: `.nvmrc`

- [ ] **Step 1: Copy the rotation file into `data/` (working copy + archive)**

```bash
cd /Users/arb30/Developer/visser-rotation-dashboard
mkdir -p data
cp rotation_2026-06-12.json data/rotation_latest.json
cp rotation_2026-06-12.json data/rotation_2026-06-12.json
```

- [ ] **Step 2: Create `package.json`** (no dependencies; scripts only)

```json
{
  "name": "visser-rotation-dashboard",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "AI Macro Nexus stock-rotation dashboard",
  "scripts": {
    "test": "node --test",
    "fetch": "node scripts/fetch_prices.mjs",
    "preview": "bash scripts/preview.sh"
  }
}
```

- [ ] **Step 3: Create `.nvmrc`**

```
20
```

- [ ] **Step 4: Verify the data copy is valid JSON and has the expected universe**

Run (fs-based, works regardless of `type:module`):
```bash
node --input-type=module -e "import {readFileSync} from 'node:fs'; const r=JSON.parse(readFileSync('./data/rotation_latest.json','utf8')); console.log('us',r.price_feed.us_listed.length,'foreign',r.price_feed.foreign_listed.length,'tickers',r.tickers.length,'aq',r.action_queue.length)"
```
Expected: `us 54 foreign 17 tickers 71 aq 16`

- [ ] **Step 5: Commit**

```bash
git add data/ package.json .nvmrc
git commit -m "chore: scaffold data dir + package.json"
```

---

## Task 2: Price-fetch pure logic (TDD, `node --test`)

Build the testable core of the fetch script — pure functions with no network — driven by tests first.

**Files:**
- Create: `scripts/fetch_prices.mjs` (pure functions + `run()` orchestrator; `main()` added in Task 3)
- Test: `tests/fetch_prices.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/fetch_prices.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot, buildPricesJson, run } from '../scripts/fetch_prices.mjs';

test('parseSnapshot uses current-day close (day.c) + change_pct', () => {
  const snap = { tickers: [{ ticker: 'NVDA', day: { c: 210.69 }, prevDay: { c: 200 }, todaysChangePerc: 5.345 }] };
  const q = parseSnapshot(snap, '2026-06-19');
  assert.equal(q.NVDA.close, 210.69);
  assert.equal(q.NVDA.change_pct, 5.35);          // rounded to 2dp
  assert.equal(q.NVDA.date, '2026-06-19');
  assert.equal(q.NVDA.stale, undefined);
});

test('parseSnapshot falls back to prevDay.c when no session (day.c falsy) and flags stale', () => {
  const snap = { tickers: [{ ticker: 'MU', day: { c: 0 }, prevDay: { c: 150 } }] };
  const q = parseSnapshot(snap, '2026-06-19');
  assert.equal(q.MU.close, 150);
  assert.equal(q.MU.stale, true);
});

test('parseSnapshot skips tickers with no usable close', () => {
  const snap = { tickers: [{ ticker: 'X', day: {}, prevDay: {} }] };
  assert.equal(parseSnapshot(snap, '2026-06-19').X, undefined);
});

test('buildPricesJson sorts missing and sets metadata', () => {
  const out = buildPricesJson({ quotes: { NVDA: { close: 1 } }, missing: ['B', 'A'], asOf: '2026-06-19', fetchedAt: '2026-06-19T22:31:05Z' });
  assert.equal(out.as_of, '2026-06-19');
  assert.equal(out.fetched_at, '2026-06-19T22:31:05Z');
  assert.deepEqual(out.missing, ['A', 'B']);
  assert.equal(out.quotes.NVDA.close, 1);
});

test('run: US via snapshot, foreign best-effort, unresolved go to missing', async () => {
  const fake = async (path) => {
    if (path.startsWith('/v2/snapshot')) {
      return { tickers: [
        { ticker: 'NVDA', day: { c: 210.69 }, prevDay: { c: 200 }, todaysChangePerc: 5.3 },
        { ticker: 'MU', day: { c: 150 }, prevDay: { c: 140 }, todaysChangePerc: 1 },
      ] };
    }
    if (path === '/v2/aggs/ticker/4062.T/prev') return { results: [{ c: 5000 }] };
    throw new Error('HTTP 404');           // INTC not in snapshot, IFX.DE foreign miss
  };
  const out = await run({ usListed: ['NVDA', 'MU', 'INTC'], foreignListed: ['4062.T', 'IFX.DE'], fetchImpl: fake, asOf: '2026-06-19', fetchedAt: 't' });
  assert.equal(out.quotes.NVDA.close, 210.69);
  assert.equal(out.quotes['4062.T'].close, 5000);
  assert.equal(out.quotes['4062.T'].stale, true);
  assert.ok(out.missing.includes('INTC'));
  assert.ok(out.missing.includes('IFX.DE'));
  assert.ok(!out.missing.includes('4062.T'));
});

test('run: total US snapshot failure leaves all US missing, never throws', async () => {
  const fake = async () => { throw new Error('HTTP 500'); };
  const out = await run({ usListed: ['NVDA', 'MU'], foreignListed: [], fetchImpl: fake, asOf: '2026-06-19', fetchedAt: 't' });
  assert.deepEqual(out.missing, ['MU', 'NVDA']);
  assert.deepEqual(out.quotes, {});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test`
Expected: FAIL — `Cannot find module '../scripts/fetch_prices.mjs'` (or export-not-found).

- [ ] **Step 3: Implement the pure functions + `run()`**

```js
// scripts/fetch_prices.mjs
// Daily close fetcher for the AI Macro Nexus rotation dashboard.
// Pure functions + run() are dependency-free and unit-tested; main() (Task 3) wires real I/O.
// SECURITY: the API key travels only in an Authorization header and is NEVER logged.

export const DEFAULT_BASE = 'https://api.polygon.io';

/** Polygon snapshot -> { TICKER: {close, change_pct?, date, stale?} }. Uses current-day close (day.c). */
export function parseSnapshot(snapshotJson, asOf) {
  const quotes = {};
  const tickers = (snapshotJson && snapshotJson.tickers) || [];
  for (const t of tickers) {
    const sym = t && t.ticker;
    if (!sym) continue;
    const day = t.day || {};
    const prev = t.prevDay || {};
    let close = (typeof day.c === 'number' && day.c > 0) ? day.c : null;
    let stale = false;
    if (close === null && typeof prev.c === 'number' && prev.c > 0) { close = prev.c; stale = true; }
    if (close === null) continue;
    const q = { close, date: asOf };
    if (typeof t.todaysChangePerc === 'number') q.change_pct = Number(t.todaysChangePerc.toFixed(2));
    if (stale) q.stale = true;
    quotes[sym] = q;
  }
  return quotes;
}

export function buildPricesJson({ quotes, missing, asOf, fetchedAt }) {
  return {
    as_of: asOf,
    fetched_at: fetchedAt,
    source: 'Massive/Polygon snapshot (current-day close)',
    quotes,
    missing: [...missing].sort(),
  };
}

/** Orchestrates one US snapshot call + best-effort foreign prev-bar calls. fetchImpl(path)->json. Never throws. */
export async function run({ usListed = [], foreignListed = [], fetchImpl, asOf, fetchedAt }) {
  const quotes = {};
  const missing = [];
  try {
    const snap = await fetchImpl(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${usListed.join(',')}`);
    Object.assign(quotes, parseSnapshot(snap, asOf));
  } catch { /* non-fatal: all US fall through to missing */ }
  for (const sym of usListed) if (!quotes[sym]) missing.push(sym);
  for (const sym of foreignListed) {
    try {
      const j = await fetchImpl(`/v2/aggs/ticker/${sym}/prev`);
      const r = j && j.results && j.results[0];
      if (r && typeof r.c === 'number') quotes[sym] = { close: r.c, date: asOf, stale: true };
      else missing.push(sym);
    } catch { missing.push(sym); }
  }
  return buildPricesJson({ quotes, missing, asOf, fetchedAt });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch_prices.mjs tests/fetch_prices.test.mjs
git commit -m "feat: price-fetch pure logic with unit tests"
```

---

## Task 3: Fetch CLI wiring + sync + preview scripts

**Files:**
- Modify: `scripts/fetch_prices.mjs` (append `main()` + entrypoint guard)
- Create: `scripts/sync_rotation.sh`
- Create: `scripts/preview.sh`
- Test: `tests/sync_rotation.test.sh` (a runnable shell check)

- [ ] **Step 1: Append `main()` and the entrypoint guard to `scripts/fetch_prices.mjs`**

```js

// ---- CLI entrypoint (not exercised by unit tests) ----
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function makeFetchImpl(base, key) {
  return async (path) => {
    const res = await fetch(base + path, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.split('?')[0]}`); // path only, no key
    return res.json();
  };
}

async function main() {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) { console.error('ERROR: MASSIVE_API_KEY is not set.'); process.exit(1); }
  const base = process.env.MASSIVE_API_BASE || DEFAULT_BASE;
  const rotationUrl = new URL('../data/rotation_latest.json', import.meta.url);
  const rotation = JSON.parse(await readFile(rotationUrl, 'utf8'));
  const now = new Date();
  const out = await run({
    usListed: (rotation.price_feed && rotation.price_feed.us_listed) || [],
    foreignListed: (rotation.price_feed && rotation.price_feed.foreign_listed) || [],
    fetchImpl: makeFetchImpl(base, key),
    asOf: now.toISOString().slice(0, 10),
    fetchedAt: now.toISOString(),
  });
  await writeFile(new URL('../data/prices.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${Object.keys(out.quotes).length} quotes; ${out.missing.length} missing.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
```

- [ ] **Step 2: Confirm unit tests still pass (no entrypoint side effects on import)**

Run: `node --test`
Expected: PASS — importing the module must NOT run `main()` (guarded by `argv[1]` check).

- [ ] **Step 3: Confirm the CLI fails cleanly without a key (and never prints a key)**

Run: `MASSIVE_API_KEY= node scripts/fetch_prices.mjs; echo "exit=$?"`
Expected: prints `ERROR: MASSIVE_API_KEY is not set.` then `exit=1`.

- [ ] **Step 4: Create `scripts/sync_rotation.sh`** (copies newest from the Cowork project; `ROTATION_SRC` overridable for tests)

```bash
#!/usr/bin/env bash
# Weekly: copy the newest rotation_*.json from the Cowork research project into data/.
# Run locally (the GitHub Action has no access to this folder). Then commit + push.
set -euo pipefail

SRC="${ROTATION_SRC:-/Users/arb30/Documents/Claude/Projects/AI Thematic Research}"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

if [ ! -d "$SRC" ]; then
  echo "ERROR: source folder not found: $SRC" >&2
  echo "Set ROTATION_SRC to your 'AI Thematic Research' folder." >&2
  exit 1
fi

newest="$(ls -t "$SRC"/rotation_*.json 2>/dev/null | head -1 || true)"
if [ -z "$newest" ]; then
  echo "ERROR: no rotation_*.json found in $SRC" >&2
  exit 1
fi

cp "$newest" "$DEST_DIR/rotation_latest.json"
cp "$newest" "$DEST_DIR/$(basename "$newest")"   # keep a dated archive too
echo "Synced $(basename "$newest") -> data/rotation_latest.json"
echo "Next: git add data/ && git commit -m 'data: rotation $(basename "$newest")' && git push"
```

- [ ] **Step 5: Create `scripts/preview.sh`** (local static server so `fetch()` works off `http://`)

```bash
#!/usr/bin/env bash
# Local preview. file:// blocks fetch(), so serve over http.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8080}"
echo "Serving $ROOT at http://localhost:$PORT  (Ctrl-C to stop)"
cd "$ROOT"
exec python3 -m http.server "$PORT"
```

- [ ] **Step 6: Make scripts executable**

```bash
chmod +x scripts/sync_rotation.sh scripts/preview.sh
```

- [ ] **Step 7: Write + run a sync test against a temp fixture (verifies "newest wins")**

```bash
# tests/sync_rotation.test.sh
set -euo pipefail
tmp="$(mktemp -d)"
printf '{"old":true}\n' > "$tmp/rotation_2026-01-01.json"; sleep 1
printf '{"new":true}\n' > "$tmp/rotation_2026-06-12.json"
ROTATION_SRC="$tmp" bash scripts/sync_rotation.sh >/dev/null
grep -q '"new"' data/rotation_latest.json && echo "PASS: newest copied" || { echo "FAIL"; exit 1; }
# restore the real working copy (the test overwrote it)
cp data/rotation_2026-06-12.json data/rotation_latest.json
rm -rf "$tmp"
```
Run: `bash tests/sync_rotation.test.sh`
Expected: `PASS: newest copied`

- [ ] **Step 8: Commit**

```bash
git add scripts/ tests/sync_rotation.test.sh
git commit -m "feat: fetch CLI wiring + sync_rotation + preview scripts"
```

---

## Task 4: Dashboard data layer + functional skeleton

Build a working (unstyled) `index.html` whose inline JS loads the two JSON files and renders all sections with stable `data-testid` hooks. Styling comes in Task 5.

**Files:**
- Create: `index.html`
- Create: `tests/dashboard.spec.mjs` (Playwright assertions — run via playwright-skill)

- [ ] **Step 1: Create `index.html` with the complete data layer + render skeleton**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Macro Nexus — Rotation</title>
<style>
  /* Minimal baseline only — Task 5 (ui-ux-pro-max) owns the real visual design.
     Do NOT remove the data-testid attributes the tests rely on. */
  :root { --in:#1a7f37; --out:#cf222e; --watch:#9a6700; --bg:#0d1117; --fg:#e6edf3; --muted:#8b949e; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  main { max-width: 1100px; margin: 0 auto; padding: 16px; }
  .lane h2 { margin: 8px 0; }
  .lane[data-lane="in"] { color: var(--in); }
  .lane[data-lane="out"] { color: var(--out); }
  .lane[data-lane="watch"] { color: var(--watch); }
  .name { color: var(--fg); border-bottom: 1px solid #30363d; padding: 6px 0; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  table { width:100%; border-collapse: collapse; }
  th, td { text-align:left; padding:4px 8px; border-bottom:1px solid #30363d; font-size:14px; }
  .neg { color: var(--out); } .pos { color: var(--in); }
  .hidden { display:none; }
</style>
</head>
<body>
<main>
  <header>
    <h1>AI Macro Nexus — Rotation</h1>
    <p data-testid="week-stamp"></p>
    <p data-testid="model-tone"></p>
    <p data-testid="narrative"></p>
    <p data-testid="price-stamp"></p>
  </header>

  <section aria-label="Rotation">
    <div class="lane" data-lane="in"><h2>Rotating IN <span data-testid="count-in"></span></h2><div data-testid="lane-in"></div></div>
    <div class="lane" data-lane="out"><h2>Rotating OUT <span data-testid="count-out"></span></h2><div data-testid="lane-out"></div></div>
    <div class="lane" data-lane="watch"><h2>Watch <span data-testid="count-watch"></span></h2><div data-testid="lane-watch"></div></div>
  </section>

  <section aria-label="Themes"><h2>Themes — week over week</h2><div data-testid="themes"></div></section>
  <section aria-label="Action queue"><h2>This week's action queue</h2><div data-testid="action-queue"></div></section>
  <section aria-label="Baskets">
    <h2>Conviction baskets</h2>
    <div data-testid="basket-10"></div>
    <div data-testid="basket-25"></div>
  </section>
  <section aria-label="All names">
    <h2>All names</h2>
    <div data-testid="filters"></div>
    <table><thead><tr><th>Ticker</th><th>Company</th><th>Theme</th><th>Setup</th><th>Score</th><th>Basket</th><th>Close</th></tr></thead>
    <tbody data-testid="ticker-rows"></tbody></table>
  </section>

  <footer>
    <p data-testid="disclaimer"></p>
    <p data-testid="cadences"></p>
    <p data-testid="generated"></p>
  </footer>
</main>

<script type="module">
// ---------- Data layer (pure; exposed on window for tests) ----------
const IN_BUCKETS = ['new_buyable'];
const OUT_BUCKETS = ['lost_buyable', 'fell_to_avoid'];
const WATCH_BUCKETS = ['pullback', 'became_extended', 'improved_from_breakdown', 'early_improvement', 'constructive_not_buyable'];
const WATCH_LABELS = {
  pullback: 'Cooled into entry window',
  became_extended: "Hot — don't chase",
  improved_from_breakdown: 'Recovering off a base',
  early_improvement: 'Base building',
  constructive_not_buyable: 'Positive, not confirmed',
};

function bucketize(signalChanges) {
  const lane = (buckets) => buckets.flatMap((b) => (signalChanges[b] || []).map((n) => ({ ...n, _bucket: b })));
  return { in: lane(IN_BUCKETS), out: lane(OUT_BUCKETS), watch: lane(WATCH_BUCKETS) };
}

function priceFor(ticker, prices) {
  return prices && prices.quotes ? prices.quotes[ticker] : undefined;
}
function fmtClose(q) { return (q && typeof q.close === 'number') ? '$' + q.close.toFixed(2) : '—'; }
function fmtChange(q) {
  if (!q || typeof q.change_pct !== 'number') return '';
  return (q.change_pct >= 0 ? '+' : '') + q.change_pct.toFixed(2) + '%';
}
function isUnmapped(t) { return t && (t.theme === null || t.current_setup === null); }

// ---------- Rendering ----------
const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, html) => { const e = document.createElement(tag); Object.assign(e, props); if (html != null) e.innerHTML = html; return e; };

function renderHeader(meta, prices) {
  $('[data-testid="week-stamp"]').textContent = `Week of ${meta.current_week} vs. ${meta.previous_week}`;
  $('[data-testid="model-tone"]').textContent = meta.model_tone;
  $('[data-testid="narrative"]').textContent = (meta.research_context && meta.research_context.narrative) || '';
  const stamp = prices && prices.as_of ? `Prices as of ${prices.as_of}` : 'Prices pending — first fetch runs after the next close';
  $('[data-testid="price-stamp"]').textContent = stamp;
}

function nameCard(n, prices, bucketLabel) {
  const q = priceFor(n.ticker, prices);
  const chg = fmtChange(q);
  const transition = n.prev_setup ? `${n.prev_setup} → ${n.current_setup}` : (n.current_setup || '');
  const label = bucketLabel ? ` · ${bucketLabel}` : '';
  return el('div', { className: 'name' }, `
    <span class="mono"><strong>${n.ticker}</strong></span> · ${n.company} · <em>${n.theme || ''}</em>
    · ${transition}${label}
    · <span class="mono">${fmtClose(q)}</span> <span class="mono ${q && q.change_pct < 0 ? 'neg' : 'pos'}">${chg}</span>`);
}

function renderLane(testid, items, withLabel, prices) {
  const host = $(`[data-testid="${testid}"]`);
  host.innerHTML = '';
  items.forEach((n) => host.appendChild(nameCard(n, prices, withLabel ? WATCH_LABELS[n._bucket] : '')));
}

function renderThemes(themes) {
  const cur = themes[Object.keys(themes).sort().reverse()[0]] || [];
  const host = $('[data-testid="themes"]'); host.innerHTML = '';
  cur.forEach((t) => {
    const d = typeof t.score_change === 'number' ? `${t.score_change > 0 ? '+' : ''}${t.score_change}` : '—';
    host.appendChild(el('div', {}, `<strong>${t.theme}</strong> — ${t.score} (Δ ${d}) · ${t.pct_above_50d}% &gt;50d · ${t.status}`));
  });
}

function renderActionQueue(q) {
  const host = $('[data-testid="action-queue"]'); host.innerHTML = '';
  q.forEach((a) => host.appendChild(el('div', {}, `<span class="mono">${a.ticker}</span> · ${a.priority} · ${a.company} · ${a.setup} · ${a.suggested_action}`)));
}

function renderBasket(testid, basket, prices) {
  const host = $(`[data-testid="${testid}"]`); host.innerHTML = '';
  basket.forEach((b) => {
    const q = priceFor(b.ticker, prices);
    const company = b.company || '(unmapped)';
    host.appendChild(el('div', { className: 'name' }, `<span class="mono">${b.ticker}</span> · ${company} · ${b.setup || 'n/a'} · <span class="mono">${fmtClose(q)}</span>`));
  });
}

function renderTickerTable(tickers, prices) {
  const tb = $('[data-testid="ticker-rows"]'); tb.innerHTML = '';
  tickers.forEach((t) => {
    const q = priceFor(t.ticker, prices);
    const tr = el('tr');
    if (isUnmapped(t)) tr.dataset.unmapped = 'true';
    tr.dataset.us = String(t.us_listed);
    const company = isUnmapped(t) ? `${t.company} ⚠` : t.company;
    tr.innerHTML = `<td class="mono">${t.ticker}</td><td>${company}</td><td>${t.theme || '—'}</td>
      <td>${t.current_setup || '—'}</td><td>${t.current_score ?? '—'}</td><td>${(t.baskets||[]).join('/') || '—'}</td>
      <td class="mono">${fmtClose(q)}</td>`;
    tb.appendChild(tr);
  });
}

function renderFooter(meta) {
  $('[data-testid="disclaimer"]').textContent = meta.disclaimer;
  $('[data-testid="cadences"]').textContent = `Rotation: ${meta.cadences.rotation_data} · Prices: ${meta.cadences.close_prices}`;
  $('[data-testid="generated"]').textContent = `Generated ${meta.generated}`;
}

async function loadJson(path) {
  try { const r = await fetch(path, { cache: 'no-store' }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

async function main() {
  const rotation = await loadJson('./data/rotation_latest.json');
  const prices = await loadJson('./data/prices.json'); // may be null -> graceful "pending"
  if (!rotation) { document.body.innerHTML = '<main><p>Failed to load rotation data.</p></main>'; return; }
  const lanes = bucketize(rotation.signal_changes);
  renderHeader(rotation.meta, prices);
  renderLane('lane-in', lanes.in, false, prices);
  renderLane('lane-out', lanes.out, false, prices);
  renderLane('lane-watch', lanes.watch, true, prices);
  $('[data-testid="count-in"]').textContent = `(${lanes.in.length})`;
  $('[data-testid="count-out"]').textContent = `(${lanes.out.length})`;
  $('[data-testid="count-watch"]').textContent = `(${lanes.watch.length})`;
  renderThemes(rotation.themes);
  renderActionQueue(rotation.action_queue);
  renderBasket('basket-10', rotation.baskets['10_name'], prices);
  renderBasket('basket-25', rotation.baskets['25_name'], prices);
  renderTickerTable(rotation.tickers, prices);
  renderFooter(rotation.meta);
}

window.__nexus = { bucketize, fmtClose, fmtChange, isUnmapped };  // test hooks
main();
</script>
</body>
</html>
```

- [ ] **Step 2: Write the Playwright verification spec**

```js
// tests/dashboard.spec.mjs — run via the playwright-skill against http://localhost:8080
// Assumes `bash scripts/preview.sh` is running.
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
  // With no prices.json (or none for foreign), header shows pending OR a date; foreign row shows em dash
  const ifx = page.locator('tr', { hasText: 'IFX.DE' });
  await expect(ifx.locator('td').last()).toHaveText('—');
});
```

- [ ] **Step 3: Run the dashboard verification (skeleton state)**

Start the server, then drive Playwright via the **playwright-skill**:
```bash
bash scripts/preview.sh &   # serves http://localhost:8080
```
Run the spec (playwright-skill handles browser install/run). Expected: the four tests PASS against the unstyled skeleton (counts 17/21/17, 6/16/10/25/71, one unmapped row, foreign `—`). Stop the server when done.

- [ ] **Step 4: Commit**

```bash
git add index.html tests/dashboard.spec.mjs
git commit -m "feat: dashboard data layer + functional skeleton (verified counts)"
```

---

## Task 5: Visual design pass (ui-ux-pro-max)

Apply the real visual design to the working skeleton. This is a styling/markup-polish task — behavior and `data-testid` hooks are invariant.

**Files:**
- Modify: `index.html` (inline CSS + structural/presentational markup only)

- [ ] **Step 1: Invoke the ui-ux-pro-max skill** for a financial dashboard, dark theme, semantic IN/OUT/WATCH = green/amber/red, monospace numerics, strong hierarchy (hero rotation reads at a glance; tables stay calm). Stack: HTML/CSS (inline, no CDN).

- [ ] **Step 2: Restyle within these INVARIANTS (do not break the contract):**
  - Keep every `data-testid` attribute and the `tr[data-unmapped]` / `tr[data-us]` hooks.
  - Keep the three lanes labeled IN / OUT / WATCH and the WATCH sub-labels.
  - No external/CDN runtime deps — all CSS inline; system/`@font-face`-free or inline-data fonts only.
  - Numbers/tickers stay monospace and right-comparable.
  - Responsive: usable down to ~375px width.
  - Implement the `[data-testid="filters"]` chips (IN/OUT/WATCH/theme/basket/US-foreign) that toggle `.hidden` on `ticker-rows` rows.

- [ ] **Step 3: Re-run the Task 4 Playwright spec — all assertions still pass**

Expected: same 4 tests PASS (counts/hooks unchanged after styling).

- [ ] **Step 4: Add a filter test and run it**

```js
// append to tests/dashboard.spec.mjs
test('US/foreign filter hides foreign rows', async ({ page }) => {
  await page.goto('http://localhost:8080/index.html');
  await page.getByTestId('filters').getByText('US only', { exact: false }).click();
  await expect(page.locator('tr[data-us="false"]:not(.hidden)')).toHaveCount(0);
});
```
Expected: PASS.

- [ ] **Step 5: Visual confirmation** — screenshot at 1280px and 375px via playwright-skill; confirm the hero reads at a glance, color semantics are correct, nothing overflows.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/dashboard.spec.mjs
git commit -m "feat: visual design (ui-ux-pro-max) + table filters"
```

---

## Task 6: Daily cron workflow + Pages

**Files:**
- Create: `.github/workflows/prices.yml`

- [ ] **Step 1: Create `.github/workflows/prices.yml`**

```yaml
name: Daily Close Prices

on:
  schedule:
    - cron: '30 22 * * 1-5'   # ~settle buffer after US close (UTC); GitHub cron may lag a few min
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: prices
  cancel-in-progress: false

jobs:
  fetch-prices:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Fetch current-day closes
        env:
          MASSIVE_API_KEY: ${{ secrets.MASSIVE_API_KEY }}
          MASSIVE_API_BASE: ${{ vars.MASSIVE_API_BASE }}
        run: node scripts/fetch_prices.mjs
      - name: Commit prices if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/prices.json
          if git diff --staged --quiet; then
            echo "No price changes."
          else
            git commit -m "chore: daily close prices $(date -u +%F)"
            git push
          fi
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/prices.yml','utf8');if(!/cron: '30 22 \* \* 1-5'/.test(s))throw new Error('cron missing');if(!/MASSIVE_API_KEY/.test(s))throw new Error('secret missing');console.log('workflow ok')"
```
Expected: `workflow ok`
(If `python3` is available, also: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/prices.yml')); print('yaml valid')"`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/prices.yml
git commit -m "ci: daily close-price cron"
```

---

## Task 7: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# AI Macro Nexus — Rotation Dashboard

One link showing what's rotating **IN / OUT / WATCH** in the AI Macro Nexus model week-over-week, plus each name's latest close (refreshed daily after US market close).

- **Rotation data:** weekly. Run `scripts/sync_rotation.sh` locally to copy the newest `rotation_*.json` from the research project into `data/`, then commit.
- **Prices:** daily. A GitHub Actions cron runs `scripts/fetch_prices.mjs` after close and commits `data/prices.json`.
- The browser reads `data/*.json` only — it never calls the price API and never holds the API key.

## Local preview
```bash
bash scripts/preview.sh    # serves http://localhost:8080 (fetch() needs http, not file://)
```

## Weekly rotation refresh
```bash
ROTATION_SRC="/Users/arb30/Documents/Claude/Projects/AI Thematic Research" bash scripts/sync_rotation.sh
git add data/ && git commit -m "data: rotation <week>" && git push
```

## Daily prices
- Set repo secret **`MASSIVE_API_KEY`** (Settings → Secrets and variables → Actions).
- (Optional) set repo variable **`MASSIVE_API_BASE`** if Massive's base URL differs from `https://api.polygon.io`.
- The cron is `30 22 * * 1-5` UTC; trigger manually via the **Run workflow** button (workflow_dispatch).
- Run once locally to populate before the first cron: `MASSIVE_API_KEY=… node scripts/fetch_prices.mjs`.

## Hosting (GitHub Pages)
Settings → Pages → **Deploy from branch** → `main` / root. The daily prices commit auto-republishes.

## Foreign tickers
17 names are non-US listings (Tokyo, Paris, Seoul, …). The US feed won't return them, so they show **—** with their exchange labeled. The fetcher attempts them best-effort; if your Massive plan covers global exchanges (and the symbol format matches), prices appear automatically. To chase coverage, adjust the foreign symbol format in `scripts/fetch_prices.mjs` (`run()` foreign loop).

## Security
The API key lives only in the Actions secret / your local env. It is sent in an `Authorization` header and never logged, never committed, never in the client. Only `data/prices.json` (`{ticker, close, date}`) is public.

## Tests
```bash
node --test                     # fetch-script unit tests
bash tests/sync_rotation.test.sh
# Dashboard: start preview.sh, then run tests/dashboard.spec.mjs via Playwright
```

*Model framework only — NOT holdings, NOT investment advice.*
````

- [ ] **Step 2: Run the full automated test suite**

Run: `node --test && bash tests/sync_rotation.test.sh`
Expected: all unit tests PASS; `PASS: newest copied`.

- [ ] **Step 3: Full dashboard verification (all three price states)**

With `scripts/preview.sh` running, via playwright-skill confirm:
1. **No `data/prices.json`** → header "prices pending"; all closes `—`; counts still 17/21/17; table 71 rows.
2. **Sample `data/prices.json`** (create a temp file with a few US quotes incl. NVDA + change_pct, then re-load) → those rows show `$` price + colored %; foreign still `—`; header "Prices as of …".
3. Remove the temp sample so the repo ships in "pending" state (real prices arrive via cron/local fetch).

- [ ] **Step 4: Spec-coverage check** — confirm every spec §3–§6 item maps to a built artifact (IA sections, three-lane bucketing, runtime-fetch, graceful degradation, fetch script + contract, cron, sync, Pages). Note any gap in `tasks/todo.md` review section.

- [ ] **Step 5: Update `tasks/todo.md` review section + commit**

```bash
git add README.md tasks/todo.md
git commit -m "docs: README + final verification notes"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** §3 IA → Task 4/5; §4 lanes → Task 4 (counts 17/21/17 asserted); §5 runtime-fetch + degradation → Task 4; §6 fetch/contract/cron/sync/Pages → Tasks 2,3,6 + README; §7 visual → Task 5; §9 foreign best-effort → Task 2 `run()`; success criteria §10 → Task 7 verification. No gaps.
- **Placeholder scan:** none — all code blocks are complete and runnable; the only delegated piece (Task 5 visuals) is bounded by explicit invariants + re-run tests.
- **Type/name consistency:** `parseSnapshot`, `buildPricesJson`, `run({usListed,foreignListed,fetchImpl,asOf,fetchedAt})`, `bucketize`, `priceFor`, `fmtClose`, `fmtChange`, `isUnmapped`, and `data-testid` names are identical across Tasks 2/4/5/7 and the tests.
