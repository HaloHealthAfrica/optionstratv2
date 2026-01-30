/**
 * Position Sizing Service
 * 
 * Dynamic position sizing using Kelly Criterion and VIX-based scaling.
 */

import { createDbClient } from "../db-client.ts";
import type {
  KellySizing,
  VixSizing,
  VixLevel,
  PositionSizeCalculation,
  PositionSizingInput,
  RegimePerformanceRow,
  VixSizingRuleRow,
  SizeAdjustment,
} from './types.ts';
import { DEFAULT_SIZING_CONFIG } from './types.ts';

/**
 * Calculate Kelly Criterion fraction
 * Kelly = W - [(1 - W) / R]
 * W = win rate, R = win/loss ratio (avg_win / avg_loss)
 */
export function calculateKellyFraction(
  winRate: number,
  avgWin: number,
  avgLoss: number
): number {
  if (avgLoss === 0 || winRate === 0) return 0;
  
  const winLossRatio = Math.abs(avgWin / avgLoss);
  const kelly = winRate - ((1 - winRate) / winLossRatio);
  
  // Clamp to reasonable bounds (0 to max)
  return Math.max(0, Math.min(DEFAULT_SIZING_CONFIG.maxKellyFraction, kelly));
}

/**
 * Determine VIX level category
 */
export function getVixLevel(vix: number): VixLevel {
  if (vix < 15) return 'LOW';
  if (vix < 20) return 'NORMAL';
  if (vix < 25) return 'ELEVATED';
  if (vix < 30) return 'HIGH';
  if (vix < 40) return 'VERY_HIGH';
  return 'EXTREME';
}

/**
 * Get Kelly-based sizing from historical regime performance
 */
export async function getKellySizing(
  supabase: ReturnType<typeof createDbClient>,
  regime: string,
  dealerPosition: string
): Promise<KellySizing> {
  const { data, error } = await supabase
    .from('regime_performance')
    .select('*')
    .eq('regime', regime)
    .eq('dealer_position', dealerPosition)
    .single() as { data: RegimePerformanceRow | null; error: any };
  
  if (error) {
    console.error('[PositionSizing] Error fetching regime performance:', error);
  }
  
  // Not enough data - use conservative default
  if (!data || data.total_trades < 20) {
    return {
      kellyFraction: DEFAULT_SIZING_CONFIG.defaultKellyFraction,
      halfKelly: DEFAULT_SIZING_CONFIG.defaultKellyFraction / 2,
      confidence: 'LOW',
      totalTrades: data?.total_trades || 0,
      winRate: data?.win_rate || 0,
    };
  }
  
  const kelly = calculateKellyFraction(
    data.win_rate || 0,
    data.average_win || 0,
    Math.abs(data.average_loss || 0)
  );
  
  const halfKelly = kelly / 2; // Conservative approach
  
  return {
    kellyFraction: kelly,
    halfKelly,
    confidence: data.total_trades > 50 ? 'HIGH' : 'MEDIUM',
    totalTrades: data.total_trades,
    winRate: data.win_rate || 0,
  };
}

/**
 * Get VIX-based sizing multiplier from rules table
 */
export async function getVixSizing(
  supabase: ReturnType<typeof createDbClient>,
  currentVix: number
): Promise<VixSizing> {
  const { data, error } = await supabase
    .from('vix_sizing_rules')
    .select('*')
    .lte('vix_min', currentVix)
    .gt('vix_max', currentVix)
    .single() as { data: VixSizingRuleRow | null; error: any };
  
  if (error) {
    console.error('[PositionSizing] Error fetching VIX sizing rules:', error);
  }
  
  // Default for extreme or missing rules
  if (!data) {
    return {
      multiplier: 0.25,
      maxPositions: 1,
      vixLevel: getVixLevel(currentVix),
      currentVix,
    };
  }
  
  return {
    multiplier: data.size_multiplier,
    maxPositions: data.max_positions || 1,
    vixLevel: getVixLevel(currentVix),
    currentVix,
  };
}

/**
 * Calculate dynamic position size with all factors
 */
export async function calculatePositionSize(
  supabase: ReturnType<typeof createDbClient>,
  input: PositionSizingInput
): Promise<PositionSizeCalculation> {
  const {
    baseQuantity,
    portfolioValue,
    optionPrice,
    regime,
    dealerPosition,
    currentVix,
    confluenceScore,
    riskPerTradePercent = DEFAULT_SIZING_CONFIG.defaultRiskPercent,
  } = input;
  
  const adjustments: SizeAdjustment[] = [];
  let totalMultiplier = 1;
  
  // 1. Kelly-based adjustment
  const kelly = await getKellySizing(supabase, regime, dealerPosition);
  const kellyBaseline = DEFAULT_SIZING_CONFIG.defaultKellyFraction;
  const kellyFactor = kelly.halfKelly > 0
    ? Math.min(2, kelly.halfKelly / kellyBaseline) // Scale relative to 2% baseline
    : 1;
  
  adjustments.push({
    factor: 'KELLY',
    multiplier: kellyFactor,
    reason: `Half-Kelly ${(kelly.halfKelly * 100).toFixed(2)}% (${kelly.confidence} confidence, ${kelly.totalTrades} trades, ${(kelly.winRate * 100).toFixed(1)}% win rate)`,
  });
  totalMultiplier *= kellyFactor;
  
  // 2. VIX-based adjustment
  const vix = await getVixSizing(supabase, currentVix);
  adjustments.push({
    factor: 'VIX',
    multiplier: vix.multiplier,
    reason: `VIX at ${currentVix.toFixed(1)} (${vix.vixLevel}), max ${vix.maxPositions} positions`,
  });
  totalMultiplier *= vix.multiplier;
  
  // 3. Regime-specific adjustment
  const regimeFactor = DEFAULT_SIZING_CONFIG.regimeMultipliers[regime] ?? 1;
  if (regimeFactor !== 1) {
    adjustments.push({
      factor: 'REGIME',
      multiplier: regimeFactor,
      reason: `Regime ${regime} adjustment`,
    });
    totalMultiplier *= regimeFactor;
  }
  
  // 4. Dealer position adjustment
  const dealerFactor = DEFAULT_SIZING_CONFIG.dealerMultipliers[dealerPosition] ?? 1;
  if (dealerFactor !== 1) {
    adjustments.push({
      factor: 'DEALER',
      multiplier: dealerFactor,
      reason: `${dealerPosition} - ${dealerPosition === 'SHORT_GAMMA' ? 'expect volatility' : 'standard'}`,
    });
    totalMultiplier *= dealerFactor;
  }
  
  // 5. Confluence-based adjustment (0.5 to 1.5 based on 0-100 score)
  const confluenceFactor = 0.5 + (confluenceScore / 100);
  adjustments.push({
    factor: 'CONFLUENCE',
    multiplier: confluenceFactor,
    reason: `Confluence score ${confluenceScore.toFixed(0)}%`,
  });
  totalMultiplier *= confluenceFactor;
  
  // 6. Calculate max quantity based on risk constraint
  const maxQuantityByRisk = Math.floor(
    (portfolioValue * (riskPerTradePercent / 100)) / (optionPrice * 100)
  );
  
  // Calculate raw adjusted quantity
  let rawAdjustedQuantity = Math.round(baseQuantity * totalMultiplier);
  
  // Apply constraints
  let wasLimitedByRisk = false;
  let wasLimitedByVix = false;
  
  if (rawAdjustedQuantity > maxQuantityByRisk && maxQuantityByRisk > 0) {
    rawAdjustedQuantity = maxQuantityByRisk;
    wasLimitedByRisk = true;
    adjustments.push({
      factor: 'RISK_LIMIT',
      multiplier: maxQuantityByRisk / (baseQuantity * totalMultiplier),
      reason: `Capped by ${riskPerTradePercent}% risk limit`,
    });
  }
  
  // Ensure minimum quantity
  const adjustedQuantity = Math.max(DEFAULT_SIZING_CONFIG.minQuantity, rawAdjustedQuantity);
  
  // Calculate risk metrics
  const estimatedRisk = adjustedQuantity * optionPrice * 100;
  const maxLossPercent = portfolioValue > 0 
    ? (estimatedRisk / portfolioValue) * 100 
    : 0;
  
  return {
    baseQuantity,
    adjustedQuantity,
    kellyFactor,
    vixFactor: vix.multiplier,
    regimeFactor,
    dealerFactor,
    confluenceFactor,
    totalMultiplier,
    adjustments,
    estimatedRisk,
    maxLossPercent,
    wasLimitedByRisk,
    wasLimitedByVix,
  };
}

/**
 * Update regime performance after a trade closes
 * Call this from the position closing logic
 */
export async function updateRegimePerformance(
  supabase: ReturnType<typeof createDbClient>,
  regime: string,
  dealerPosition: string,
  pnl: number,
  isWinner: boolean
): Promise<void> {
  // Get current stats
  const { data: current, error: fetchError } = await supabase
    .from('regime_performance')
    .select('*')
    .eq('regime', regime)
    .eq('dealer_position', dealerPosition)
    .single() as { data: RegimePerformanceRow | null; error: any };
  
  if (fetchError) {
    console.error('[PositionSizing] Error fetching regime performance:', fetchError);
    return;
  }
  
  if (current) {
    // Update existing record
    const newTotalTrades = current.total_trades + 1;
    const newWinningTrades = current.winning_trades + (isWinner ? 1 : 0);
    const newLosingTrades = current.losing_trades + (isWinner ? 0 : 1);
    const newTotalPnl = (current.total_pnl || 0) + pnl;
    const newWinRate = newWinningTrades / newTotalTrades;
    
    // Running average for wins/losses
    const newAvgWin = isWinner && newWinningTrades > 0
      ? (((current.average_win || 0) * current.winning_trades) + pnl) / newWinningTrades
      : current.average_win;
    
    const newAvgLoss = !isWinner && newLosingTrades > 0
      ? (((current.average_loss || 0) * current.losing_trades) + pnl) / newLosingTrades
      : current.average_loss;
    
    const newKelly = calculateKellyFraction(
      newWinRate,
      newAvgWin || 0,
      Math.abs(newAvgLoss || 0)
    );
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload = {
      total_trades: newTotalTrades,
      winning_trades: newWinningTrades,
      losing_trades: newLosingTrades,
      total_pnl: newTotalPnl,
      win_rate: newWinRate,
      average_win: newAvgWin,
      average_loss: newAvgLoss,
      win_loss_ratio: newAvgLoss ? Math.abs((newAvgWin || 0) / newAvgLoss) : null,
      kelly_fraction: newKelly,
      half_kelly: newKelly / 2,
      updated_at: new Date().toISOString(),
    };
    
    const { error: updateError } = await (supabase
      .from('regime_performance') as any)
      .update(updatePayload)
      .eq('regime', regime)
      .eq('dealer_position', dealerPosition);
    
    if (updateError) {
      console.error('[PositionSizing] Error updating regime performance:', updateError);
    } else {
      console.log(`[PositionSizing] Updated ${regime}/${dealerPosition}: ${newTotalTrades} trades, ${(newWinRate * 100).toFixed(1)}% win rate, Kelly: ${(newKelly * 100).toFixed(2)}%`);
    }
  } else {
    // Insert new record
    const insertPayload = {
      regime,
      dealer_position: dealerPosition,
      total_trades: 1,
      winning_trades: isWinner ? 1 : 0,
      losing_trades: isWinner ? 0 : 1,
      total_pnl: pnl,
      win_rate: isWinner ? 1 : 0,
      average_win: isWinner ? pnl : null,
      average_loss: isWinner ? null : pnl,
      kelly_fraction: DEFAULT_SIZING_CONFIG.defaultKellyFraction,
      half_kelly: DEFAULT_SIZING_CONFIG.defaultKellyFraction / 2,
      period_start: new Date().toISOString(),
    };
    
    const { error: insertError } = await (supabase
      .from('regime_performance') as any)
      .insert(insertPayload);
    
    if (insertError) {
      console.error('[PositionSizing] Error inserting regime performance:', insertError);
    } else {
      console.log(`[PositionSizing] Created new regime performance record for ${regime}/${dealerPosition}`);
    }
  }
}

/**
 * Get all VIX sizing rules (for display/configuration)
 */
export async function getVixSizingRules(
  supabase: ReturnType<typeof createDbClient>
): Promise<VixSizingRuleRow[]> {
  const { data, error } = await supabase
    .from('vix_sizing_rules')
    .select('*')
    .order('vix_min', { ascending: true });
  
  if (error) {
    console.error('[PositionSizing] Error fetching VIX rules:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get all regime performance stats (for display/analysis)
 */
export async function getRegimePerformanceStats(
  supabase: ReturnType<typeof createDbClient>
): Promise<RegimePerformanceRow[]> {
  const { data, error } = await supabase
    .from('regime_performance')
    .select('*')
    .order('total_trades', { ascending: false });
  
  if (error) {
    console.error('[PositionSizing] Error fetching regime stats:', error);
    return [];
  }
  
  return data || [];
}


