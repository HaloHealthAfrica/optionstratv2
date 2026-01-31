// Health check endpoint
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();
const serverStart = Date.now();

router.get('/', async (req, res) => {
  let dbConnected = false;
  let dbError = null;

  try {
    await query('SELECT 1');
    dbConnected = true;
  } catch (error) {
    dbError = error instanceof Error ? error.message : 'Unknown error';
  }

  const lastSignal = await query(
    `SELECT created_at FROM refactored_signals ORDER BY created_at DESC LIMIT 1`
  ).catch(() => ({ rows: [] }));

  const lastOrder = await query(
    `SELECT created_at FROM orders ORDER BY created_at DESC LIMIT 1`
  ).catch(() => ({ rows: [] }));

  res.json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    version: process.env.APP_VERSION || '2.0.0',
    mode: process.env.APP_MODE || 'PAPER',
    live_trading_enabled: process.env.LIVE_TRADING_ENABLED === 'true',
    uptime_ms: Date.now() - serverStart,
    database: {
      connected: dbConnected,
      error: dbConnected ? null : dbError,
    },
    last_activity: {
      signal: lastSignal.rows?.[0]?.created_at || null,
      order: lastOrder.rows?.[0]?.created_at || null,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
