import type { 
  AdapterConfig, 
  OrderRequest, 
  OrderResult,
  Trade 
} from "./types.ts";

export interface PaperAdapterConfig extends AdapterConfig {
  slippage_percent: number;
  commission_per_contract: number;
  fee_per_contract: number;
  base_price: number; // Simulated market price
  deterministic: boolean;
  seed?: number;
}

const DEFAULT_CONFIG: PaperAdapterConfig = {
  mode: 'PAPER',
  slippage_percent: 0.1, // 0.1% slippage
  commission_per_contract: 0.65,
  fee_per_contract: 0.02,
  base_price: 1.00,
  deterministic: false,
};

// Simple seeded random number generator for deterministic testing
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

export class PaperAdapter {
  private config: PaperAdapterConfig;
  private random: SeededRandom | null;

  constructor(config: Partial<PaperAdapterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.random = this.config.deterministic && this.config.seed !== undefined
      ? new SeededRandom(this.config.seed)
      : null;
  }

  private getRandom(): number {
    return this.random ? this.random.next() : Math.random();
  }

  private calculateSlippage(basePrice: number, isBuy: boolean): number {
    const slippageMultiplier = (this.getRandom() * 2 - 1) * (this.config.slippage_percent / 100);
    // Buys get worse (higher) prices, sells get worse (lower) prices
    const direction = isBuy ? 1 : -1;
    return basePrice * (1 + direction * Math.abs(slippageMultiplier));
  }

  async submitOrder(
    request: OrderRequest, 
    marketPrice?: number
  ): Promise<{ result: OrderResult; trade: Omit<Trade, 'id' | 'created_at'> }> {
    const orderId = crypto.randomUUID();
    const tradeId = `PAPER-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Use provided market price or config base price
    const basePrice = marketPrice ?? this.config.base_price;
    
    // For limit orders, check if the order would fill
    if (request.order_type === 'LIMIT' && request.limit_price) {
      const isBuy = request.side.includes('BUY');
      if (isBuy && request.limit_price < basePrice) {
        // Buy limit below market - wouldn't fill immediately
        return {
          result: {
            success: true,
            order_id: orderId,
            broker_order_id: tradeId,
            status: 'SUBMITTED',
            filled_quantity: 0,
          },
          trade: null as any, // No trade yet for unfilled orders
        };
      }
      if (!isBuy && request.limit_price > basePrice) {
        // Sell limit above market - wouldn't fill immediately
        return {
          result: {
            success: true,
            order_id: orderId,
            broker_order_id: tradeId,
            status: 'SUBMITTED',
            filled_quantity: 0,
          },
          trade: null as any,
        };
      }
    }

    // Calculate execution price with slippage
    const isBuy = request.side.includes('BUY');
    const executionPrice = this.calculateSlippage(
      request.limit_price || basePrice, 
      isBuy
    );
    
    // Calculate costs
    const commission = this.config.commission_per_contract * request.quantity;
    const fees = this.config.fee_per_contract * request.quantity;
    const contractMultiplier = 100; // Options contract multiplier
    const premium = executionPrice * request.quantity * contractMultiplier;
    
    // For buys, total cost is premium + fees; for sells, it's fees minus premium received
    const totalCost = isBuy 
      ? premium + commission + fees
      : commission + fees - premium;

    const trade: Omit<Trade, 'id' | 'created_at'> = {
      order_id: orderId,
      broker_trade_id: tradeId,
      execution_price: Math.round(executionPrice * 100) / 100,
      quantity: request.quantity,
      commission,
      fees,
      total_cost: Math.round(totalCost * 100) / 100,
      underlying: request.underlying,
      symbol: request.symbol,
      strike: request.strike,
      expiration: request.expiration,
      option_type: request.option_type,
      executed_at: new Date().toISOString(),
    };

    return {
      result: {
        success: true,
        order_id: orderId,
        broker_order_id: tradeId,
        status: 'FILLED',
        filled_quantity: request.quantity,
        avg_fill_price: trade.execution_price,
      },
      trade,
    };
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
    // Paper adapter always succeeds at cancelling unfilled orders
    return { success: true };
  }

  getConfig(): PaperAdapterConfig {
    return { ...this.config };
  }
}
