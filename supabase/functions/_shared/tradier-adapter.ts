/**
 * Tradier Broker Adapter
 * 
 * Live trading adapter for Tradier Brokerage.
 * Implements options order submission, status polling, and cancellation.
 * Docs: https://documentation.tradier.com/brokerage-api/trading/place-option-order
 */

import type { 
  OrderRequest, 
  Trade,
  TradingMode,
  OrderStatus,
  OrderSide
} from "./types.ts";

import type {
  BrokerAdapter,
  AdapterOrderResult,
  AdapterCapabilities,
  OrderStatusResponse,
  AdapterTradeFill
} from "./broker-adapter.ts";

const TRADIER_BASE_URL = "https://api.tradier.com/v1";
const TRADIER_SANDBOX_URL = "https://sandbox.tradier.com/v1";

interface TradierConfig {
  apiKey: string;
  accountId: string;
  sandbox?: boolean;
  timeout_ms?: number;
}

interface TradierOrderResponse {
  order: {
    id: number;
    status: string;
    partner_id: string;
  };
}

interface TradierOrderStatusResponse {
  order: TradierOrderDetail;
}

interface TradierOrderDetail {
  id: number;
  type: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  duration: string;
  price: number;
  avg_fill_price: number;
  exec_quantity: number;
  last_fill_price: number;
  last_fill_quantity: number;
  remaining_quantity: number;
  create_date: string;
  transaction_date: string;
  class: string;
  option_symbol: string;
  num_legs?: number;
  strategy?: string;
  leg?: TradierLeg[];
  reject_reason?: string;
}

interface TradierLeg {
  id: number;
  type: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  duration: string;
  price: number;
  avg_fill_price: number;
  exec_quantity: number;
  last_fill_price: number;
  last_fill_quantity: number;
  remaining_quantity: number;
  create_date: string;
  transaction_date: string;
  option_symbol: string;
}

// Map Tradier status to our OrderStatus
function mapTradierStatus(status: string): OrderStatus {
  switch (status.toLowerCase()) {
    case 'pending':
    case 'open':
      return 'SUBMITTED';
    case 'partially_filled':
      return 'PARTIAL_FILL';
    case 'filled':
      return 'FILLED';
    case 'canceled':
    case 'cancelled':
      return 'CANCELLED';
    case 'rejected':
      return 'REJECTED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'PENDING';
  }
}

// Map our OrderSide to Tradier side
function mapOrderSide(side: OrderSide): string {
  switch (side) {
    case 'BUY':
    case 'BUY_TO_OPEN':
      return 'buy_to_open';
    case 'BUY_TO_CLOSE':
      return 'buy_to_close';
    case 'SELL':
    case 'SELL_TO_OPEN':
      return 'sell_to_open';
    case 'SELL_TO_CLOSE':
      return 'sell_to_close';
    default:
      return 'buy_to_open';
  }
}

export class TradierAdapter implements BrokerAdapter {
  readonly name = 'tradier';
  readonly mode: TradingMode = 'LIVE';
  
  private baseUrl: string;
  private apiKey: string;
  private accountId: string;
  private timeout_ms: number;
  
  constructor(config: TradierConfig) {
    this.apiKey = config.apiKey;
    this.accountId = config.accountId;
    this.baseUrl = config.sandbox ? TRADIER_SANDBOX_URL : TRADIER_BASE_URL;
    this.timeout_ms = config.timeout_ms || 10000;
  }
  
  isConfigured(): boolean {
    return !!this.apiKey && !!this.accountId;
  }
  
  getCapabilities(): AdapterCapabilities {
    return {
      supports_market_orders: true,
      supports_limit_orders: true,
      supports_stop_orders: true,
      supports_options: true,
      supports_multi_leg: true,
      supports_order_modification: false, // Tradier requires cancel/replace
      supports_extended_hours: false,
      max_order_size: 10000,
      min_order_size: 1,
    };
  }
  
  private async fetch<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, string | number>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);
    
    try {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      };
      
      if (body && (method === 'POST' || method === 'PUT')) {
        options.headers = {
          ...options.headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        };
        options.body = new URLSearchParams(
          Object.entries(body).map(([k, v]) => [k, String(v)])
        ).toString();
      }
      
      const response = await fetch(url, options);
      clearTimeout(timeout);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tradier API error: ${response.status} - ${errorText}`);
      }
      
      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
  
  async submitOrder(
    request: OrderRequest,
    _marketPrice?: number
  ): Promise<{ result: AdapterOrderResult; trade: Omit<Trade, 'id' | 'created_at'> | null }> {
    const startTime = Date.now();
    
    try {
      // Build order parameters for Tradier
      const orderParams: Record<string, string | number> = {
        class: 'option',
        symbol: request.underlying,
        option_symbol: request.symbol.replace(/\s/g, ''), // Remove spaces from OCC symbol
        side: mapOrderSide(request.side),
        quantity: request.quantity,
        type: request.order_type.toLowerCase(),
        duration: request.time_in_force.toLowerCase() === 'gtc' ? 'gtc' : 'day',
      };
      
      // Add price for limit/stop orders
      if (request.order_type === 'LIMIT' && request.limit_price) {
        orderParams.price = request.limit_price;
      }
      if ((request.order_type === 'STOP' || request.order_type === 'STOP_LIMIT') && request.stop_price) {
        orderParams.stop = request.stop_price;
      }
      
      console.log(`[TradierAdapter] Submitting order:`, orderParams);
      
      const response = await this.fetch<TradierOrderResponse>(
        `/accounts/${this.accountId}/orders`,
        'POST',
        orderParams
      );
      
      const orderId = String(response.order.id);
      const brokerOrderId = orderId;
      
      // Tradier orders don't fill immediately - we need to poll
      return {
        result: {
          success: true,
          order_id: request.signal_id || crypto.randomUUID(),
          broker_order_id: brokerOrderId,
          status: mapTradierStatus(response.order.status),
          filled_quantity: 0,
          requires_polling: true,
          estimated_fill_time_ms: 5000, // 5 seconds typical
        },
        trade: null, // Will be filled via getOrderFills
      };
    } catch (error) {
      console.error(`[TradierAdapter] Order submission failed:`, error);
      return {
        result: {
          success: false,
          order_id: request.signal_id || crypto.randomUUID(),
          status: 'REJECTED',
          filled_quantity: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        trade: null,
      };
    }
  }
  
  async cancelOrder(
    _orderId: string, 
    brokerOrderId?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!brokerOrderId) {
      return { success: false, error: 'Broker order ID required for cancellation' };
    }
    
    try {
      await this.fetch(
        `/accounts/${this.accountId}/orders/${brokerOrderId}`,
        'DELETE'
      );
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  async getOrderStatus(
    _orderId: string, 
    brokerOrderId: string
  ): Promise<OrderStatusResponse> {
    try {
      const response = await this.fetch<TradierOrderStatusResponse>(
        `/accounts/${this.accountId}/orders/${brokerOrderId}`
      );
      
      const order = response.order;
      
      return {
        order_id: _orderId,
        broker_order_id: brokerOrderId,
        status: mapTradierStatus(order.status),
        filled_quantity: order.exec_quantity || 0,
        remaining_quantity: order.remaining_quantity || order.quantity,
        avg_fill_price: order.avg_fill_price || undefined,
        last_fill_price: order.last_fill_price || undefined,
        last_fill_quantity: order.last_fill_quantity || undefined,
        last_fill_time: order.transaction_date,
        rejection_reason: order.reject_reason,
      };
    } catch (error) {
      return {
        order_id: _orderId,
        broker_order_id: brokerOrderId,
        status: 'PENDING',
        filled_quantity: 0,
        remaining_quantity: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  async getOrderFills(
    orderId: string, 
    brokerOrderId: string
  ): Promise<AdapterTradeFill[]> {
    try {
      const statusResponse = await this.getOrderStatus(orderId, brokerOrderId);
      
      if (statusResponse.filled_quantity === 0 || !statusResponse.avg_fill_price) {
        return [];
      }
      
      // Tradier doesn't provide individual fills easily - we aggregate
      const commission = 0.65 * statusResponse.filled_quantity;
      const fees = 0.02 * statusResponse.filled_quantity;
      const premium = statusResponse.avg_fill_price * statusResponse.filled_quantity * 100;
      
      return [{
        broker_trade_id: `${brokerOrderId}-fill`,
        order_id: orderId,
        execution_price: statusResponse.avg_fill_price,
        quantity: statusResponse.filled_quantity,
        commission,
        fees,
        total_cost: premium + commission + fees,
        executed_at: statusResponse.last_fill_time || new Date().toISOString(),
      }];
    } catch (error) {
      console.error(`[TradierAdapter] Failed to get fills:`, error);
      return [];
    }
  }
}

/**
 * Factory function to create Tradier adapter
 */
export function createTradierAdapter(): TradierAdapter | null {
  const apiKey = Deno.env.get('TRADIER_API_KEY');
  const accountId = Deno.env.get('TRADIER_ACCOUNT_ID');
  
  if (!apiKey || !accountId) {
    console.warn('Tradier adapter not configured: missing TRADIER_API_KEY or TRADIER_ACCOUNT_ID');
    return null;
  }
  
  const sandbox = Deno.env.get('TRADIER_SANDBOX') === 'true';
  
  return new TradierAdapter({ apiKey, accountId, sandbox });
}
