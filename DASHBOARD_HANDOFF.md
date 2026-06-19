# AI Macro Nexus — Rotation Dashboard: Build Handoff

Prepared in Cowork for a **Claude Code + Superpowers** build session. Everything here is the
factual/architectural groundwork so the Superpowers brainstorming phase starts from solid ground
instead of re-deriving it.

**Status (2026-06-18):** Visser library fully indexed through today. Newest technical dashboard is
**2026-06-12** — rotation data in `rotation_2026-06-12.json` is current; there is no newer dashboard to load.
Latest research framing (folded into the JSON's `meta.research_context`): an *"AI mid-cycle slowdown"* —
a pullback inside a bull market, with rotation **out of** hyperscalers/Mag 7 and **into** memory,
advanced packaging, specialty chemicals/materials, and 800V industrial power (Vera Rubin "AI factory era").

## Quick start

Make a NEW repo in `~/Developer` (suggested: `~/Developer/visser-rotation-dashboard`), open the Claude
Code session **there** (Superpowers installed), and paste:

> Build me a single self-contained HTML dashboard for my AI Macro Nexus stock rotation — I open one
> link and see what's rotating IN vs OUT week-over-week, plus each name's latest close refreshed daily
> after market close. This is its own git repo. The data lives in my Cowork project — read these two
> files by absolute path first:
> `/Users/arb30/Documents/Claude/Projects/AI Thematic Research/DASHBOARD_HANDOFF.md` and
> `/Users/arb30/Documents/Claude/Projects/AI Thematic Research/rotation_2026-06-12.json`.
> Copy the rotation JSON into this repo's `data/` (don't read it from the project at runtime).
> Use your brainstorming skill to settle the open decisions with me, then write a plan, build, and run
> review + verify-before-completion. Don't jump straight to code.

That's the small version. Build location + data flow is in §0 below; the fuller prompt is in §7.

---

## 0. Where this builds — repo location + data flow

**Build location:** a standalone git repo in `~/Developer` (suggested `~/Developer/visser-rotation-dashboard`),
alongside your other toolkits. Do NOT build inside the Cowork project — that folder is cloud-synced and holds
research PDFs/xlsx you must never publish to a host.

**Two folders, one file between them:**

- **Cowork project** — `/Users/arb30/Documents/Claude/Projects/AI Thematic Research/` — the data/research brain.
  The `visser-weekly` skill regenerates `rotation_<week>.json` here whenever a new dashboard lands.
- **`~/Developer` repo** — the deployable app (HTML, price-fetch script, git, CI, deploy config). It consumes
  exactly one file from the project: the latest `rotation_<week>.json`.

Claude Code has full disk access, so it reads the project by absolute path — no folder mounting or "sharing" needed.

**Sync (one file only):** copy the newest rotation JSON into the repo, e.g. a `scripts/sync_rotation.sh`:

```bash
SRC="/Users/arb30/Documents/Claude/Projects/AI Thematic Research"
cp "$(ls -t "$SRC"/rotation_*.json | head -1)" ./data/rotation_latest.json
```

Run it after each weekly `visser-weekly` run, then commit + push. The daily price job lives in the repo and writes
`data/prices.json`. Commit only the app + `data/rotation_latest.json` + `data/prices.json` — never the research files.

---

## 1. What you're building

A single self-contained HTML dashboard that shows, at a glance:
- **What's rotating IN vs OUT** in Jordi Visser's AI Macro Nexus model, week over week.
- The **latest closing price** for each name in the list, refreshed **daily after market close**.

Two different data cadences — keep them separate:

| Layer | Updates | Source | Mechanism |
|---|---|---|---|
| Rotation data (themes, setups, baskets) | **Weekly** | `AI_Macro_Nexus_Master_Tracker.xlsx` → `rotation_*.json` | `visser-weekly` skill regenerates the JSON when a new dashboard lands |
| Close prices | **Daily, after close** | Massive / Polygon API | Scheduled job writes `prices.json` |

The page just reads those two JSON files. It does **not** call any API live from the browser (see §4).

---

## 2. Data file: `rotation_2026-06-12.json`

Already generated, sitting next to this doc. Contents (current week = 2026-06-12, prior = 2026-05-29):

- `meta` — week dates, model tone, disclaimer, cadence notes
- `themes` — both weeks, with score, Δ vs prior, % above 50-day, breakouts/breakdowns, status
- `action_queue` — 16 ranked setups for the current week
- `signal_changes` — bucketed: `new_buyable` (17), `lost_buyable` (12), `fell_to_avoid` (9), `pullback` (5), `improved_from_breakdown` (6), `became_extended` (2), etc.
- `baskets` — 10-name (10) and 25-name (25) with current setup + prior setup
- `tickers` — 71 unified names, each with theme, current setup, score, basket membership, and a price-feed flag
- `price_feed` — pre-split `us_listed` (54) vs `foreign_listed` (17)

To regenerate next week: re-run the same extraction against the tracker (the `nexus-update` skill
already owns this), bump the date in the filename, point the dashboard at the newest `rotation_*.json`.

---

## 3. Price feed — exact Massive/Polygon API (verified)

Massive wraps Polygon. Your account key authenticates the same REST endpoints.

**Single name — Previous Day Bar (OHLC):**
```
GET /v2/aggs/ticker/{TICKER}/prev
```
Verified response for NVDA (CSV form): `c` = close, `t` = epoch ms.
```
T,v,vw,o,c,h,l,t,n
NVDA,241272013,209.7577,207.33,210.69,211.39,206.5,1781812800000,2245367
```
`c` (210.69) is the close to display; `t` is the bar date.

**Batch — Full Market Snapshot (one call for all US names, better for the daily job):**
```
GET /v2/snapshot/locale/us/markets/stocks/tickers?tickers=NVDA,MU,DELL,INTC,...
```
Returns each ticker's day + previous-day close in a single request — use this for the scheduled
pull so it's one call, not 54.

**Coverage caveat — important:** 17 of the 71 names are **non-US listings** and the US feed will not
return them:
```
000660.KS (SK hynix), 4062.T (Ibiden), 4063.T (Shin-Etsu), 4186.T (TOK), 4203.T (Sumitomo Bakelite),
6146.T (Disco), 6526.T (Socionext), 6857.T (Advantest), AKE.PA (Arkema), BESI.AS (BE Semi),
HEN3.DE (Henkel), HO.PA (Thales), IFX.DE (Infineon), MRN.PA (Mersen), PRY.MI (Prysmian),
SOI.PA (Soitec), SU.PA (Schneider)
```
Options: (a) show "—" / "n/a" for these, (b) map to US ADRs where one exists, or (c) confirm whether
your Massive plan includes global exchanges. Decide this in brainstorming. The 54 US names work today.

---

## 4. Architecture — why it's a scheduled fetch, not a live browser call

A static page **cannot safely call Massive from the browser**: the API key would be visible in page
source to anyone who opens the link. So:

- The API key lives **only** in the build/scheduler environment (env var / CI secret). Never in the HTML or committed JS.
- A small fetch script (Node or Python) runs **once daily after close**, pulls closes for the US names, and writes a public `prices.json` containing only `{ticker, close, date}` — no secret.
- The dashboard loads `rotation_*.json` + `prices.json` and renders. Opening the link shows the last close with zero live API calls.

```
[daily cron] → fetch script (key in env) → prices.json ──┐
                                                          ├─→ static index.html (reads both) → your URL
[weekly]     → nexus-update → rotation_YYYY-MM-DD.json ───┘
```

---

## 5. Hosting — "does Claude Code host it?" No. It builds and deploys; the host runs the URL + cron.

Claude Code runs locally: it can scaffold everything and preview on a local server, but it does not
keep an always-on public URL or run daily crons. Pick a host for that:

**Option A — GitHub Pages + GitHub Actions (recommended: free, simple, version-controlled)**
- Static site on GitHub Pages.
- A scheduled GitHub Action (cron, e.g. `30 21 * * 1-5` ≈ after US close) runs the fetch script with the key stored as an **Actions secret**, writes `prices.json`, commits, Pages redeploys.
- Claude Code is strong at scaffolding the workflow file. No servers to manage.

**Option B — Netlify (good if you prefer Netlify; a Netlify connector is available here)**
- Host static on Netlify; key in a Netlify **environment variable**.
- A **Netlify Scheduled Function** runs daily to refresh prices (persist via Netlify Blobs, or trigger a build hook that runs the fetch at build time).
- Slightly more moving parts than A, fully managed, easy deploys.

Either way: **the Massive key stays server-side**; only `prices.json` is public.

---

## 6. Should you ideate here first, or let Superpowers do it?

Let **Superpowers** do the design/architecture ideation — its `brainstorming` skill is built for
exactly that and will interrogate tradeoffs (layout, which list drives the price feed, foreign-ticker
handling, host choice) better in-session. This doc gives it the *facts* so the brainstorm is about
decisions, not data archaeology. Don't over-specify the UI here; bring the intent + this doc.

---

## 7. Seed prompt for the Superpowers session

Paste this into Claude Code (with Superpowers installed) from inside the `AI Thematic Research` folder:

```
Build a single self-contained HTML dashboard for my "AI Macro Nexus" stock rotation. I want to
open one link and instantly see what's rotating IN vs OUT week-over-week, plus each name's most
recent closing price, refreshed daily after market close.

Use your brainstorming skill first to settle layout, scope, and the open decisions below; then
write a plan; then build; then run subagent code review and verify-before-completion. Don't jump
straight to code.

Read DASHBOARD_HANDOFF.md in this folder first — it has the data shape, the verified Massive/Polygon
price API, the foreign-ticker coverage caveat, the static-page-plus-scheduled-fetch architecture,
and the hosting options. Then:

- Rotation data: read rotation_2026-06-12.json (themes both weeks, signal_changes buckets,
  action_queue, baskets, tickers).
- Prices: design the daily fetch as a separate script that writes prices.json, with the Massive
  key in an env var / CI secret — never in the client. The page reads prices.json, no live API
  calls from the browser.
- Decisions to brainstorm with me: which list drives the price feed (25-name basket? action queue?
  full 71?), how to handle the 17 non-US tickers, and host = GitHub Pages + Actions cron vs Netlify
  scheduled function.

Constraints: one self-contained index.html (inline CSS/JS, no external runtime deps), regenerates
cleanly each week as new rotation_*.json files are added, and includes the model-disclaimer footer
from the JSON meta.
```

---

*Generated in Cowork from `AI_Macro_Nexus_Master_Tracker.xlsx`. Rotation figures are a model framework,
not Jordi Visser's holdings and not investment advice.*
