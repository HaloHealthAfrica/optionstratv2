// Exit signals endpoint
import express from 'express';
import { getCurrentExitAlerts } from '../workers/exit-monitor.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const result = await getCurrentExitAlerts();
    const duration = Date.now() - startTime;
    
    res.json({
      ...result,
      duration_ms: duration,
    });
  } catch (error) {
    console.error('[exit-signals] Error:', error);
    const duration = Date.now() - startTime;
    
    res.json({
      alerts: [],
      summary: {
        total_positions: 0,
        positions_with_alerts: 0,
        critical_alerts: 0,
        high_alerts: 0,
        medium_alerts: 0,
      },
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
