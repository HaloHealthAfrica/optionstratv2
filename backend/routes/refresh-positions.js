// Refresh positions endpoint
import express from 'express';
import { refreshOpenPositions } from '../workers/position-refresher.js';

const router = express.Router();

// POST /refresh-positions - Manually trigger position refresh
router.post('/', async (req, res) => {
  try {
    const result = await refreshOpenPositions();
    res.json({
      success: true,
      ...result,
      message: `Refreshed ${result.refreshed} positions`,
    });
  } catch (error) {
    console.error('[refresh-positions] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
