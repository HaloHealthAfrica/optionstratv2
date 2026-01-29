/**
 * Paper Trading Service
 * 
 * Executes and manages paper trades with full context capture
 */

import { createSupabaseClient } from '../supabase-client.ts';

const createServiceClient = createSupabaseClient;
import type { 
  GEXSignalBundle, 
  EntryDecision, 
  ExitDecision,
  PaperTradingStats,
  MarketRegime,
} from './types.ts';

interface PaperEntryInput {
  signal: {
    id: string;
    underlying: string;
    symbol: string;
    strike: number;
    expiration: string;
    optionType: 'CALL' | 'PUT';
    side: 'BUY_TO_OPEN' | 'SELL_TO_CLOSE';
    quantity: number;
  };
  entryDecision: EntryDecision;
  gexSignals: GEXSignalBundle;
  currentPrice: number;
  underlyingPrice: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    iv?: number;
  };
  vix?: number;
}

/**
 * Execute paper trade entry
 */
export async function executePaperEntry(input: PaperEntryInput): Promise<{ success: boolean; tradeId?: string; error?: string }> {
  const supabase = createServiceClient();
  
  const { signal, entryDecision, gexSignals, currentPrice, underlyingPrice, greeks, vix } = input;
  
  // Calculate trade plan levels
  const tradePlan = {
    stopLoss: entryDecision.stopLoss,
    target1: entryDecision.target1,
    target2: entryDecision.target2,
    trailingStopPct: entryDecision.trailingStopPct,
    maxHoldHours: entryDecision.maxHoldHours,
  };
  
  const paperTrade = {
    ticker: signal.underlying,
    symbol: signal.symbol,
    strike: signal.strike,
    expiration: signal.expiration,
    option_type: signal.optionType,
    side: signal.side,
    quantity: entryDecision.adjustedQuantity,
    entry_price: currentPrice,
    entry_underlying_price: underlyingPrice,
    signal_id: signal.id,
    
    // Entry context snapshot
    entry_market_regime: gexSignals.marketRegime.regime,
    entry_dealer_position: gexSignals.dealerPosition,
    entry_zero_gamma: gexSignals.zeroGammaBreakout.zeroGammaLevel,
    entry_max_pain: gexSignals.maxPainMagnet.maxPainStrike,
    entry_pc_ratio: gexSignals.pcRatio.combinedRatio,
    entry_vix: vix,
    entry_context: {
      gexBias: gexSignals.summary.overallBias,
      regimeConfidence: gexSignals.marketRegime.confidence,
      zeroGammaDirection: gexSignals.zeroGammaBreakout.direction,
      pcSentiment: gexSignals.pcRatio.sentiment,
      keySupport: gexSignals.gexWalls.currentRange.support,
      keyResistance: gexSignals.gexWalls.currentRange.resistance,
    },
    
    // Trade plan
    planned_stop_loss: tradePlan.stopLoss,
    planned_target_1: tradePlan.target1,
    planned_target_2: tradePlan.target2,
    trailing_stop_enabled: true,
    trailing_stop_pct: tradePlan.trailingStopPct,
    max_hold_hours: tradePlan.maxHoldHours,
    
    // Initial state
    status: 'OPEN',
    current_price: currentPrice,
    current_underlying_price: underlyingPrice,
    highest_price_since_entry: currentPrice,
    lowest_price_since_entry: currentPrice,
    
    // Greeks at entry
    entry_delta: greeks?.delta,
    entry_gamma: greeks?.gamma,
    entry_theta: greeks?.theta,
    entry_iv: greeks?.iv,
    current_delta: greeks?.delta,
    current_gamma: greeks?.gamma,
    current_theta: greeks?.theta,
    current_iv: greeks?.iv,
    
    // P&L
    unrealized_pnl: 0,
    unrealized_pnl_pct: 0,
    
    // Decision log
    entry_decision_log: entryDecision.decisionLog,
  };
  
  const { data, error } = await supabase
    .from('paper_trades')
    .insert(paperTrade)
    .select('id')
    .single();
  
  if (error) {
    console.error('[PaperTrading] Entry failed:', error);
    return { success: false, error: error.message };
  }
  
  // Update account daily trades
  await updateAccountStats(supabase, 'entry');
  
  console.log(`[PaperTrading] Entry executed: ${data.id}`);
  return { success: true, tradeId: data.id };
}

/**
 * Execute paper trade exit
 */
export async function executePaperExit(
  tradeId: string,
  exitDecision: ExitDecision,
  currentPrice: number,
  underlyingPrice: number,
  currentRegime?: MarketRegime
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  
  // Fetch the trade
  const { data: trade, error: fetchError } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('id', tradeId)
    .single();
  
  if (fetchError || !trade) {
    return { success: false, error: 'Trade not found' };
  }
  
  const isPartialExit = exitDecision.action === 'CLOSE_PARTIAL';
  const exitQuantityPct = exitDecision.exitQuantityPct || 100;
  const exitQuantity = Math.ceil(trade.quantity * (exitQuantityPct / 100));
  const remainingQuantity = trade.quantity - exitQuantity;
  
  // Calculate P&L
  const pnlPerContract = (currentPrice - trade.entry_price) * 100; // Options multiplier
  const exitPnl = pnlPerContract * exitQuantity;
  const exitPnlPct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
  
  // Calculate time in trade
  const entryTime = new Date(trade.entry_timestamp).getTime();
  const exitTime = Date.now();
  const hoursInTrade = (exitTime - entryTime) / (1000 * 60 * 60);
  
  // Calculate excursions
  const maxFavorableExcursion = trade.highest_price_since_entry - trade.entry_price;
  const maxAdverseExcursion = trade.entry_price - trade.lowest_price_since_entry;
  
  if (isPartialExit && remainingQuantity > 0) {
    // Partial exit - update trade
    const { error } = await supabase
      .from('paper_trades')
      .update({
        quantity: remainingQuantity,
        partial_exit_quantity: (trade.partial_exit_quantity || 0) + exitQuantity,
        partial_exit_price: currentPrice,
        partial_exit_timestamp: new Date().toISOString(),
        partial_exit_reason: exitDecision.reason,
        realized_pnl: (trade.realized_pnl || 0) + exitPnl,
        status: 'PARTIAL_CLOSED',
        hold_decisions_log: [
          ...(trade.hold_decisions_log || []),
          {
            action: 'PARTIAL_EXIT',
            timestamp: new Date().toISOString(),
            exitQuantity,
            exitPrice: currentPrice,
            reason: exitDecision.reason,
          },
        ],
      })
      .eq('id', tradeId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    console.log(`[PaperTrading] Partial exit: ${tradeId}, ${exitQuantity} contracts at ${currentPrice}`);
    return { success: true };
  }
  
  // Full exit - close the trade
  const totalPnl = (trade.realized_pnl || 0) + exitPnl;
  const isWinner = totalPnl > 0;
  
  const { error } = await supabase
    .from('paper_trades')
    .update({
      status: 'CLOSED',
      exit_price: currentPrice,
      exit_timestamp: new Date().toISOString(),
      exit_reason: exitDecision.reason,
      exit_signal_type: exitDecision.trigger,
      exit_market_regime: currentRegime,
      exit_underlying_price: underlyingPrice,
      exit_decision_log: exitDecision.decisionLog,
      realized_pnl: (trade.realized_pnl || 0) + exitPnl,
      total_pnl: totalPnl,
      time_in_trade_hours: hoursInTrade,
      max_favorable_excursion: maxFavorableExcursion,
      max_adverse_excursion: maxAdverseExcursion,
    })
    .eq('id', tradeId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  // Update account stats
  await updateAccountStats(supabase, 'exit', {
    pnl: totalPnl,
    isWinner,
    regime: trade.entry_market_regime,
    signalType: exitDecision.trigger,
  });
  
  console.log(`[PaperTrading] Exit executed: ${tradeId}, P&L: ${totalPnl.toFixed(2)}`);
  return { success: true };
}

/**
 * Update position with current market data
 */
export async function updatePaperPosition(
  tradeId: string,
  currentPrice: number,
  underlyingPrice: number,
  greeks?: { delta?: number; gamma?: number; theta?: number; iv?: number }
): Promise<void> {
  const supabase = createServiceClient();
  
  const { data: trade } = await supabase
    .from('paper_trades')
    .select('entry_price, highest_price_since_entry, lowest_price_since_entry, quantity')
    .eq('id', tradeId)
    .single();
  
  if (!trade) return;
  
  const unrealizedPnl = (currentPrice - trade.entry_price) * trade.quantity * 100;
  const unrealizedPnlPct = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;
  
  await supabase
    .from('paper_trades')
    .update({
      current_price: currentPrice,
      current_underlying_price: underlyingPrice,
      highest_price_since_entry: Math.max(trade.highest_price_since_entry || currentPrice, currentPrice),
      lowest_price_since_entry: Math.min(trade.lowest_price_since_entry || currentPrice, currentPrice),
      unrealized_pnl: unrealizedPnl,
      unrealized_pnl_pct: unrealizedPnlPct,
      current_delta: greeks?.delta,
      current_gamma: greeks?.gamma,
      current_theta: greeks?.theta,
      current_iv: greeks?.iv,
    })
    .eq('id', tradeId);
}

/**
 * Get open paper positions
 */
export async function getOpenPaperPositions(): Promise<any[]> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from('paper_trades')
    .select('*')
    .in('status', ['OPEN', 'PARTIAL_CLOSED'])
    .order('entry_timestamp', { ascending: false });
  
  if (error) {
    console.error('[PaperTrading] Failed to fetch positions:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Get paper trading stats
 */
export async function getPaperTradingStats(): Promise<PaperTradingStats | null> {
  const supabase = createServiceClient();
  
  const { data: account } = await supabase
    .from('paper_trading_account')
    .select('*')
    .eq('is_active', true)
    .single();
  
  if (!account) return null;
  
  // Get open positions count
  const { count: openCount } = await supabase
    .from('paper_trades')
    .select('*', { count: 'exact', head: true })
    .in('status', ['OPEN', 'PARTIAL_CLOSED']);
  
  // Get open position value
  const { data: openTrades } = await supabase
    .from('paper_trades')
    .select('current_price, quantity')
    .in('status', ['OPEN', 'PARTIAL_CLOSED']);
  
  const openPositionValue = (openTrades || []).reduce(
    (sum: number, t: { current_price: number | null; quantity: number | null }) => 
      sum + (t.current_price || 0) * (t.quantity || 0) * 100,
    0
  );
  
  return {
    accountName: account.account_name,
    startingBalance: account.starting_balance,
    currentBalance: account.current_balance,
    totalTrades: account.total_trades,
    winningTrades: account.winning_trades,
    losingTrades: account.losing_trades,
    winRate: account.win_rate,
    totalPnl: account.total_pnl,
    profitFactor: account.profit_factor,
    averageWinner: account.average_winner,
    averageLoser: account.average_loser,
    bestTrade: account.best_trade_pnl,
    worstTrade: account.worst_trade_pnl,
    maxDrawdown: account.max_drawdown,
    maxDrawdownPct: account.max_drawdown_pct,
    regimeStats: [
      { regime: 'TRENDING_UP', trades: account.trending_up_trades, winRate: account.trending_up_win_rate },
      { regime: 'TRENDING_DOWN', trades: account.trending_down_trades, winRate: account.trending_down_win_rate },
      { regime: 'RANGE_BOUND', trades: account.range_bound_trades, winRate: account.range_bound_win_rate },
      { regime: 'BREAKOUT_IMMINENT', trades: account.breakout_trades, winRate: account.breakout_win_rate },
      { regime: 'REVERSAL_UP', trades: account.reversal_trades, winRate: account.reversal_win_rate },
      { regime: 'REVERSAL_DOWN', trades: account.reversal_trades, winRate: account.reversal_win_rate },
    ],
    signalStats: [
      { signal: 'GEX_FLIP', trades: account.gex_flip_trades, winRate: account.gex_flip_win_rate },
      { signal: 'ZERO_GAMMA', trades: account.zero_gamma_trades, winRate: account.zero_gamma_win_rate },
      { signal: 'MAX_PAIN', trades: account.max_pain_trades, winRate: account.max_pain_win_rate },
      { signal: 'PC_EXTREME', trades: account.pc_extreme_trades, winRate: account.pc_extreme_win_rate },
    ],
    dailyPnl: account.daily_pnl,
    dailyTrades: account.daily_trades,
    weeklyPnl: account.weekly_pnl,
    weeklyTrades: account.weekly_trades,
    openPositions: openCount || 0,
    openPositionValue,
  };
}

/**
 * Update account statistics
 */
async function updateAccountStats(
  supabase: ReturnType<typeof createServiceClient>,
  action: 'entry' | 'exit',
  exitData?: { pnl: number; isWinner: boolean; regime?: string; signalType?: string | null }
): Promise<void> {
  const { data: account } = await supabase
    .from('paper_trading_account')
    .select('*')
    .eq('is_active', true)
    .single();
  
  if (!account) return;
  
  // Check if daily reset needed
  const now = new Date();
  const dailyReset = new Date(account.daily_reset_at);
  const needsDailyReset = now.getDate() !== dailyReset.getDate();
  
  // Check if weekly reset needed
  const weeklyReset = new Date(account.weekly_reset_at);
  const daysSinceWeeklyReset = (now.getTime() - weeklyReset.getTime()) / (1000 * 60 * 60 * 24);
  const needsWeeklyReset = daysSinceWeeklyReset >= 7;
  
  const updates: Record<string, unknown> = {};
  
  if (needsDailyReset) {
    updates.daily_pnl = 0;
    updates.daily_trades = 0;
    updates.daily_reset_at = now.toISOString();
  }
  
  if (needsWeeklyReset) {
    updates.weekly_pnl = 0;
    updates.weekly_trades = 0;
    updates.weekly_reset_at = now.toISOString();
  }
  
  if (action === 'entry') {
    updates.daily_trades = (needsDailyReset ? 0 : account.daily_trades) + 1;
    updates.weekly_trades = (needsWeeklyReset ? 0 : account.weekly_trades) + 1;
  }
  
  if (action === 'exit' && exitData) {
    const { pnl, isWinner, regime } = exitData;
    
    updates.total_trades = account.total_trades + 1;
    updates.winning_trades = account.winning_trades + (isWinner ? 1 : 0);
    updates.losing_trades = account.losing_trades + (isWinner ? 0 : 1);
    updates.win_rate = (account.winning_trades + (isWinner ? 1 : 0)) / (account.total_trades + 1);
    updates.total_pnl = account.total_pnl + pnl;
    updates.current_balance = account.current_balance + pnl;
    updates.daily_pnl = (needsDailyReset ? 0 : account.daily_pnl) + pnl;
    updates.weekly_pnl = (needsWeeklyReset ? 0 : account.weekly_pnl) + pnl;
    
    // Best/worst trade
    if (!account.best_trade_pnl || pnl > account.best_trade_pnl) {
      updates.best_trade_pnl = pnl;
    }
    if (!account.worst_trade_pnl || pnl < account.worst_trade_pnl) {
      updates.worst_trade_pnl = pnl;
    }
    
    // Max drawdown
    const drawdown = account.starting_balance - (account.current_balance + pnl);
    if (drawdown > account.max_drawdown) {
      updates.max_drawdown = drawdown;
      updates.max_drawdown_pct = (drawdown / account.starting_balance) * 100;
    }
    
    // Update regime stats
    if (regime) {
      const regimeKey = regime.toLowerCase().replace(/_/g, '_');
      const tradesKey = `${regimeKey}_trades`;
      const winRateKey = `${regimeKey}_win_rate`;
      
      if (tradesKey in account) {
        const accountAny = account as Record<string, number | null>;
        const trades = (accountAny[tradesKey] || 0) + 1;
        const wins = isWinner ? 1 : 0;
        const prevWins = (accountAny[winRateKey] || 0) * (accountAny[tradesKey] || 0);
        updates[tradesKey] = trades;
        updates[winRateKey] = (prevWins + wins) / trades;
      }
    }
  }
  
  if (Object.keys(updates).length > 0) {
    await supabase
      .from('paper_trading_account')
      .update(updates)
      .eq('id', account.id);
  }
}
