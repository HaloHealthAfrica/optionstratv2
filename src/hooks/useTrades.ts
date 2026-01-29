import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface Trade {
  id: string;
  order_id: string;
  broker_trade_id: string | null;
  execution_price: number;
  quantity: number;
  commission: number;
  fees: number;
  total_cost: number;
  underlying: string;
  symbol: string;
  strike: number;
  expiration: string;
  option_type: string;
  executed_at: string;
  created_at: string;
  // Joined from orders
  side?: string;
  mode?: string;
  order_type?: string;
  signal_id?: string;
}

export interface TradeAnalytics {
  total_trades: number;
  total_volume: number;
  total_commission: number;
  total_fees: number;
  total_premium_traded: number;
  avg_execution_price: number;
  trades_by_underlying: Record<string, number>;
  trades_by_side: Record<string, number>;
  trades_by_day: { date: string; count: number; volume: number }[];
  avg_trade_size: number;
}

export interface TradesResponse {
  trades: Trade[];
  total_count: number | null;
  analytics: TradeAnalytics | null;
  filters: {
    underlyings: string[];
  };
}

interface UseTradesOptions {
  underlying?: string;
  side?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  includeAnalytics?: boolean;
}

export function useTrades(options: UseTradesOptions = {}) {
  const { underlying, side, startDate, endDate, limit = 100, offset = 0, includeAnalytics = true } = options;

  return useQuery({
    queryKey: ["trades", underlying, side, startDate, endDate, limit, offset, includeAnalytics],
    queryFn: async (): Promise<TradesResponse> => {
      const params = new URLSearchParams();
      if (underlying) params.set("underlying", underlying);
      if (side) params.set("side", side);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      params.set("limit", limit.toString());
      params.set("offset", offset.toString());
      if (includeAnalytics) params.set("analytics", "true");

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/trades?${params.toString()}`, {
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          ...(session?.access_token && { "Authorization": `Bearer ${session.access_token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch trades: ${response.status}`);
      }

      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Direct database query for simpler use cases
export function useTradesDirect() {
  return useQuery({
    queryKey: ["trades-direct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trades")
        .select(`
          *,
          orders!inner (
            side,
            mode,
            order_type,
            signal_id
          )
        `)
        .order("executed_at", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      // Flatten the joined data
      return (data || []).map(t => ({
        ...t,
        side: t.orders?.side,
        mode: t.orders?.mode,
        order_type: t.orders?.order_type,
        signal_id: t.orders?.signal_id,
      })) as Trade[];
    },
    refetchInterval: 10000,
  });
}
