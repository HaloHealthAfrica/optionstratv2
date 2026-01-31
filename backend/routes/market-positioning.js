// Market positioning endpoint (demo data)
import express from 'express';
import { requireAuth } from '../lib/auth.js';

const router = express.Router();

function buildDemoPositioning(underlying, expiration) {
  const basePrice = underlying === 'SPY' ? 502.15 : underlying === 'QQQ' ? 438.2 : 190.5;
  return {
    underlying,
    expiration,
    put_call_ratio: {
      volume_ratio: 0.92,
      oi_ratio: 1.08,
      sentiment: "BULLISH",
      signal_strength: 62,
      call_volume: 124000,
      put_volume: 114000,
      call_oi: 210000,
      put_oi: 226800,
    },
    max_pain: {
      max_pain_strike: Math.round(basePrice),
      underlying_price: basePrice,
      distance_percent: ((Math.round(basePrice) - basePrice) / basePrice) * 100,
      direction: "AT_PRICE",
      bias: "NEUTRAL",
      magnet_strength: 48,
      strikes: [Math.round(basePrice) - 15, Math.round(basePrice), Math.round(basePrice) + 15],
      pain_values: [120, 200, 140],
    },
    gamma_exposure: {
      net_gex: 320000,
      dealer_position: "LONG_GAMMA",
      volatility_expectation: "SUPPRESSED",
      zero_gamma_level: Math.round(basePrice) - 5,
      support_levels: [Math.round(basePrice) - 10, Math.round(basePrice) - 5],
      resistance_levels: [Math.round(basePrice) + 5, Math.round(basePrice) + 12],
      strikes: [Math.round(basePrice) - 20, Math.round(basePrice), Math.round(basePrice) + 20],
      gex_by_strike: [120000, 160000, 40000],
    },
    recent_flow: [
      {
        id: "flow-1",
        strike: Math.round(basePrice),
        option_type: "CALL",
        side: "BUY",
        size: 2500,
        premium: 180000,
        execution_type: "SWEEP",
        sentiment: "BULLISH",
        is_golden_sweep: true,
        executed_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      },
      {
        id: "flow-2",
        strike: Math.round(basePrice) - 10,
        option_type: "PUT",
        side: "SELL",
        size: 1400,
        premium: 92000,
        execution_type: "BLOCK",
        sentiment: "NEUTRAL",
        is_golden_sweep: false,
        executed_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
    ],
    positioning_bias: "BULLISH",
    confidence: 64,
    insights: [
      "Call volume leads puts with moderate conviction.",
      "Dealer gamma positioning likely dampens volatility near spot.",
      "Max pain sits close to current price, reducing directional edge.",
    ],
    warnings: [],
    available_sources: ["DEMO", "OPTIONS_FLOW", "GEX"],
  };
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const underlying = (req.query.underlying || 'SPY').toString().toUpperCase();
    const expiration = (req.query.expiration || new Date().toISOString().slice(0, 10)).toString();
    const quick = req.query.quick === 'true';

    const data = buildDemoPositioning(underlying, expiration);

    if (quick) {
      return res.json({
        bias: data.positioning_bias,
        confidence: data.confidence,
        max_pain_strike: data.max_pain?.max_pain_strike,
        pc_ratio: data.put_call_ratio?.volume_ratio,
      });
    }

    return res.json(data);
  } catch (error) {
    console.error('[market-positioning] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
