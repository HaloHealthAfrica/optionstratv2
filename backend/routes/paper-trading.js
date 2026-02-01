// Paper trading endpoint
import express from 'express';
import { executePendingPaperOrders } from '../workers/paper-executor.js';

const router = express.Router();

// POST /paper-trading - Manually trigger paper execution
router.post('/', async (req, res) => {
  try {
    const result = await executePendingPaperOrders();
    res.json({
      success: true,
      ...result,
      message: `Executed ${result.executed} paper orders`,
    });
  } catch (error) {
    console.error('[paper-trading] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
