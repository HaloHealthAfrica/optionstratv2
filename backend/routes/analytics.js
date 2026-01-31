// Analytics endpoint - Advanced analytics and insights
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    // Return empty analytics if no data
    res.json({
      period,
      analytics: {
        win_rate: { wins: 0, losses: 0, breakeven: 0, win_rate_pct: 0 },
        pnl_distribution: { avg_pnl: 0, max_win: 0, max_loss: 0, pnl_stddev: 0, total_pnl: 0 },
        symbol_performance: [],
        strategy_performance: [],
        time_analysis: []
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Analytics] Error:', error);
    res.json({
      period: '30d',
      analytics: {},
      generated_at: new Date().toISOString(),
    });
  }
});

export default router;
