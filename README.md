# Dip-Reversion BTC Bot

[![btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/c/btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/c/btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/c/btc-race-24h-20261117-0603)

A trading bot for the make.fun bounty **"Race a BTC trading bot live for 24 hours"**
(`btc-race-24h-20261117-0603`). It trades Coinbase Wrapped BTC (cbBTC) against
USDC, one-minute bars, long only, starting from $1,000 of paper money.

## Strategy

BTC on this pool mostly chops sideways in a ~1–2% band, and a single minute's
move (~6 bps of noise) is far smaller than the ~26 bps a full round trip costs
in fees, slippage and price impact. So the bot does **not** chase breakouts or
EMA crosses — both lose money to whipsaw on the dev window. Instead:

1. **Buy the dip**: when the close falls at least **50 bps below its trailing
   6-hour (360-bar) mean**, and — once 12 hours of history exist — price is
   still at or above its trailing **12-hour (720-bar) mean**, so it stays out
   of real downtrends.
2. **Buy with all cash** (one position, long only, up to 100% of equity).
3. **Sell it all** at **+180 bps above the actual fill price** (take-profit)
   or **−150 bps below it** (hard stop-loss).

A handful of round trips a day, each needing a real ~2% swing to pay. Dev
grade on the frozen 24 h window: **about +$30 net PnL on $1,000, max drawdown
under 1%, 4 trades**. The same idea stays profitable across a wide
neighbourhood of nearby parameters (mean window 240–420 bars, dip 40–60 bps,
take-profit 120–180 bps), so it is not tuned to one lucky number.

## Layout

- `main.ts` — the bot (entrypoint, Node 22, erasable TypeScript only).
- `vendor/makefun-bars.ts` — the kit's `agent-fun/bars-replay/v1` SDK shim,
  copied byte for byte.

## Determinism

Pure integer (`bigint`) arithmetic on the bar closes. No clock, no
environment, no randomness. The same bars always produce the same orders.

## License

MIT — see [LICENSE](LICENSE).
