/**
 * Broker Adapter Interface
 * 
 * Defines the contract for all broker adapters (Paper, Tradier, Alpaca).
 * Includes factory for dynamic adapter selection based on APP_MODE.
 */

import type { 
  OrderRequest, 
  OrderResult, 
  Trade,
  TradingMode,
  OrderStatus
} from "./types.ts";

// Extended result type for live adapters that may not fill immediately
export interface AdapterOrderResult extends OrderResult {
  requires_polling?: boolean;
  estimated_fill_time_ms?: number;
}

// Order status response for polling
export interface OrderStatusResponse {
  order_id: string;
  broker_order_id: string;
  status: OrderStatus;
  filled_quantity: number;
  remaining_quantity: number;
  avg_fill_price?: number;
  last_fill_price?: number;
  last_fill_quantity?: number;
  last_fill_time?: string;
  rejection_reason?: string;
  error?: string;
}

// Trade fill from a live adapter
export interface AdapterTradeFill {
  broker_trade_id: string;
  order_id: string;
  execution_price: number;
  quantity: number;
  commission: number;
  fees: number;
  total_cost: number;
  executed_at: string;
}

// Adapter capabilities
export interface AdapterCapabilities {
  supports_market_orders: boolean;
  supports_limit_orders: boolean;
  supports_stop_orders: boolean;
  supports_options: boolean;
  supports_multi_leg: boolean;
  supports_order_modification: boolean;
  supports_extended_hours: boolean;
  max_order_size: number;
  min_order_size: number;
}

// Base adapter interface all brokers must implement
export interface BrokerAdapter {
  readonly name: string;
  readonly mode: TradingMode;
  
  // Check if adapter is properly configured and can execute
  isConfigured(): boolean;
  
  // Get adapter capabilities
  getCapabilities(): AdapterCapabilities;
  
  // Submit a new order
  submitOrder(
    request: OrderRequest,
    marketPrice?: number
  ): Promise<{ 
    result: AdapterOrderResult; 
    trade: Omit<Trade, 'id' | 'created_at'> | null;
  }>;
  
  // Cancel an existing order
  cancelOrder(orderId: string, brokerOrderId?: string): Promise<{ 
    success: boolean; 
    error?: string 
  }>;
  
  // Get current order status (for async fills)
  getOrderStatus(orderId: string, brokerOrderId: string): Promise<OrderStatusResponse>;
  
  // Get fills/trades for an order
  getOrderFills(orderId: string, brokerOrderId: string): Promise<AdapterTradeFill[]>;
}

// Adapter configuration for factory
export interface AdapterFactoryConfig {
  mode: TradingMode;
  allow_live_execution: boolean;
  preferred_live_broker?: 'tradier' | 'alpaca';
  paper_config?: {
    slippage_percent?: number;
    commission_per_contract?: number;
    fee_per_contract?: number;
  };
}

// Safety gate validation result
export interface SafetyGateResult {
  allowed: boolean;
  reason: string;
  mode: TradingMode;
  adapter_name: string;
}

/**
 * Validates safety gates before allowing live trading
 * Requires BOTH APP_MODE=LIVE AND ALLOW_LIVE_EXECUTION=true
 */
export function validateSafetyGates(): SafetyGateResult {
  const appMode = Deno.env.get("APP_MODE") as TradingMode || "PAPER";
  const allowLiveExecution = Deno.env.get("ALLOW_LIVE_EXECUTION") === "true";
  
  // Default to PAPER mode
  if (appMode !== "LIVE") {
    return {
      allowed: false,
      reason: "APP_MODE is not set to LIVE",
      mode: "PAPER",
      adapter_name: "paper"
    };
  }
  
  // Require explicit opt-in for live execution
  if (!allowLiveExecution) {
    return {
      allowed: false,
      reason: "ALLOW_LIVE_EXECUTION is not enabled",
      mode: "PAPER",
      adapter_name: "paper"
    };
  }
  
  // Determine which live adapter to use
  const preferredBroker = Deno.env.get("PREFERRED_BROKER") || "tradier";
  
  return {
    allowed: true,
    reason: "Live trading enabled",
    mode: "LIVE",
    adapter_name: preferredBroker
  };
}

/**
 * Gets the current trading mode based on environment configuration
 */
export function getCurrentTradingMode(): TradingMode {
  const safetyResult = validateSafetyGates();
  return safetyResult.mode;
}

/**
 * Check if a specific broker is configured with required credentials
 */
export function isBrokerConfigured(broker: 'tradier' | 'alpaca'): boolean {
  switch (broker) {
    case 'tradier':
      return !!Deno.env.get('TRADIER_API_KEY') && !!Deno.env.get('TRADIER_ACCOUNT_ID');
    case 'alpaca':
      return !!Deno.env.get('ALPACA_API_KEY') && !!Deno.env.get('ALPACA_SECRET_KEY');
    default:
      return false;
  }
}
