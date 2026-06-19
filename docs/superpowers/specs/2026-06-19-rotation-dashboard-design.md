# AI Macro Nexus — Rotation Dashboard: Design Spec

**Date:** 2026-06-19
**Status:** Approved (brainstorming complete; ready for implementation plan)
**Source inputs:** `DASHBOARD_HANDOFF.md`, `rotation_2026-06-12.json` (both in repo root)

## 1. Purpose

A single, self-contained HTML dashboard for Jordi Visser's "AI Macro Nexus" stock-rotation model. Open one link and instantly see:

1. **What's rotating IN vs OUT** week-over-week (current week `2026-06-12` vs prior `2026-05-29`).
2. **Each name's latest close**, refreshed **daily after US market close**.

Two cadences, kept strictly separate:

| Layer | Updates | Source | Mechanism |
|---|---|---|---|
| Rotation data (themes, signal changes, action queue, baskets, tickers) | **Weekly** | `rotation_<week>.json` (from the Cowork research project) | `sync_rotation.sh` copies newest file into `data/`, committed |
| Close prices | **Daily, after close** | Massive / Polygon API | GitHub Actions cron runs `fetch_prices.mjs`, writes & commits `data/prices.json` |

The browser **never** calls the price API and **never** holds the API key (see §6).

## 2. Locked decisions (from brainstorming, 2026-06-19)

1. **Price-feed scope = ALL displayed names.** Fetch every US name (54) in one batch snapshot call — narrowing to a basket/queue saves no API cost but leaves rows priceless. Foreign per #2.
2. **Foreign 17 = attempt, else `—`.** Best-effort fetch of the 17 non-US tickers; any the plan won't return show `—` with their exchange labeled. Auto-fills if the Massive plan ever covers global exchanges — no code change. **No ADR mapping** (thin/illiquid, priced off the local close the model scores on → misleading).
3. **Hosting = GitHub Pages (deploy-from-branch) + a GitHub Actions cron** for the daily price fetch (key as an Actions secret).

## 3. Information architecture (top → bottom)

**Header** — Title "AI Macro Nexus — Rotation"; week-over-week stamp **"Week of Jun 12, 2026 vs. May 29"**; model-tone pill (*Constructive / Risk-On*, from `meta.model_tone`); one-line narrative (from `meta.research_context.narrative`, condensed); **"Prices as of <as_of>"** freshness stamp from `prices.json` (or "prices pending" if absent).

**§A — Rotation hero (three lanes).** The headline answer. See §4 for exact bucketing. Each name renders as a card/row showing: `TICKER` · company · theme tag · **setup transition** (`prev_setup → current_setup`) · score (+ Δ where available) · **latest close** (+ day % change when the feed provides it). Color-coded by lane.

**§B — Themes, week-over-week.** All 6 themes (`themes["2026-06-12"]` joined to `["2026-05-29"]`): score, Δ vs prior (arrow + value), % above 50-day, breakouts/breakdowns, status pill (*Leading / Constructive / Weakening / Breaking Down*). Conveys "every theme cooled this week."

**§C — This week's action queue.** The 16 ranked setups from `action_queue`: priority (High/Medium), ticker, company, theme, score, setup, signal_change, suggested_action. Ranked, scannable.

**§D — Conviction baskets.** `baskets.10_name` (10) and `baskets.25_name` (25): ticker, company, theme, score, current setup, prior setup, model action note.

**§E — All names (data tool).** All 71 from `tickers` in one **sortable, filterable** table: ticker, company, theme, prev→current setup, score, basket membership, close. Filter chips: IN / OUT / WATCH / by theme / by basket / US vs foreign.

**Footer** — Full disclaimer (`meta.disclaimer`), both cadence notes (`meta.cadences`), data sources, generated date (`meta.generated`).

## 4. IN / OUT / WATCH bucketing (APPROVED, tightened)

Maps the 8 `signal_changes` buckets into three lanes. **Green = exactly "just confirmed Buyable" — nothing borrowed.**

- **🟢 ROTATING IN** — `new_buyable` (17) **only**. Confirmed fresh buys.
- **🔴 ROTATING OUT** — `lost_buyable` (12) + `fell_to_avoid` (9). Clear deterioration.
- **🟡 WATCH / NUANCE** — everything directional-but-not-a-confirmed-buy and not a clear breakdown, **each sub-labeled by its bucket**:
  - `pullback` (5) — "cooled into entry window"
  - `became_extended` (2) — "hot — don't chase"
  - `improved_from_breakdown` (6) — "recovering off a base"
  - `early_improvement` (2) — "base building"
  - `constructive_not_buyable` (2) — "positive, not confirmed"

All 8 buckets placed; 55 names carry a signal change this week. Names without a bucket change appear only in §E (full table).

## 5. Technical architecture

**One self-contained `index.html`** — inline CSS + vanilla JS, **zero external/CDN runtime deps**. On load it `fetch()`es two local files and renders:

- `data/rotation_latest.json` — the weekly rotation (copy of the current `rotation_<week>.json`).
- `data/prices.json` — daily closes (contract in §6).

**Data flow:**
```
[weekly, run locally]  sync_rotation.sh → data/rotation_latest.json → git commit
[daily cron, Actions]  fetch_prices.mjs (key in env) → data/prices.json → git commit → Pages republishes
index.html             reads both → renders.  No key, no live API call in the browser.
```

**Graceful degradation (required):**
- Page renders **fully from rotation data even if `prices.json` is absent** (first deploy) — price cells show `—`, header shows "prices pending."
- Any ticker missing from the feed (all foreign by default) shows `—`; foreign rows additionally label the exchange (from `exchange_country`).
- The `P` quirk (`"(not in current 100-universe)"`, null theme/score, in 25-name basket) renders as a flagged "unmapped" row — never crashes, never fabricated.

**Why runtime-fetch (not inlined):** `index.html` stays static — the daily cron only touches the tiny `prices.json`, never the HTML (clean diffs; "regenerates cleanly as new `rotation_*.json` are added"). Trade-off: local preview needs a one-line static server (`scripts/preview.sh`), since `file://` blocks `fetch`. On Pages (HTTPS) it just works.

## 6. Price fetch, data contract, cron, hosting

**`scripts/fetch_prices.mjs`** — Node, **no dependencies** (built-in `fetch`).
- Reads env: `MASSIVE_API_KEY` (required), `MASSIVE_API_BASE` (default `https://api.polygon.io`). Auth via `Authorization: Bearer <key>` header (not query param) so the key never lands in a logged URL.
- Reads `data/rotation_latest.json` → `price_feed.us_listed` (54) and `price_feed.foreign_listed` (17) as the authoritative universe.
- **US: one Full Market Snapshot call** — `GET {BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=<54 csv>`. **Capture the CURRENT day's close = `day.c`** (the session that just closed), with `todaysChangePerc` as `change_pct`. Fall back to `prevDay.c` only if `day` is empty (holiday/no session), flagged.
- **Foreign: best-effort**, non-fatal. Attempt each via `GET {BASE}/v2/aggs/ticker/{TICKER}/prev`; record close if returned, else add to `missing`. Wrapped so one failure never aborts the run.
- **Never logs the key. Never fails the build on missing prices** — writes whatever it got. Non-zero exit only on catastrophic failure (no key / can't write file).

**`data/prices.json` contract:**
```json
{
  "as_of": "2026-06-19",
  "fetched_at": "2026-06-19T22:31:05Z",
  "source": "Massive/Polygon snapshot (current-day close)",
  "quotes": { "NVDA": { "close": 210.69, "change_pct": -1.23, "date": "2026-06-19" } },
  "missing": ["000660.KS", "4062.T", "..."]
}
```

**Cron — `.github/workflows/prices.yml`:** schedule `30 22 * * 1-5` UTC (settle buffer after the 20:00/21:00 UTC US close; GitHub cron is UTC and may lag a few min — fine for a daily close). `workflow_dispatch` for manual runs. `permissions: contents: write`. Steps: checkout → setup-node 20 → run script with `MASSIVE_API_KEY` secret (+ optional `MASSIVE_API_BASE` var) → commit `data/prices.json` if changed → push (which republishes Pages).

**`scripts/sync_rotation.sh`** — weekly, run locally. Copies the **newest** `rotation_*.json` from the Cowork research project into the repo:
```bash
SRC="/Users/arb30/Documents/Claude/Projects/AI Thematic Research"
cp "$(ls -t "$SRC"/rotation_*.json | head -1)" ./data/rotation_latest.json
```
This sync is **local only** — the GitHub Action has no access to the Cowork folder; it fetches prices, not rotation data.

**Pages** — deploy-from-branch (`main` / root). No deploy workflow; the daily prices commit auto-republishes. (Repo holds nothing sensitive: key is an Actions secret; research PDFs/xlsx are never committed.)

**`README.md`** — add the secret, run `sync_rotation.sh` weekly, preview locally, how the cron works, the foreign-ticker note, the "key never in the client" security note.

## 7. Visual direction

Focused, trustworthy financial dashboard — **dense but legible**, editorial-meets-terminal. Dark default; semantic green/amber/red for IN/WATCH/OUT; **monospace for tickers and numbers** so columns align; strong typographic hierarchy so the hero reads at a glance and tables stay calm. Actual palette, type pairing, and component styling are executed at build via the **ui-ux-pro-max** skill — pixels are not locked here.

## 8. Repo structure
```
visser-rotation-dashboard/
├── index.html                      # self-contained: inline CSS/JS
├── data/
│   ├── rotation_latest.json        # working copy of the weekly file
│   ├── rotation_2026-06-12.json    # dated archive
│   └── prices.json                 # written daily by the cron
├── scripts/
│   ├── fetch_prices.mjs            # daily price job (key in env)
│   ├── sync_rotation.sh            # weekly: Cowork rotation_*.json → data/
│   └── preview.sh                  # local static server
├── .github/workflows/prices.yml    # daily cron
├── tasks/                          # todo.md, lessons.md
├── docs/superpowers/specs/         # this spec
└── README.md
```

## 9. Open implementation risk (flagged, non-blocking)

The handoff verifies the **endpoints** but not Massive's exact **base URL / auth** nor the **symbol format** for foreign tickers (`4062.T` vs `TYO:4062` …). Handled defensively: base URL + auth are env-configurable; the foreign attempt is best-effort with graceful `—` fallback. The **expected baseline — all 54 US closes + 17 foreign as `—` — works regardless**; foreign prices light up automatically if the plan + symbol format cooperate. README documents what to tweak to chase foreign coverage later.

## 10. Success criteria

- Opening the page shows the three-lane IN/OUT/WATCH rotation, themes WoW, action queue, baskets, and a sortable/filterable 71-name table — rendered from `data/*.json`, no live API call, no key in source.
- Renders correctly with `prices.json` present, absent, and partial (foreign `—`).
- `fetch_prices.mjs` produces a valid `prices.json` (current-day closes for US names) and never leaks the key.
- Weekly refresh = drop a new `rotation_*.json` via `sync_rotation.sh` + commit; no HTML edit needed.
- Disclaimer + cadence footer present.
```
