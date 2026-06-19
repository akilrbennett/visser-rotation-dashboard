# AI Macro Nexus — Rotation Dashboard

One link showing what's rotating **IN / OUT / WATCH** in the AI Macro Nexus model week-over-week, plus each name's latest close — refreshed daily after the US market close.

- **Rotation data** — *weekly.* Run `scripts/sync_rotation.sh` locally to copy the newest `rotation_*.json` from the research project into `data/`, then commit.
- **Prices** — *daily.* A GitHub Actions cron runs `scripts/fetch_prices.mjs` after close and commits `data/prices.json`.
- The browser reads `data/*.json` only — it **never** calls the price API and **never** holds the API key.

## What's on the page
- **Rotation hero** — three lanes: **IN** = just-confirmed Buyable (`new_buyable`), **OUT** = `lost_buyable` + `fell_to_avoid`, **WATCH** = pullbacks, extended, recovering, and not-yet-confirmed names (each sub-labeled).
- **Themes** week-over-week, **this week's action queue**, the **10/25-name conviction baskets**, and a **sortable, filterable table of all 71 names** (filter by rotation lane and US/foreign; sort by ticker or score).

## Local preview
```bash
bash scripts/preview.sh    # serves http://localhost:8080  (fetch() needs http, not file://)
```

## Weekly rotation refresh
```bash
# Default source is the Cowork "AI Thematic Research" folder; override with ROTATION_SRC if needed.
bash scripts/sync_rotation.sh
git add data/ && git commit -m "data: rotation <week>" && git push
```
This step is **local only** — the GitHub Action has no access to the research folder; it fetches prices, not rotation data.

## Daily prices
1. Add the repo secret **`MASSIVE_API_KEY`** (Settings → Secrets and variables → Actions).
2. *(Optional)* add the repo variable **`MASSIVE_API_BASE`** if Massive's base URL differs from `https://api.polygon.io`.
3. The cron is **`30 22 * * 1-5` UTC** (a settle buffer after the US close); trigger manually anytime via the **Run workflow** button (`workflow_dispatch`).
4. To populate before the first cron: `MASSIVE_API_KEY=… node scripts/fetch_prices.mjs`.

`data/prices.json` ships as a `pending` placeholder; the first fetch overwrites it. The page degrades gracefully — if a price is missing it shows `—`.

## Hosting (GitHub Pages)
Settings → Pages → **Deploy from branch** → `main` / root. The daily prices commit auto-republishes; the static `index.html` never changes between weekly rotation updates.

## Foreign tickers
17 names are non-US listings (Tokyo, Paris, Seoul, …). The US feed won't return them, so they show **—** with their exchange context. The fetcher attempts them best-effort; if your Massive plan covers global exchanges (and the symbol format matches), prices appear automatically. To chase coverage, adjust the foreign symbol handling in `scripts/fetch_prices.mjs` (the `run()` foreign loop).

## Security
The API key lives only in the Actions secret / your local env. It is sent in an `Authorization: Bearer` header, never logged, never committed, never in the client. Only `data/prices.json` (`{ticker, close, date}`) is public.

## Tests
```bash
node --test                        # fetch-script unit tests (pure logic, no network)
bash tests/sync_rotation.test.sh   # sync picks the newest rotation file (isolated)
# Dashboard (tests/dashboard.spec.mjs): start preview.sh, then run via Playwright.
```

## Layout
```
index.html                     self-contained dashboard (inline CSS/JS, no deps)
data/  rotation_latest.json    weekly rotation (working copy) + dated archive
       prices.json             daily closes (cron-written; pending placeholder shipped)
scripts/  fetch_prices.mjs     daily price job (key in env, Bearer auth)
          sync_rotation.sh     weekly: newest rotation_*.json -> data/
          preview.sh           local static server
.github/workflows/prices.yml   daily cron
docs/superpowers/              design spec + implementation plan
```

---
*Model framework only — NOT holdings, NOT investment advice.*
