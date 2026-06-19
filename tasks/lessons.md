# Lessons — visser-rotation-dashboard

Patterns learned from corrections in this project. Review at session start; apply before touching anything.

## Project-specific facts (verified, not lessons-from-mistakes)
- This repo consumes exactly ONE file from the Cowork research project: the latest `rotation_<week>.json`, copied into `data/`. Never read the research project at runtime; never publish research PDFs/xlsx.
- The Massive/Polygon API key must NEVER appear in committed HTML/JS or the client. It lives only in the scheduler/CI environment. Only `data/prices.json` (`{ticker, close, date}`) is public.
- 17 of 71 tickers are non-US listings the US Polygon feed won't return (e.g. `000660.KS`, `4062.T`, `IFX.DE`, `AKE.PA`). The 54 US names work today.
- Data quirk: ticker `P` is "(not in current 100-universe)" with null theme/setup/score but appears in the 25-name basket. Handle gracefully — don't crash, don't render a fake row.

## Lessons (filled in as corrections arrive)

- **Subagents can't run Bash in this environment.** A subagent-driven implementer wrote the files but couldn't run `node --test` or `git commit` (BLOCKED). Adapt: author + verify + commit in the main loop; reserve subagents for read-only review and parallel research, not test-and-commit implementation.
- **JS `toFixed` and `.xx5` floats:** `(5.345).toFixed(2)` → `"5.34"` (binary float stores it as 5.3449…). Never use `.xx5` inputs in rounding tests; pick unambiguous values (e.g. 5.367 → 5.37, which also distinguishes rounding from truncation).
- **`overflow-wrap:break-word` doesn't stop mid-word breaks when the column is too narrow for the word.** A squeezed flex column will still break a single long word. Fix the layout (let the row wrap / move siblings to their own line) so the text has room — don't just toggle wrap modes.
- **CSS `scroll-behavior:smooth` + `scroll-margin-top` can mis-land anchors** (one section landed ~400px off). A JS nav handler that computes `target.getBoundingClientRect().top + scrollY − fixedNavOffset` and calls `scrollTo` lands every anchor uniformly (add a `prefers-reduced-motion` → `behavior:'auto'` fallback).
- **Verify the rendered artifact in a real browser, not just the data.** Playwright (via playwright-skill) caught the prices.json 404 console line and confirmed exact lane counts/filters; a data-only check would have missed both.
