/**
 * Decision Orchestrator Module
 * 
 * Unified trading decision engine that coordinates signal ingestion, validation,
 * sizing, exits, and observability for deterministic, explainable decisions.
 * 
 * Usage:
 * ```typescript
 * import { 
 *   orchestrateEntryDecision,
 *   orchestrateHoldDecision,
 *   orchestrateExitDecision,
 *   recordTradeOutcome,
 * } from '../_shared/decision-orchestrator/index.ts';
 * 
 * // Entry decision
 * const entryResult = await orchestrateEntryDecision({
 *   tvSignal: { ticker: 'SPY', action: 'BUY', ... },
 *   gexSignals: gexBundle,
 *   marketContext: context,
 *   portfolioValue: 10000,
 *   ...
 * });
 * 
 * if (entryResult.action === 'EXECUTE') {
 *   console.log(`Trade approved: ${entryResult.adjustedQuantity} contracts`);
 *   console.log(`Exit plan: Stop=${entryResult.exitPlan.stopLossPercent}%`);
 * } else {
 *   console.log(`Trade rejected: ${entryResult.rejectionReason}`);
 * }
 * 
 * // Hold decision (for open positions)
 * const holdResult = await orchestrateHoldDecision({
 *   position: { ... },
 *   gexSignals: currentGex,
 * });
 * 
 * // Exit decision (for open positions)
 * const exitResult = await orchestrateExitDecision({
 *   position: { ... },
 *   gexSignals: currentGex,
 *   volatility: { atr, atrPercentile },
 * });
 * ```
 */

export type {
  // Configuration
  OrchestratorConfig,
  
  // Inputs
  TVSignalInput,
  MarketContextInput,
  MTFTrendInput,
  PositioningInput,
  OrchestratorEntryInput,
  OrchestratorHoldInput,
  OrchestratorExitInput,
  
  // Outputs
  RuleTrigger,
  ExitPlan,
  ConfidenceBreakdown,
  IntegratedEntryDecision,
  IntegratedHoldDecision,
  IntegratedExitDecision,
  
  // Context
  DecisionContextSnapshot,
  OrchestratorDecisionLog,
} from './types.ts';

export { DEFAULT_ORCHESTRATOR_CONFIG } from './types.ts';

export {
  orchestrateEntryDecision,
  orchestrateHoldDecision,
  orchestrateExitDecision,
  recordTradeOutcome,
} from './orchestrator-service.ts';
