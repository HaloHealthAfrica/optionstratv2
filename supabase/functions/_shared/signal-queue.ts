/**
 * Signal Queue - Pre-Market Signal Queueing System
 * 
 * Stores high-confidence signals received during pre-market hours
 * for execution at market open. This captures overnight setups
 * that would otherwise be rejected by time filters.
 * 
 * Based on analysis: 48% of rejections were time-based (pre/after-market)
 */

import { createDbClient } from "./db-client.ts";
import type { IncomingSignal } from "./types.ts";
import type { MarketSession } from "./market-filters.ts";
import { getCurrentMarketSession } from "./market-filters.ts";

export interface QueuedSignal {
  id: string;
  signal: IncomingSignal;
  source: string;
  confidence_score: number;
  queued_at: string;
  execute_at: string | null;
  status: 'QUEUED' | 'EXECUTED' | 'EXPIRED' | 'CANCELLED';
  underlying: string;
  direction: 'BULLISH' | 'BEARISH';
}

export interface QueueConfig {
  // Minimum confidence score to queue (higher than normal since delayed)
  minQueueConfidence: number;
  // Maximum age of queued signals (minutes after market open)
  maxQueueAge: number;
  // Sessions during which to queue signals
  queueSessions: MarketSession[];
  // Only queue from high-weight sources
  allowedSources: string[];
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  minQueueConfidence: 70, // Higher than normal 65 threshold
  maxQueueAge: 15, // Execute within 15 minutes of market open
  queueSessions: ['PRE_MARKET', 'AFTER_HOURS'],
  allowedSources: [
    'ultimate-option',
    'strat_engine_v6',
    'mtf-trend-dots',
    'orb_bhch_stretch',
  ],
};

// In-memory queue (resets on function cold start)
// For production, this should be stored in database
const signalQueue: Map<string, QueuedSignal> = new Map();

/**
 * Check if a signal should be queued instead of rejected
 */
export function shouldQueueSignal(
  signal: IncomingSignal,
  source: string,
  confidenceScore: number,
  session: MarketSession,
  config: Partial<QueueConfig> = {}
): { shouldQueue: boolean; reason: string } {
  const cfg = { ...DEFAULT_QUEUE_CONFIG, ...config };
  
  // Check if we're in a queueable session
  if (!cfg.queueSessions.includes(session)) {
    return { shouldQueue: false, reason: 'Not in queueable session' };
  }
  
  // Check if source is allowed
  if (!cfg.allowedSources.includes(source)) {
    return { shouldQueue: false, reason: `Source ${source} not allowed for queueing` };
  }
  
  // Check confidence threshold
  if (confidenceScore < cfg.minQueueConfidence) {
    return { shouldQueue: false, reason: `Confidence ${confidenceScore} below queue threshold ${cfg.minQueueConfidence}` };
  }
  
  // Check if signal has required fields
  if (!signal.underlying || !signal.action) {
    return { shouldQueue: false, reason: 'Missing required signal fields' };
  }
  
  return { 
    shouldQueue: true, 
    reason: `Queueing ${source} signal with confidence ${confidenceScore} for market open execution` 
  };
}

/**
 * Add a signal to the pre-market queue
 */
export function queueSignal(
  signal: IncomingSignal,
  source: string,
  confidenceScore: number
): QueuedSignal {
  const id = crypto.randomUUID();
  const direction = (signal.action === 'BUY' && signal.option_type === 'CALL') ||
                    (signal.action === 'SELL' && signal.option_type === 'PUT')
                    ? 'BULLISH' : 'BEARISH';
  
  const queuedSignal: QueuedSignal = {
    id,
    signal,
    source,
    confidence_score: confidenceScore,
    queued_at: new Date().toISOString(),
    execute_at: null, // Will be set at market open
    status: 'QUEUED',
    underlying: signal.underlying || 'UNKNOWN',
    direction,
  };
  
  // Store in memory queue (keyed by underlying + direction to avoid duplicates)
  const key = `${signal.underlying}-${direction}`;
  
  // Only keep the highest confidence signal per underlying/direction
  const existing = signalQueue.get(key);
  if (!existing || existing.confidence_score < confidenceScore) {
    signalQueue.set(key, queuedSignal);
    console.log(`[SignalQueue] Queued ${source} signal for ${signal.underlying} (${direction}, score: ${confidenceScore})`);
  } else {
    console.log(`[SignalQueue] Skipped duplicate - existing signal has higher confidence (${existing.confidence_score} vs ${confidenceScore})`);
  }
  
  return queuedSignal;
}

/**
 * Get all queued signals ready for execution
 */
export function getQueuedSignals(
  config: Partial<QueueConfig> = {}
): QueuedSignal[] {
  const cfg = { ...DEFAULT_QUEUE_CONFIG, ...config };
  const session = getCurrentMarketSession();
  
  // Only return signals during market hours
  if (['PRE_MARKET', 'AFTER_HOURS'].includes(session)) {
    return [];
  }
  
  const now = new Date();
  const validSignals: QueuedSignal[] = [];
  
  for (const [key, signal] of signalQueue) {
    if (signal.status !== 'QUEUED') continue;
    
    const queuedAt = new Date(signal.queued_at);
    const ageMinutes = (now.getTime() - queuedAt.getTime()) / (1000 * 60);
    
    // Check if signal has expired
    if (ageMinutes > cfg.maxQueueAge + 240) { // 240 = max pre-market duration
      signal.status = 'EXPIRED';
      console.log(`[SignalQueue] Signal expired: ${key} (age: ${ageMinutes.toFixed(0)} min)`);
      continue;
    }
    
    validSignals.push(signal);
  }
  
  return validSignals;
}

/**
 * Mark a queued signal as executed
 */
export function markSignalExecuted(signalId: string): void {
  for (const [key, signal] of signalQueue) {
    if (signal.id === signalId) {
      signal.status = 'EXECUTED';
      signal.execute_at = new Date().toISOString();
      console.log(`[SignalQueue] Marked as executed: ${key}`);
      break;
    }
  }
}

/**
 * Clear all queued signals (call after market close)
 */
export function clearQueue(): void {
  const count = signalQueue.size;
  signalQueue.clear();
  console.log(`[SignalQueue] Cleared ${count} signals from queue`);
}

/**
 * Get queue statistics
 */
export function getQueueStats(): {
  total: number;
  queued: number;
  executed: number;
  expired: number;
  byUnderlying: Record<string, number>;
} {
  let queued = 0, executed = 0, expired = 0;
  const byUnderlying: Record<string, number> = {};
  
  for (const signal of signalQueue.values()) {
    if (signal.status === 'QUEUED') queued++;
    else if (signal.status === 'EXECUTED') executed++;
    else if (signal.status === 'EXPIRED') expired++;
    
    byUnderlying[signal.underlying] = (byUnderlying[signal.underlying] || 0) + 1;
  }
  
  return {
    total: signalQueue.size,
    queued,
    executed,
    expired,
    byUnderlying,
  };
}

/**
 * Process queued signals at market open
 * Called by webhook or a scheduled function
 */
export async function processQueuedSignals(): Promise<{
  processed: number;
  errors: string[];
}> {
  const session = getCurrentMarketSession();
  
  // Only process during opening or morning session
  if (!['OPENING', 'MORNING'].includes(session)) {
    return { processed: 0, errors: ['Not in opening/morning session'] };
  }
  
  const queuedSignals = getQueuedSignals();
  const errors: string[] = [];
  let processed = 0;
  
  console.log(`[SignalQueue] Processing ${queuedSignals.length} queued signals`);
  
  for (const queued of queuedSignals) {
    try {
      // Log the queued signal for processing
      // The actual execution will be handled by the normal signal flow
      console.log(`[SignalQueue] Ready to execute: ${queued.underlying} ${queued.direction} from ${queued.source} (score: ${queued.confidence_score})`);
      
      // Mark as executed (the actual trade execution happens in webhook flow)
      markSignalExecuted(queued.id);
      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to process ${queued.id}: ${errorMsg}`);
    }
  }
  
  return { processed, errors };
}

