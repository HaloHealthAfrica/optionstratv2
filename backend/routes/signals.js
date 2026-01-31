// Signals endpoint
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

// GET /signals - Get all signals
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const status = req.query.status;
    const params = [];
    let sql = 'SELECT * FROM refactored_signals';

    if (status) {
      params.push(status);
      sql += ` WHERE metadata->>'status' = $${params.length}`;
    }

    params.push(Number.isFinite(limit) ? limit : 50);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    const signals = (result.rows || []).map((signal) => ({
      id: signal.id,
      source: signal.source || 'unknown',
      symbol: signal.symbol,
      direction: signal.direction,
      timeframe: signal.timeframe || 'unknown',
      timestamp: signal.timestamp || signal.created_at,
      metadata: signal.metadata || {},
      validation_result: signal.validation_result || null,
      created_at: signal.created_at,
      action: signal.metadata?.action || null,
      underlying: signal.symbol,
      strike: signal.metadata?.strike || null,
      expiration: signal.metadata?.expiration || null,
      option_type: signal.direction,
      quantity: signal.metadata?.quantity || null,
    }));

    res.json({ signals });
  } catch (error) {
    console.error('[Signals] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /signals - Create a signal (if needed)
router.post('/', async (req, res) => {
  try {
    // Implementation depends on your signal creation logic
    res.status(501).json({ error: 'Not implemented yet' });
  } catch (error) {
    console.error('[Signals] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
