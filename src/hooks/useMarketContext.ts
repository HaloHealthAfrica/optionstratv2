import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      
      const { data, error } = await supabase
        .from("market_context")
        .select("*")
        .eq("ticker", ticker.toUpperCase())
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching market context:", error);
        throw error;
      }

      return data as MarketContext | null;
    },
    enabled: !!ticker,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000, // Consider data stale after 15 seconds
  });
}

export function useAllMarketContexts() {
  return useQuery({
    queryKey: ["market-contexts-all"],
    queryFn: async () => {
      // Get latest context for each ticker using distinct
      const { data, error } = await supabase
        .from("market_context")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching market contexts:", error);
        throw error;
      }

      // Group by ticker and take latest
      const latestByTicker = new Map<string, MarketContext>();
      for (const ctx of (data || [])) {
        if (!latestByTicker.has(ctx.ticker)) {
          latestByTicker.set(ctx.ticker, ctx as MarketContext);
        }
      }

      return Array.from(latestByTicker.values());
    },
    refetchInterval: 30000,
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
