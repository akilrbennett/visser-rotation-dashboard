// scripts/fetch_prices.mjs
// Daily close fetcher for the AI Macro Nexus rotation dashboard.
// Pure functions + run() are dependency-free and unit-tested; main() wires real I/O.
// SECURITY: the API key travels only in an Authorization header and is NEVER logged.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

// ---- CLI entrypoint (not exercised by unit tests) ----

function makeFetchImpl(base, key) {
  return async (path) => {
    const res = await fetch(base + path, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.split('?')[0]}`); // path only, never the key
    return res.json();
  };
}

async function main() {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) { console.error('ERROR: MASSIVE_API_KEY is not set.'); process.exit(1); }
  const base = process.env.MASSIVE_API_BASE || DEFAULT_BASE;
  const rotation = JSON.parse(await readFile(new URL('../data/rotation_latest.json', import.meta.url), 'utf8'));
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
