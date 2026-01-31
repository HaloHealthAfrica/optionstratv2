// Mtf comparison endpoint
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Return empty comparison data for now
    res.json({
      comparison: {
        timeframes: [],
        alignment_score: 0,
        bullish_count: 0,
        bearish_count: 0,
        neutral_count: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[mtf-comparison] Error:', error);
    res.json({
      comparison: {
        timeframes: [],
        alignment_score: 0,
        bullish_count: 0,
        bearish_count: 0,
        neutral_count: 0,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
