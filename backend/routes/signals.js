// Signals endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

// GET /signals - Get all signals
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM signals 
       ORDER BY created_at DESC 
       LIMIT 100`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('[Signals] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /signals - Create a signal (if needed)
router.post('/', requireAuth, async (req, res) => {
  try {
    // Implementation depends on your signal creation logic
    res.status(501).json({ error: 'Not implemented yet' });
  } catch (error) {
    console.error('[Signals] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
