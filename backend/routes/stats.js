// Stats endpoint - System statistics and metrics
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    // Get signal statistics
    const signalStats = await query(`
      SELECT 
        COUNT(*) as total_signals,
        COUNT(*) FILTER (WHERE status = 'EXECUTED') as executed_signals,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_signals,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as signals_24h
      FROM signals
    `);

    // Get position statistics
    const positionStats = await query(`
      SELECT 
        COUNT(*) as total_positions,
        COUNT(*) FILTER (WHERE status = 'OPEN') as open_positions,
        COUNT(*) FILTER (WHERE status = 'CLOSED') as closed_positions,
        COALESCE(SUM(pnl) FILTER (WHERE status = 'CLOSED'), 0) as total_pnl
      FROM positions
    `);

    // Get order statistics
    const orderStats = await query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'FILLED') as filled_orders,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending_orders,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as orders_24h
      FROM orders
    `);

    // Get recent performance
    const recentPerformance = await query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as trades,
        SUM(pnl) as daily_pnl
      FROM positions
      WHERE status = 'CLOSED'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `);

    res.json({
      signals: signalStats.rows[0],
      positions: positionStats.rows[0],
      orders: orderStats.rows[0],
      recent_performance: recentPerformance.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
