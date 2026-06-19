// tests/fetch_prices.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot, buildPricesJson, run } from '../scripts/fetch_prices.mjs';

test('parseSnapshot uses current-day close (day.c) + change_pct', () => {
  const snap = { tickers: [{ ticker: 'NVDA', day: { c: 210.69 }, prevDay: { c: 200 }, todaysChangePerc: 5.367 }] };
  const q = parseSnapshot(snap, '2026-06-19');
  assert.equal(q.NVDA.close, 210.69);
  assert.equal(q.NVDA.change_pct, 5.37);          // rounded to 2dp (5.367 -> 5.37, not truncated to 5.36)
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
