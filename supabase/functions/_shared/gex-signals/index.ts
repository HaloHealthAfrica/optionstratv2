/**
 * GEX Signals Module
 * 
 * Exports all GEX signal generation and trading decision services
 */

// Types
export * from './types.ts';

// Signal Generation
export { 
  generateGEXSignals,
  detectGEXFlip,
  detectZeroGammaBreakout,
  detectGEXWalls,
  calculateMaxPainMagnet,
  analyzePCRatio,
  analyzeMarketRegime,
} from './gex-signal-service.ts';

// Decision Services
export { evaluateEntry } from './entry-decision-service.ts';
export { evaluateHold } from './hold-decision-service.ts';
export { evaluateExit } from './exit-decision-service.ts';

// Paper Trading
export {
  executePaperEntry,
  executePaperExit,
  updatePaperPosition,
  getOpenPaperPositions,
  getPaperTradingStats,
} from './paper-trading-service.ts';
