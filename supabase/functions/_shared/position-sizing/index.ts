/**
 * Position Sizing Module
 * 
 * Dynamic position sizing using Kelly Criterion and VIX-based scaling.
 * 
 * Usage:
 * ```typescript
 * import { calculatePositionSize, updateRegimePerformance } from '../_shared/position-sizing/index.ts';
 * 
 * // Calculate position size
 * const sizing = await calculatePositionSize(supabase, {
 *   baseQuantity: 2,
 *   portfolioValue: 10000,
 *   optionPrice: 1.50,
 *   regime: 'TRENDING_UP',
 *   dealerPosition: 'LONG_GAMMA',
 *   currentVix: 18.5,
 *   confluenceScore: 75,
 * });
 * 
 * console.log(`Adjusted quantity: ${sizing.adjustedQuantity}`);
 * console.log(`Adjustments: ${sizing.adjustments.map(a => a.reason).join(', ')}`);
 * 
 * // After trade closes, update regime performance for Kelly learning
 * await updateRegimePerformance(supabase, 'TRENDING_UP', 'LONG_GAMMA', 150, true);
 * ```
 */

export type {
  KellySizing,
  VixSizing,
  VixLevel,
  PositionSizeCalculation,
  PositionSizingInput,
  RegimePerformanceRow,
  VixSizingRuleRow,
  SizeAdjustment,
  ConfidenceLevel,
} from './types.ts';

export { DEFAULT_SIZING_CONFIG } from './types.ts';

export {
  calculateKellyFraction,
  getVixLevel,
  getKellySizing,
  getVixSizing,
  calculatePositionSize,
  updateRegimePerformance,
  getVixSizingRules,
  getRegimePerformanceStats,
} from './sizing-service.ts';
