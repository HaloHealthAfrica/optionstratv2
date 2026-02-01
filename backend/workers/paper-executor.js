// Paper Trading Executor
// Simulates order fills for paper trading mode
import { query, getClient } from '../lib/db.js';
import marketDataService from '../lib/market-data-service.js';

/**
 * Get current option price
 * Uses real underlying price from market data service
 */
async function getOptionPrice(underlying, strike, optionType, expiration) {
  // Fetch real underlying price
  const underlyingData = await marketDataService.getStockPrice(underlying);
  const underlyingPrice = underlyingData.price;
  
  // Calculate intrinsic value
  let intrinsicValue = 0;
  if (optionType === 'CALL') {
    intrinsicValue = Math.max(0, underlyingPrice - strike);
  } else {
    intrinsicValue = Math.max(0, strike - underlyingPrice);
  }
  
  // Calculate days to expiration
  const expirationDate = new Date(expiration);
  const today = new Date();
  const daysToExpiration = Math.max(0, Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24)));
  
  // Simple time value: $0.10 per day to expiration (will be replaced with real options pricing in Phase 2)
  const timeValue = daysToExpiration * 0.10;
  
  // Option price = intrinsic value + time value
  const optionPrice = intrinsicValue + timeValue;
  
  // Minimum price of $0.05
  return Math.max(0.05, optionPrice);
}

/**
 * Get underlying price (deprecated - use marketDataService directly)
 */
async function getUnderlyingPrice(symbol) {
  const priceData = await marketDataService.getStockPrice(symbol);
  return priceData.price;
}

/**
 * Execute a paper trade (simulate fill)
 */
async function executePaperTrade(order) {
  const client = await getClient();
  
  try {
    console.log(`[Paper Executor] Executing paper trade for order ${order.id}`);
    
    // Get simulated fill price
    const fillPrice = await getOptionPrice(
      order.underlying,
      order.strike,
      order.option_type,
      order.expiration
    );
    
    // Add some randomness (±2% slippage)
    const slippage = 1 + (Math.random() * 0.04 - 0.02);
    const avgFillPrice = fillPrice * slippage;
    
    await client.query('BEGIN');
    
    // Update order status
    await client.query(`
      UPDATE orders
      SET 
        status = 'FILLED',
        filled_quantity = quantity,
        avg_fill_price = $1
      WHERE id = $2
    `, [avgFillPrice, order.id]);
    
    // Create trade record
    const tradeResult = await client.query(`
      INSERT INTO trades (
        order_id,
        underlying,
        symbol,
        strike,
        expiration,
        option_type,
        side,
        quantity,
        price,
        executed_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `, [
      order.id,
      order.underlying,
      order.symbol,
      order.strike,
      order.expiration,
      order.option_type,
      order.side,
      order.quantity,
      avgFillPrice,
    ]);
    
    const tradeId = tradeResult.rows[0].id;
    
    // Create or update position
    if (order.side === 'BUY') {
      // Opening position
      await client.query(`
        INSERT INTO refactored_positions (
          signal_id,
          symbol,
          direction,
          quantity,
          entry_price,
          entry_time,
          current_price,
          unrealized_pnl,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, 0, 'OPEN', NOW())
      `, [
        order.signal_id,
        order.underlying,
        order.option_type,
        order.quantity,
        avgFillPrice,
        avgFillPrice,
      ]);
    } else {
      // Closing position
      const positionResult = await client.query(`
        SELECT * FROM refactored_positions
        WHERE signal_id = $1 AND status = 'OPEN'
        LIMIT 1
      `, [order.signal_id]);
      
      if (positionResult.rows.length > 0) {
        const position = positionResult.rows[0];
        const realizedPnl = (avgFillPrice - position.entry_price) * position.quantity * 100;
        
        await client.query(`
          UPDATE refactored_positions
          SET 
            status = 'CLOSED',
            exit_price = $1,
            exit_time = NOW(),
            realized_pnl = $2
          WHERE id = $3
        `, [avgFillPrice, realizedPnl, position.id]);
      }
    }
    
    // Update signal status
    await client.query(`
      UPDATE signals
      SET status = 'EXECUTED'
      WHERE id = $1
    `, [order.signal_id]);
    
    await client.query('COMMIT');
    
    console.log(`[Paper Executor] ✅ Executed paper trade ${tradeId} for order ${order.id} at $${avgFillPrice.toFixed(2)}`);
    
    return {
      success: true,
      trade_id: tradeId,
      order_id: order.id,
      fill_price: avgFillPrice,
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[Paper Executor] Error executing paper trade for order ${order.id}:`, error);
    
    // Mark order as failed
    try {
      await query(`
        UPDATE orders
        SET status = 'FAILED', updated_at = NOW()
        WHERE id = $1
      `, [order.id]);
    } catch (updateError) {
      console.error(`[Paper Executor] Error updating order status:`, updateError);
    }
    
    return {
      success: false,
      order_id: order.id,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Execute all pending paper orders
 */
export async function executePendingPaperOrders() {
  try {
    console.log('[Paper Executor] Starting paper execution run...');
    
    // Fetch pending paper orders
    const result = await query(`
      SELECT * FROM orders
      WHERE mode = 'PAPER'
      AND status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT 100
    `);
    
    const pendingOrders = result.rows;
    
    if (pendingOrders.length === 0) {
      console.log('[Paper Executor] No pending paper orders');
      return { executed: 0, errors: 0 };
    }
    
    console.log(`[Paper Executor] Found ${pendingOrders.length} pending paper orders`);
    
    // Execute orders
    const results = await Promise.all(
      pendingOrders.map(order => executePaperTrade(order))
    );
    
    const stats = {
      executed: results.filter(r => r.success).length,
      errors: results.filter(r => !r.success).length,
    };
    
    console.log(`[Paper Executor] Completed: ${stats.executed} executed, ${stats.errors} errors`);
    
    return stats;
    
  } catch (error) {
    console.error('[Paper Executor] Fatal error:', error);
    throw error;
  }
}

/**
 * Run paper executor on interval
 */
export function startPaperExecutor(intervalMs = 10000) {
  console.log(`[Paper Executor] Starting with ${intervalMs}ms interval`);
  
  // Run immediately
  executePendingPaperOrders().catch(err => {
    console.error('[Paper Executor] Error in initial run:', err);
  });
  
  // Then run on interval
  const interval = setInterval(() => {
    executePendingPaperOrders().catch(err => {
      console.error('[Paper Executor] Error in scheduled run:', err);
    });
  }, intervalMs);
  
  return interval;
}
