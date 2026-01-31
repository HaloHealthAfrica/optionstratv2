// Risk limits endpoint
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

// GET /risk-limits
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM risk_limits 
       ORDER BY created_at DESC 
       LIMIT 100`
    ).catch(() => ({ rows: [] }));
    res.json(result.rows || []);
  } catch (error) {
    console.error('[risk-limits] Error:', error);
    res.json([]);
  }
});

export default router;
