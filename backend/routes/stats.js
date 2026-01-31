// Stats endpoint - System statistics and metrics
import express from 'express';
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [signalsResult, ordersResult, tradesResult, positionsResult, violationsResult] = await Promise.all([
      query('SELECT id, validation_result FROM refactored_signals'),
      query('SELECT id, status, mode FROM orders'),
      query('SELECT id FROM trades'),
      query('SELECT id, status FROM refactored_positions'),
      query('SELECT id, severity FROM risk_violations'),
    ]);

    const signals = signalsResult.rows || [];
    const orders = ordersResult.rows || [];
    const positions = positionsResult.rows || [];
    const violations = violationsResult.rows || [];

    const acceptedSignals = signals.filter((s) => s.validation_result?.valid === true).length;
    const rejectedSignals = signals.filter((s) => s.validation_result?.valid === false).length;
    const pendingSignals = signals.filter((s) => !s.validation_result).length;
    const failedSignals = signals.filter(
      (s) => s.validation_result?.valid === false && s.validation_result?.stage === 'EXECUTION'
    ).length;

    const stats = {
      signals: {
        total: signals.length,
        pending: pendingSignals,
        completed: acceptedSignals,
        rejected: rejectedSignals,
        failed: failedSignals,
      },
      orders: {
        total: orders.length,
        paper: orders.filter((o) => o.mode === 'PAPER').length,
        live: orders.filter((o) => o.mode === 'LIVE').length,
        filled: orders.filter((o) => o.status === 'FILLED').length,
        pending: orders.filter((o) => o.status === 'PENDING' || o.status === 'SUBMITTED').length,
      },
      trades: {
        total: tradesResult.rows?.length || 0,
      },
      positions: {
        total: positions.length,
        open: positions.filter((p) => p.status === 'OPEN').length,
        closed: positions.filter((p) => p.status === 'CLOSED').length,
      },
      risk_violations: {
        total: violations.length,
        critical: violations.filter((v) => v.severity === 'CRITICAL').length,
        warning: violations.filter((v) => v.severity === 'WARNING').length,
      },
      mode: process.env.APP_MODE || 'PAPER',
      timestamp: new Date().toISOString(),
    };

    res.json(stats);
  } catch (error) {
    console.error('[Stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
