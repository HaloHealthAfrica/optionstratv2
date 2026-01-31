// Node.js Express Backend Server
// Replaces Deno server.ts with a clean Express implementation

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Import route handlers
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import signalsRouter from './routes/signals.js';
import ordersRouter from './routes/orders.js';
import positionsRouter from './routes/positions.js';
import statsRouter from './routes/stats.js';
import webhookRouter from './routes/webhook.js';
import analyticsRouter from './routes/analytics.js';
import exitSignalsRouter from './routes/exit-signals.js';
import exitRulesRouter from './routes/exit-rules.js';
import riskLimitsRouter from './routes/risk-limits.js';
import marketPositioningRouter from './routes/market-positioning.js';
import metricsRouter from './routes/metrics.js';
import monitorPositionsRouter from './routes/monitor-positions.js';
import mtfAnalysisRouter from './routes/mtf-analysis.js';
import mtfComparisonRouter from './routes/mtf-comparison.js';
import paperTradingRouter from './routes/paper-trading.js';
import pollOrdersRouter from './routes/poll-orders.js';
import refreshGexSignalsRouter from './routes/refresh-gex-signals.js';
import refreshPositionsRouter from './routes/refresh-positions.js';
import refactoredExitWorkerRouter from './routes/refactored-exit-worker.js';
import tradesRouter from './routes/trades.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8080');

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    
    const slowRequestMs = parseInt(process.env.SLOW_REQUEST_MS || '2000');
    if (duration > slowRequestMs) {
      console.warn(`[Perf] Slow request ${req.path}: ${duration}ms`);
    }
  });
  next();
});

// Mount routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/signals', signalsRouter);
app.use('/orders', ordersRouter);
app.use('/positions', positionsRouter);
app.use('/stats', statsRouter);
app.use('/webhook', webhookRouter);
app.use('/analytics', analyticsRouter);
app.use('/exit-signals', exitSignalsRouter);
app.use('/exit-rules', exitRulesRouter);
app.use('/risk-limits', riskLimitsRouter);
app.use('/market-positioning', marketPositioningRouter);
app.use('/metrics', metricsRouter);
app.use('/monitor-positions', monitorPositionsRouter);
app.use('/mtf-analysis', mtfAnalysisRouter);
app.use('/mtf-comparison', mtfComparisonRouter);
app.use('/paper-trading', paperTradingRouter);
app.use('/poll-orders', pollOrdersRouter);
app.use('/refresh-gex-signals', refreshGexSignalsRouter);
app.use('/refresh-positions', refreshPositionsRouter);
app.use('/refactored-exit-worker', refactoredExitWorkerRouter);
app.use('/trades', tradesRouter);

// Root endpoint redirects to health
app.get('/', (req, res) => {
  res.redirect('/health');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Endpoint '${req.path}' not found`,
    available: [
      'health', 'auth', 'signals', 'orders', 'positions', 'stats', 'webhook',
      'analytics', 'exit-signals', 'exit-rules', 'risk-limits', 'market-positioning',
      'metrics', 'monitor-positions', 'mtf-analysis', 'mtf-comparison', 'paper-trading',
      'poll-orders', 'refresh-gex-signals', 'refresh-positions', 'refactored-exit-worker',
      'trades'
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Optionstrat Backend Server (Node.js) starting on port ${PORT}`);
  console.log(`📦 Available endpoints: health, auth, signals, orders, positions, stats, webhook, analytics, exit-signals, exit-rules, risk-limits, market-positioning, metrics, monitor-positions, mtf-analysis, mtf-comparison, paper-trading, poll-orders, refresh-gex-signals, refresh-positions, refactored-exit-worker, trades`);
  console.log(`✅ Server ready at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
