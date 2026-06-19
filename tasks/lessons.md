# Lessons — visser-rotation-dashboard

Patterns learned from corrections in this project. Review at session start; apply before touching anything.

## Project-specific facts (verified, not lessons-from-mistakes)
- This repo consumes exactly ONE file from the Cowork research project: the latest `rotation_<week>.json`, copied into `data/`. Never read the research project at runtime; never publish research PDFs/xlsx.
- The Massive/Polygon API key must NEVER appear in committed HTML/JS or the client. It lives only in the scheduler/CI environment. Only `data/prices.json` (`{ticker, close, date}`) is public.
- 17 of 71 tickers are non-US listings the US Polygon feed won't return (e.g. `000660.KS`, `4062.T`, `IFX.DE`, `AKE.PA`). The 54 US names work today.
- Data quirk: ticker `P` is "(not in current 100-universe)" with null theme/setup/score but appears in the 25-name basket. Handle gracefully — don't crash, don't render a fake row.

## Lessons (filled in as corrections arrive)
_(none yet)_
