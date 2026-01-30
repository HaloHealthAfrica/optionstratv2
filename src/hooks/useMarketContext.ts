import { useQuery } from "@tanstack/react-query";
import { POLLING_INTERVALS } from "@/lib/polling";
import apiClient from "@/lib/api-client";

export interface MarketContext {
  id: string;
  ticker: string;
  price: number;
  updated_at: string;
  
  // Volatility
  vix: number | null;
  vix_regime: string | null;
  vix_trend: string | null;
  atr_percentile: number | null;
  bb_position: number | null;
  
  // Levels
  nearest_resistance: number | null;
  nearest_support: number | null;
  dist_to_nearest_res_pct: number | null;
  dist_to_nearest_sup_pct: number | null;
  or_breakout: string | null;
  or_complete: boolean;
  
  // Market
  spy_trend: string | null;
  qqq_trend: string | null;
  market_bias: string | null;
  moving_with_market: boolean | null;
  
  // Candle
  candle_pattern: string | null;
  candle_pattern_bias: string | null;
  candle_strength: number | null;
  
  // Session
  is_market_open: boolean;
  is_first_30min: boolean;
}

export function useMarketContext(ticker?: string) {
  return useQuery({
    queryKey: ["market-context", ticker],
    queryFn: async () => {
      if (!ticker) return null;
      
      const { data, error } = await apiClient.getMarketContext(ticker.toUpperCase());
      if (error) throw error;
      return (data as MarketContext | null) || null;
    },
    enabled: !!ticker,
    refetchInterval: POLLING_INTERVALS.marketContext,
    staleTime: 15000, // Consider data stale after 15 seconds
  });
}

export function useAllMarketContexts() {
  return useQuery({
    queryKey: ["market-contexts-all"],
    queryFn: async () => {
      const { data, error } = await apiClient.getMarketContexts(50);
      if (error) throw error;
      return (data as MarketContext[]) || [];
    },
    refetchInterval: POLLING_INTERVALS.marketContext,
    staleTime: 15000,
  });
}

// Helper to check if context is stale (>5 minutes old)
export function isContextStale(context: MarketContext): boolean {
  const updatedAt = new Date(context.updated_at);
  const ageMs = Date.now() - updatedAt.getTime();
  return ageMs > 5 * 60 * 1000; // 5 minutes
}

// Helper to get context freshness label
export function getContextFreshness(context: MarketContext): "fresh" | "recent" | "stale" {
  const updatedAt = new Date(context.updated_at);
  const ageMs = Date.now() - updatedAt.getTime();
  
  if (ageMs < 60 * 1000) return "fresh"; // <1 minute
  if (ageMs < 5 * 60 * 1000) return "recent"; // <5 minutes
  return "stale"; // >5 minutes
}
