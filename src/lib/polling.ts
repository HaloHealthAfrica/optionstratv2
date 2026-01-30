const parseInterval = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const POLLING_INTERVALS = {
  systemStats: parseInterval(import.meta.env.VITE_POLL_SYSTEM_STATS, 5000),
  systemHealth: parseInterval(import.meta.env.VITE_POLL_SYSTEM_HEALTH, 10000),
  positions: parseInterval(import.meta.env.VITE_POLL_POSITIONS, 5000),
  signals: parseInterval(import.meta.env.VITE_POLL_SIGNALS, 5000),
  orders: parseInterval(import.meta.env.VITE_POLL_ORDERS, 5000),
  riskViolations: parseInterval(import.meta.env.VITE_POLL_RISK_VIOLATIONS, 10000),
  trades: parseInterval(import.meta.env.VITE_POLL_TRADES, 30000),
  exitSignals: parseInterval(import.meta.env.VITE_POLL_EXIT_SIGNALS, 60000),
  marketContext: parseInterval(import.meta.env.VITE_POLL_MARKET_CONTEXT, 30000),
  marketPositioning: parseInterval(import.meta.env.VITE_POLL_MARKET_POSITIONING, 300000),
  sourcePerformance: parseInterval(import.meta.env.VITE_POLL_SOURCE_PERFORMANCE, 30000),
  signalQueue: parseInterval(import.meta.env.VITE_POLL_SIGNAL_QUEUE, 10000),
  closedPnL: parseInterval(import.meta.env.VITE_POLL_CLOSED_PNL, 10000),
  openTrades: parseInterval(import.meta.env.VITE_POLL_OPEN_TRADES, 10000),
  performanceCharts: parseInterval(import.meta.env.VITE_POLL_PERFORMANCE, 60000),
  mtfAlignment: parseInterval(import.meta.env.VITE_POLL_MTF_ALIGNMENT, 30000),
};
