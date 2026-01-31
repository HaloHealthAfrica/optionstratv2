// Market context endpoint (demo data)
import express from 'express';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

const demoContexts = [
  {
    ticker: "SPY",
    price: 502.15,
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    vix: 14.8,
    vix_regime: "LOW_VOL",
    market_bias: "BULLISH",
    or_breakout: "ABOVE",
    is_market_open: true,
    spy_trend: "BULLISH",
    moving_with_market: true,
    candle_pattern: "NONE",
  },
  {
    ticker: "QQQ",
    price: 438.2,
    updated_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    vix: 14.8,
    vix_regime: "LOW_VOL",
    market_bias: "NEUTRAL",
    or_breakout: "INSIDE",
    is_market_open: true,
    spy_trend: "BULLISH",
    moving_with_market: false,
    candle_pattern: "INSIDE_BAR",
  },
  {
    ticker: "AAPL",
    price: 190.5,
    updated_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    vix: 14.8,
    vix_regime: "LOW_VOL",
    market_bias: "BULLISH",
    or_breakout: "ABOVE",
    is_market_open: true,
    spy_trend: "BULLISH",
    moving_with_market: true,
    candle_pattern: "ENGULFING",
  },
];

router.get('/', requireAuth, async (req, res) => {
  try {
    const ticker = req.query.ticker ? req.query.ticker.toString().toUpperCase() : null;
    if (ticker) {
      const match = demoContexts.find((ctx) => ctx.ticker === ticker);
      return res.json(match || null);
    }

    const limit = parseInt(req.query.limit || "50", 10);
    res.json(demoContexts.slice(0, Number.isFinite(limit) ? limit : 50));
  } catch (error) {
    console.error('[market-context] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
