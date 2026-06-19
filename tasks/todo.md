# TODO — AI Macro Nexus Rotation Dashboard

## Current phase: BUILD (spec + plan approved; executing tasks)

### Decisions LOCKED (2026-06-19, via brainstorming):
1. **Price feed scope** = ALL shown names. Fetch all 54 US in one batch snapshot call (narrowing saves no API cost). Foreign per #2.
2. **Foreign 17** = ATTEMPT, else show "—". Best-effort fetch; graceful fallback; exchange labeled. Auto-fills if Massive plan covers global. NO ADR mapping (correctness risk).
3. **Hosting** = GitHub Pages + Actions. Cron Action runs fetch (key = Actions secret) → commits prices.json. Pages serves (deploy-from-branch, simplest).

### Design APPROVED (2026-06-19) with these refinements:
- **IN/OUT lanes (tightened):** IN = `new_buyable` ONLY (17 confirmed buys). OUT = `lost_buyable` + `fell_to_avoid`. WATCH = `pullback` + `became_extended` + `improved_from_breakdown` + `early_improvement` + `constructive_not_buyable` (each sub-labeled). Green = exactly "just confirmed Buyable."
- **sync_rotation.sh** copies newest from `/Users/arb30/Documents/Claude/Projects/AI Thematic Research/rotation_*.json` → `data/rotation_latest.json` (NOT repo-internal only).
- **Daily fetch = CURRENT day's close** via snapshot `day.c` (not prev-day bar). Cron = `30 22 * * 1-5` UTC (settle buffer).
- Runtime-fetch (not inlined), branch-serve Pages, vanilla JS no deps, graceful degradation, `P` rendered as flagged unmapped row.

## Plan
- [x] Brainstorm + lock the three decisions with the user
- [x] Write spec → `docs/superpowers/specs/2026-06-19-rotation-dashboard-design.md` (committed)
- [x] Write detailed plan → `docs/superpowers/plans/2026-06-19-rotation-dashboard.md`
- [x] Build, task-by-task (TDD where deterministic; ui-ux-pro-max for visuals):
  - [x] Task 1: Scaffold data dir + package.json (9ba2163)
  - [x] Task 2: Price-fetch pure logic — 6/6 node --test (65011c2)
  - [x] Task 3: Fetch CLI wiring + sync_rotation.sh + preview.sh (2483386)
  - [x] Task 4: Dashboard data layer + functional skeleton — Playwright counts (5f9e413)
  - [x] Task 5: Visual design pass (ui-ux-pro-max) + filters/sort (13fd71e)
  - [x] Task 6: Daily cron workflow (521fb9f)
  - [x] Task 7: README + final verification
- [ ] Independent code review (read-only subagent)
- [ ] verification-before-completion skill
- [ ] finishing-a-development-branch (merge build/dashboard → main)

## Review

### Execution note
Subagent-driven was chosen, but subagents in this env can't run Bash (Task 2 implementer
wrote files but couldn't test/commit). Adapted: I authored files inline from the plan,
ran ALL verification (tests/browser/commits) myself, with an independent read-only review
at the end. Built on branch `build/dashboard` (not main).

### Verification evidence (all green)
- `node --test` → 6/6 pass (parseSnapshot/buildPricesJson/run; current-day close, foreign best-effort, never-throw).
- `tests/sync_rotation.test.sh` → PASS (newest file copied; real data files untouched).
- Playwright (Chromium, real browser):
  - Counts: IN 17 / OUT 21 / WATCH 17; themes 6; action queue 16; baskets 10 + 25; table 71 rows.
  - Unmapped `P` row flagged (1). ARM in IN lane; AVGO in WATCH lane.
  - Graceful degradation: no `prices.json` → "pending" + all `—`; placeholder → same; sample → US `$close`, foreign `—`.
  - Filters: US → 54 visible / 0 foreign; Foreign → 17; rotation IN → 17. Sort score desc → top = 100. Zero page errors.
  - Responsive verified at 1440 / 375.
- `prices.yml` parsed + structure validated (cron 30 22 * * 1-5, contents:write, secret env, steps).

### Spec coverage (docs/.../2026-06-19-rotation-dashboard-design.md)
§1 purpose, §2 locked decisions, §3 IA, §4 IN/OUT/WATCH (verified counts), §5 self-contained +
runtime-fetch + graceful degradation + P quirk, §6 fetch/contract/cron/sync/Pages, §7 visual,
§8 repo structure, §9 foreign best-effort, §10 success criteria — all covered. No gaps.

### Deviations from plan (improvements, all verified)
- Fixed a `.xx5` float-edge in the change_pct test (5.345 → 5.367).
- Hardened the sync test so its fixture can't clobber the real dated archive.
- Ship a `pending` placeholder `data/prices.json` (eliminates a harmless 404; cron overwrites).
- Added click-to-sort columns alongside the planned filters (spec §E said "sortable").

### Follow-ups for the user (not blockers)
- Set the `MASSIVE_API_KEY` Actions secret; confirm Massive base URL / foreign symbol format.
- Enable Pages (deploy-from-branch, main/root) and push to a GitHub remote.
- Root `rotation_2026-06-12.json` + `DASHBOARD_HANDOFF.md` remain (harmless inputs; not republished secrets).
