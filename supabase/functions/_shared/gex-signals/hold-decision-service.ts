/**
 * Hold Decision Service
 * 
 * Evaluates whether to continue holding a position based on current GEX signals
 */

import type { 
  GEXSignalBundle, 
  HoldDecision, 
  MarketRegime,
} from './types.ts';

interface HoldInput {
  position: {
    id: string;
    optionType: 'CALL' | 'PUT';
    entryPrice: number;
    currentPrice: number;
    unrealizedPnlPct: number;
    hoursInTrade: number;
    entryMarketRegime?: MarketRegime;
    entryDealerPosition?: string;
  };
  gexSignals: GEXSignalBundle;
}

/**
 * Evaluate hold decision
 */
export function evaluateHold(input: HoldInput): HoldDecision {
  const { position, gexSignals } = input;
  
  let holdConfidence = 70; // Start with moderate confidence
  const warnings: HoldDecision['warnings'] = [];
  
  const isLong = position.optionType === 'CALL';
  const currentRegime = gexSignals.marketRegime.regime;
  const previousRegime = position.entryMarketRegime;
  const regimeChanged = previousRegime && previousRegime !== currentRegime;
  
  // Evaluate regime change impact
  let regimeChangeImpact: HoldDecision['regimeChangeImpact'] = 'NEUTRAL';
  
  if (regimeChanged) {
    regimeChangeImpact = evaluateRegimeChangeImpact(
      previousRegime!, 
      currentRegime, 
      isLong
    );
    
    if (regimeChangeImpact === 'FAVORABLE') {
      holdConfidence += 10;
    } else if (regimeChangeImpact === 'UNFAVORABLE') {
      holdConfidence -= 25;
      warnings.push({
        type: 'REGIME_CHANGE',
        severity: 'HIGH',
        message: `Regime changed from ${previousRegime} to ${currentRegime} against position`,
      });
    }
  }
  
  // 2. Dealer position flip
  if (position.entryDealerPosition && 
      position.entryDealerPosition !== gexSignals.dealerPosition) {
    if (gexSignals.dealerPosition === 'SHORT_GAMMA' && position.unrealizedPnlPct > 10) {
      // Have profits + volatility expanding = take some off
      warnings.push({
        type: 'DEALER_FLIP',
        severity: 'MEDIUM',
        message: 'Dealers flipped to short gamma with profits - consider partial exit',
      });
      
      return {
        action: 'PARTIAL_EXIT',
        holdConfidence,
        exitQuantityPct: 50,
        warnings,
        regimeChanged: regimeChanged || false,
        previousRegime,
        currentRegime,
        regimeChangeImpact,
        decisionLog: createDecisionLog(holdConfidence, position, gexSignals),
      };
    }
    
    if (gexSignals.dealerPosition === 'LONG_GAMMA') {
      holdConfidence -= 10;
      warnings.push({
        type: 'DEALER_FLIP',
        severity: 'LOW',
        message: 'Dealers flipped to long gamma - expect pinning behavior',
      });
    }
  }
  
  // 3. Zero Gamma crossover against position
  const priceDirection = gexSignals.zeroGammaBreakout.direction;
  if ((priceDirection === 'BELOW' && isLong) || (priceDirection === 'ABOVE' && !isLong)) {
    holdConfidence -= 20;
    warnings.push({
      type: 'ZERO_GAMMA_CROSS',
      severity: 'HIGH',
      message: `Price crossed zero gamma level against ${isLong ? 'CALL' : 'PUT'} position`,
    });
  }
  
  // 4. GEX Wall proximity
  if (gexSignals.gexWalls.priceNearWall) {
    if ((gexSignals.gexWalls.wallType === 'CALL' && isLong) ||
        (gexSignals.gexWalls.wallType === 'PUT' && !isLong)) {
      holdConfidence -= 5;
      warnings.push({
        type: 'GEX_WALL',
        severity: 'LOW',
        message: `Approaching ${gexSignals.gexWalls.wallType} GEX wall (resistance/support)`,
      });
    }
  }
  
  // 5. P/C Ratio extreme against position
  if (gexSignals.pcRatio.isExtreme) {
    const contrarian = gexSignals.pcRatio.contrarianSignal;
    if ((contrarian === 'SELL' && isLong) || (contrarian === 'BUY' && !isLong)) {
      holdConfidence -= 10;
      warnings.push({
        type: 'PC_EXTREME',
        severity: 'MEDIUM',
        message: `P/C extreme contrarian signal suggests ${contrarian}`,
      });
    }
  }
  
  // 6. Max Pain pull against position
  const mpDirection = gexSignals.maxPainMagnet.expectedDirection;
  if ((mpDirection === 'DOWN' && isLong) || (mpDirection === 'UP' && !isLong)) {
    if (gexSignals.maxPainMagnet.magnetStrength !== 'NONE') {
      holdConfidence -= 8;
      warnings.push({
        type: 'MAX_PAIN_PULL',
        severity: 'LOW',
        message: `Max pain pulling ${mpDirection} against position`,
      });
    }
  }
  
  // 7. Profit-taking check
  if (position.unrealizedPnlPct >= 50) {
    warnings.push({
      type: 'PROFIT_TARGET',
      severity: 'MEDIUM',
      message: `Position at ${position.unrealizedPnlPct.toFixed(1)}% profit - consider exit`,
    });
  }
  
  // 8. Time decay warning
  if (position.hoursInTrade >= 72 && position.unrealizedPnlPct < 10) {
    warnings.push({
      type: 'TIME_DECAY',
      severity: 'LOW',
      message: `In trade ${Math.round(position.hoursInTrade)}h with <10% gain - theta decay warning`,
    });
  }
  
  // Determine action based on hold confidence
  if (holdConfidence < 30) {
    return {
      action: 'EXIT',
      holdConfidence,
      warnings,
      regimeChanged: regimeChanged || false,
      previousRegime,
      currentRegime,
      regimeChangeImpact,
      decisionLog: createDecisionLog(holdConfidence, position, gexSignals),
    };
  }
  
  if (holdConfidence < 50 && position.unrealizedPnlPct > 20) {
    return {
      action: 'PARTIAL_EXIT',
      holdConfidence,
      exitQuantityPct: 50,
      warnings,
      regimeChanged: regimeChanged || false,
      previousRegime,
      currentRegime,
      regimeChangeImpact,
      decisionLog: createDecisionLog(holdConfidence, position, gexSignals),
    };
  }
  
  if (warnings.length >= 3 && !warnings.some(w => w.severity === 'HIGH')) {
    // Multiple minor warnings = tighten stop
    return {
      action: 'TIGHTEN_STOP',
      holdConfidence,
      newStopLoss: position.currentPrice * 0.9, // Tighten to 10% from current
      warnings,
      regimeChanged: regimeChanged || false,
      previousRegime,
      currentRegime,
      regimeChangeImpact,
      decisionLog: createDecisionLog(holdConfidence, position, gexSignals),
    };
  }
  
  return {
    action: 'HOLD',
    holdConfidence,
    warnings,
    regimeChanged: regimeChanged || false,
    previousRegime,
    currentRegime,
    regimeChangeImpact,
    decisionLog: createDecisionLog(holdConfidence, position, gexSignals),
  };
}

function evaluateRegimeChangeImpact(
  previous: MarketRegime, 
  current: MarketRegime, 
  isLong: boolean
): 'FAVORABLE' | 'NEUTRAL' | 'UNFAVORABLE' {
  const bullishRegimes: MarketRegime[] = ['TRENDING_UP', 'REVERSAL_UP'];
  const bearishRegimes: MarketRegime[] = ['TRENDING_DOWN', 'REVERSAL_DOWN'];
  const neutralRegimes: MarketRegime[] = ['RANGE_BOUND', 'BREAKOUT_IMMINENT', 'UNKNOWN'];
  
  // Check if moved to favorable regime
  if (isLong && bullishRegimes.includes(current) && !bullishRegimes.includes(previous)) {
    return 'FAVORABLE';
  }
  if (!isLong && bearishRegimes.includes(current) && !bearishRegimes.includes(previous)) {
    return 'FAVORABLE';
  }
  
  // Check if moved to unfavorable regime
  if (isLong && bearishRegimes.includes(current)) {
    return 'UNFAVORABLE';
  }
  if (!isLong && bullishRegimes.includes(current)) {
    return 'UNFAVORABLE';
  }
  
  return 'NEUTRAL';
}

function createDecisionLog(
  holdScore: number,
  position: HoldInput['position'],
  gexSignals: GEXSignalBundle
): HoldDecision['decisionLog'] {
  return {
    timestamp: new Date().toISOString(),
    factors: {
      positionId: position.id,
      unrealizedPnlPct: position.unrealizedPnlPct,
      hoursInTrade: position.hoursInTrade,
      currentRegime: gexSignals.marketRegime.regime,
      dealerPosition: gexSignals.dealerPosition,
      gexBias: gexSignals.summary.overallBias,
      zeroGammaDirection: gexSignals.zeroGammaBreakout.direction,
      pcSentiment: gexSignals.pcRatio.sentiment,
    },
    holdScore,
  };
}
