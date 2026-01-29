/**
 * Position Manager
 * Handles position lifecycle, P&L calculation, and Greeks refresh
 * Integrates GEX signals for intelligent exit decisions
 */

import { createSupabaseClient } from "./supabase-client.ts";
import { getMarketDataService } from "./market-data/index.ts";
import type { Position } from "./types.ts";
import type { OptionsQuote } from "./market-data/types.ts";
import { 
  evaluateExitRules, 
  evaluateAllPositions as evaluateAllPositionsLegacy,
  type ExitRuleConfig, 
  type ExitEvaluation,
  type PositionWithMarketData 
} from "./exit-rules.ts";
import { evaluateExit as evaluateGEXExit, type ExitInput } from "./gex-signals/exit-decision-service.ts";
import type { GEXSignalBundle } from "./gex-signals/types.ts";

export interface PositionUpdate {
  id: string;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_percent: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  implied_volatility: number | null;
  last_updated: string;
}

export interface PortfolioMetrics {
  total_positions: number;
  total_market_value: number;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  total_delta: number;
  total_gamma: number;
  total_theta: number;
  total_vega: number;
  day_pnl: number;
  week_pnl: number;
}

export interface RefreshResult {
  success: boolean;
  positions_updated: number;
  positions_failed: number;
  exit_signals: { position_id: string; position: PositionWithMarketData; evaluation: ExitEvaluation }[];
  portfolio_metrics: PortfolioMetrics;
  errors: string[];
}

/**
 * Calculate P&L metrics for a position given current market price
 */
function calculatePnL(
  position: Position,
  currentPrice: number
): { 
  market_value: number; 
  unrealized_pnl: number; 
  unrealized_pnl_percent: number;
} {
  const contractMultiplier = 100;
  const market_value = currentPrice * Math.abs(position.quantity) * contractMultiplier;
  
  // For long positions: profit if current > avg entry
  // For short positions: profit if current < avg entry
  const isLong = position.quantity > 0;
  const priceDiff = isLong 
    ? currentPrice - position.avg_open_price
    : position.avg_open_price - currentPrice;
  
  const unrealized_pnl = priceDiff * Math.abs(position.quantity) * contractMultiplier;
  const unrealized_pnl_percent = (unrealized_pnl / Math.abs(position.total_cost)) * 100;

  return { market_value, unrealized_pnl, unrealized_pnl_percent };
}

/**
 * Refresh market data and Greeks for all open positions
 */
export async function refreshPositions(
  exitRuleConfig?: ExitRuleConfig
): Promise<RefreshResult> {
  const supabase = createSupabaseClient();
  const marketDataService = getMarketDataService();
  
  const result: RefreshResult = {
    success: true,
    positions_updated: 0,
    positions_failed: 0,
    exit_signals: [],
    portfolio_metrics: {
      total_positions: 0,
      total_market_value: 0,
      total_unrealized_pnl: 0,
      total_realized_pnl: 0,
      total_delta: 0,
      total_gamma: 0,
      total_theta: 0,
      total_vega: 0,
      day_pnl: 0,
      week_pnl: 0,
    },
    errors: [],
  };

  // Fetch all open positions
  const { data: positions, error: fetchError } = await supabase
    .from("positions")
    .select("*")
    .eq("is_closed", false);

  if (fetchError) {
    result.success = false;
    result.errors.push(`Failed to fetch positions: ${fetchError.message}`);
    return result;
  }

  if (!positions || positions.length === 0) {
    return result;
  }

  result.portfolio_metrics.total_positions = positions.length;
  const positionsWithMarketData: PositionWithMarketData[] = [];

  // Refresh each position with current market data
  for (const position of positions) {
    try {
      // Get real-time quote
      const quoteResult = await marketDataService.getOptionQuote(
        position.underlying,
        position.expiration,
        Number(position.strike),
        position.option_type as 'CALL' | 'PUT'
      );

      let update: PositionUpdate;
      let marketData: OptionsQuote | undefined;

      if (quoteResult.success && quoteResult.data) {
        marketData = quoteResult.data;
        const currentPrice = marketData.mid;
        const pnl = calculatePnL(position as Position, currentPrice);

        update = {
          id: position.id,
          current_price: currentPrice,
          market_value: pnl.market_value,
          unrealized_pnl: pnl.unrealized_pnl,
          unrealized_pnl_percent: pnl.unrealized_pnl_percent,
          delta: marketData.delta,
          gamma: marketData.gamma,
          theta: marketData.theta,
          vega: marketData.vega,
          implied_volatility: marketData.implied_volatility,
          last_updated: new Date().toISOString(),
        };

        // Update portfolio metrics
        result.portfolio_metrics.total_market_value += pnl.market_value;
        result.portfolio_metrics.total_unrealized_pnl += pnl.unrealized_pnl;
        result.portfolio_metrics.total_delta += (marketData.delta || 0) * position.quantity;
        result.portfolio_metrics.total_gamma += (marketData.gamma || 0) * position.quantity;
        result.portfolio_metrics.total_theta += (marketData.theta || 0) * position.quantity;
        result.portfolio_metrics.total_vega += (marketData.vega || 0) * position.quantity;
      } else {
        // No market data available, just update timestamp
        update = {
          id: position.id,
          current_price: position.current_price,
          market_value: position.market_value,
          unrealized_pnl: position.unrealized_pnl,
          unrealized_pnl_percent: position.unrealized_pnl_percent,
          delta: position.delta,
          gamma: position.gamma,
          theta: position.theta,
          vega: position.vega,
          implied_volatility: position.implied_volatility,
          last_updated: new Date().toISOString(),
        };

        result.errors.push(
          `Market data unavailable for ${position.symbol}: ${quoteResult.error}`
        );
      }

      // Persist update
      const { error: updateError } = await supabase
        .from("positions")
        .update(update)
        .eq("id", position.id);

      if (updateError) {
        result.positions_failed++;
        result.errors.push(`Failed to update ${position.symbol}: ${updateError.message}`);
      } else {
        result.positions_updated++;
      }

      // Track for exit rule evaluation
      positionsWithMarketData.push({
        ...position,
        ...update,
        market_data: marketData,
      } as PositionWithMarketData);

    } catch (error) {
      result.positions_failed++;
      result.errors.push(
        `Error processing ${position.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Calculate realized P&L from closed positions (today)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const { data: closedToday } = await supabase
    .from("positions")
    .select("realized_pnl")
    .eq("is_closed", true)
    .gte("closed_at", todayStart.toISOString());

  result.portfolio_metrics.day_pnl = (closedToday || [])
    .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

  // Calculate week P&L
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const { data: closedThisWeek } = await supabase
    .from("positions")
    .select("realized_pnl")
    .eq("is_closed", true)
    .gte("closed_at", weekStart.toISOString());

  result.portfolio_metrics.week_pnl = (closedThisWeek || [])
    .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

  // Evaluate exit rules with GEX integration if config provided
  if (exitRuleConfig && positionsWithMarketData.length > 0) {
    // Fetch latest GEX signals for all relevant underlyings
    const underlyings = [...new Set(positionsWithMarketData.map(p => p.underlying))];
    
    const gexSignalsMap = new Map<string, any>();
    for (const underlying of underlyings) {
      const { data: gexSignal } = await supabase
        .from('gex_signals')
        .select('*')
        .eq('ticker', underlying)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (gexSignal) {
        gexSignalsMap.set(underlying, gexSignal);
      }
    }

    // Evaluate each position with GEX-aware exit logic
    for (const position of positionsWithMarketData) {
      const gexData = gexSignalsMap.get(position.underlying);
      
      // Calculate time-based metrics
      const entryTime = new Date(position.opened_at).getTime();
      const hoursInTrade = (Date.now() - entryTime) / (1000 * 60 * 60);
      const dte = Math.ceil((new Date(position.expiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const currentPrice = position.current_price ?? position.avg_open_price;
      const unrealizedPnl = position.unrealized_pnl ?? 0;
      const unrealizedPnlPct = position.unrealized_pnl_percent ?? 0;
      
      // Calculate theta decay percentage
      const thetaDecayPct = position.theta && currentPrice 
        ? Math.abs(position.theta / currentPrice) * 100 
        : undefined;

      // Default trade plan values (can be enhanced with actual entry data)
      const plannedStopLoss = position.avg_open_price * 0.25; // 75% stop loss
      const plannedTarget1 = position.avg_open_price * 1.25;  // 25% target
      const plannedTarget2 = position.avg_open_price * 1.50;  // 50% target
      const trailingStopPct = exitRuleConfig.trailing_stop_percent ?? 25;

      // If we have GEX data, use GEX-aware exit evaluation
      if (gexData) {
        const gexSignals = transformDbToGexBundle(gexData);
        
        const exitDecision = evaluateGEXExit({
          position: {
            id: position.id,
            optionType: position.option_type as 'CALL' | 'PUT',
            entryPrice: position.avg_open_price,
            currentPrice,
            highestPriceSinceEntry: position.high_water_mark ?? currentPrice,
            unrealizedPnl,
            unrealizedPnlPct,
            dte,
            hoursInTrade,
            plannedStopLoss,
            plannedTarget1,
            plannedTarget2,
            trailingStopPct,
            partialExitDone: false, // Track from orders table if needed
          },
          gexSignals,
          greeks: {
            delta: position.delta ?? undefined,
            theta: position.theta ?? undefined,
            thetaDecayPct,
          },
        });

        // Only add to exit signals if action is not HOLD
        if (exitDecision.action !== 'HOLD') {
          result.exit_signals.push({
            position_id: position.id,
            position,
            evaluation: {
              should_exit: true,
              reason: exitDecision.trigger as any,
              urgency: exitDecision.urgency === 'IMMEDIATE' ? 'IMMEDIATE' 
                     : exitDecision.urgency === 'SOON' ? 'END_OF_DAY' 
                     : 'NEXT_SESSION',
              details: exitDecision.details,
              current_value: unrealizedPnlPct,
              threshold_value: 0,
              suggested_order_type: exitDecision.urgency === 'IMMEDIATE' ? 'MARKET' : 'LIMIT',
              suggested_limit_price: position.market_data?.bid,
            },
          });
        }
      } else {
        // Fallback to legacy exit rules without GEX
        const legacyEvaluation = evaluateExitRules(position, exitRuleConfig);
        if (legacyEvaluation.should_exit) {
          result.exit_signals.push({
            position_id: position.id,
            position,
            evaluation: legacyEvaluation,
          });
        }
      }
    }
  }

  result.success = result.positions_failed === 0;
  return result;
}

/**
 * Update high water mark for trailing stop tracking
 * This is called during each refresh cycle to track the highest unrealized P&L
 */
export async function updateHighWaterMarks(): Promise<{ updated: number; errors: string[] }> {
  const supabase = createSupabaseClient();
  const result = { updated: 0, errors: [] as string[] };

  // Get all open positions with their current unrealized P&L and high water mark
  const { data: positions, error } = await supabase
    .from("positions")
    .select("id, unrealized_pnl, high_water_mark")
    .eq("is_closed", false);

  if (error) {
    result.errors.push(`Failed to fetch positions: ${error.message}`);
    return result;
  }

  if (!positions || positions.length === 0) return result;

  // Update high water mark for positions where current P&L exceeds previous high
  for (const position of positions) {
    const currentPnl = position.unrealized_pnl ?? 0;
    const currentHwm = position.high_water_mark ?? 0;

    // Only update if current P&L is higher than the recorded high water mark
    if (currentPnl > currentHwm) {
      const { error: updateError } = await supabase
        .from("positions")
        .update({ high_water_mark: currentPnl })
        .eq("id", position.id);

      if (updateError) {
        result.errors.push(`Failed to update HWM for ${position.id}: ${updateError.message}`);
      } else {
        result.updated++;
        console.log(`[HWM] Updated position ${position.id}: $${currentHwm.toFixed(2)} -> $${currentPnl.toFixed(2)}`);
      }
    }
  }

  return result;
}

/**
 * Calculate realized P&L when closing a position
 */
export function calculateRealizedPnL(
  position: Position,
  closePrice: number,
  closeQuantity: number
): number {
  const contractMultiplier = 100;
  const isLong = position.quantity > 0;
  
  const priceDiff = isLong
    ? closePrice - position.avg_open_price
    : position.avg_open_price - closePrice;
  
  return priceDiff * closeQuantity * contractMultiplier;
}

/**
 * Get portfolio snapshot for a specific point in time
 */
export async function capturePortfolioSnapshot(
  mode: 'PAPER' | 'LIVE'
): Promise<void> {
  const supabase = createSupabaseClient();

  // Get current positions and metrics
  const { data: positions } = await supabase
    .from("positions")
    .select("*")
    .eq("is_closed", false);

  const openPositions = positions || [];

  const snapshot = {
    mode,
    snapshot_at: new Date().toISOString(),
    open_positions_count: openPositions.length,
    total_positions_value: openPositions.reduce((sum, p) => sum + (p.market_value || 0), 0),
    total_pnl: openPositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0),
    total_pnl_percent: 0, // Calculate based on total cost basis
    day_pnl: 0,
    day_pnl_percent: 0,
    total_delta: openPositions.reduce((sum, p) => sum + (p.delta || 0) * p.quantity, 0),
    total_gamma: openPositions.reduce((sum, p) => sum + (p.gamma || 0) * p.quantity, 0),
    total_theta: openPositions.reduce((sum, p) => sum + (p.theta || 0) * p.quantity, 0),
    total_vega: openPositions.reduce((sum, p) => sum + (p.vega || 0) * p.quantity, 0),
    cash_balance: 100000, // Would come from broker/config
    buying_power: 100000,
    total_value: 100000 + openPositions.reduce((sum, p) => sum + (p.market_value || 0), 0),
  };

  const totalCost = openPositions.reduce((sum, p) => sum + Math.abs(p.total_cost), 0);
  if (totalCost > 0) {
    snapshot.total_pnl_percent = (snapshot.total_pnl / totalCost) * 100;
  }

  await supabase.from("portfolio_snapshots").insert(snapshot);
}

/**
 * Transform database GEX signal row to GEXSignalBundle format
 */
function transformDbToGexBundle(dbRow: any): GEXSignalBundle {
  return {
    ticker: dbRow.ticker,
    expiration: dbRow.expiration,
    currentPrice: dbRow.current_price,
    underlyingPrice: dbRow.current_price,
    calculatedAt: dbRow.calculated_at,
    netGex: dbRow.net_gex ?? 0,
    dealerPosition: dbRow.dealer_position ?? 'NEUTRAL',
    previousDealerPosition: dbRow.previous_dealer_position,
    
    gexFlip: {
      detected: dbRow.gex_flip_detected ?? false,
      direction: dbRow.gex_flip_direction,
      implication: '',
      tradeAction: dbRow.recommended_action ?? 'HOLD',
      conviction: dbRow.action_conviction ?? 'LOW',
      priceVsZeroGamma: dbRow.zero_gamma_level 
        ? (dbRow.current_price > dbRow.zero_gamma_level ? 'ABOVE' : 'BELOW')
        : 'AT',
    },
    
    zeroGammaBreakout: {
      zeroGammaLevel: dbRow.zero_gamma_level,
      currentPrice: dbRow.current_price,
      distancePercent: dbRow.zero_gamma_level 
        ? Math.abs((dbRow.current_price - dbRow.zero_gamma_level) / dbRow.current_price * 100)
        : 0,
      direction: dbRow.zero_gamma_level 
        ? (dbRow.current_price > dbRow.zero_gamma_level ? 'ABOVE' : 'BELOW')
        : 'AT',
      dealerPosition: dbRow.dealer_position ?? 'NEUTRAL',
      expectedBehavior: '',
      tradeAction: 'HOLD',
      conviction: 'LOW',
    },
    
    gexWalls: {
      callWalls: dbRow.call_walls ?? [],
      putWalls: dbRow.put_walls ?? [],
      nearestCallWall: dbRow.nearest_call_wall ? {
        strike: dbRow.nearest_call_wall,
        gexValue: 0,
        strength: dbRow.nearest_call_wall_strength ?? 'MINOR',
        expectedBehavior: 'Resistance',
      } : null,
      nearestPutWall: dbRow.nearest_put_wall ? {
        strike: dbRow.nearest_put_wall,
        gexValue: 0,
        strength: dbRow.nearest_put_wall_strength ?? 'MINOR',
        expectedBehavior: 'Support',
      } : null,
      currentRange: {
        support: dbRow.key_support,
        resistance: dbRow.key_resistance,
      },
      priceNearWall: false,
      wallType: null,
    },
    
    maxPainMagnet: {
      maxPainStrike: dbRow.max_pain_strike ?? dbRow.current_price,
      currentPrice: dbRow.current_price,
      distancePercent: dbRow.max_pain_distance_pct ?? 0,
      dte: 0,
      magnetStrength: dbRow.max_pain_magnet_strength ?? 'NONE',
      expectedDirection: dbRow.max_pain_expected_direction ?? 'NEUTRAL',
      pinExpected: false,
      tradeAction: 'HOLD',
    },
    
    pcRatio: {
      volumeRatio: dbRow.pc_volume_ratio ?? 1,
      oiRatio: dbRow.pc_oi_ratio ?? 1,
      combinedRatio: dbRow.pc_combined_ratio ?? 1,
      sentiment: dbRow.pc_sentiment ?? 'NEUTRAL',
      isExtreme: dbRow.pc_contrarian_conviction === 'HIGH',
      contrarianSignal: dbRow.pc_contrarian_signal ?? 'HOLD',
      conviction: dbRow.pc_contrarian_conviction ?? 'LOW',
      reasoning: '',
    },
    
    marketRegime: {
      regime: dbRow.market_regime ?? 'UNKNOWN',
      confidence: dbRow.regime_confidence ?? 0,
      primaryDriver: dbRow.regime_primary_driver ?? '',
      strategy: dbRow.regime_strategy ?? 'HOLD',
      reasoning: '',
    },
    
    summary: {
      overallBias: dbRow.overall_bias ?? 'NEUTRAL',
      biasStrength: dbRow.bias_strength ?? 'NONE',
      recommendedAction: dbRow.recommended_action ?? 'HOLD',
      actionConviction: dbRow.action_conviction ?? 'LOW',
      reasoning: dbRow.action_reasoning ?? '',
      keyLevels: {
        support: dbRow.key_support,
        resistance: dbRow.key_resistance,
        zeroGamma: dbRow.zero_gamma_level,
        maxPain: dbRow.max_pain_strike ?? dbRow.current_price,
      },
    },
  };
}

// Re-export exit rules for convenience
export { evaluateExitRules, evaluateAllPositions, getDefaultExitRules } from "./exit-rules.ts";
export type { ExitRuleConfig, ExitEvaluation, PositionWithMarketData } from "./exit-rules.ts";
