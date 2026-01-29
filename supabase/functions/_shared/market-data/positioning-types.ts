/**
 * Market Positioning Types
 * 
 * Types for Put/Call ratio, Max Pain, Gamma Exposure (GEX), and Options Flow data.
 */

export interface PutCallRatio {
  underlying: string;
  expiration: string;
  
  // Volume-based ratios
  volume_ratio: number;        // Put volume / Call volume
  call_volume: number;
  put_volume: number;
  total_volume: number;
  
  // Open interest-based ratios
  oi_ratio: number;            // Put OI / Call OI
  call_oi: number;
  put_oi: number;
  total_oi: number;
  
  // Interpretation
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signal_strength: number;     // 0-100
  
  calculated_at: string;
}

export interface MaxPainAnalysis {
  underlying: string;
  expiration: string;
  underlying_price: number;
  
  // Max Pain calculation
  max_pain_strike: number;
  max_pain_value: number;      // Total $ value of options expiring worthless at max pain
  
  // Distance from current price
  distance_percent: number;    // (max_pain - current) / current * 100
  direction: 'ABOVE' | 'BELOW' | 'AT_PRICE';
  
  // Pain distribution
  strikes: number[];
  pain_values: number[];       // Total pain at each strike
  
  // Trading signal
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  magnet_strength: number;     // 0-100, how strong the pull toward max pain
  
  calculated_at: string;
}

export interface GammaExposure {
  underlying: string;
  expiration: string;
  underlying_price: number;
  
  // Net GEX
  net_gex: number;             // Positive = dealers long gamma, Negative = short gamma
  call_gex: number;
  put_gex: number;
  
  // GEX by strike (for visualization)
  strikes: number[];
  gex_by_strike: number[];     // Net GEX at each strike
  
  // Key levels
  zero_gamma_level: number | null;  // Strike where GEX flips sign
  highest_gex_strike: number;       // Strike with most positive GEX
  lowest_gex_strike: number;        // Strike with most negative GEX
  
  // Interpretation
  dealer_position: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
  volatility_expectation: 'SUPPRESSED' | 'AMPLIFIED' | 'NEUTRAL';
  
  // Trading implications
  support_levels: number[];    // Strikes where dealers buy dips
  resistance_levels: number[]; // Strikes where dealers sell rips
  
  calculated_at: string;
}

export interface OptionsFlowAlert {
  id: string;
  underlying: string;
  
  // Contract details
  strike: number;
  expiration: string;
  option_type: 'CALL' | 'PUT';
  
  // Trade details
  side: 'BUY' | 'SELL' | 'UNKNOWN';
  size: number;                // Number of contracts
  premium: number;             // Total $ premium
  price: number;               // Price per contract
  
  // Execution info
  execution_type: 'SWEEP' | 'BLOCK' | 'SPLIT' | 'REGULAR';
  exchange: string;
  
  // Sentiment indicators
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  is_unusual: boolean;
  is_golden_sweep: boolean;    // Large sweep near ask
  
  // Timing
  executed_at: string;
  
  // Source
  source: 'unusual_whales' | 'tradier' | 'internal';
}

export interface MarketPositioningResult {
  underlying: string;
  expiration: string;
  
  put_call_ratio: PutCallRatio | null;
  max_pain: MaxPainAnalysis | null;
  gamma_exposure: GammaExposure | null;
  recent_flow: OptionsFlowAlert[];
  
  // Combined signal
  positioning_bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
  confidence: number;          // 0-100
  
  // Key insights
  insights: string[];
  
  // Warnings
  warnings: string[];
  
  calculated_at: string;
}

export interface PositioningConfig {
  // Put/Call thresholds
  pc_bullish_threshold: number;   // Below this = bullish (e.g., 0.7)
  pc_bearish_threshold: number;   // Above this = bearish (e.g., 1.3)
  
  // Max Pain settings
  max_pain_magnet_threshold: number;  // % distance to consider significant
  
  // GEX thresholds
  gex_significant_threshold: number;  // Absolute GEX to consider significant
  
  // Flow filters
  flow_min_premium: number;       // Minimum $ premium to consider
  flow_lookback_minutes: number;  // How far back to look for flow
  
  // Combined signal weights
  weight_pc_ratio: number;
  weight_max_pain: number;
  weight_gex: number;
  weight_flow: number;
}

export const DEFAULT_POSITIONING_CONFIG: PositioningConfig = {
  pc_bullish_threshold: 0.7,
  pc_bearish_threshold: 1.3,
  max_pain_magnet_threshold: 2.0,  // 2% from current price
  gex_significant_threshold: 1000000000, // $1B in notional gamma
  flow_min_premium: 50000,         // $50K minimum premium
  flow_lookback_minutes: 60,       // Last hour
  weight_pc_ratio: 0.2,
  weight_max_pain: 0.3,
  weight_gex: 0.3,
  weight_flow: 0.2,
};
