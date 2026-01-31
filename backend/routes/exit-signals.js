// Exit signals endpoint
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Return empty array if table doesn't exist
    const result = await query(
      `SELECT * FROM exit_signals 
       ORDER BY created_at DESC 
       LIMIT 100`
    ).catch(() => ({ rows: [] }));
    
    res.json(result.rows || []);
  } catch (error) {
    console.error('[exit-signals] Error:', error);
    res.json([]); // Return empty array instead of error
  }
});

export default router;
