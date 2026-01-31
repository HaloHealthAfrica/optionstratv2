// Health check endpoint
import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    runtime: 'Node.js',
    endpoints: [
      'health', 'auth', 'signals', 'orders', 'positions', 'stats', 'webhook',
      'analytics', 'exit-signals', 'exit-rules', 'risk-limits', 'market-positioning',
      'metrics', 'monitor-positions', 'mtf-analysis', 'mtf-comparison', 'paper-trading',
      'poll-orders', 'refresh-gex-signals', 'refresh-positions', 'refactored-exit-worker',
      'trades'
    ],
  });
});

export default router;
