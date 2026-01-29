/**
 * Auto-Close Service
 * Automatically submits close orders for positions that trigger exit rules
 */

import type { Position, OrderRequest, OrderSide, OrderType, Trade } from "./types.ts";
import type { ExitEvaluation, PositionWithMarketData } from "./exit-rules.ts";
import { createAdapter } from "./adapter-factory.ts";
import { createSupabaseClient } from "./supabase-client.ts";
import { generateOccSymbol } from "./types.ts";

export interface AutoCloseResult {
  position_id: string;
  symbol: string;
  success: boolean;
  order_id?: string;
  error?: string;
  exit_reason: string;
  urgency: string;
}

export interface AutoCloseConfig {
  enabled: boolean;
  only_immediate?: boolean; // Only close IMMEDIATE urgency
  dry_run?: boolean; // Log but don't execute
}

/**
 * Determine the correct order side for closing a position
 */
function getCloseSide(position: Position): OrderSide {
  // Long positions (positive quantity) are closed by selling
  // Short positions (negative quantity) are closed by buying
  return position.quantity > 0 ? 'SELL_TO_CLOSE' : 'BUY_TO_CLOSE';
}

/**
 * Submit a single close order for a position
 */
async function submitCloseOrder(
  position: PositionWithMarketData,
  evaluation: ExitEvaluation,
  dryRun = false
): Promise<AutoCloseResult> {
  const correlationId = `auto-close-${position.id}-${Date.now()}`;
  const supabase = createSupabaseClient();
  
  try {
    const side = getCloseSide(position);
    const orderType = evaluation.suggested_order_type as OrderType;
    
    // Build OCC symbol
    const symbol = generateOccSymbol(
      position.underlying,
      position.expiration,
      position.option_type as 'CALL' | 'PUT',
      position.strike
    );
    
    const orderRequest: OrderRequest = {
      symbol,
      underlying: position.underlying,
      strike: position.strike,
      expiration: position.expiration,
      option_type: position.option_type as 'CALL' | 'PUT',
      side,
      quantity: Math.abs(position.quantity),
      order_type: orderType,
      limit_price: evaluation.suggested_limit_price,
      time_in_force: 'DAY',
    };
    
    console.log(`[${correlationId}] Auto-close: ${position.symbol} - ${evaluation.reason} (${evaluation.urgency})`);
    
    if (dryRun) {
      console.log(`[${correlationId}] DRY RUN - would submit:`, orderRequest);
      return {
        position_id: position.id,
        symbol: position.symbol,
        success: true,
        exit_reason: evaluation.reason || 'UNKNOWN',
        urgency: evaluation.urgency,
      };
    }
    
    // Create adapter and submit order
    const { adapter, safety_result, warnings } = createAdapter();
    
    if (warnings.length > 0) {
      console.warn(`[${correlationId}] Adapter warnings:`, warnings);
    }
    
    // Get market price for execution
    const marketPrice = evaluation.suggested_limit_price || 
      position.current_price || 
      position.avg_open_price;
    
    const { result, trade } = await adapter.submitOrder(orderRequest, marketPrice);
    
    if (!result.success) {
      throw new Error(result.error || 'Order submission failed');
    }
    
    // Insert order record
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        id: result.order_id,
        signal_id: null, // Auto-close, no signal
        mode: safety_result.mode,
        underlying: position.underlying,
        symbol: orderRequest.symbol,
        strike: position.strike,
        expiration: position.expiration,
        option_type: position.option_type,
        side,
        quantity: Math.abs(position.quantity),
        order_type: orderType,
        limit_price: evaluation.suggested_limit_price,
        time_in_force: 'DAY',
        status: result.status,
        broker_order_id: result.broker_order_id,
        filled_quantity: result.filled_quantity,
        avg_fill_price: result.avg_fill_price,
        submitted_at: new Date().toISOString(),
        filled_at: result.status === 'FILLED' ? new Date().toISOString() : null,
      })
      .select()
      .single();
    
    if (orderError) {
      console.error(`[${correlationId}] Failed to insert order:`, orderError);
    }
    
    // If filled, create trade record
    if (result.status === 'FILLED' && trade) {
      await supabase.from('trades').insert({
        order_id: result.order_id,
        broker_trade_id: trade.broker_trade_id,
        underlying: trade.underlying,
        symbol: trade.symbol,
        strike: trade.strike,
        expiration: trade.expiration,
        option_type: trade.option_type,
        execution_price: trade.execution_price,
        quantity: trade.quantity,
        commission: trade.commission,
        fees: trade.fees,
        total_cost: trade.total_cost,
        executed_at: trade.executed_at,
      });
      
      // Calculate realized P&L from actual execution price
      // Formula: (exit_price - entry_price) × quantity × 100 (for long positions)
      // For short positions: (entry_price - exit_price) × quantity × 100
      const closePrice = trade.execution_price;
      const entryPrice = position.avg_open_price;
      const qty = Math.abs(position.quantity);
      const contractMultiplier = 100;
      const isLong = position.quantity > 0;
      
      const priceDiff = isLong 
        ? closePrice - entryPrice 
        : entryPrice - closePrice;
      
      const realizedPnl = priceDiff * qty * contractMultiplier;
      
      console.log(`[${correlationId}] Realized P&L calc: entry=${entryPrice}, close=${closePrice}, qty=${qty}, isLong=${isLong}, pnl=${realizedPnl.toFixed(2)}`);
      
      // Close the position with calculated realized P&L
      await supabase
        .from('positions')
        .update({
          is_closed: true,
          closed_at: new Date().toISOString(),
          current_price: closePrice,
          realized_pnl: realizedPnl,
        })
        .eq('id', position.id);
    }
    
    // Log the auto-close action
    await supabase.from('adapter_logs').insert({
      adapter_name: 'auto-close',
      operation: 'auto_close_position',
      correlation_id: correlationId,
      order_id: result.order_id,
      status: result.success ? 'success' : 'failed',
      request_payload: {
        position_id: position.id,
        exit_reason: evaluation.reason,
        urgency: evaluation.urgency,
        order_request: orderRequest,
      },
      response_payload: result,
    });
    
    return {
      position_id: position.id,
      symbol: position.symbol,
      success: true,
      order_id: result.order_id,
      exit_reason: evaluation.reason || 'UNKNOWN',
      urgency: evaluation.urgency,
    };
    
  } catch (error) {
    console.error(`[${correlationId}] Auto-close error:`, error);
    
    // Log the error
    await supabase.from('adapter_logs').insert({
      adapter_name: 'auto-close',
      operation: 'auto_close_position',
      correlation_id: correlationId,
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      request_payload: {
        position_id: position.id,
        exit_reason: evaluation.reason,
        urgency: evaluation.urgency,
      },
    });
    
    return {
      position_id: position.id,
      symbol: position.symbol,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      exit_reason: evaluation.reason || 'UNKNOWN',
      urgency: evaluation.urgency,
    };
  }
}

/**
 * Process all positions with exit signals and submit close orders
 */
export async function autoClosePositions(
  exitSignals: { position: PositionWithMarketData; evaluation: ExitEvaluation }[],
  config: AutoCloseConfig
): Promise<AutoCloseResult[]> {
  if (!config.enabled) {
    console.log('[AutoClose] Auto-close is disabled');
    return [];
  }
  
  if (exitSignals.length === 0) {
    console.log('[AutoClose] No exit signals to process');
    return [];
  }
  
  // Filter by urgency if configured
  let signalsToProcess = exitSignals;
  if (config.only_immediate) {
    signalsToProcess = exitSignals.filter(s => s.evaluation.urgency === 'IMMEDIATE');
    console.log(`[AutoClose] Filtered to ${signalsToProcess.length} IMMEDIATE signals`);
  }
  
  console.log(`[AutoClose] Processing ${signalsToProcess.length} positions for auto-close`);
  
  // Process each position sequentially to avoid race conditions
  const results: AutoCloseResult[] = [];
  
  for (const { position, evaluation } of signalsToProcess) {
    const result = await submitCloseOrder(position, evaluation, config.dry_run);
    results.push(result);
    
    // Small delay between orders to be respectful to broker rate limits
    if (!config.dry_run && signalsToProcess.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`[AutoClose] Complete: ${successful} successful, ${failed} failed`);
  
  return results;
}
