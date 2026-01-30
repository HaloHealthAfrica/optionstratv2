import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { POLLING_INTERVALS } from '@/lib/polling';

// Since we no longer have Supabase realtime, we'll use polling instead
// The hooks already have refetchInterval set, so this just provides
// a compatible interface for components that expect realtime subscriptions

interface Position {
  id: string;
  signal_id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entry_price: number;
  entry_time: string;
  current_price: number | null;
  unrealized_pnl: number | null;
  exit_price: number | null;
  exit_time: string | null;
  realized_pnl: number | null;
  status: string;
}

interface UseRealtimePositionsOptions {
  onInsert?: (position: Position) => void;
  onUpdate?: (position: Position) => void;
  onDelete?: (position: Position) => void;
}

export function useRealtimePositions(options: UseRealtimePositionsOptions = {}) {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(true); // Always "subscribed" with polling

  useEffect(() => {
    // Set up polling interval for positions
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    }, POLLING_INTERVALS.positions);

    setIsSubscribed(true);

    return () => {
      clearInterval(interval);
    };
  }, [queryClient]);

  return { isSubscribed };
}

interface Order {
  id: string;
  symbol: string;
  underlying: string;
  status: string | null;
  side: string;
  quantity: number;
  filled_quantity: number | null;
  avg_fill_price: number | null;
}

interface UseRealtimeOrdersOptions {
  onInsert?: (order: Order) => void;
  onUpdate?: (order: Order) => void;
  onStatusChange?: (order: Order, oldStatus: string | null) => void;
}

export function useRealtimeOrders(options: UseRealtimeOrdersOptions = {}) {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, POLLING_INTERVALS.orders);

    setIsSubscribed(true);

    return () => {
      clearInterval(interval);
    };
  }, [queryClient]);

  return { isSubscribed };
}

interface RiskViolation {
  id: string;
  violation_type: string;
  rule_violated: string;
  severity: string | null;
  current_value: number | null;
  limit_value: number | null;
}

export function useRealtimeRiskViolations(onViolation?: (violation: RiskViolation) => void) {
  const queryClient = useQueryClient();
  const [isSubscribed, setIsSubscribed] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['risk-violations'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, POLLING_INTERVALS.riskViolations);

    setIsSubscribed(true);

    return () => {
      clearInterval(interval);
    };
  }, [queryClient]);

  return { isSubscribed };
}

// Combined hook for dashboard with all subscriptions
export function useDashboardRealtime() {
  const queryClient = useQueryClient();
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    positions: true,
    orders: true,
    trades: true,
    violations: true,
  });

  useEffect(() => {
    // Poll all data sources
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['risk-violations'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    }, Math.min(
      POLLING_INTERVALS.positions,
      POLLING_INTERVALS.orders,
      POLLING_INTERVALS.trades,
      POLLING_INTERVALS.riskViolations
    ));

    setSubscriptionStatus({
      positions: true,
      orders: true,
      trades: true,
      violations: true,
    });

    return () => {
      clearInterval(interval);
    };
  }, [queryClient]);

  const allSubscribed = true; // Always "subscribed" with polling

  return { 
    subscriptionStatus, 
    allSubscribed,
    isConnected: allSubscribed,
  };
}
