import { useQuery } from "@tanstack/react-query";

export interface MarketPositioning {
  underlying: string;
  expiration: string;
  
  put_call_ratio: {
    volume_ratio: number;
    oi_ratio: number;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    signal_strength: number;
    call_volume: number;
    put_volume: number;
    call_oi: number;
    put_oi: number;
  } | null;
  
  max_pain: {
    max_pain_strike: number;
    underlying_price: number;
    distance_percent: number;
    direction: 'ABOVE' | 'BELOW' | 'AT_PRICE';
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    magnet_strength: number;
    strikes?: number[];
    pain_values?: number[];
  } | null;
  
  gamma_exposure: {
    net_gex: number;
    dealer_position: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
    volatility_expectation: 'SUPPRESSED' | 'AMPLIFIED' | 'NEUTRAL';
    zero_gamma_level: number | null;
    support_levels: number[];
    resistance_levels: number[];
    strikes?: number[];
    gex_by_strike?: number[];
  } | null;
  
  recent_flow: {
    id: string;
    strike: number;
    option_type: 'CALL' | 'PUT';
    side: 'BUY' | 'SELL' | 'UNKNOWN';
    size: number;
    premium: number;
    execution_type: 'SWEEP' | 'BLOCK' | 'SPLIT' | 'REGULAR';
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    is_golden_sweep: boolean;
    executed_at: string;
  }[];
  
  positioning_bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
  confidence: number;
  insights: string[];
  warnings: string[];
  available_sources: string[];
}

export function useMarketPositioning(underlying: string, expiration: string, enabled = true) {
  return useQuery({
    queryKey: ['market-positioning', underlying, expiration],
    queryFn: async (): Promise<MarketPositioning> => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-positioning?underlying=${underlying}&expiration=${expiration}`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch positioning: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: enabled && !!underlying && !!expiration,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}

export function useQuickPositioningBias(underlying: string, expiration: string, enabled = true) {
  return useQuery({
    queryKey: ['market-positioning-quick', underlying, expiration],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-positioning?underlying=${underlying}&expiration=${expiration}&quick=true`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch positioning: ${response.statusText}`);
      }
      
      return response.json() as Promise<{
        bias: 'STRONGLY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONGLY_BEARISH';
        confidence: number;
        max_pain_strike?: number;
        pc_ratio?: number;
      }>;
    },
    enabled: enabled && !!underlying && !!expiration,
    staleTime: 30 * 1000,
  });
}
