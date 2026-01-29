/**
 * Position Cooldown Filter
 * 
 * Prevents rapid successive trades on the same instrument by:
 * 1. Checking recent signals/orders for the same ticker+strike+expiration+option_type
 * 2. Checking if we already have an open position on the same contract
 * 3. Enforcing a minimum cooldown period between trades
 */

import { createSupabaseClient } from "./supabase-client.ts";

export interface CooldownConfig {
  /** Minimum seconds between trades on same instrument (default: 180 = 3 minutes) */
  cooldownSeconds: number;
  /** Prevent adding to existing positions (default: true) */
  blockDuplicatePositions: boolean;
  /** Maximum position quantity per contract before blocking new entries (default: 10) */
  maxPositionQuantity: number;
  /** Allow scaling into existing positions if below max (default: false) */
  allowScaling: boolean;
}

export interface CooldownResult {
  approved: boolean;
  reason: string;
  details: {
    existingPosition?: {
      id: string;
      quantity: number;
      opened_at: string;
    };
    recentSignal?: {
      id: string;
      created_at: string;
      seconds_ago: number;
    };
    cooldownRemaining?: number;
  };
}

const DEFAULT_CONFIG: CooldownConfig = {
  cooldownSeconds: 180, // 3 minutes
  blockDuplicatePositions: true,
  maxPositionQuantity: 10,
  allowScaling: false,
};

/**
 * Check if we should allow a new trade on this instrument
 */
export async function checkPositionCooldown(
  underlying: string,
  strike: number,
  expiration: string,
  optionType: 'CALL' | 'PUT',
  action: 'BUY' | 'SELL' | 'CLOSE',
  config: Partial<CooldownConfig> = {}
): Promise<CooldownResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const supabase = createSupabaseClient();
  
  // CLOSE actions bypass cooldown - we always want to allow exits
  if (action === 'CLOSE') {
    return {
      approved: true,
      reason: 'Close action bypasses cooldown',
      details: {},
    };
  }

  // 1. Check for existing open position on same contract
  const { data: existingPosition } = await supabase
    .from('positions')
    .select('id, quantity, opened_at, symbol')
    .eq('underlying', underlying)
    .eq('strike', strike)
    .eq('expiration', expiration)
    .eq('option_type', optionType)
    .eq('is_closed', false)
    .maybeSingle();

  if (existingPosition) {
    // We have an existing position
    if (cfg.blockDuplicatePositions && !cfg.allowScaling) {
      return {
        approved: false,
        reason: `Already holding position on ${underlying} ${strike} ${optionType} (qty: ${existingPosition.quantity})`,
        details: {
          existingPosition: {
            id: existingPosition.id,
            quantity: existingPosition.quantity,
            opened_at: existingPosition.opened_at,
          },
        },
      };
    }

    // If scaling allowed, check max quantity
    if (cfg.allowScaling && existingPosition.quantity >= cfg.maxPositionQuantity) {
      return {
        approved: false,
        reason: `Position size limit reached: ${existingPosition.quantity}/${cfg.maxPositionQuantity} contracts`,
        details: {
          existingPosition: {
            id: existingPosition.id,
            quantity: existingPosition.quantity,
            opened_at: existingPosition.opened_at,
          },
        },
      };
    }
  }

  // 2. Check recent signals for same instrument (within cooldown window)
  // ONLY check COMPLETED signals that resulted in actual positions (not rejected ones)
  const cooldownCutoff = new Date(Date.now() - cfg.cooldownSeconds * 1000).toISOString();
  
  const { data: recentSignals } = await supabase
    .from('signals')
    .select('id, created_at, status')
    .eq('underlying', underlying)
    .eq('strike', strike)
    .eq('expiration', expiration)
    .eq('option_type', optionType)
    .eq('status', 'COMPLETED') // Only COMPLETED signals that actually executed
    .gte('created_at', cooldownCutoff)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentSignals && recentSignals.length > 0) {
    const recentSignal = recentSignals[0];
    const secondsAgo = Math.floor(
      (Date.now() - new Date(recentSignal.created_at).getTime()) / 1000
    );
    const cooldownRemaining = cfg.cooldownSeconds - secondsAgo;

    return {
      approved: false,
      reason: `Cooldown active: traded ${secondsAgo}s ago (wait ${cooldownRemaining}s)`,
      details: {
        recentSignal: {
          id: recentSignal.id,
          created_at: recentSignal.created_at,
          seconds_ago: secondsAgo,
        },
        cooldownRemaining,
      },
    };
  }

  // 3. Also check recent orders to catch any edge cases
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, created_at, status, side')
    .eq('underlying', underlying)
    .eq('strike', strike)
    .eq('expiration', expiration)
    .eq('option_type', optionType)
    .in('status', ['PENDING', 'FILLED', 'SUBMITTED'])
    .gte('created_at', cooldownCutoff)
    .order('created_at', { ascending: false })
    .limit(1);

  if (recentOrders && recentOrders.length > 0) {
    const recentOrder = recentOrders[0];
    // Only block if it was a buy order (we want to allow close orders)
    if (recentOrder.side.includes('BUY') || recentOrder.side.includes('OPEN')) {
      const secondsAgo = Math.floor(
        (Date.now() - new Date(recentOrder.created_at).getTime()) / 1000
      );
      const cooldownRemaining = cfg.cooldownSeconds - secondsAgo;

      return {
        approved: false,
        reason: `Order cooldown: order placed ${secondsAgo}s ago (wait ${cooldownRemaining}s)`,
        details: {
          recentSignal: {
            id: recentOrder.id,
            created_at: recentOrder.created_at,
            seconds_ago: secondsAgo,
          },
          cooldownRemaining,
        },
      };
    }
  }

  // All checks passed
  return {
    approved: true,
    reason: 'No cooldown active, no duplicate position',
    details: {},
  };
}

/**
 * Quick check for underlying-level cooldown (faster, less specific)
 * Use this for initial filtering before detailed contract check
 */
export async function checkUnderlyingCooldown(
  underlying: string,
  cooldownSeconds: number = 60
): Promise<{ approved: boolean; reason: string }> {
  const supabase = createSupabaseClient();
  const cutoff = new Date(Date.now() - cooldownSeconds * 1000).toISOString();

  const { data: recentSignals, error } = await supabase
    .from('signals')
    .select('id, created_at')
    .eq('underlying', underlying)
    .in('status', ['COMPLETED', 'PROCESSING'])
    .gte('created_at', cutoff)
    .limit(1);

  if (error) {
    console.warn(`[Cooldown] Error checking underlying cooldown: ${error.message}`);
    return { approved: true, reason: 'Check failed, allowing trade' };
  }

  if (recentSignals && recentSignals.length > 0) {
    const secondsAgo = Math.floor(
      (Date.now() - new Date(recentSignals[0].created_at).getTime()) / 1000
    );
    return {
      approved: false,
      reason: `Recent ${underlying} trade ${secondsAgo}s ago`,
    };
  }

  return { approved: true, reason: 'No recent trades' };
}
