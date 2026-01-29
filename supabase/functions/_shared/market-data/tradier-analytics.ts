/**
 * Tradier Analytics
 * 
 * Calculates Put/Call ratio, Max Pain, and Gamma Exposure from Tradier options chain data.
 */

import { TradierClient, createTradierClient } from "./tradier-client.ts";
import type { OptionsChain, OptionsQuote } from "./types.ts";
import type { 
  PutCallRatio, 
  MaxPainAnalysis, 
  GammaExposure,
  PositioningConfig,
  DEFAULT_POSITIONING_CONFIG 
} from "./positioning-types.ts";

export class TradierAnalytics {
  private client: TradierClient;

  constructor(client: TradierClient) {
    this.client = client;
  }

  /**
   * Calculate Put/Call ratio from options chain
   */
  calculatePutCallRatio(chain: OptionsChain): PutCallRatio {
    let callVolume = 0;
    let putVolume = 0;
    let callOI = 0;
    let putOI = 0;

    for (const call of chain.calls) {
      callVolume += call.volume || 0;
      callOI += call.open_interest || 0;
    }

    for (const put of chain.puts) {
      putVolume += put.volume || 0;
      putOI += put.open_interest || 0;
    }

    const volumeRatio = callVolume > 0 ? putVolume / callVolume : 0;
    const oiRatio = callOI > 0 ? putOI / callOI : 0;

    // Determine sentiment based on volume ratio
    let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let signalStrength = 50;

    if (volumeRatio < 0.7) {
      sentiment = 'BULLISH';
      signalStrength = Math.min(100, 50 + (0.7 - volumeRatio) * 100);
    } else if (volumeRatio > 1.3) {
      sentiment = 'BEARISH';
      signalStrength = Math.min(100, 50 + (volumeRatio - 1.3) * 50);
    } else {
      // Neutral range, calculate relative position
      signalStrength = 50;
    }

    return {
      underlying: chain.underlying,
      expiration: chain.expirations[0] || '',
      volume_ratio: Math.round(volumeRatio * 100) / 100,
      call_volume: callVolume,
      put_volume: putVolume,
      total_volume: callVolume + putVolume,
      oi_ratio: Math.round(oiRatio * 100) / 100,
      call_oi: callOI,
      put_oi: putOI,
      total_oi: callOI + putOI,
      sentiment,
      signal_strength: Math.round(signalStrength),
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Calculate Max Pain - the strike price where options expire with minimum value
   */
  calculateMaxPain(chain: OptionsChain): MaxPainAnalysis {
    const strikes = chain.strikes;
    const painValues: number[] = [];
    let minPain = Infinity;
    let maxPainStrike = strikes[0] || 0;

    // For each potential closing price (strike), calculate total pain
    for (const closePrice of strikes) {
      let totalPain = 0;

      // Calculate pain for all calls
      for (const call of chain.calls) {
        if (closePrice > call.strike) {
          // Call is ITM - pain = (close - strike) * OI * 100
          totalPain += (closePrice - call.strike) * (call.open_interest || 0) * 100;
        }
        // OTM calls expire worthless - no pain for holders
      }

      // Calculate pain for all puts
      for (const put of chain.puts) {
        if (closePrice < put.strike) {
          // Put is ITM - pain = (strike - close) * OI * 100
          totalPain += (put.strike - closePrice) * (put.open_interest || 0) * 100;
        }
        // OTM puts expire worthless - no pain for holders
      }

      painValues.push(totalPain);

      if (totalPain < minPain) {
        minPain = totalPain;
        maxPainStrike = closePrice;
      }
    }

    const currentPrice = chain.underlying_price;
    const distancePercent = currentPrice > 0 
      ? ((maxPainStrike - currentPrice) / currentPrice) * 100 
      : 0;

    let direction: 'ABOVE' | 'BELOW' | 'AT_PRICE' = 'AT_PRICE';
    if (distancePercent > 0.5) direction = 'ABOVE';
    else if (distancePercent < -0.5) direction = 'BELOW';

    // Determine bias based on max pain location
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (distancePercent > 2) bias = 'BULLISH';  // Max pain above = bullish pull
    else if (distancePercent < -2) bias = 'BEARISH';

    // Magnet strength based on OI concentration and distance
    const totalOI = chain.calls.reduce((sum, c) => sum + (c.open_interest || 0), 0) +
                    chain.puts.reduce((sum, p) => sum + (p.open_interest || 0), 0);
    const magnetStrength = Math.min(100, Math.abs(distancePercent) * 10 * Math.log10(totalOI + 1) / 5);

    return {
      underlying: chain.underlying,
      expiration: chain.expirations[0] || '',
      underlying_price: currentPrice,
      max_pain_strike: maxPainStrike,
      max_pain_value: minPain,
      distance_percent: Math.round(distancePercent * 100) / 100,
      direction,
      strikes,
      pain_values: painValues,
      bias,
      magnet_strength: Math.round(magnetStrength),
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Calculate Gamma Exposure (GEX)
   * GEX = Gamma * Open Interest * Spot Price^2 * Contract Multiplier (100)
   * 
   * Positive GEX = dealers are long gamma (will buy dips, sell rips - suppresses volatility)
   * Negative GEX = dealers are short gamma (will sell dips, buy rips - amplifies volatility)
   */
  calculateGammaExposure(chain: OptionsChain): GammaExposure {
    const spotPrice = chain.underlying_price;
    const strikes = chain.strikes;
    const gexByStrike: number[] = [];
    
    let totalCallGex = 0;
    let totalPutGex = 0;
    let highestGex = -Infinity;
    let lowestGex = Infinity;
    let highestGexStrike = strikes[0] || 0;
    let lowestGexStrike = strikes[0] || 0;

    // Create maps for quick lookup
    const callsByStrike = new Map<number, OptionsQuote>();
    const putsByStrike = new Map<number, OptionsQuote>();
    
    for (const call of chain.calls) {
      callsByStrike.set(call.strike, call);
    }
    for (const put of chain.puts) {
      putsByStrike.set(put.strike, put);
    }

    // Calculate GEX at each strike
    for (const strike of strikes) {
      const call = callsByStrike.get(strike);
      const put = putsByStrike.get(strike);
      
      // GEX formula: Gamma * OI * Spot^2 * 100 / 100 (simplified to Gamma * OI * Spot^2)
      // Calls: positive GEX (dealers buy underlying as price rises)
      // Puts: negative GEX (dealers sell underlying as price rises)
      
      const callGex = call 
        ? (call.gamma || 0) * (call.open_interest || 0) * spotPrice * spotPrice * 0.01
        : 0;
      
      // Put gamma contribution is inverted for dealer hedging
      const putGex = put
        ? -(put.gamma || 0) * (put.open_interest || 0) * spotPrice * spotPrice * 0.01
        : 0;
      
      const netGex = callGex + putGex;
      gexByStrike.push(netGex);
      
      totalCallGex += callGex;
      totalPutGex += putGex;

      if (netGex > highestGex) {
        highestGex = netGex;
        highestGexStrike = strike;
      }
      if (netGex < lowestGex) {
        lowestGex = netGex;
        lowestGexStrike = strike;
      }
    }

    const netGex = totalCallGex + totalPutGex;

    // Find zero gamma level (where GEX flips sign)
    let zeroGammaLevel: number | null = null;
    for (let i = 0; i < strikes.length - 1; i++) {
      if ((gexByStrike[i] >= 0 && gexByStrike[i + 1] < 0) ||
          (gexByStrike[i] < 0 && gexByStrike[i + 1] >= 0)) {
        // Linear interpolation
        const ratio = Math.abs(gexByStrike[i]) / (Math.abs(gexByStrike[i]) + Math.abs(gexByStrike[i + 1]));
        zeroGammaLevel = strikes[i] + ratio * (strikes[i + 1] - strikes[i]);
        break;
      }
    }

    // Determine dealer position
    let dealerPosition: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL' = 'NEUTRAL';
    let volatilityExpectation: 'SUPPRESSED' | 'AMPLIFIED' | 'NEUTRAL' = 'NEUTRAL';
    
    const gexThreshold = spotPrice * spotPrice * 1000; // Rough threshold based on spot
    if (netGex > gexThreshold) {
      dealerPosition = 'LONG_GAMMA';
      volatilityExpectation = 'SUPPRESSED';
    } else if (netGex < -gexThreshold) {
      dealerPosition = 'SHORT_GAMMA';
      volatilityExpectation = 'AMPLIFIED';
    }

    // Identify support/resistance based on high GEX strikes
    const supportLevels: number[] = [];
    const resistanceLevels: number[] = [];
    
    for (let i = 0; i < strikes.length; i++) {
      if (gexByStrike[i] > gexThreshold * 0.5 && strikes[i] < spotPrice) {
        supportLevels.push(strikes[i]);
      }
      if (gexByStrike[i] > gexThreshold * 0.5 && strikes[i] > spotPrice) {
        resistanceLevels.push(strikes[i]);
      }
    }

    return {
      underlying: chain.underlying,
      expiration: chain.expirations[0] || '',
      underlying_price: spotPrice,
      net_gex: Math.round(netGex),
      call_gex: Math.round(totalCallGex),
      put_gex: Math.round(totalPutGex),
      strikes,
      gex_by_strike: gexByStrike.map(g => Math.round(g)),
      zero_gamma_level: zeroGammaLevel ? Math.round(zeroGammaLevel * 100) / 100 : null,
      highest_gex_strike: highestGexStrike,
      lowest_gex_strike: lowestGexStrike,
      dealer_position: dealerPosition,
      volatility_expectation: volatilityExpectation,
      support_levels: supportLevels.slice(-3),  // Top 3 nearest
      resistance_levels: resistanceLevels.slice(0, 3),
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Fetch chain and calculate all analytics
   */
  async getFullAnalytics(underlying: string, expiration: string): Promise<{
    success: boolean;
    put_call_ratio?: PutCallRatio;
    max_pain?: MaxPainAnalysis;
    gamma_exposure?: GammaExposure;
    error?: string;
  }> {
    const chainResult = await this.client.getOptionsChain(underlying, expiration, true);
    
    if (!chainResult.success || !chainResult.data) {
      return {
        success: false,
        error: chainResult.error || 'Failed to fetch options chain',
      };
    }

    const chain = chainResult.data;

    return {
      success: true,
      put_call_ratio: this.calculatePutCallRatio(chain),
      max_pain: this.calculateMaxPain(chain),
      gamma_exposure: this.calculateGammaExposure(chain),
    };
  }
}

/**
 * Factory function to create TradierAnalytics instance
 */
export function createTradierAnalytics(): TradierAnalytics | null {
  const client = createTradierClient();
  if (!client) {
    return null;
  }
  return new TradierAnalytics(client);
}
