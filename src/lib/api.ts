import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface SystemStats {
  signals: {
    total: number;
    pending: number;
    completed: number;
    rejected: number;
    failed: number;
  };
  orders: {
    total: number;
    paper: number;
    live: number;
    filled: number;
    pending: number;
  };
  trades: {
    total: number;
  };
  positions: {
    total: number;
    open: number;
    closed: number;
  };
  risk_violations: {
    total: number;
    critical: number;
    warning: number;
  };
  mode: "PAPER" | "LIVE";
  timestamp: string;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  mode: "PAPER" | "LIVE";
  live_trading_enabled: boolean;
  uptime_ms: number;
  database: {
    connected: boolean;
    error: string | null;
  };
  last_activity: {
    signal: string | null;
    order: string | null;
  };
  timestamp: string;
}

export interface Position {
  id: string;
  signal_id: string;
  symbol: string;
  direction: "CALL" | "PUT";
  quantity: number;
  entry_price: number;
  entry_time: string;
  current_price: number | null;
  unrealized_pnl: number | null;
  exit_price: number | null;
  exit_time: string | null;
  realized_pnl: number | null;
  status: "OPEN" | "CLOSED";
  created_at: string;
  updated_at: string;
  // Legacy/optional fields for compatibility
  underlying?: string | null;
  strike?: number | null;
  expiration?: string | null;
  option_type?: "CALL" | "PUT" | string | null;
  avg_open_price?: number | null;
  total_cost?: number | null;
  market_value?: number | null;
  unrealized_pnl_percent?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  implied_volatility?: number | null;
  is_closed?: boolean | null;
  closed_at?: string | null;
  opened_at?: string | null;
  last_updated?: string | null;
}

export interface PositionsResponse {
  positions: Position[];
  totals: {
    total_positions: number;
    open_positions: number;
    closed_positions: number;
    total_exposure: number;
    total_unrealized_pnl: number;
    total_realized_pnl: number;
    day_realized_pnl: number;
    week_realized_pnl: number;
  };
}

export interface PositionRefreshResult {
  success: boolean;
  duration_ms: number;
  positions_updated: number;
  positions_failed: number;
  exit_signals: Array<{
    position_id: string;
    evaluation: {
      should_exit: boolean;
      reason: string | null;
      urgency: 'IMMEDIATE' | 'END_OF_DAY' | 'NEXT_SESSION';
      details: string;
    };
  }>;
  portfolio_metrics: {
    total_positions: number;
    total_market_value: number;
    total_unrealized_pnl: number;
    total_delta: number;
    total_gamma: number;
    total_theta: number;
    total_vega: number;
  };
}

export interface ContextSummary {
  vix_regime?: string;
  vix_trend?: string;
  market_bias?: string;
  or_breakout?: string;
  moving_with_market?: boolean;
  spy_trend?: string;
  candle_pattern?: string;
  is_stale?: boolean;
  data_age_seconds?: number;
}

export interface MTFSummary {
  bias?: string;
  alignment_score?: number;
  bullish_count?: number;
  bearish_count?: number;
  is_stale?: boolean;
}

export interface Signal {
  id: string;
  source: string;
  symbol: string;
  direction: "CALL" | "PUT";
  timeframe: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  validation_result: {
    valid?: boolean;
    rejection_reason?: string;
    stage?: string;
  } | null;
  created_at: string;
  // Legacy/optional fields for compatibility
  action?: "BUY" | "SELL" | "CLOSE" | string | null;
  underlying?: string | null;
  strike?: number | null;
  expiration?: string | null;
  option_type?: "CALL" | "PUT" | string | null;
  quantity?: number | null;
}

export interface Order {
  id: string;
  signal_id: string | null;
  broker_order_id: string | null;
  client_order_id: string | null;
  underlying: string;
  symbol: string;
  strike: number;
  expiration: string;
  option_type: "CALL" | "PUT";
  side: string;
  quantity: number;
  order_type: string;
  limit_price: number | null;
  time_in_force: string;
  mode: "PAPER" | "LIVE";
  status: string;
  filled_quantity: number;
  avg_fill_price: number | null;
  created_at: string;
}

async function callEdgeFunction<T>(functionName: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${functionName}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(session?.access_token && { "Authorization": `Bearer ${session.access_token}` }),
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function fetchStats(): Promise<SystemStats> {
  return callEdgeFunction<SystemStats>("stats");
}

export async function fetchHealth(): Promise<SystemHealth> {
  return callEdgeFunction<SystemHealth>("health");
}

export async function fetchPositions(showClosed = false): Promise<PositionsResponse> {
  return callEdgeFunction<PositionsResponse>("positions", { show_closed: showClosed.toString() });
}

export async function fetchSignals(): Promise<Signal[]> {
  const { data, error } = await supabase
    .from("refactored_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  
  if (error) throw error;
  return data as Signal[];
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  
  if (error) throw error;
  return data as Order[];
}

export async function fetchRiskViolations() {
  const { data, error } = await supabase
    .from("risk_violations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  
  if (error) throw error;
  return data;
}
