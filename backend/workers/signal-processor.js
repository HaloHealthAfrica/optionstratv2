// Signal Processor Worker
// Processes pending signals and applies decision logic
import { query, getClient } from '../lib/db.js';

/**
 * Fetch market context for a symbol
 */
async function fetchMarketContext(symbol) {
  try {
    // For now, return basic context
    // TODO: Integrate real market data provider
    return {
      vix_regime: 'LOW_VOL',
      market_bias: 'NEUTRAL',
      or_breakout: 'INSIDE',
      spy_trend: 'NEUTRAL',
      is_market_open: true,
    };
  } catch (error) {
    console.error('[Signal Processor] Error fetching market context:', error);
    return null;
  }
}

/**
 * Fetch MTF analysis for a symbol
 */
async function fetchMTFAnalysis(symbol) {
  try {
    // For now, return neutral analysis
    // TODO: Integrate real MTF analysis
    return {
      recommendation: 'HOLD',
      confidence: 50,
      alignment: {
        isAligned: false,
        score: 0,
      },
    };
  } catch (error) {
    console.error('[Signal Processor] Error fetching MTF analysis:', error);
    return null;
  }
}

/**
 * Check risk limits
 */
async function checkRiskLimits() {
  try {
    const result = await query(`
      SELECT * FROM risk_limits 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      // No risk limits configured, allow all
      return { allowed: true };
    }
    
    const limits = result.rows[0];
    
    // Check current open positions
    const positionsResult = await query(`
      SELECT COUNT(*) as count FROM refactored_positions WHERE status = 'OPEN'
    `);
    const openPositions = parseInt(positionsResult.rows[0].count);
    
    if (limits.max_open_positions && openPositions >= limits.max_open_positions) {
      return {
        allowed: false,
        reason: `Max open positions limit reached (${limits.max_open_positions})`,
      };
    }
    
    // Check daily loss
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const dailyPnLResult = await query(`
      SELECT COALESCE(SUM(realized_pnl), 0) as daily_pnl
      FROM refactored_positions
      WHERE status = 'CLOSED' AND exit_time >= $1
    `, [todayStart.toISOString()]);
    
    const dailyPnL = parseFloat(dailyPnLResult.rows[0].daily_pnl);
    
    if (limits.max_daily_loss && dailyPnL < -Math.abs(limits.max_daily_loss)) {
      return {
        allowed: false,
        reason: `Daily loss limit exceeded ($${Math.abs(dailyPnL).toFixed(2)})`,
      };
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('[Signal Processor] Error checking risk limits:', error.message);
    // On error, allow (don't block trading due to config issues)
    return { allowed: true, warning: 'Risk limits check failed' };
  }
}

/**
 * Apply decision rules to a signal
 */
async function applyDecisionRules(signal, marketContext, mtfAnalysis) {
  const validationResult = {
    valid: false,
    rejection_reason: null,
    stage: 'VALIDATION',
    details: {},
  };
  
  // Rule 1: Market must be open (for now, always pass)
  if (!marketContext?.is_market_open) {
    validationResult.rejection_reason = 'Market is closed';
    return validationResult;
  }
  
  // Rule 2: Check risk limits
  const riskCheck = await checkRiskLimits();
  if (!riskCheck.allowed) {
    validationResult.rejection_reason = riskCheck.reason;
    validationResult.stage = 'RISK_LIMITS';
    return validationResult;
  }
  
  // Rule 3: Basic signal validation (already done in webhook, but double-check)
  if (!signal.symbol || !signal.direction) {
    validationResult.rejection_reason = 'Missing required fields';
    return validationResult;
  }
  
  // Rule 4: For now, approve all signals that pass basic checks
  // TODO: Add more sophisticated decision logic (MTF alignment, market context filters, etc.)
  validationResult.valid = true;
  validationResult.rejection_reason = null;
  validationResult.details = {
    market_context: marketContext,
    mtf_analysis: mtfAnalysis,
    risk_check: riskCheck,
  };
  
  return validationResult;
}

/**
 * Process a single signal
 */
async function processSignal(signal) {
  const client = await getClient();
  
  try {
    console.log(`[Signal Processor] Processing signal ${signal.id} (${signal.symbol} ${signal.direction})`);
    
    // Fetch market context
    const marketContext = await fetchMarketContext(signal.symbol);
    
    // Fetch MTF analysis
    const mtfAnalysis = await fetchMTFAnalysis(signal.symbol);
    
    // Apply decision rules
    const validationResult = await applyDecisionRules(signal, marketContext, mtfAnalysis);
    
    // Update signal with validation result
    await client.query('BEGIN');
    
    await client.query(`
      UPDATE refactored_signals
      SET validation_result = $1
      WHERE id = $2
    `, [JSON.stringify(validationResult), signal.id]);
    
    await client.query(`
      UPDATE signals
      SET status = $1
      WHERE id = $2
    `, [validationResult.valid ? 'APPROVED' : 'REJECTED', signal.id]);
    
    await client.query('COMMIT');
    
    if (validationResult.valid) {
      console.log(`[Signal Processor] ✅ Signal ${signal.id} APPROVED`);
      return { success: true, approved: true, signal_id: signal.id };
    } else {
      console.log(`[Signal Processor] ❌ Signal ${signal.id} REJECTED: ${validationResult.rejection_reason}`);
      return { success: true, approved: false, signal_id: signal.id, reason: validationResult.rejection_reason };
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[Signal Processor] Error processing signal ${signal.id}:`, error);
    return { success: false, signal_id: signal.id, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Process all pending signals
 */
export async function processPendingSignals() {
  try {
    console.log('[Signal Processor] Starting signal processing run...');
    
    // Fetch pending signals
    const result = await query(`
      SELECT * FROM refactored_signals
      WHERE validation_result IS NULL
      ORDER BY created_at ASC
      LIMIT 100
    `);
    
    const pendingSignals = result.rows;
    
    if (pendingSignals.length === 0) {
      console.log('[Signal Processor] No pending signals to process');
      return { processed: 0, approved: 0, rejected: 0 };
    }
    
    console.log(`[Signal Processor] Found ${pendingSignals.length} pending signals`);
    
    // Process each signal
    const results = await Promise.all(
      pendingSignals.map(signal => processSignal(signal))
    );
    
    const stats = {
      processed: results.filter(r => r.success).length,
      approved: results.filter(r => r.success && r.approved).length,
      rejected: results.filter(r => r.success && !r.approved).length,
      errors: results.filter(r => !r.success).length,
    };
    
    console.log(`[Signal Processor] Completed: ${stats.processed} processed, ${stats.approved} approved, ${stats.rejected} rejected, ${stats.errors} errors`);
    
    return stats;
    
  } catch (error) {
    console.error('[Signal Processor] Fatal error:', error);
    throw error;
  }
}

/**
 * Run signal processor on interval
 */
export function startSignalProcessor(intervalMs = 30000) {
  console.log(`[Signal Processor] Starting with ${intervalMs}ms interval`);
  
  // Run immediately
  processPendingSignals().catch(err => {
    console.error('[Signal Processor] Error in initial run:', err);
  });
  
  // Then run on interval
  const interval = setInterval(() => {
    processPendingSignals().catch(err => {
      console.error('[Signal Processor] Error in scheduled run:', err);
    });
  }, intervalMs);
  
  return interval;
}
