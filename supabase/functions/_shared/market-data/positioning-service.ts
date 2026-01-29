/**
 * Market Positioning Service
 * 
 * Unified service that aggregates Put/Call ratio, Max Pain, GEX, and Options Flow
 * into actionable trading signals and insights.
 * 
 * Uses multi-provider support: Marketdata.app (primary) → Tradier (fallback)
 */

import { getPositioningAnalytics, PositioningAnalytics } from "./positioning-analytics.ts";
import { createUnusualWhalesClient, UnusualWhalesClient } from "./unusual-whales-client.ts";
import type {
  PutCallRatio,
  MaxPainAnalysis,
  GammaExposure,
  OptionsFlowAlert,
  MarketPositioningResult,
  PositioningConfig,
} from "./positioning-types.ts";

export class MarketPositioningService {
  private positioningAnalytics: PositioningAnalytics;
  private unusualWhales: UnusualWhalesClient | null;
  private config: PositioningConfig;

  constructor(config: Partial<PositioningConfig> = {}) {
    this.config = { 
      pc_bullish_threshold: 0.7,
      pc_bearish_threshold: 1.3,
      max_pain_magnet_threshold: 2.0,
      gex_significant_threshold: 1000000000,
      flow_min_premium: 50000,
      flow_lookback_minutes: 60,
      weight_pc_ratio: 0.2,
      weight_max_pain: 0.3,
      weight_gex: 0.3,
      weight_flow: 0.2,
      ...config 
    };
    
    this.positioningAnalytics = getPositioningAnalytics();
    this.unusualWhales = createUnusualWhalesClient();
  }

  /**
   * Get full market positioning analysis for a ticker/expiration
   */
  async getPositioning(
    underlying: string,
    expiration: string
  ): Promise<MarketPositioningResult> {
    const startTime = Date.now();
    const insights: string[] = [];
    const warnings: string[] = [];
    
    let putCallRatio: PutCallRatio | null = null;
    let maxPain: MaxPainAnalysis | null = null;
    let gammaExposure: GammaExposure | null = null;
    let recentFlow: OptionsFlowAlert[] = [];

    // Fetch positioning analytics (P/C ratio, Max Pain, GEX) with multi-provider fallback
    try {
      const analytics = await this.positioningAnalytics.getFullAnalytics(underlying, expiration);
      
      if (analytics.success) {
        putCallRatio = analytics.put_call_ratio || null;
        maxPain = analytics.max_pain || null;
        gammaExposure = analytics.gamma_exposure || null;

        // Log which provider was used
        if (analytics.provider) {
          console.log(`[PositioningService] Data sourced from: ${analytics.provider}`);
        }

        // Generate insights from analytics data
        if (putCallRatio) {
          if (putCallRatio.sentiment === 'BULLISH') {
            insights.push(`P/C ratio ${putCallRatio.volume_ratio} indicates bullish sentiment (high call activity)`);
          } else if (putCallRatio.sentiment === 'BEARISH') {
            insights.push(`P/C ratio ${putCallRatio.volume_ratio} indicates bearish sentiment (high put activity)`);
          }
        }

        if (maxPain) {
          insights.push(`Max Pain at $${maxPain.max_pain_strike} (${maxPain.distance_percent > 0 ? '+' : ''}${maxPain.distance_percent.toFixed(1)}% from current)`);
          if (Math.abs(maxPain.distance_percent) < this.config.max_pain_magnet_threshold) {
            insights.push(`Price is near max pain - expect pinning action`);
          }
        }

        if (gammaExposure) {
          if (gammaExposure.dealer_position === 'LONG_GAMMA') {
            insights.push(`Dealers are long gamma - volatility likely suppressed`);
            if (gammaExposure.support_levels.length > 0) {
              insights.push(`GEX support levels: $${gammaExposure.support_levels.join(', $')}`);
            }
          } else if (gammaExposure.dealer_position === 'SHORT_GAMMA') {
            insights.push(`Dealers are short gamma - expect amplified moves`);
            warnings.push('High volatility environment - consider smaller position sizes');
          }
          if (gammaExposure.zero_gamma_level) {
            insights.push(`Zero gamma level (flip point) at $${gammaExposure.zero_gamma_level}`);
          }
        }
      } else {
        warnings.push(`Analytics unavailable: ${analytics.error}`);
      }
    } catch (error) {
      console.error('[PositioningService] Analytics error:', error);
      warnings.push('Failed to fetch positioning analytics');
    }

    // Fetch Unusual Whales flow data
    if (this.unusualWhales) {
      try {
        const flowResult = await this.unusualWhales.getFlow(underlying, {
          limit: 50,
          minPremium: this.config.flow_min_premium,
        });

        if (flowResult.success && flowResult.data) {
          // Filter to lookback window
          const cutoffTime = new Date(Date.now() - this.config.flow_lookback_minutes * 60 * 1000);
          recentFlow = flowResult.data.filter(f => new Date(f.executed_at) > cutoffTime);

          // Generate flow insights
          const goldenSweeps = recentFlow.filter(f => f.is_golden_sweep);
          const unusualActivity = recentFlow.filter(f => f.is_unusual);
          
          if (goldenSweeps.length > 0) {
            const bullishSweeps = goldenSweeps.filter(s => s.sentiment === 'BULLISH');
            const bearishSweeps = goldenSweeps.filter(s => s.sentiment === 'BEARISH');
            
            if (bullishSweeps.length > bearishSweeps.length) {
              insights.push(`${bullishSweeps.length} bullish golden sweeps detected - strong buyer conviction`);
            } else if (bearishSweeps.length > bullishSweeps.length) {
              insights.push(`${bearishSweeps.length} bearish golden sweeps detected - strong seller conviction`);
            }
          }

          if (unusualActivity.length >= 5) {
            insights.push(`High unusual activity (${unusualActivity.length} alerts) - smart money active`);
          }

          // Calculate net flow
          const netPremium = recentFlow.reduce((sum, f) => {
            return sum + (f.sentiment === 'BULLISH' ? f.premium : f.sentiment === 'BEARISH' ? -f.premium : 0);
          }, 0);

          if (Math.abs(netPremium) > 500000) {
            insights.push(`Net premium flow: ${netPremium > 0 ? '+' : ''}$${(netPremium / 1000000).toFixed(2)}M ${netPremium > 0 ? 'bullish' : 'bearish'}`);
          }
        }
      } catch (error) {
        console.error('[PositioningService] Unusual Whales error:', error);
        // Don't add warning - flow is optional enhancement
      }
    }

    // Calculate combined positioning bias
    const { bias, confidence } = this.calculateCombinedBias(
      putCallRatio,
      maxPain,
      gammaExposure,
      recentFlow
    );

    console.log(`[PositioningService] Analysis complete in ${Date.now() - startTime}ms: ${bias} (${confidence}% confidence)`);

    return {
      underlying,
      expiration,
      put_call_ratio: putCallRatio,
      max_pain: maxPain,
      gamma_exposure: gammaExposure,
      recent_flow: recentFlow,
      positioning_bias: bias,
      confidence,
      insights,
      warnings,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Quick check for positioning bias (faster, less detailed)
   */
  async getQuickBias(underlying: string, expiration: string): Promise<{
    bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
    confidence: number;
    max_pain_strike?: number;
    pc_ratio?: number;
  }> {
    const positioning = await this.getPositioning(underlying, expiration);
    
    return {
      bias: positioning.positioning_bias,
      confidence: positioning.confidence,
      max_pain_strike: positioning.max_pain?.max_pain_strike,
      pc_ratio: positioning.put_call_ratio?.volume_ratio,
    };
  }

  private calculateCombinedBias(
    pcRatio: PutCallRatio | null,
    maxPain: MaxPainAnalysis | null,
    gex: GammaExposure | null,
    flow: OptionsFlowAlert[]
  ): { 
    bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
    confidence: number;
  } {
    let score = 0;  // -100 to +100
    let totalWeight = 0;

    // P/C Ratio contribution
    if (pcRatio) {
      const pcWeight = this.config.weight_pc_ratio;
      totalWeight += pcWeight;
      
      if (pcRatio.sentiment === 'BULLISH') {
        score += pcWeight * pcRatio.signal_strength;
      } else if (pcRatio.sentiment === 'BEARISH') {
        score -= pcWeight * pcRatio.signal_strength;
      }
    }

    // Max Pain contribution
    if (maxPain) {
      const mpWeight = this.config.weight_max_pain;
      totalWeight += mpWeight;
      
      // If price below max pain = bullish pull, above = bearish pull
      if (maxPain.bias === 'BULLISH') {
        score += mpWeight * maxPain.magnet_strength;
      } else if (maxPain.bias === 'BEARISH') {
        score -= mpWeight * maxPain.magnet_strength;
      }
    }

    // GEX contribution
    if (gex) {
      const gexWeight = this.config.weight_gex;
      totalWeight += gexWeight;
      
      // Long gamma = mean reversion = directional bias based on where price is vs zero gamma
      if (gex.dealer_position === 'LONG_GAMMA') {
        // Volatility suppressed - likely to stay in range
        // Slight bullish bias as dealers buy dips
        score += gexWeight * 30;
      } else if (gex.dealer_position === 'SHORT_GAMMA') {
        // Volatility amplified - trend continuation
        // No strong directional bias from GEX alone
      }
    }

    // Flow contribution
    if (flow.length > 0) {
      const flowWeight = this.config.weight_flow;
      totalWeight += flowWeight;
      
      const bullishPremium = flow
        .filter(f => f.sentiment === 'BULLISH')
        .reduce((sum, f) => sum + f.premium, 0);
      const bearishPremium = flow
        .filter(f => f.sentiment === 'BEARISH')
        .reduce((sum, f) => sum + f.premium, 0);
      
      const netPremium = bullishPremium - bearishPremium;
      const totalPremium = bullishPremium + bearishPremium;
      
      if (totalPremium > 0) {
        const flowBias = (netPremium / totalPremium) * 100;
        score += flowWeight * flowBias;
      }
    }

    // Normalize score
    const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;
    
    // Determine bias
    let bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
    if (normalizedScore > 60) bias = 'STRONGLY_BULLISH';
    else if (normalizedScore > 25) bias = 'BULLISH';
    else if (normalizedScore < -60) bias = 'STRONGLY_BEARISH';
    else if (normalizedScore < -25) bias = 'BEARISH';
    else bias = 'NEUTRAL';

    // Confidence based on data availability and signal agreement
    const dataAvailability = totalWeight / (
      this.config.weight_pc_ratio + 
      this.config.weight_max_pain + 
      this.config.weight_gex + 
      this.config.weight_flow
    );
    const signalStrength = Math.abs(normalizedScore) / 100;
    const confidence = Math.round(dataAvailability * 50 + signalStrength * 50);

    return { bias, confidence };
  }

  /**
   * Get available data sources
   */
  getAvailableSources(): string[] {
    const sources: string[] = [...this.positioningAnalytics.getAvailableProviders()];
    if (this.unusualWhales) sources.push('unusual_whales');
    return sources;
  }
}

// Singleton instance
let serviceInstance: MarketPositioningService | null = null;

export function getMarketPositioningService(
  config?: Partial<PositioningConfig>
): MarketPositioningService {
  if (!serviceInstance || config) {
    serviceInstance = new MarketPositioningService(config);
  }
  return serviceInstance;
}

// Re-export types
export * from "./positioning-types.ts";
