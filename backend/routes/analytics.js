// Analytics endpoint - Advanced analytics and insights
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { period = '30d', metric = 'all' } = req.query;

    // Calculate interval based on period
    const intervalMap = {
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days',
      '1y': '1 year',
    };
    const interval = intervalMap[period] || '30 days';

    const analytics = {};

    // Win rate analysis
    if (metric === 'all' || metric === 'winrate') {
      const winRate = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE pnl > 0) as wins,
          COUNT(*) FILTER (WHERE pnl < 0) as losses,
          COUNT(*) FILTER (WHERE pnl = 0) as breakeven,
          ROUND(
            (COUNT(*) FILTER (WHERE pnl > 0)::numeric / NULLIF(COUNT(*), 0)) * 100, 
            2
          ) as win_rate_pct
        FROM positions
        WHERE status = 'CLOSED'
          AND created_at > NOW() - INTERVAL '${interval}'
      `);
      analytics.win_rate = winRate.rows[0];
    }

    // PnL distribution
    if (metric === 'all' || metric === 'pnl') {
      const pnlDistribution = await query(`
        SELECT 
          AVG(pnl) as avg_pnl,
          MAX(pnl) as max_win,
          MIN(pnl) as max_loss,
          STDDEV(pnl) as pnl_stddev,
          SUM(pnl) as total_pnl
        FROM positions
        WHERE status = 'CLOSED'
          AND created_at > NOW() - INTERVAL '${interval}'
      `);
      analytics.pnl_distribution = pnlDistribution.rows[0];
    }

    // Symbol performance
    if (metric === 'all' || metric === 'symbols') {
      const symbolPerformance = await query(`
        SELECT 
          underlying as symbol,
          COUNT(*) as trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl,
          ROUND(
            (COUNT(*) FILTER (WHERE pnl > 0)::numeric / NULLIF(COUNT(*), 0)) * 100, 
            2
          ) as win_rate_pct
        FROM positions
        WHERE status = 'CLOSED'
          AND created_at > NOW() - INTERVAL '${interval}'
        GROUP BY underlying
        ORDER BY total_pnl DESC
        LIMIT 10
      `);
      analytics.symbol_performance = symbolPerformance.rows;
    }

    // Strategy performance
    if (metric === 'all' || metric === 'strategies') {
      const strategyPerformance = await query(`
        SELECT 
          metadata->>'source' as strategy,
          COUNT(*) as trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl,
          ROUND(
            (COUNT(*) FILTER (WHERE pnl > 0)::numeric / NULLIF(COUNT(*), 0)) * 100, 
            2
          ) as win_rate_pct
        FROM positions
        WHERE status = 'CLOSED'
          AND created_at > NOW() - INTERVAL '${interval}'
        GROUP BY metadata->>'source'
        ORDER BY total_pnl DESC
      `);
      analytics.strategy_performance = strategyPerformance.rows;
    }

    // Time-based analysis
    if (metric === 'all' || metric === 'time') {
      const timeAnalysis = await query(`
        SELECT 
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl
        FROM positions
        WHERE status = 'CLOSED'
          AND created_at > NOW() - INTERVAL '${interval}'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `);
      analytics.time_analysis = timeAnalysis.rows;
    }

    res.json({
      period,
      analytics,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Analytics] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
