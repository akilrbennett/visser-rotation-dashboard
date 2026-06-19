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
- [ ] Build, task-by-task (TDD where deterministic; ui-ux-pro-max for visuals):
  - [ ] Task 1: Scaffold data dir + package.json
  - [ ] Task 2: Price-fetch pure logic (node --test)
  - [ ] Task 3: Fetch CLI wiring + sync_rotation.sh + preview.sh
  - [ ] Task 4: Dashboard data layer + functional skeleton (Playwright counts)
  - [ ] Task 5: Visual design pass (ui-ux-pro-max) + filters
  - [ ] Task 6: Daily cron workflow (.github/workflows/prices.yml)
  - [ ] Task 7: README + final verification
- [ ] Review (requesting-code-review / code-review)
- [ ] Verify before completion (verification-before-completion skill)

## Review
_(filled in after build)_
