// Exit signals endpoint
import express from 'express';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    res.json({
      alerts: [],
      summary: {
        total_positions: 0,
        positions_with_alerts: 0,
        critical_alerts: 0,
        high_alerts: 0,
        medium_alerts: 0,
      },
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[exit-signals] Error:', error);
    res.json({
      alerts: [],
      summary: {
        total_positions: 0,
        positions_with_alerts: 0,
        critical_alerts: 0,
        high_alerts: 0,
        medium_alerts: 0,
      },
      duration_ms: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
