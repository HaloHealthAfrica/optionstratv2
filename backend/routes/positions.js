// Positions endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const showClosed = req.query.show_closed === 'true';
    const params = [];
    let sql = 'SELECT * FROM refactored_positions';

    if (!showClosed) {
      sql += ' WHERE status = $1';
      params.push('OPEN');
    }

    sql += ' ORDER BY entry_time DESC';
    const result = await query(sql, params);
    const positions = result.rows || [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const closedTodayResult = await query(
      `SELECT realized_pnl FROM refactored_positions
       WHERE status = 'CLOSED' AND exit_time >= $1`,
      [todayStart.toISOString()]
    );

    const closedThisWeekResult = await query(
      `SELECT realized_pnl FROM refactored_positions
       WHERE status = 'CLOSED' AND exit_time >= $1`,
      [weekStart.toISOString()]
    );

    const openPositions = positions.filter((p) => p.status === 'OPEN');
    const dayRealizedPnl = (closedTodayResult.rows || []).reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const weekRealizedPnl = (closedThisWeekResult.rows || []).reduce((sum, p) => sum + (p.realized_pnl || 0), 0);
    const totalRealizedPnl = positions
      .filter((p) => p.status === 'CLOSED')
      .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

    const totals = {
      total_positions: positions.length,
      open_positions: openPositions.length,
      closed_positions: positions.filter((p) => p.status === 'CLOSED').length,
      total_exposure: openPositions.reduce((sum, p) => sum + (p.entry_price * p.quantity * 100), 0),
      total_unrealized_pnl: openPositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0),
      total_realized_pnl: totalRealizedPnl,
      day_realized_pnl: dayRealizedPnl,
      week_realized_pnl: weekRealizedPnl,
    };

    res.json({ positions, totals });
  } catch (error) {
    console.error('[positions] Error:', error);
    res.status(500).json({ error: error.message });
  }
});



export default router;
