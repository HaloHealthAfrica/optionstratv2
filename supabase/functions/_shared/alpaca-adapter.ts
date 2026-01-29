/**
 * Alpaca Broker Adapter
 * 
 * Live trading adapter for Alpaca Markets.
 * Implements options order submission via Alpaca Trading API.
 * Docs: https://docs.alpaca.markets/reference/postorder
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

const ALPACA_LIVE_URL = "https://api.alpaca.markets";
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";

interface AlpacaConfig {
  apiKey: string;
  secretKey: string;
  paper?: boolean;
  timeout_ms?: number;
}

interface AlpacaOrderResponse {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  status: string;
  extended_hours: boolean;
  legs?: AlpacaOrderLeg[];
  order_class?: string;
}

interface AlpacaOrderLeg {
  id: string;
  symbol: string;
  qty: string;
  side: string;
  position_effect: string;
  ratio_qty: string;
}

interface AlpacaFill {
  id: string;
  order_id: string;
  price: string;
  qty: string;
  timestamp: string;
  side: string;
}

// Map Alpaca status to our OrderStatus
function mapAlpacaStatus(status: string): OrderStatus {
  switch (status.toLowerCase()) {
    case 'new':
    case 'pending_new':
    case 'accepted':
      return 'SUBMITTED';
    case 'partially_filled':
      return 'PARTIAL_FILL';
    case 'filled':
      return 'FILLED';
    case 'canceled':
    case 'pending_cancel':
      return 'CANCELLED';
    case 'rejected':
      return 'REJECTED';
    case 'expired':
      return 'EXPIRED';
    case 'replaced':
    case 'pending_replace':
      return 'SUBMITTED';
    default:
      return 'PENDING';
  }
}

// Map our OrderSide to Alpaca side + position effect
function mapOrderSide(side: OrderSide): { side: string; position_effect: string } {
  switch (side) {
    case 'BUY':
    case 'BUY_TO_OPEN':
      return { side: 'buy', position_effect: 'open' };
    case 'BUY_TO_CLOSE':
      return { side: 'buy', position_effect: 'close' };
    case 'SELL':
    case 'SELL_TO_OPEN':
      return { side: 'sell', position_effect: 'open' };
    case 'SELL_TO_CLOSE':
      return { side: 'sell', position_effect: 'close' };
    default:
      return { side: 'buy', position_effect: 'open' };
  }
}

// Convert OCC symbol format to Alpaca format
// OCC: AAPL  251219C00150000 -> Alpaca: AAPL251219C00150000
function toAlpacaSymbol(occSymbol: string): string {
  return occSymbol.replace(/\s/g, '');
}

export class AlpacaAdapter implements BrokerAdapter {
  readonly name = 'alpaca';
  readonly mode: TradingMode = 'LIVE';
  
  private baseUrl: string;
  private apiKey: string;
  private secretKey: string;
  private timeout_ms: number;
  
  constructor(config: AlpacaConfig) {
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.baseUrl = config.paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
    this.timeout_ms = config.timeout_ms || 10000;
  }
  
  isConfigured(): boolean {
    return !!this.apiKey && !!this.secretKey;
  }
  
  getCapabilities(): AdapterCapabilities {
    return {
      supports_market_orders: true,
      supports_limit_orders: true,
      supports_stop_orders: true,
      supports_options: true,
      supports_multi_leg: true,
      supports_order_modification: true,
      supports_extended_hours: true,
      max_order_size: 100000,
      min_order_size: 1,
    };
  }
  
  private async fetch<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);
    
    try {
      const options: RequestInit = {
        method,
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.secretKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      };
      
      if (body && (method === 'POST' || method === 'PUT')) {
        options.headers = {
          ...options.headers,
          'Content-Type': 'application/json',
        };
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(url, options);
      clearTimeout(timeout);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Alpaca API error: ${response.status} - ${errorText}`);
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
    try {
      const sideMapping = mapOrderSide(request.side);
      
      // Build order for Alpaca Options API
      const orderBody: Record<string, unknown> = {
        symbol: toAlpacaSymbol(request.symbol),
        qty: String(request.quantity),
        side: sideMapping.side,
        type: request.order_type.toLowerCase(),
        time_in_force: request.time_in_force.toLowerCase(),
        position_intent: sideMapping.position_effect === 'open' ? 'buy_to_open' : 'buy_to_close',
        client_order_id: `lov-${(request.signal_id || crypto.randomUUID()).substring(0, 8)}-${Date.now()}`,
      };
      
      // Handle order type specifics
      if (request.order_type === 'LIMIT' && request.limit_price) {
        orderBody.limit_price = String(request.limit_price);
      }
      if ((request.order_type === 'STOP' || request.order_type === 'STOP_LIMIT') && request.stop_price) {
        orderBody.stop_price = String(request.stop_price);
      }
      
      console.log(`[AlpacaAdapter] Submitting order:`, orderBody);
      
      const response = await this.fetch<AlpacaOrderResponse>(
        '/v2/orders',
        'POST',
        orderBody
      );
      
      const status = mapAlpacaStatus(response.status);
      const filledQty = parseInt(response.filled_qty) || 0;
      const avgPrice = response.filled_avg_price ? parseFloat(response.filled_avg_price) : undefined;
      
      // If already filled, create trade record
      let trade: Omit<Trade, 'id' | 'created_at'> | null = null;
      if (status === 'FILLED' && avgPrice) {
        const commission = 0.65 * filledQty;
        const fees = 0.02 * filledQty;
        const isBuy = request.side.includes('BUY');
        const premium = avgPrice * filledQty * 100;
        const totalCost = isBuy ? premium + commission + fees : commission + fees - premium;
        
        trade = {
          order_id: response.id,
          broker_trade_id: `${response.id}-fill`,
          execution_price: avgPrice,
          quantity: filledQty,
          commission,
          fees,
          total_cost: totalCost,
          underlying: request.underlying,
          symbol: request.symbol,
          strike: request.strike,
          expiration: request.expiration,
          option_type: request.option_type,
          executed_at: response.filled_at || new Date().toISOString(),
        };
      }
      
      return {
        result: {
          success: true,
          order_id: request.signal_id || crypto.randomUUID(),
          broker_order_id: response.id,
          status,
          filled_quantity: filledQty,
          avg_fill_price: avgPrice,
          requires_polling: status !== 'FILLED' && status !== 'REJECTED',
          estimated_fill_time_ms: 3000,
        },
        trade,
      };
    } catch (error) {
      console.error(`[AlpacaAdapter] Order submission failed:`, error);
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
        `/v2/orders/${brokerOrderId}`,
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
    orderId: string, 
    brokerOrderId: string
  ): Promise<OrderStatusResponse> {
    try {
      const response = await this.fetch<AlpacaOrderResponse>(
        `/v2/orders/${brokerOrderId}`
      );
      
      const filledQty = parseInt(response.filled_qty) || 0;
      const totalQty = parseInt(response.qty) || 0;
      
      return {
        order_id: orderId,
        broker_order_id: brokerOrderId,
        status: mapAlpacaStatus(response.status),
        filled_quantity: filledQty,
        remaining_quantity: totalQty - filledQty,
        avg_fill_price: response.filled_avg_price ? parseFloat(response.filled_avg_price) : undefined,
        last_fill_time: response.filled_at || undefined,
      };
    } catch (error) {
      return {
        order_id: orderId,
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
      // Get order status which includes fill info
      const statusResponse = await this.getOrderStatus(orderId, brokerOrderId);
      
      if (statusResponse.filled_quantity === 0 || !statusResponse.avg_fill_price) {
        return [];
      }
      
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
      console.error(`[AlpacaAdapter] Failed to get fills:`, error);
      return [];
    }
  }
}

/**
 * Factory function to create Alpaca adapter
 */
export function createAlpacaAdapter(): AlpacaAdapter | null {
  const apiKey = Deno.env.get('ALPACA_API_KEY');
  const secretKey = Deno.env.get('ALPACA_SECRET_KEY');
  
  if (!apiKey || !secretKey) {
    console.warn('Alpaca adapter not configured: missing ALPACA_API_KEY or ALPACA_SECRET_KEY');
    return null;
  }
  
  // Use paper unless explicitly set to live
  const paper = Deno.env.get('ALPACA_PAPER') !== 'false';
  
  return new AlpacaAdapter({ apiKey, secretKey, paper });
}
