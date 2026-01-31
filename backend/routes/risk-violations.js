// Risk violations endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const params = [];
    let sql = 'SELECT * FROM risk_violations ORDER BY created_at DESC';

    params.push(Number.isFinite(limit) ? limit : 20);
    sql += ` LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json({ violations: result.rows || [] });
  } catch (error) {
    console.error('[risk-violations] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
// Risk violations endpoint
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

// GET /risk-violations
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const result = await query(
      `SELECT * FROM risk_violations 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    ).catch(() => ({ rows: [] }));
    res.json({ violations: result.rows || [] });
  } catch (error) {
    console.error('[risk-violations] Error:', error);
    res.json({ violations: [] });
  }
});

export default router;
