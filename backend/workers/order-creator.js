// Order Creator Worker
// Creates orders from approved signals
import { query, getClient } from '../lib/db.js';
import crypto from 'crypto';

/**
 * Calculate strike price for an option
 */
function calculateStrike(signal, currentPrice) {
  // If strike is provided in signal, use it
  if (signal.metadata?.strike) {
    return signal.metadata.strike;
  }
  
  // Otherwise, use ATM (at-the-money)
  // Round to nearest strike (typically $5 or $1 increments)
  const increment = currentPrice > 100 ? 5 : 1;
  return Math.round(currentPrice / increment) * increment;
}

/**
 * Calculate expiration date
 */
function calculateExpiration(signal) {
  // If expiration is provided in signal, use it
  if (signal.metadata?.expiration) {
    return signal.metadata.expiration;
  }
  
  // Otherwise, use next Friday (typical weekly options expiration)
  const today = new Date();
  const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + daysUntilFriday);
  
  return nextFriday.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Calculate position size
 */
async function calculatePositionSize(signal) {
  try {
    // Fetch risk limits
    const result = await query(`
      SELECT * FROM risk_limits 
      WHERE enabled = true 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      // No risk limits, use default size
      return 1;
    }
    
    const limits = result.rows[0];
    const maxPositionSize = limits.max_position_size || 1;
    
    // For now, use max position size
    // TODO: Add more sophisticated sizing (Kelly criterion, volatility-based, etc.)
    return maxPositionSize;
    
  } catch (error) {
    console.error('[Order Creator] Error calculating position size:', error);
    return 1; // Default to 1 contract
  }
}

/**
 * Get current price for a symbol
 */
async function getCurrentPrice(symbol) {
  // TODO: Integrate real market data provider
  // For now, return demo prices
  const demoPrices = {
    'SPY': 502.15,
    'QQQ': 438.20,
    'AAPL': 190.50,
    'TSLA': 245.30,
    'MSFT': 420.80,
  };
  
  return demoPrices[symbol] || 100.00;
}

/**
 * Create an order from an approved signal
 */
async function createOrderFromSignal(signal) {
  const client = await getClient();
  
  try {
    console.log(`[Order Creator] Creating order for signal ${signal.id}`);
    
    // Get current price
    const currentPrice = await getCurrentPrice(signal.symbol);
    
    // Calculate strike and expiration
    const strike = calculateStrike(signal, currentPrice);
    const expiration = calculateExpiration(signal);
    
    // Calculate position size
    const quantity = await calculatePositionSize(signal);
    
    // Determine order side
    const side = signal.metadata?.action === 'SELL' ? 'SELL' : 'BUY';
    
    // Determine mode (PAPER or LIVE)
    const mode = process.env.APP_MODE || 'PAPER';
    
    // Generate client order ID
    const clientOrderId = `${signal.id}-${crypto.randomUUID().substring(0, 8)}`;
    
    // Create order
    await client.query('BEGIN');
    
    const orderResult = await client.query(`
      INSERT INTO orders (
        signal_id,
        client_order_id,
        underlying,
        symbol,
        strike,
        expiration,
        option_type,
        side,
        quantity,
        order_type,
        limit_price,
        time_in_force,
        mode,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING id
    `, [
      signal.id,
      clientOrderId,
      signal.symbol,
      `${signal.symbol}${expiration.replace(/-/g, '')}${signal.direction}${strike}`, // Option symbol
      strike,
      expiration,
      signal.direction,
      side,
      quantity,
      'MARKET', // For now, always use market orders
      null, // No limit price for market orders
      'DAY',
      mode,
      'PENDING',
    ]);
    
    const orderId = orderResult.rows[0].id;
    
    // Update signal status
    await client.query(`
      UPDATE signals
      SET status = 'ORDER_CREATED'
      WHERE id = $1
    `, [signal.id]);
    
    await client.query('COMMIT');
    
    console.log(`[Order Creator] ✅ Created order ${orderId} for signal ${signal.id}`);
    
    return {
      success: true,
      order_id: orderId,
      signal_id: signal.id,
      quantity,
      strike,
      expiration,
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[Order Creator] Error creating order for signal ${signal.id}:`, error);
    return {
      success: false,
      signal_id: signal.id,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Process all approved signals that don't have orders yet
 */
export async function createOrdersFromApprovedSignals() {
  try {
    console.log('[Order Creator] Starting order creation run...');
    
    // Fetch approved signals without orders
    const result = await query(`
      SELECT rs.* 
      FROM refactored_signals rs
      LEFT JOIN orders o ON o.signal_id = rs.id
      WHERE rs.validation_result->>'valid' = 'true'
      AND o.id IS NULL
      ORDER BY rs.created_at ASC
      LIMIT 100
    `);
    
    const approvedSignals = result.rows;
    
    if (approvedSignals.length === 0) {
      console.log('[Order Creator] No approved signals without orders');
      return { created: 0, errors: 0 };
    }
    
    console.log(`[Order Creator] Found ${approvedSignals.length} approved signals without orders`);
    
    // Create orders
    const results = await Promise.all(
      approvedSignals.map(signal => createOrderFromSignal(signal))
    );
    
    const stats = {
      created: results.filter(r => r.success).length,
      errors: results.filter(r => !r.success).length,
    };
    
    console.log(`[Order Creator] Completed: ${stats.created} orders created, ${stats.errors} errors`);
    
    return stats;
    
  } catch (error) {
    console.error('[Order Creator] Fatal error:', error);
    throw error;
  }
}

/**
 * Run order creator on interval
 */
export function startOrderCreator(intervalMs = 30000) {
  console.log(`[Order Creator] Starting with ${intervalMs}ms interval`);
  
  // Run immediately
  createOrdersFromApprovedSignals().catch(err => {
    console.error('[Order Creator] Error in initial run:', err);
  });
  
  // Then run on interval
  const interval = setInterval(() => {
    createOrdersFromApprovedSignals().catch(err => {
      console.error('[Order Creator] Error in scheduled run:', err);
    });
  }, intervalMs);
  
  return interval;
}
