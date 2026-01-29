/**
 * GEX Signal Service
 * 
 * Generates all 6 GEX-based trading signals from options chain data
 */

import type { OptionsChain, OptionsQuote } from '../market-data/types.ts';
import type {
  GEXSignalBundle,
  GEXFlipSignal,
  ZeroGammaBreakoutSignal,
  GEXWallsSignal,
  GEXWall,
  MaxPainMagnetSignal,
  PCRatioSignal,
  MarketRegimeAnalysis,
  DealerPosition,
  Conviction,
  BiasStrength,
  TradeAction,
  Sentiment,
  MarketRegime,
} from './types.ts';

// Thresholds
const GEX_SIGNIFICANT_THRESHOLD = 1_000_000_000; // $1B notional
const ZERO_GAMMA_BREAKOUT_THRESHOLD = 0.5; // 0.5% distance
const PC_BULLISH_THRESHOLD = 0.7;
const PC_BEARISH_THRESHOLD = 1.3;
const PC_EXTREME_BULLISH_THRESHOLD = 0.3;
const PC_EXTREME_BEARISH_THRESHOLD = 2.0;

/**
 * Generate complete GEX signals from options chain
 */
export function generateGEXSignals(
  ticker: string,
  expiration: string,
  currentPrice: number,
  optionsChain: OptionsChain,
  previousGEX?: number,
  previousDealerPosition?: DealerPosition,
  vix?: number
): GEXSignalBundle {
  const underlyingPrice = optionsChain.underlying_price || currentPrice;
  
  // Calculate core GEX data
  const { netGex, gexByStrike, callGex, putGex } = calculateGEX(optionsChain, underlyingPrice);
  const dealerPosition = getDealerPosition(netGex);
  const zeroGammaLevel = findZeroGammaLevel(gexByStrike, underlyingPrice);
  
  // Calculate individual signals
  const gexFlip = detectGEXFlip(
    netGex,
    previousGEX ?? netGex, // Default to current if no previous
    previousDealerPosition ?? dealerPosition,
    zeroGammaLevel,
    currentPrice
  );
  
  const zeroGammaBreakout = detectZeroGammaBreakout(
    currentPrice,
    zeroGammaLevel,
    dealerPosition
  );
  
  const gexWalls = detectGEXWalls(gexByStrike, callGex, putGex, currentPrice);
  
  const dte = calculateDTE(expiration);
  const maxPainStrike = calculateMaxPainStrike(optionsChain, underlyingPrice);
  const maxPainMagnet = calculateMaxPainMagnet(maxPainStrike, currentPrice, dte);
  
  const pcRatio = analyzePCRatio(optionsChain);
  
  const marketRegime = analyzeMarketRegime(
    dealerPosition,
    zeroGammaBreakout,
    maxPainMagnet,
    pcRatio,
    gexWalls,
    vix ?? 15
  );
  
  // Generate summary
  const summary = generateSummary(
    gexFlip,
    zeroGammaBreakout,
    gexWalls,
    maxPainMagnet,
    pcRatio,
    marketRegime
  );
  
  return {
    ticker,
    expiration,
    currentPrice,
    underlyingPrice,
    calculatedAt: new Date().toISOString(),
    netGex,
    dealerPosition,
    previousDealerPosition,
    gexFlip,
    zeroGammaBreakout,
    gexWalls,
    maxPainMagnet,
    pcRatio,
    marketRegime,
    summary,
  };
}

/**
 * Calculate GEX from options chain
 */
function calculateGEX(chain: OptionsChain, spotPrice: number): {
  netGex: number;
  gexByStrike: Map<number, number>;
  callGex: Map<number, number>;
  putGex: Map<number, number>;
} {
  const gexByStrike = new Map<number, number>();
  const callGex = new Map<number, number>();
  const putGex = new Map<number, number>();
  
  // Process calls (positive GEX contribution)
  for (const call of chain.calls) {
    if (!call.gamma || !call.open_interest) continue;
    const gex = call.gamma * call.open_interest * spotPrice * spotPrice * 0.01;
    callGex.set(call.strike, gex);
    gexByStrike.set(call.strike, (gexByStrike.get(call.strike) || 0) + gex);
  }
  
  // Process puts (negative GEX contribution due to dealer hedging)
  for (const put of chain.puts) {
    if (!put.gamma || !put.open_interest) continue;
    const gex = -put.gamma * put.open_interest * spotPrice * spotPrice * 0.01;
    putGex.set(put.strike, Math.abs(gex));
    gexByStrike.set(put.strike, (gexByStrike.get(put.strike) || 0) + gex);
  }
  
  const netGex = Array.from(gexByStrike.values()).reduce((sum, val) => sum + val, 0);
  
  return { netGex, gexByStrike, callGex, putGex };
}

/**
 * Determine dealer position from net GEX
 */
function getDealerPosition(netGex: number): DealerPosition {
  if (netGex > GEX_SIGNIFICANT_THRESHOLD) return 'LONG_GAMMA';
  if (netGex < -GEX_SIGNIFICANT_THRESHOLD) return 'SHORT_GAMMA';
  return 'NEUTRAL';
}

/**
 * Find zero gamma level (strike where GEX flips sign)
 */
function findZeroGammaLevel(gexByStrike: Map<number, number>, currentPrice: number): number | null {
  const strikes = Array.from(gexByStrike.keys()).sort((a, b) => a - b);
  
  for (let i = 0; i < strikes.length - 1; i++) {
    const strike1 = strikes[i];
    const strike2 = strikes[i + 1];
    const gex1 = gexByStrike.get(strike1) || 0;
    const gex2 = gexByStrike.get(strike2) || 0;
    
    // Look for sign change near current price
    if (gex1 * gex2 < 0 && strike1 <= currentPrice && strike2 >= currentPrice) {
      // Linear interpolation
      const ratio = Math.abs(gex1) / (Math.abs(gex1) + Math.abs(gex2));
      return strike1 + ratio * (strike2 - strike1);
    }
  }
  
  return null;
}

/**
 * Detect GEX Flip (Regime Change)
 */
export function detectGEXFlip(
  currentGEX: number,
  previousGEX: number,
  previousDealerPosition: DealerPosition,
  zeroGammaLevel: number | null,
  currentPrice: number
): GEXFlipSignal {
  const currentDealerPosition = getDealerPosition(currentGEX);
  const detected = previousDealerPosition !== currentDealerPosition && 
                   previousDealerPosition !== 'NEUTRAL' && 
                   currentDealerPosition !== 'NEUTRAL';
  
  if (!detected) {
    return {
      detected: false,
      direction: null,
      implication: 'No regime change detected',
      tradeAction: 'HOLD',
      conviction: 'LOW',
      priceVsZeroGamma: getPriceVsZeroGamma(currentPrice, zeroGammaLevel),
    };
  }
  
  const direction = previousGEX > 0 && currentGEX < 0 ? 'LONG_TO_SHORT' : 'SHORT_TO_LONG';
  const priceVsZeroGamma = getPriceVsZeroGamma(currentPrice, zeroGammaLevel);
  
  if (direction === 'LONG_TO_SHORT') {
    // Volatility expanding
    const implication = priceVsZeroGamma === 'ABOVE' 
      ? 'EXPECT_DOWNSIDE_ACCELERATION' 
      : 'EXPECT_UPSIDE_ACCELERATION';
    const tradeAction: TradeAction = priceVsZeroGamma === 'ABOVE' ? 'BUY_PUTS' : 'BUY_CALLS';
    
    return {
      detected: true,
      direction,
      implication,
      tradeAction,
      conviction: 'HIGH',
      priceVsZeroGamma,
    };
  } else {
    // Volatility contracting
    return {
      detected: true,
      direction,
      implication: 'EXPECT_MEAN_REVERSION_PINNING',
      tradeAction: 'SELL_STRADDLE',
      conviction: 'MEDIUM',
      priceVsZeroGamma,
    };
  }
}

function getPriceVsZeroGamma(price: number, zeroGamma: number | null): 'ABOVE' | 'BELOW' | 'AT' {
  if (!zeroGamma) return 'AT';
  const distPct = ((price - zeroGamma) / zeroGamma) * 100;
  if (distPct > 0.5) return 'ABOVE';
  if (distPct < -0.5) return 'BELOW';
  return 'AT';
}

/**
 * Detect Zero Gamma Breakout
 */
export function detectZeroGammaBreakout(
  currentPrice: number,
  zeroGammaLevel: number | null,
  dealerPosition: DealerPosition
): ZeroGammaBreakoutSignal {
  if (!zeroGammaLevel) {
    return {
      zeroGammaLevel: null,
      currentPrice,
      distancePercent: 0,
      direction: 'AT',
      dealerPosition,
      expectedBehavior: 'Zero gamma level not determined',
      tradeAction: 'HOLD',
      conviction: 'LOW',
    };
  }
  
  const distancePercent = ((currentPrice - zeroGammaLevel) / zeroGammaLevel) * 100;
  const isShortGamma = dealerPosition === 'SHORT_GAMMA';
  
  if (distancePercent > ZERO_GAMMA_BREAKOUT_THRESHOLD) {
    return {
      zeroGammaLevel,
      currentPrice,
      distancePercent,
      direction: 'ABOVE',
      dealerPosition,
      expectedBehavior: isShortGamma 
        ? 'Dealers chasing - accelerated upside expected'
        : 'Dealers hedging - controlled move up',
      tradeAction: isShortGamma ? 'BUY_CALLS' : 'SELL_PUTS',
      conviction: isShortGamma ? 'HIGH' : 'MEDIUM',
    };
  }
  
  if (distancePercent < -ZERO_GAMMA_BREAKOUT_THRESHOLD) {
    return {
      zeroGammaLevel,
      currentPrice,
      distancePercent,
      direction: 'BELOW',
      dealerPosition,
      expectedBehavior: isShortGamma
        ? 'Dealers chasing - accelerated downside expected'
        : 'Dealers hedging - controlled move down',
      tradeAction: isShortGamma ? 'BUY_PUTS' : 'SELL_CALLS',
      conviction: isShortGamma ? 'HIGH' : 'MEDIUM',
    };
  }
  
  return {
    zeroGammaLevel,
    currentPrice,
    distancePercent,
    direction: 'AT',
    dealerPosition,
    expectedBehavior: 'Price at zero gamma level - inflection point',
    tradeAction: 'HOLD',
    conviction: 'LOW',
  };
}

/**
 * Detect GEX Walls (Support/Resistance from Options)
 */
export function detectGEXWalls(
  gexByStrike: Map<number, number>,
  callGex: Map<number, number>,
  putGex: Map<number, number>,
  currentPrice: number
): GEXWallsSignal {
  // Get all values for threshold calculation
  const allCallGexValues = Array.from(callGex.values()).filter(v => v > 0);
  const allPutGexValues = Array.from(putGex.values()).filter(v => v > 0);
  
  if (allCallGexValues.length === 0 || allPutGexValues.length === 0) {
    return {
      callWalls: [],
      putWalls: [],
      nearestCallWall: null,
      nearestPutWall: null,
      currentRange: { support: null, resistance: null },
      priceNearWall: false,
      wallType: null,
    };
  }
  
  // Find top 10% threshold
  const callThreshold = topPercentile(allCallGexValues, 0.10);
  const putThreshold = topPercentile(allPutGexValues, 0.10);
  
  const callWalls: GEXWall[] = [];
  const putWalls: GEXWall[] = [];
  
  // Call walls = resistance (above current price)
  for (const [strike, gex] of callGex) {
    if (strike > currentPrice && gex > callThreshold) {
      callWalls.push({
        strike,
        gexValue: gex,
        strength: gex > callThreshold * 2 ? 'MAJOR' : 'MINOR',
        expectedBehavior: 'Dealers sell into rallies here → resistance',
      });
    }
  }
  
  // Put walls = support (below current price)
  for (const [strike, gex] of putGex) {
    if (strike < currentPrice && gex > putThreshold) {
      putWalls.push({
        strike,
        gexValue: gex,
        strength: gex > putThreshold * 2 ? 'MAJOR' : 'MINOR',
        expectedBehavior: 'Dealers buy on dips here → support',
      });
    }
  }
  
  // Sort by distance from current price
  callWalls.sort((a, b) => a.strike - b.strike);
  putWalls.sort((a, b) => b.strike - a.strike);
  
  const nearestCallWall = callWalls[0] || null;
  const nearestPutWall = putWalls[0] || null;
  
  // Check if price is near a wall
  const nearWallThreshold = 0.5; // 0.5%
  let priceNearWall = false;
  let wallType: 'CALL' | 'PUT' | null = null;
  
  if (nearestCallWall) {
    const distPct = ((nearestCallWall.strike - currentPrice) / currentPrice) * 100;
    if (distPct < nearWallThreshold) {
      priceNearWall = true;
      wallType = 'CALL';
    }
  }
  
  if (nearestPutWall && !priceNearWall) {
    const distPct = ((currentPrice - nearestPutWall.strike) / currentPrice) * 100;
    if (distPct < nearWallThreshold) {
      priceNearWall = true;
      wallType = 'PUT';
    }
  }
  
  return {
    callWalls,
    putWalls,
    nearestCallWall,
    nearestPutWall,
    currentRange: {
      support: nearestPutWall?.strike || null,
      resistance: nearestCallWall?.strike || null,
    },
    priceNearWall,
    wallType,
  };
}

function topPercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => b - a);
  const index = Math.floor(values.length * percentile);
  return sorted[Math.max(0, index - 1)] || 0;
}

/**
 * Calculate Max Pain Strike
 */
function calculateMaxPainStrike(chain: OptionsChain, currentPrice: number): number {
  const strikes = new Set<number>();
  for (const opt of [...chain.calls, ...chain.puts]) {
    strikes.add(opt.strike);
  }
  
  let minPain = Infinity;
  let maxPainStrike = currentPrice;
  
  for (const closePrice of strikes) {
    let totalPain = 0;
    
    // Call pain: if close > strike, calls are ITM
    for (const call of chain.calls) {
      if (closePrice > call.strike) {
        totalPain += (closePrice - call.strike) * (call.open_interest || 0) * 100;
      }
    }
    
    // Put pain: if close < strike, puts are ITM
    for (const put of chain.puts) {
      if (closePrice < put.strike) {
        totalPain += (put.strike - closePrice) * (put.open_interest || 0) * 100;
      }
    }
    
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = closePrice;
    }
  }
  
  return maxPainStrike;
}

/**
 * Calculate Max Pain Magnet Score
 */
export function calculateMaxPainMagnet(
  maxPainStrike: number,
  currentPrice: number,
  dte: number
): MaxPainMagnetSignal {
  const distancePercent = ((maxPainStrike - currentPrice) / currentPrice) * 100;
  const absDistance = Math.abs(distancePercent);
  
  // Magnet strength increases as expiration approaches
  let magnetStrength: BiasStrength;
  if (dte <= 2 && absDistance < 3) magnetStrength = 'STRONG';
  else if (dte <= 5 && absDistance < 5) magnetStrength = 'MODERATE';
  else if (dte <= 10 && absDistance < 7) magnetStrength = 'WEAK';
  else magnetStrength = 'NONE';
  
  const expectedDirection: 'UP' | 'DOWN' | 'NEUTRAL' = 
    distancePercent > 0.5 ? 'UP' : 
    distancePercent < -0.5 ? 'DOWN' : 'NEUTRAL';
  
  const pinExpected = magnetStrength === 'STRONG' && absDistance < 2;
  
  // Determine trade action
  let tradeAction: TradeAction = 'HOLD';
  if (magnetStrength === 'STRONG') {
    if (expectedDirection === 'UP') tradeAction = 'SELL_PUTS';
    else if (expectedDirection === 'DOWN') tradeAction = 'SELL_CALLS';
    else tradeAction = 'SELL_STRADDLE'; // Pin expected
  }
  
  return {
    maxPainStrike,
    currentPrice,
    distancePercent,
    dte,
    magnetStrength,
    expectedDirection,
    pinExpected,
    tradeAction,
  };
}

function calculateDTE(expiration: string): number {
  const expDate = new Date(expiration);
  const today = new Date();
  const diffTime = expDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Analyze Put/Call Ratio
 */
export function analyzePCRatio(chain: OptionsChain): PCRatioSignal {
  let callVolume = 0, putVolume = 0;
  let callOI = 0, putOI = 0;
  
  for (const call of chain.calls) {
    callVolume += call.volume || 0;
    callOI += call.open_interest || 0;
  }
  
  for (const put of chain.puts) {
    putVolume += put.volume || 0;
    putOI += put.open_interest || 0;
  }
  
  const volumeRatio = callVolume > 0 ? putVolume / callVolume : 1;
  const oiRatio = callOI > 0 ? putOI / callOI : 1;
  const combinedRatio = volumeRatio * 0.6 + oiRatio * 0.4;
  
  // Determine sentiment and contrarian signals
  let sentiment: Sentiment;
  let isExtreme = false;
  let contrarianSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let conviction: Conviction = 'LOW';
  let reasoning = '';
  
  if (combinedRatio > PC_EXTREME_BEARISH_THRESHOLD) {
    sentiment = 'EXTREME_BEARISH';
    isExtreme = true;
    contrarianSignal = 'BUY';
    conviction = 'HIGH';
    reasoning = 'Extreme put buying often marks bottoms';
  } else if (combinedRatio > PC_BEARISH_THRESHOLD) {
    sentiment = 'BEARISH';
    contrarianSignal = 'HOLD';
    conviction = 'MEDIUM';
    reasoning = 'Elevated put activity suggests caution';
  } else if (combinedRatio < PC_EXTREME_BULLISH_THRESHOLD) {
    sentiment = 'EXTREME_BULLISH';
    isExtreme = true;
    contrarianSignal = 'SELL';
    conviction = 'HIGH';
    reasoning = 'Extreme call buying often marks tops';
  } else if (combinedRatio < PC_BULLISH_THRESHOLD) {
    sentiment = 'BULLISH';
    contrarianSignal = 'HOLD';
    conviction = 'MEDIUM';
    reasoning = 'Elevated call activity suggests bullish sentiment';
  } else {
    sentiment = 'NEUTRAL';
    reasoning = 'Put/Call ratio in neutral range';
  }
  
  return {
    volumeRatio,
    oiRatio,
    combinedRatio,
    sentiment,
    isExtreme,
    contrarianSignal,
    conviction,
    reasoning,
  };
}

/**
 * Analyze Market Regime (Composite)
 */
export function analyzeMarketRegime(
  dealerPosition: DealerPosition,
  zeroGammaBreakout: ZeroGammaBreakoutSignal,
  maxPainMagnet: MaxPainMagnetSignal,
  pcRatio: PCRatioSignal,
  gexWalls: GEXWallsSignal,
  vix: number
): MarketRegimeAnalysis {
  // BREAKOUT IMMINENT
  if (dealerPosition === 'SHORT_GAMMA' && 
      Math.abs(zeroGammaBreakout.distancePercent) < 2 && 
      vix > 20) {
    return {
      regime: 'BREAKOUT_IMMINENT',
      confidence: 75,
      primaryDriver: 'Short gamma + tight range + elevated VIX',
      strategy: 'LONG_STRADDLE',
      reasoning: 'Dealers short gamma, volatility expected to expand',
    };
  }
  
  // RANGE BOUND
  if (dealerPosition === 'LONG_GAMMA' && 
      Math.abs(maxPainMagnet.distancePercent) < 2 && 
      maxPainMagnet.dte <= 5) {
    return {
      regime: 'RANGE_BOUND',
      confidence: 70,
      primaryDriver: 'Long gamma + near max pain + close expiry',
      strategy: 'IRON_CONDOR',
      reasoning: 'Dealers long gamma, price likely to pin near max pain',
    };
  }
  
  // REVERSAL UP
  if (pcRatio.combinedRatio > 1.8 && gexWalls.priceNearWall && gexWalls.wallType === 'PUT') {
    return {
      regime: 'REVERSAL_UP',
      confidence: 65,
      primaryDriver: 'Extreme bearish P/C + price at put support',
      strategy: 'BUY_CALLS',
      reasoning: 'Contrarian signal with dealer support',
    };
  }
  
  // REVERSAL DOWN
  if (pcRatio.combinedRatio < 0.5 && gexWalls.priceNearWall && gexWalls.wallType === 'CALL') {
    return {
      regime: 'REVERSAL_DOWN',
      confidence: 65,
      primaryDriver: 'Extreme bullish P/C + price at call resistance',
      strategy: 'BUY_PUTS',
      reasoning: 'Contrarian signal with dealer resistance',
    };
  }
  
  // TRENDING UP
  if (zeroGammaBreakout.direction === 'ABOVE' && 
      pcRatio.combinedRatio < 0.8 && 
      dealerPosition === 'LONG_GAMMA') {
    return {
      regime: 'TRENDING_UP',
      confidence: 60,
      primaryDriver: 'Above zero gamma + bullish P/C + long gamma stability',
      strategy: 'BUY_CALLS',
      reasoning: 'Controlled uptrend with dealer hedging',
    };
  }
  
  // TRENDING DOWN
  if (zeroGammaBreakout.direction === 'BELOW' && 
      pcRatio.combinedRatio > 1.2 && 
      dealerPosition === 'LONG_GAMMA') {
    return {
      regime: 'TRENDING_DOWN',
      confidence: 60,
      primaryDriver: 'Below zero gamma + bearish P/C + long gamma stability',
      strategy: 'BUY_PUTS',
      reasoning: 'Controlled downtrend with dealer hedging',
    };
  }
  
  // Default: Unknown
  return {
    regime: 'UNKNOWN',
    confidence: 30,
    primaryDriver: 'No clear regime detected',
    strategy: 'HOLD',
    reasoning: 'Mixed signals, waiting for clarity',
  };
}

/**
 * Generate Summary from all signals
 */
function generateSummary(
  gexFlip: GEXFlipSignal,
  zeroGammaBreakout: ZeroGammaBreakoutSignal,
  gexWalls: GEXWallsSignal,
  maxPainMagnet: MaxPainMagnetSignal,
  pcRatio: PCRatioSignal,
  marketRegime: MarketRegimeAnalysis
): GEXSignalBundle['summary'] {
  // Determine overall bias from signals
  let bullishScore = 0;
  let bearishScore = 0;
  
  // GEX Flip
  if (gexFlip.detected) {
    if (gexFlip.tradeAction === 'BUY_CALLS') bullishScore += 2;
    if (gexFlip.tradeAction === 'BUY_PUTS') bearishScore += 2;
  }
  
  // Zero Gamma Breakout
  if (zeroGammaBreakout.direction === 'ABOVE') bullishScore += 1;
  if (zeroGammaBreakout.direction === 'BELOW') bearishScore += 1;
  
  // Max Pain Magnet
  if (maxPainMagnet.expectedDirection === 'UP') bullishScore += 1;
  if (maxPainMagnet.expectedDirection === 'DOWN') bearishScore += 1;
  
  // P/C Ratio (contrarian)
  if (pcRatio.contrarianSignal === 'BUY') bullishScore += 1;
  if (pcRatio.contrarianSignal === 'SELL') bearishScore += 1;
  
  // Market Regime
  if (['TRENDING_UP', 'REVERSAL_UP'].includes(marketRegime.regime)) bullishScore += 2;
  if (['TRENDING_DOWN', 'REVERSAL_DOWN'].includes(marketRegime.regime)) bearishScore += 2;
  
  const netScore = bullishScore - bearishScore;
  const overallBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 
    netScore >= 2 ? 'BULLISH' : 
    netScore <= -2 ? 'BEARISH' : 'NEUTRAL';
  
  const biasStrength: BiasStrength = 
    Math.abs(netScore) >= 4 ? 'STRONG' :
    Math.abs(netScore) >= 2 ? 'MODERATE' :
    Math.abs(netScore) >= 1 ? 'WEAK' : 'NONE';
  
  // Determine recommended action
  let recommendedAction: TradeAction = 'HOLD';
  let actionConviction: Conviction = 'LOW';
  
  if (gexFlip.detected && gexFlip.conviction === 'HIGH') {
    recommendedAction = gexFlip.tradeAction;
    actionConviction = gexFlip.conviction;
  } else if (marketRegime.confidence >= 65) {
    recommendedAction = marketRegime.strategy;
    actionConviction = marketRegime.confidence >= 70 ? 'HIGH' : 'MEDIUM';
  } else if (biasStrength === 'STRONG') {
    recommendedAction = overallBias === 'BULLISH' ? 'BUY_CALLS' : 'BUY_PUTS';
    actionConviction = 'MEDIUM';
  }
  
  const reasoning = [
    `Regime: ${marketRegime.regime} (${marketRegime.confidence}% confidence)`,
    `Dealer: ${zeroGammaBreakout.dealerPosition}`,
    `P/C: ${pcRatio.sentiment}`,
    gexFlip.detected ? `GEX Flip: ${gexFlip.direction}` : null,
  ].filter(Boolean).join('. ');
  
  return {
    overallBias,
    biasStrength,
    recommendedAction,
    actionConviction,
    reasoning,
    keyLevels: {
      support: gexWalls.currentRange.support,
      resistance: gexWalls.currentRange.resistance,
      zeroGamma: zeroGammaBreakout.zeroGammaLevel,
      maxPain: maxPainMagnet.maxPainStrike,
    },
  };
}
