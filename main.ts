// Dip-reversion bot for the make.fun btc-race-24h-20261117-0603 bounty.
//
// Strategy (plain words): BTC on this pool spends most of its time chopping
// sideways in a ~1-2% band, and single-minute moves (~6 bps noise) are far
// smaller than the ~26 bps a full round trip costs in fees, slippage and
// price impact. So this bot does NOT chase breakouts or EMA crosses (both
// lose money to whipsaw on the dev window). Instead it:
//
//   1. Waits until price has dipped at least 50 bps below its trailing
//      6-hour (360-bar) mean close -- a genuine dip, not minute noise.
//   2. Only buys the dip when the longer trend is not against it: once
//      12 hours of history exist, price must also be at or above its
//      trailing 12-hour (720-bar) mean close. This keeps it out of the
//      middle of a real downtrend, where dip-buying bleeds.
//   3. Buys with all available cash (one position, long only, max 100%).
//   4. Sells the whole position when price rises 180 bps above the actual
//      fill price (take-profit), or falls 150 bps below it (hard stop-loss
//      that caps any single trade's loss).
//
// That is it: a handful of round trips a day, each needing a real ~2% swing
// to pay. On the dev window this makes about +$30 on $1,000 with max
// drawdown under 1%, and it stays profitable across a wide neighbourhood
// of nearby parameters (window 240-420 bars, dip 40-60 bps, take-profit
// 120-180 bps), so it is not tuned to one lucky number.
//
// Determinism: pure integer (bigint) arithmetic on the bar closes, no
// clock, no environment, no randomness. The same bars always produce the
// same orders.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Trailing windows, in 1-minute bars.
const MEAN_BARS = 360; // 6 hours: the dip is measured against this mean.
const LONG_BARS = 720; // 12 hours: the trend filter's mean.

// Entry: close at least this far below the 6h mean (basis points).
const DIP_BPS = 50n;
// Exit: take-profit / stop-loss measured from the actual fill price (bps).
const TAKE_PROFIT_BPS = 180n;
const STOP_LOSS_BPS = 150n;
// Generous slippage cap: worst single-minute move seen is ~45 bps, plus
// ~7 bps of own impact and 2 bps modelled slippage, so 300 bps never
// binds in practice but guards against an absurd gap.
const MAX_SLIPPAGE_BPS = 300;

const BPS = 10_000n;

// --- strategy state (one run, one history) ---------------------------------

const closes: bigint[] = [];
let entryPrice: bigint | null = null;

function sumLast(n: number): bigint {
  let s = 0n;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i]!;
  return s;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    // Warm-up batches cannot be traded on; any order would be rejected.
    if (state.warmingUp) return [];

    // Learn the actual fill price of any buy/sell that just landed, so
    // take-profit and stop-loss are measured from what we really paid.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') entryPrice = BigInt(fill.price);
      if (fill.side === 'sell') entryPrice = null;
    }

    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return []; // No bar this minute: nothing to decide on.
    const close = BigInt(bar.c);

    closes.push(close);
    if (closes.length > LONG_BARS) closes.shift();

    const position = state.positions.get(SYMBOL);
    const qty = position?.qty ?? 0n;

    // We hold a position but somehow have no fill price recorded (should not
    // happen): fall back to the current close as the reference.
    if (qty > 0n && entryPrice === null) entryPrice = close;

    if (qty === 0n) {
      // Flat: look for a dip worth buying.
      if (closes.length < MEAN_BARS) return []; // Not enough history yet.
      const mean = sumLast(MEAN_BARS) / BigInt(MEAN_BARS);
      // Trend filter: once 12h of history exists, skip the buy while price
      // sits below its 12h mean (a real downtrend, not a dip).
      if (closes.length >= LONG_BARS) {
        const longMean = sumLast(LONG_BARS) / BigInt(LONG_BARS);
        if (close < longMean) return [];
      }
      if (close * BPS <= mean * (BPS - DIP_BPS)) {
        const notional = state.cash < state.weightRoom(SYMBOL) ? state.cash : state.weightRoom(SYMBOL);
        if (notional <= 0n) return [];
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Holding: take-profit or stop-loss, measured from the fill price.
    if (entryPrice !== null) {
      if (close * BPS >= entryPrice * (BPS + TAKE_PROFIT_BPS)) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      if (close * BPS <= entryPrice * (BPS - STOP_LOSS_BPS)) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
