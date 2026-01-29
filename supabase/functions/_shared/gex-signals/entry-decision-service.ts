/**
 * Entry Decision Service
 * 
 * Evaluates whether to enter a trade based on GEX signals, context, and trend data
 */

import type { 
  GEXSignalBundle, 
  EntryDecision, 
  Conviction,
  MarketRegime 
} from './types.ts';

// Base thresholds
const BASE_CONFIDENCE_THRESHOLD = 35;
const BASE_STOP_LOSS_PCT = 75;
const BASE_TARGET_1_PCT = 25;
const BASE_TARGET_2_PCT = 50;
const BASE_TRAILING_STOP_PCT = 25;
const BASE_MAX_HOLD_HOURS = 168; // 7 days

interface EntryInput {
  signal: {
    underlying: string;
    action: 'BUY' | 'SELL';
    optionType: 'CALL' | 'PUT';
    quantity: number;
    confidence?: number;
  };
  gexSignals: GEXSignalBundle;
  marketContext?: {
    vix?: number;
    vixRegime?: string;
    marketBias?: string;
  };
  mtfTrend?: {
    bias?: string;
    alignmentScore?: number;
  };
  currentPrice: number;
}

/**
 * Evaluate entry decision
 */
export function evaluateEntry(input: EntryInput): EntryDecision {
  const { signal, gexSignals, marketContext, mtfTrend, currentPrice } = input;
  
  // Start with base values
  let confidence = signal.confidence ?? 50;
  let quantityMultiplier = 1.0;
  const confidenceAdjustments: EntryDecision['confidenceAdjustments'] = [];
  
  // Determine trade direction
  const isLong = signal.optionType === 'CALL';
  const gexBias = gexSignals.summary.overallBias;
  const regime = gexSignals.marketRegime.regime;
  
  // 1. GEX Bias Alignment
  const gexAlignment = evaluateGEXAlignment(isLong, gexBias, gexSignals);
  if (gexAlignment.aligned) {
    confidence += 20;
    confidenceAdjustments.push({
      source: 'GEX_BIAS',
      adjustment: 20,
      reason: `GEX bias ${gexBias} aligns with ${isLong ? 'LONG' : 'SHORT'} trade`,
    });
  } else if (gexAlignment.conflicting) {
    confidence -= 20;
    confidenceAdjustments.push({
      source: 'GEX_BIAS',
      adjustment: -20,
      reason: `GEX bias ${gexBias} conflicts with ${isLong ? 'LONG' : 'SHORT'} trade`,
    });
  }
  
  // 2. GEX Flip Signal
  if (gexSignals.gexFlip.detected) {
    const flipAligned = isFlipAligned(gexSignals.gexFlip, isLong);
    if (flipAligned) {
      confidence += 15;
      quantityMultiplier *= 1.25;
      confidenceAdjustments.push({
        source: 'GEX_FLIP',
        adjustment: 15,
        reason: `GEX flip ${gexSignals.gexFlip.direction} supports trade direction`,
      });
    } else {
      confidence -= 15;
      quantityMultiplier *= 0.75;
      confidenceAdjustments.push({
        source: 'GEX_FLIP',
        adjustment: -15,
        reason: `GEX flip ${gexSignals.gexFlip.direction} opposes trade direction`,
      });
    }
  }
  
  // 3. Zero Gamma Breakout
  const zgbAligned = isZeroGammaBreakoutAligned(gexSignals.zeroGammaBreakout, isLong);
  if (zgbAligned.aligned) {
    confidence += 18;
    quantityMultiplier *= 1.3;
    confidenceAdjustments.push({
      source: 'ZERO_GAMMA',
      adjustment: 18,
      reason: zgbAligned.reason,
    });
  } else if (zgbAligned.conflicting) {
    confidence -= 12;
    confidenceAdjustments.push({
      source: 'ZERO_GAMMA',
      adjustment: -12,
      reason: zgbAligned.reason,
    });
  }
  
  // 4. Max Pain Magnet
  const mpAligned = isMaxPainAligned(gexSignals.maxPainMagnet, isLong);
  if (mpAligned.aligned) {
    confidence += 12;
    confidenceAdjustments.push({
      source: 'MAX_PAIN',
      adjustment: 12,
      reason: mpAligned.reason,
    });
  } else if (mpAligned.conflicting) {
    confidence -= 15;
    quantityMultiplier *= 0.6;
    confidenceAdjustments.push({
      source: 'MAX_PAIN',
      adjustment: -15,
      reason: mpAligned.reason,
    });
  }
  
  // 5. P/C Ratio Extreme (Contrarian)
  if (gexSignals.pcRatio.isExtreme) {
    const pcAligned = isPCRatioAligned(gexSignals.pcRatio, isLong);
    if (pcAligned) {
      confidence += 10;
      confidenceAdjustments.push({
        source: 'PC_EXTREME',
        adjustment: 10,
        reason: `P/C extreme contrarian signal aligns with trade`,
      });
    } else {
      confidence -= 8;
      confidenceAdjustments.push({
        source: 'PC_EXTREME',
        adjustment: -8,
        reason: `P/C extreme contrarian signal opposes trade`,
      });
    }
  }
  
  // 6. Market Regime Alignment
  const regimeAlignment = evaluateRegimeAlignment(regime, isLong, gexSignals.marketRegime.confidence);
  if (regimeAlignment.aligned) {
    confidence += 15 * (gexSignals.marketRegime.confidence / 100);
    confidenceAdjustments.push({
      source: 'REGIME',
      adjustment: Math.round(15 * (gexSignals.marketRegime.confidence / 100)),
      reason: `Regime ${regime} supports trade`,
    });
  } else if (regimeAlignment.shouldReject) {
    // Strong regime conflict = reject
    return createRejection(
      signal.quantity,
      'Strong regime conflict',
      `Market regime ${regime} with ${gexSignals.marketRegime.confidence}% confidence conflicts with trade direction`,
      confidenceAdjustments
    );
  }
  
  // 7. GEX Wall proximity
  if (gexSignals.gexWalls.priceNearWall) {
    if (gexSignals.gexWalls.wallType === 'CALL' && isLong) {
      confidence -= 10;
      confidenceAdjustments.push({
        source: 'GEX_WALL',
        adjustment: -10,
        reason: 'Buying calls into call wall (resistance)',
      });
    } else if (gexSignals.gexWalls.wallType === 'PUT' && !isLong) {
      confidence -= 10;
      confidenceAdjustments.push({
        source: 'GEX_WALL',
        adjustment: -10,
        reason: 'Buying puts into put wall (support)',
      });
    } else if (gexSignals.gexWalls.wallType === 'PUT' && isLong) {
      confidence += 8;
      confidenceAdjustments.push({
        source: 'GEX_WALL',
        adjustment: 8,
        reason: 'Buying calls at put wall (support)',
      });
    } else if (gexSignals.gexWalls.wallType === 'CALL' && !isLong) {
      confidence += 8;
      confidenceAdjustments.push({
        source: 'GEX_WALL',
        adjustment: 8,
        reason: 'Buying puts at call wall (resistance)',
      });
    }
  }
  
  // 8. Dealer position adjustments
  if (gexSignals.dealerPosition === 'SHORT_GAMMA') {
    // Favor breakouts, wider stops
    quantityMultiplier *= 0.75;
    confidenceAdjustments.push({
      source: 'DEALER_SHORT_GAMMA',
      adjustment: 0,
      reason: 'Short gamma regime: reduced size, wider stops recommended',
    });
  }
  
  // Check rejection threshold
  if (confidence < BASE_CONFIDENCE_THRESHOLD) {
    return createRejection(
      signal.quantity,
      'Confidence below threshold',
      `Confidence ${confidence.toFixed(0)}% is below minimum ${BASE_CONFIDENCE_THRESHOLD}%`,
      confidenceAdjustments
    );
  }
  
  // Calculate final quantity
  const adjustedQuantity = Math.max(1, Math.round(signal.quantity * quantityMultiplier));
  
  // Calculate trade plan
  const isShortGamma = gexSignals.dealerPosition === 'SHORT_GAMMA';
  const stopLossPct = isShortGamma ? BASE_STOP_LOSS_PCT * 1.2 : BASE_STOP_LOSS_PCT;
  const target1Pct = isShortGamma ? BASE_TARGET_1_PCT * 0.8 : BASE_TARGET_1_PCT;
  const target2Pct = isShortGamma ? BASE_TARGET_2_PCT * 0.8 : BASE_TARGET_2_PCT;
  
  // Calculate price levels
  const stopLoss = currentPrice * (1 - stopLossPct / 100);
  const target1 = currentPrice * (1 + target1Pct / 100);
  const target2 = currentPrice * (1 + target2Pct / 100);
  
  // Determine alignment classifications
  const gexAlignmentStatus: EntryDecision['gexAlignment'] = 
    gexAlignment.aligned ? 'ALIGNED' :
    gexAlignment.conflicting ? 'CONFLICTING' : 'NEUTRAL';
  
  const regimeAlignmentStatus: EntryDecision['regimeAlignment'] =
    regimeAlignment.aligned ? 'ALIGNED' :
    regimeAlignment.conflicting ? 'CONFLICTING' : 'NEUTRAL';
  
  return {
    action: 'EXECUTE',
    confidence: Math.min(100, Math.max(0, confidence)),
    quantity: signal.quantity,
    adjustedQuantity,
    quantityMultiplier,
    confidenceAdjustments,
    stopLoss,
    target1,
    target2,
    trailingStopPct: BASE_TRAILING_STOP_PCT,
    maxHoldHours: BASE_MAX_HOLD_HOURS,
    gexAlignment: gexAlignmentStatus,
    regimeAlignment: regimeAlignmentStatus,
    decisionLog: {
      timestamp: new Date().toISOString(),
      factors: {
        gexBias: gexSignals.summary.overallBias,
        dealerPosition: gexSignals.dealerPosition,
        regime: regime,
        regimeConfidence: gexSignals.marketRegime.confidence,
        pcRatio: gexSignals.pcRatio.combinedRatio,
        zeroGamma: gexSignals.zeroGammaBreakout.zeroGammaLevel,
        maxPain: gexSignals.maxPainMagnet.maxPainStrike,
      },
      finalScore: confidence,
    },
  };
}

function createRejection(
  quantity: number,
  reason: string,
  details: string,
  confidenceAdjustments: EntryDecision['confidenceAdjustments']
): EntryDecision {
  return {
    action: 'REJECT',
    confidence: 0,
    quantity,
    adjustedQuantity: 0,
    quantityMultiplier: 0,
    confidenceAdjustments,
    stopLoss: 0,
    target1: 0,
    target2: 0,
    trailingStopPct: 0,
    maxHoldHours: 0,
    gexAlignment: 'CONFLICTING',
    regimeAlignment: 'CONFLICTING',
    rejectionReason: reason,
    rejectionDetails: details,
    decisionLog: {
      timestamp: new Date().toISOString(),
      factors: {},
      finalScore: 0,
    },
  };
}

function evaluateGEXAlignment(isLong: boolean, gexBias: string, gexSignals: GEXSignalBundle) {
  const aligned = (isLong && gexBias === 'BULLISH') || (!isLong && gexBias === 'BEARISH');
  const conflicting = (isLong && gexBias === 'BEARISH') || (!isLong && gexBias === 'BULLISH');
  return { aligned, conflicting };
}

function isFlipAligned(gexFlip: GEXSignalBundle['gexFlip'], isLong: boolean): boolean {
  if (gexFlip.tradeAction === 'BUY_CALLS' && isLong) return true;
  if (gexFlip.tradeAction === 'BUY_PUTS' && !isLong) return true;
  return false;
}

function isZeroGammaBreakoutAligned(
  zgb: GEXSignalBundle['zeroGammaBreakout'], 
  isLong: boolean
): { aligned: boolean; conflicting: boolean; reason: string } {
  if (zgb.direction === 'ABOVE' && isLong && zgb.conviction === 'HIGH') {
    return { aligned: true, conflicting: false, reason: 'Above zero gamma with high conviction supports calls' };
  }
  if (zgb.direction === 'BELOW' && !isLong && zgb.conviction === 'HIGH') {
    return { aligned: true, conflicting: false, reason: 'Below zero gamma with high conviction supports puts' };
  }
  if (zgb.direction === 'ABOVE' && !isLong) {
    return { aligned: false, conflicting: true, reason: 'Above zero gamma opposes puts' };
  }
  if (zgb.direction === 'BELOW' && isLong) {
    return { aligned: false, conflicting: true, reason: 'Below zero gamma opposes calls' };
  }
  return { aligned: false, conflicting: false, reason: 'Neutral zone' };
}

function isMaxPainAligned(
  mp: GEXSignalBundle['maxPainMagnet'], 
  isLong: boolean
): { aligned: boolean; conflicting: boolean; reason: string } {
  if (mp.magnetStrength === 'STRONG' && mp.dte <= 3) {
    // Expect pinning - reduce confidence
    return { 
      aligned: false, 
      conflicting: true, 
      reason: `Strong max pain magnet with ${mp.dte} DTE - expect pinning` 
    };
  }
  if (mp.expectedDirection === 'UP' && isLong) {
    return { aligned: true, conflicting: false, reason: 'Max pain pull is upward, supports calls' };
  }
  if (mp.expectedDirection === 'DOWN' && !isLong) {
    return { aligned: true, conflicting: false, reason: 'Max pain pull is downward, supports puts' };
  }
  if (mp.expectedDirection === 'UP' && !isLong) {
    return { aligned: false, conflicting: true, reason: 'Max pain pull is upward, opposes puts' };
  }
  if (mp.expectedDirection === 'DOWN' && isLong) {
    return { aligned: false, conflicting: true, reason: 'Max pain pull is downward, opposes calls' };
  }
  return { aligned: false, conflicting: false, reason: 'Neutral max pain' };
}

function isPCRatioAligned(pcRatio: GEXSignalBundle['pcRatio'], isLong: boolean): boolean {
  return (pcRatio.contrarianSignal === 'BUY' && isLong) || 
         (pcRatio.contrarianSignal === 'SELL' && !isLong);
}

function evaluateRegimeAlignment(
  regime: MarketRegime, 
  isLong: boolean,
  confidence: number
): { aligned: boolean; conflicting: boolean; shouldReject: boolean } {
  const bullishRegimes: MarketRegime[] = ['TRENDING_UP', 'REVERSAL_UP'];
  const bearishRegimes: MarketRegime[] = ['TRENDING_DOWN', 'REVERSAL_DOWN'];
  
  const aligned = (isLong && bullishRegimes.includes(regime)) || 
                  (!isLong && bearishRegimes.includes(regime));
  const conflicting = (isLong && bearishRegimes.includes(regime)) || 
                      (!isLong && bullishRegimes.includes(regime));
  
  // Strong regime conflict = reject
  const shouldReject = conflicting && confidence >= 70;
  
  return { aligned, conflicting, shouldReject };
}
