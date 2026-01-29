import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('positions-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'refactored_positions' },
        (payload) => {
          options.onInsert?.(payload.new as Position);
          queryClient.invalidateQueries({ queryKey: ['positions'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'refactored_positions' },
        (payload) => {
          options.onUpdate?.(payload.new as Position);
          queryClient.invalidateQueries({ queryKey: ['positions'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'refactored_positions' },
        (payload) => {
          options.onDelete?.(payload.old as Position);
          queryClient.invalidateQueries({ queryKey: ['positions'] });
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, options.onInsert, options.onUpdate, options.onDelete]);

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
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          options.onInsert?.(payload.new as Order);
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = payload.new as Order;
          const oldOrder = payload.old as Order;
          
          options.onUpdate?.(newOrder);
          
          if (newOrder.status !== oldOrder.status) {
            options.onStatusChange?.(newOrder, oldOrder.status);
          }
          
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, options.onInsert, options.onUpdate, options.onStatusChange]);

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
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel('risk-violations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'risk_violations' },
        (payload) => {
          onViolation?.(payload.new as RiskViolation);
          queryClient.invalidateQueries({ queryKey: ['risk-violations'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, onViolation]);

  return { isSubscribed };
}

// Combined hook for dashboard with all subscriptions
export function useDashboardRealtime() {
  const queryClient = useQueryClient();
  const [subscriptionStatus, setSubscriptionStatus] = useState({
    positions: false,
    orders: false,
    trades: false,
    violations: false,
  });

  useEffect(() => {
    const positionsChannel = supabase
      .channel('dashboard-positions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refactored_positions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      })
      .subscribe((status) => {
        setSubscriptionStatus(prev => ({ ...prev, positions: status === 'SUBSCRIBED' }));
      });

    const ordersChannel = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      })
      .subscribe((status) => {
        setSubscriptionStatus(prev => ({ ...prev, orders: status === 'SUBSCRIBED' }));
      });

    const tradesChannel = supabase
      .channel('dashboard-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        queryClient.invalidateQueries({ queryKey: ['trades'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      })
      .subscribe((status) => {
        setSubscriptionStatus(prev => ({ ...prev, trades: status === 'SUBSCRIBED' }));
      });

    const violationsChannel = supabase
      .channel('dashboard-violations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'risk_violations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['risk-violations'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      })
      .subscribe((status) => {
        setSubscriptionStatus(prev => ({ ...prev, violations: status === 'SUBSCRIBED' }));
      });

    return () => {
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(violationsChannel);
    };
  }, [queryClient]);

  const allSubscribed = Object.values(subscriptionStatus).every(Boolean);

  return { 
    subscriptionStatus, 
    allSubscribed,
    isConnected: allSubscribed,
  };
}
