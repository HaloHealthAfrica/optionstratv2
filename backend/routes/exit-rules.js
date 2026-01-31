// Exit rules endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM exit_rules 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[exit-rules] Error:', error);
    res.status(500).json({ error: error.message });
  }
});



export default router;
