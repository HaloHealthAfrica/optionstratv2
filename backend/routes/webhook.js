// Webhook endpoint
import express from 'express';

import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // TODO: Implement webhook logic
    res.status(501).json({ error: 'Not implemented yet' });
  } catch (error) {
    console.error('[webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});


router.post('/', async (req, res) => {
  try {
    // TODO: Implement webhook logic from Deno function
    res.status(501).json({ error: 'Webhook not implemented yet' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});


export default router;
