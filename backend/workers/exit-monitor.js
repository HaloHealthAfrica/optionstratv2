// Exit Monitor
// Monitors open positions and generates exit signals based on rules
import { query, getClient } from '../lib/db.js';

/**
 * Get exit rules
 */
async function getExitRules() {
  try {
    const result = await query(`
      SELECT * FROM exit_rules
      WHERE enabled = true
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      // Default exit rules
      return {
        profit_target_percent: 50,
        stop_loss_percent: 50,
        trailing_stop_percent: null,
        time_stop_dte: 1,
        max_hold_days: 5,
      };
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('[Exit Monitor] Error fetching exit rules:', error);
    // Return default rules on error
    return {
      profit_target_percent: 50,
      stop_loss_percent: 50,
      trailing_stop_percent: null,
      time_stop_dte: 1,
      max_hold_days: 5,
    };
  }
}

/**
 * Evaluate exit conditions for a position
 */
async function evaluateExitConditions(position, exitRules) {
  const alerts = [];
  
  // Calculate P&L percentage
  const pnlPercent = (position.unrealized_pnl / (position.entry_price * position.quantity * 100)) * 100;
  
  // Rule 1: Profit Target
  if (exitRules.profit_target_percent && pnlPercent >= exitRules.profit_target_percent) {
    alerts.push({
      position_id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      quantity: position.quantity,
      entry_price: position.entry_price,
      current_price: position.current_price,
      unrealized_pnl: position.unrealized_pnl,
      unrealized_pnl_percent: pnlPercent,
      priority: 'HIGH',
      reason: 'PROFIT_TARGET',
      details: `Position up ${pnlPercent.toFixed(1)}%, target is ${exitRules.profit_target_percent}%`,
      recommended_action: 'CLOSE_POSITION',
      urgency: 'END_OF_DAY',
    });
  }
  
  // Rule 2: Stop Loss
  if (exitRules.stop_loss_percent && pnlPercent <= -exitRules.stop_loss_percent) {
    alerts.push({
      position_id: position.id,
      symbol: position.symbol,
      direction: position.direction,
      quantity: position.quantity,
      entry_price: position.entry_price,
      current_price: position.current_price,
      unrealized_pnl: position.unrealized_pnl,
      unrealized_pnl_percent: pnlPercent,
      priority: 'CRITICAL',
      reason: 'STOP_LOSS',
      details: `Position down ${Math.abs(pnlPercent).toFixed(1)}%, stop loss is ${exitRules.stop_loss_percent}%`,
      recommended_action: 'CLOSE_POSITION_IMMEDIATELY',
      urgency: 'IMMEDIATE',
    });
  }
  
  // Rule 3: Time Stop (Days to Expiration)
  // Get expiration from order
  const orderResult = await query(`
    SELECT o.expiration
    FROM orders o
    WHERE o.signal_id = $1
    AND o.side = 'BUY'
    LIMIT 1
  `, [position.signal_id]);
  
  if (orderResult.rows.length > 0 && orderResult.rows[0].expiration) {
    const expirationDate = new Date(orderResult.rows[0].expiration);
    const today = new Date();
    const daysToExpiration = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
    
    if (exitRules.time_stop_dte && daysToExpiration <= exitRules.time_stop_dte) {
      alerts.push({
        position_id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        quantity: position.quantity,
        entry_price: position.entry_price,
        current_price: position.current_price,
        unrealized_pnl: position.unrealized_pnl,
        unrealized_pnl_percent: pnlPercent,
        days_to_expiration: daysToExpiration,
        expiration: orderResult.rows[0].expiration,
        priority: daysToExpiration === 0 ? 'CRITICAL' : 'HIGH',
        reason: 'EXPIRATION_APPROACHING',
        details: `${daysToExpiration} day(s) to expiration`,
        recommended_action: 'CLOSE_POSITION',
        urgency: daysToExpiration === 0 ? 'IMMEDIATE' : 'END_OF_DAY',
      });
    }
  }
  
  // Rule 4: Max Hold Days
  if (exitRules.max_hold_days) {
    const entryDate = new Date(position.entry_time);
    const today = new Date();
    const daysHeld = Math.ceil((today - entryDate) / (1000 * 60 * 60 * 24));
    
    if (daysHeld >= exitRules.max_hold_days) {
      alerts.push({
        position_id: position.id,
        symbol: position.symbol,
        direction: position.direction,
        quantity: position.quantity,
        entry_price: position.entry_price,
        current_price: position.current_price,
        unrealized_pnl: position.unrealized_pnl,
        unrealized_pnl_percent: pnlPercent,
        days_held: daysHeld,
        priority: 'MEDIUM',
        reason: 'MAX_HOLD_TIME',
        details: `Position held for ${daysHeld} days, max is ${exitRules.max_hold_days} days`,
        recommended_action: 'REVIEW_POSITION',
        urgency: 'END_OF_DAY',
      });
    }
  }
  
  return alerts;
}

/**
 * Create exit order for a position
 */
async function createExitOrder(position, alert) {
  const client = await getClient();
  
  try {
    console.log(`[Exit Monitor] Creating exit order for position ${position.id}`);
    
    // Get original order details
    const orderResult = await query(`
      SELECT * FROM orders
      WHERE signal_id = $1
      AND side = 'BUY'
      LIMIT 1
    `, [position.signal_id]);
    
    if (orderResult.rows.length === 0) {
      throw new Error('Original order not found');
    }
    
    const originalOrder = orderResult.rows[0];
    
    await client.query('BEGIN');
    
    // Create exit order
    const exitOrderResult = await client.query(`
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
      position.signal_id,
      `exit-${position.id}-${Date.now()}`,
      originalOrder.underlying,
      originalOrder.symbol,
      originalOrder.strike,
      originalOrder.expiration,
      originalOrder.option_type,
      'SELL', // Exit is always SELL
      position.quantity,
      alert.urgency === 'IMMEDIATE' ? 'MARKET' : 'LIMIT',
      alert.urgency === 'IMMEDIATE' ? null : position.current_price,
      'DAY',
      originalOrder.mode,
      'PENDING',
    ]);
    
    const exitOrderId = exitOrderResult.rows[0].id;
    
    await client.query('COMMIT');
    
    console.log(`[Exit Monitor] ✅ Created exit order ${exitOrderId} for position ${position.id}`);
    
    return {
      success: true,
      exit_order_id: exitOrderId,
      position_id: position.id,
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[Exit Monitor] Error creating exit order for position ${position.id}:`, error);
    return {
      success: false,
      position_id: position.id,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Monitor all open positions and generate exit signals
 */
export async function monitorPositionsForExits() {
  try {
    console.log('[Exit Monitor] Starting exit monitoring run...');
    
    // Get exit rules
    const exitRules = await getExitRules();
    
    // Fetch open positions
    const result = await query(`
      SELECT * FROM refactored_positions
      WHERE status = 'OPEN'
      AND current_price IS NOT NULL
      ORDER BY entry_time ASC
    `);
    
    const openPositions = result.rows;
    
    if (openPositions.length === 0) {
      console.log('[Exit Monitor] No open positions to monitor');
      return {
        monitored: 0,
        alerts_generated: 0,
        exit_orders_created: 0,
      };
    }
    
    console.log(`[Exit Monitor] Monitoring ${openPositions.length} open positions`);
    
    // Evaluate each position
    const allAlerts = [];
    for (const position of openPositions) {
      const alerts = await evaluateExitConditions(position, exitRules);
      allAlerts.push(...alerts);
    }
    
    // Create exit orders for critical alerts
    const criticalAlerts = allAlerts.filter(a => a.priority === 'CRITICAL');
    const exitOrderResults = await Promise.all(
      criticalAlerts.map(alert => {
        const position = openPositions.find(p => p.id === alert.position_id);
        return createExitOrder(position, alert);
      })
    );
    
    const stats = {
      monitored: openPositions.length,
      alerts_generated: allAlerts.length,
      exit_orders_created: exitOrderResults.filter(r => r.success).length,
      critical_alerts: criticalAlerts.length,
      high_alerts: allAlerts.filter(a => a.priority === 'HIGH').length,
      medium_alerts: allAlerts.filter(a => a.priority === 'MEDIUM').length,
    };
    
    console.log(`[Exit Monitor] Completed: ${stats.monitored} monitored, ${stats.alerts_generated} alerts, ${stats.exit_orders_created} exit orders created`);
    
    return stats;
    
  } catch (error) {
    console.error('[Exit Monitor] Fatal error:', error);
    throw error;
  }
}

/**
 * Get current exit alerts (for API endpoint)
 */
export async function getCurrentExitAlerts() {
  try {
    const exitRules = await getExitRules();
    
    const result = await query(`
      SELECT * FROM refactored_positions
      WHERE status = 'OPEN'
      AND current_price IS NOT NULL
      ORDER BY entry_time ASC
    `);
    
    const openPositions = result.rows;
    
    const allAlerts = [];
    for (const position of openPositions) {
      const alerts = await evaluateExitConditions(position, exitRules);
      allAlerts.push(...alerts);
    }
    
    return {
      alerts: allAlerts,
      summary: {
        total_positions: openPositions.length,
        positions_with_alerts: new Set(allAlerts.map(a => a.position_id)).size,
        critical_alerts: allAlerts.filter(a => a.priority === 'CRITICAL').length,
        high_alerts: allAlerts.filter(a => a.priority === 'HIGH').length,
        medium_alerts: allAlerts.filter(a => a.priority === 'MEDIUM').length,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[Exit Monitor] Error getting current alerts:', error);
    return {
      alerts: [],
      summary: {
        total_positions: 0,
        positions_with_alerts: 0,
        critical_alerts: 0,
        high_alerts: 0,
        medium_alerts: 0,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Run exit monitor on interval
 */
export function startExitMonitor(intervalMs = 60000) {
  console.log(`[Exit Monitor] Starting with ${intervalMs}ms interval`);
  
  // Run immediately
  monitorPositionsForExits().catch(err => {
    console.error('[Exit Monitor] Error in initial run:', err);
  });
  
  // Then run on interval
  const interval = setInterval(() => {
    monitorPositionsForExits().catch(err => {
      console.error('[Exit Monitor] Error in scheduled run:', err);
    });
  }, intervalMs);
  
  return interval;
}
