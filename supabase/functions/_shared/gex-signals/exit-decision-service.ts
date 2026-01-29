/**
 * @deprecated This file is deprecated and will be removed in a future version.
 * Use DecisionOrchestrator.orchestrateExitDecision() from refactored/orchestrator/decision-orchestrator.ts instead.
 * 
 * Exit Decision Service
 * 
 * Evaluates exit triggers for open positions
 */

import type { 
  GEXSignalBundle, 
  ExitDecision, 
  ExitTrigger,
  ExitUrgency,
  MarketRegime,
} from './types.ts';

export interface ExitInput {
  position: {
    id: string;
    optionType: 'CALL' | 'PUT';
    entryPrice: number;
    currentPrice: number;
    highestPriceSinceEntry: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    dte: number;
    hoursInTrade: number;
    entryMarketRegime?: MarketRegime;
    // Trade plan
    plannedStopLoss: number;
    plannedTarget1: number;
    plannedTarget2: number;
    trailingStopPct: number;
    partialExitDone: boolean;
  };
  gexSignals: GEXSignalBundle;
  greeks?: {
    delta?: number;
    theta?: number;
    thetaDecayPct?: number;
  };
}

/**
 * Evaluate exit decision
 */
export function evaluateExit(input: ExitInput): ExitDecision {
  const { position, gexSignals, greeks } = input;
  
  const triggers: Record<string, boolean> = {};
  
  // Priority ordered exit triggers
  
  // 1. STOP LOSS - IMMEDIATE
  if (position.currentPrice <= position.plannedStopLoss) {
    triggers.STOP_LOSS = true;
    return createExitDecision('CLOSE_FULL', 'IMMEDIATE', 'STOP_LOSS', position, triggers,
      'Stop loss triggered',
      `Price ${position.currentPrice.toFixed(2)} hit stop loss at ${position.plannedStopLoss.toFixed(2)}`
    );
  }
  
  // 2. TARGET 2 - IMMEDIATE
  if (position.currentPrice >= position.plannedTarget2) {
    triggers.TARGET_2 = true;
    return createExitDecision('CLOSE_FULL', 'IMMEDIATE', 'TARGET_2', position, triggers,
      'Target 2 reached',
      `Price ${position.currentPrice.toFixed(2)} hit target 2 at ${position.plannedTarget2.toFixed(2)}`
    );
  }
  
  // 3. TARGET 1 (if not partial yet) - SOON
  if (!position.partialExitDone && position.currentPrice >= position.plannedTarget1) {
    triggers.TARGET_1 = true;
    return createExitDecision('CLOSE_PARTIAL', 'SOON', 'TARGET_1', position, triggers,
      'Target 1 reached - partial exit',
      `Price ${position.currentPrice.toFixed(2)} hit target 1 at ${position.plannedTarget1.toFixed(2)}`,
      50
    );
  }
  
  // 4. TRAILING STOP - IMMEDIATE
  const trailingStopPrice = position.highestPriceSinceEntry * (1 - position.trailingStopPct / 100);
  if (position.currentPrice <= trailingStopPrice && position.unrealizedPnlPct > 0) {
    triggers.TRAILING_STOP = true;
    return createExitDecision('CLOSE_FULL', 'IMMEDIATE', 'TRAILING_STOP', position, triggers,
      'Trailing stop triggered',
      `Price ${position.currentPrice.toFixed(2)} fell ${position.trailingStopPct}% from high of ${position.highestPriceSinceEntry.toFixed(2)}`
    );
  }
  
  // 5. GEX FLIP (with profit) - SOON
  const isLong = position.optionType === 'CALL';
  if (gexSignals.gexFlip.detected && position.unrealizedPnlPct > 10) {
    const flipAgainst = (gexSignals.gexFlip.tradeAction === 'BUY_PUTS' && isLong) ||
                        (gexSignals.gexFlip.tradeAction === 'BUY_CALLS' && !isLong);
    if (flipAgainst) {
      triggers.GEX_FLIP = true;
      return createExitDecision('CLOSE_FULL', 'SOON', 'GEX_FLIP', position, triggers,
        'GEX regime flip against position',
        `GEX flipped ${gexSignals.gexFlip.direction} with ${position.unrealizedPnlPct.toFixed(1)}% profit`
      );
    }
  }
  
  // 6. ZERO GAMMA BREAKOUT against (HIGH conviction) - IMMEDIATE
  const zgb = gexSignals.zeroGammaBreakout;
  if (zgb.conviction === 'HIGH') {
    const breakoutAgainst = (zgb.direction === 'BELOW' && isLong) || 
                            (zgb.direction === 'ABOVE' && !isLong);
    if (breakoutAgainst) {
      triggers.ZERO_GAMMA_BREAKOUT = true;
      return createExitDecision('CLOSE_FULL', 'IMMEDIATE', 'ZERO_GAMMA_BREAKOUT', position, triggers,
        'Zero gamma breakout against position',
        `High conviction ${zgb.direction} breakout - ${zgb.expectedBehavior}`
      );
    }
  }
  
  // 7. REGIME CHANGE to opposing (>70% confidence) - SOON
  const regime = gexSignals.marketRegime;
  if (regime.confidence >= 70) {
    const regimeAgainst = (isLong && ['TRENDING_DOWN', 'REVERSAL_DOWN'].includes(regime.regime)) ||
                          (!isLong && ['TRENDING_UP', 'REVERSAL_UP'].includes(regime.regime));
    if (regimeAgainst) {
      triggers.REGIME_CHANGE = true;
      return createExitDecision('CLOSE_FULL', 'SOON', 'REGIME_CHANGE', position, triggers,
        'Regime change against position',
        `Market regime ${regime.regime} (${regime.confidence}% confidence) opposes ${position.optionType}`
      );
    }
  }
  
  // 8. DTE LIMIT (≤1 day) - IMMEDIATE
  if (position.dte <= 1) {
    triggers.DTE_LIMIT = true;
    return createExitDecision('CLOSE_FULL', 'IMMEDIATE', 'DTE_LIMIT', position, triggers,
      'Expiration imminent',
      `Only ${position.dte} day(s) to expiration`
    );
  }
  
  // 9. TIME LIMIT (7+ days with <10% gain) - OPTIONAL
  if (position.hoursInTrade >= 168 && position.unrealizedPnlPct < 10) {
    triggers.TIME_LIMIT = true;
    return createExitDecision('CLOSE_FULL', 'OPTIONAL', 'TIME_LIMIT', position, triggers,
      'Max hold time with minimal gain',
      `Held ${Math.round(position.hoursInTrade / 24)} days with only ${position.unrealizedPnlPct.toFixed(1)}% gain`
    );
  }
  
  // 10. THETA DECAY (>5% daily) - SOON
  if (greeks?.thetaDecayPct && greeks.thetaDecayPct > 5) {
    triggers.THETA_DECAY = true;
    return createExitDecision('CLOSE_FULL', 'SOON', 'THETA_DECAY', position, triggers,
      'Excessive theta decay',
      `Theta decay at ${greeks.thetaDecayPct.toFixed(1)}% daily`
    );
  }
  
  // No exit trigger - HOLD
  return {
    action: 'HOLD',
    urgency: 'OPTIONAL',
    trigger: null,
    unrealizedPnl: position.unrealizedPnl,
    unrealizedPnlPct: position.unrealizedPnlPct,
    reason: 'No exit triggers active',
    details: 'Position within all parameters - continue holding',
    decisionLog: {
      timestamp: new Date().toISOString(),
      triggers,
      exitScore: 0,
    },
  };
}

function createExitDecision(
  action: ExitDecision['action'],
  urgency: ExitUrgency,
  trigger: ExitTrigger,
  position: ExitInput['position'],
  triggers: Record<string, boolean>,
  reason: string,
  details: string,
  exitQuantityPct?: number
): ExitDecision {
  return {
    action,
    urgency,
    trigger,
    exitQuantityPct,
    unrealizedPnl: position.unrealizedPnl,
    unrealizedPnlPct: position.unrealizedPnlPct,
    reason,
    details,
    decisionLog: {
      timestamp: new Date().toISOString(),
      triggers,
      exitScore: urgency === 'IMMEDIATE' ? 100 : urgency === 'SOON' ? 75 : 50,
    },
  };
}
