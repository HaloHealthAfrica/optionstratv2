import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { POLLING_INTERVALS } from "@/lib/polling";

interface ExitEvaluation {
  should_exit: boolean;
  reason: string | null;
  urgency: 'IMMEDIATE' | 'END_OF_DAY' | 'NEXT_SESSION';
  details: string;
  current_value: number;
  threshold_value: number;
  suggested_order_type: 'MARKET' | 'LIMIT';
  suggested_limit_price?: number;
}

export interface ExitAlert {
  position_id: string;
  symbol: string;
  underlying: string;
  strike: number;
  expiration: string;
  option_type: string;
  quantity: number;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  days_to_expiration: number;
  exit_evaluation: ExitEvaluation;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  recommended_action: string;
}

interface ExitSignalsResponse {
  alerts: ExitAlert[];
  summary: {
    total_positions: number;
    positions_with_alerts: number;
    critical_alerts: number;
    high_alerts: number;
    medium_alerts: number;
  };
  duration_ms: number;
  timestamp: string;
}

export async function fetchExitSignals(refresh = false): Promise<ExitSignalsResponse> {
  const { data, error } = await apiClient.getExitSignals(refresh);
  if (error || !data) {
    throw error || new Error('Failed to fetch exit signals');
  }
  return data;
}

export function useExitSignals(refresh = false) {
  return useQuery({
    queryKey: ['exit-signals', refresh],
    queryFn: () => fetchExitSignals(refresh),
    refetchInterval: POLLING_INTERVALS.exitSignals,
    staleTime: 30000,
  });
}
