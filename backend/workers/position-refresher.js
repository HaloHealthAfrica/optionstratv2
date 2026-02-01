// Position Refresher
// Updates current prices and unrealized PnL for open positions
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
  
  // Simple time value (will be replaced with real options pricing in Phase 2)
  const timeValue = daysToExpiration * 0.10;
  
  // Option price = intrinsic value + time value
  const optionPrice = intrinsicValue + timeValue;
  
  // Minimum price of $0.05
  return Math.max(0.05, optionPrice);
}

/**
 * Refresh a single position
 */
async function refreshPosition(position) {
  try {
    // Get position details from orders/trades
    const orderResult = await query(`
      SELECT o.*, t.strike, t.expiration, t.option_type
      FROM orders o
      LEFT JOIN trades t ON t.order_id = o.id
      WHERE o.signal_id = $1
      AND o.side = 'BUY'
      LIMIT 1
    `, [position.signal_id]);
    
    if (orderResult.rows.length === 0) {
      console.warn(`[Position Refresher] No order found for position ${position.id}`);
      return { success: false, position_id: position.id, error: 'No order found' };
    }
    
    const order = orderResult.rows[0];
    
    // Get current option price
    const currentPrice = await getOptionPrice(
      position.symbol,
      order.strike || position.entry_price, // Fallback to entry price if strike not available
      position.direction,
      order.expiration || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    );
    
    // Calculate unrealized PnL
    const unrealizedPnl = (currentPrice - position.entry_price) * position.quantity * 100;
    
    // Update position
    await query(`
      UPDATE refactored_positions
      SET 
        current_price = $1,
        unrealized_pnl = $2
      WHERE id = $3
    `, [currentPrice, unrealizedPnl, position.id]);
    
    return {
      success: true,
      position_id: position.id,
      current_price: currentPrice,
      unrealized_pnl: unrealizedPnl,
    };
    
  } catch (error) {
    console.error(`[Position Refresher] Error refreshing position ${position.id}:`, error);
    return {
      success: false,
      position_id: position.id,
      error: error.message,
    };
  }
}

/**
 * Refresh all open positions
 */
export async function refreshOpenPositions() {
  try {
    console.log('[Position Refresher] Starting position refresh run...');
    
    // Fetch open positions
    const result = await query(`
      SELECT * FROM refactored_positions
      WHERE status = 'OPEN'
      ORDER BY entry_time ASC
    `);
    
    const openPositions = result.rows;
    
    if (openPositions.length === 0) {
      console.log('[Position Refresher] No open positions to refresh');
      return { refreshed: 0, errors: 0 };
    }
    
    console.log(`[Position Refresher] Found ${openPositions.length} open positions`);
    
    // Refresh positions
    const results = await Promise.all(
      openPositions.map(position => refreshPosition(position))
    );
    
    const stats = {
      refreshed: results.filter(r => r.success).length,
      errors: results.filter(r => !r.success).length,
      total_unrealized_pnl: results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.unrealized_pnl || 0), 0),
    };
    
    console.log(`[Position Refresher] Completed: ${stats.refreshed} refreshed, ${stats.errors} errors, Total unrealized P&L: $${stats.total_unrealized_pnl.toFixed(2)}`);
    
    return stats;
    
  } catch (error) {
    console.error('[Position Refresher] Fatal error:', error);
    throw error;
  }
}

/**
 * Run position refresher on interval
 */
export function startPositionRefresher(intervalMs = 60000) {
  console.log(`[Position Refresher] Starting with ${intervalMs}ms interval`);
  
  // Run immediately
  refreshOpenPositions().catch(err => {
    console.error('[Position Refresher] Error in initial run:', err);
  });
  
  // Then run on interval
  const interval = setInterval(() => {
    refreshOpenPositions().catch(err => {
      console.error('[Position Refresher] Error in scheduled run:', err);
    });
  }, intervalMs);
  
  return interval;
}
