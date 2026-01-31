// Orders endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const status = req.query.status;
    const params = [];
    let sql = 'SELECT * FROM orders';

    if (status) {
      params.push(status);
      sql += ` WHERE status = $${params.length}`;
    }

    params.push(Number.isFinite(limit) ? limit : 50);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json({ orders: result.rows || [] });
  } catch (error) {
    console.error('[Orders] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
