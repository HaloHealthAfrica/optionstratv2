// Stats endpoint
import express from 'express';
import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    // TODO: Implement stats logic
    res.status(501).json({ error: 'Not implemented yet' });
  } catch (error) {
    console.error('[stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
});



export default router;
