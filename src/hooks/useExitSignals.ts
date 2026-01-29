import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  const { data: sessionData } = await supabase.auth.getSession();
  
  const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exit-signals`);
  if (refresh) {
    url.searchParams.set('refresh', 'true');
  }
  
  const response = await fetch(url.toString(), {
    headers: {
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Authorization': sessionData?.session?.access_token 
        ? `Bearer ${sessionData.session.access_token}`
        : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch exit signals');
  }
  
  return response.json();
}

export function useExitSignals(refresh = false) {
  return useQuery({
    queryKey: ['exit-signals', refresh],
    queryFn: () => fetchExitSignals(refresh),
    refetchInterval: 60000, // Refetch every minute
    staleTime: 30000,
  });
}
