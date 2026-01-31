// Trades endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "100", 10);
    const offset = parseInt(req.query.offset || "0", 10);
    const underlying = req.query.underlying ? req.query.underlying.toString().toUpperCase() : null;

    const params = [];
    let sql = `
      SELECT 
        t.*,
        o.side,
        o.mode,
        o.order_type,
        o.signal_id
      FROM trades t
      LEFT JOIN orders o ON o.id = t.order_id
    `;

    if (underlying) {
      params.push(underlying);
      sql += ` WHERE t.underlying = $${params.length}`;
    }

    params.push(Number.isFinite(limit) ? limit : 100);
    params.push(Number.isFinite(offset) ? offset : 0);

    sql += ` ORDER BY t.executed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);

    const underlyingsResult = await query(
      `SELECT DISTINCT underlying FROM trades ORDER BY underlying ASC LIMIT 100`
    );

    res.json({
      trades: result.rows || [],
      total_count: result.rows?.length || 0,
      filters: {
        underlyings: (underlyingsResult.rows || []).map((row) => row.underlying),
      },
    });
  } catch (error) {
    console.error('[trades] Error:', error);
    res.status(500).json({ error: error.message });
  }
});



export default router;
