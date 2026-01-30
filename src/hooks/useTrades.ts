import { useQuery } from "@tanstack/react-query";
import { POLLING_INTERVALS } from "@/lib/polling";
import apiClient from "@/lib/api-client";

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
      const { data, error } = await apiClient.getTrades({
        underlying,
        side,
        startDate,
        endDate,
        limit,
        offset,
        includeAnalytics,
      });
      if (error || !data) throw error || new Error('Failed to fetch trades');
      return data as TradesResponse;
    },
    refetchInterval: POLLING_INTERVALS.trades,
  });
}

// Direct database query for simpler use cases
export function useTradesDirect() {
  return useQuery({
    queryKey: ["trades-direct"],
    queryFn: async () => {
      const { data, error } = await apiClient.getTrades({ limit: 100 });
      if (error || !data) throw error || new Error('Failed to fetch trades');
      return (data as any).trades || data;
    },
    refetchInterval: POLLING_INTERVALS.openTrades,
  });
}
