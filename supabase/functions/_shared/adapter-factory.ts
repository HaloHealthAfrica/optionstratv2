/**
 * Adapter Factory
 * 
 * Dynamic adapter selection based on APP_MODE and safety gates.
 * Ensures proper isolation between PAPER and LIVE modes.
 */

import type { 
  BrokerAdapter,
  AdapterFactoryConfig,
  SafetyGateResult
} from "./broker-adapter.ts";

import { validateSafetyGates, isBrokerConfigured } from "./broker-adapter.ts";
import { PaperAdapter, type PaperAdapterConfig } from "./paper-adapter.ts";
import { TradierAdapter, createTradierAdapter } from "./tradier-adapter.ts";
import { AlpacaAdapter, createAlpacaAdapter } from "./alpaca-adapter.ts";

// Wrapper to make PaperAdapter conform to BrokerAdapter interface
class PaperAdapterWrapper implements BrokerAdapter {
  readonly name = 'paper';
  readonly mode = 'PAPER' as const;
  private adapter: PaperAdapter;

  constructor(config: Partial<PaperAdapterConfig> = {}) {
    this.adapter = new PaperAdapter(config);
  }

  isConfigured(): boolean {
    return true; // Paper adapter is always configured
  }

  getCapabilities() {
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

  async submitOrder(request: Parameters<BrokerAdapter['submitOrder']>[0], marketPrice?: number) {
    const result = await this.adapter.submitOrder(request, marketPrice);
    return {
      result: {
        ...result.result,
        requires_polling: false,
      },
      trade: result.trade,
    };
  }

  async cancelOrder(orderId: string, _brokerOrderId?: string) {
    return this.adapter.cancelOrder(orderId);
  }

  async getOrderStatus(orderId: string, brokerOrderId: string) {
    // Paper adapter fills immediately, so status is always FILLED
    return {
      order_id: orderId,
      broker_order_id: brokerOrderId,
      status: 'FILLED' as const,
      filled_quantity: 0,
      remaining_quantity: 0,
    };
  }

  async getOrderFills(_orderId: string, _brokerOrderId: string) {
    // Paper adapter includes trade in submitOrder response
    return [];
  }
}

export interface AdapterSelectionResult {
  adapter: BrokerAdapter;
  safety_result: SafetyGateResult;
  warnings: string[];
}

/**
 * Creates the appropriate adapter based on environment configuration
 * Implements dual-flag safety gate for live trading
 */
export function createAdapter(
  config?: Partial<AdapterFactoryConfig>
): AdapterSelectionResult {
  const warnings: string[] = [];
  
  // Validate safety gates
  const safetyResult = validateSafetyGates();
  
  // If not allowed to trade live, return paper adapter
  if (!safetyResult.allowed) {
    console.log(`[AdapterFactory] Using PAPER mode: ${safetyResult.reason}`);
    
    const paperConfig = config?.paper_config || {};
    const adapter = new PaperAdapterWrapper({
      slippage_percent: paperConfig.slippage_percent || 0.1,
      commission_per_contract: paperConfig.commission_per_contract || 0.65,
      fee_per_contract: paperConfig.fee_per_contract || 0.02,
    });
    
    return { adapter, safety_result: safetyResult, warnings };
  }
  
  // LIVE mode enabled - select appropriate broker
  const preferredBroker = config?.preferred_live_broker || 
    (Deno.env.get("PREFERRED_BROKER") as 'tradier' | 'alpaca') || 
    'tradier';
  
  console.log(`[AdapterFactory] LIVE mode enabled, preferred broker: ${preferredBroker}`);
  
  // Try to create the preferred broker adapter
  let liveAdapter: BrokerAdapter | null = null;
  
  if (preferredBroker === 'tradier') {
    liveAdapter = createTradierAdapter();
    if (!liveAdapter) {
      warnings.push('Tradier adapter not configured, trying Alpaca');
      liveAdapter = createAlpacaAdapter();
    }
  } else {
    liveAdapter = createAlpacaAdapter();
    if (!liveAdapter) {
      warnings.push('Alpaca adapter not configured, trying Tradier');
      liveAdapter = createTradierAdapter();
    }
  }
  
  // If no live adapter available, fall back to paper with warning
  if (!liveAdapter) {
    warnings.push('No live broker configured - falling back to PAPER mode for safety');
    console.warn(`[AdapterFactory] No live broker configured, falling back to PAPER`);
    
    const paperAdapter = new PaperAdapterWrapper({
      slippage_percent: 0.1,
      commission_per_contract: 0.65,
      fee_per_contract: 0.02,
    });
    
    return {
      adapter: paperAdapter,
      safety_result: {
        ...safetyResult,
        allowed: false,
        reason: 'No live broker configured',
        mode: 'PAPER',
        adapter_name: 'paper',
      },
      warnings,
    };
  }
  
  console.log(`[AdapterFactory] Using live adapter: ${liveAdapter.name}`);
  
  return {
    adapter: liveAdapter,
    safety_result: safetyResult,
    warnings,
  };
}

/**
 * Get adapter info without creating one
 */
export function getAdapterInfo(): {
  mode: 'PAPER' | 'LIVE';
  adapter_name: string;
  configured_brokers: string[];
  live_enabled: boolean;
} {
  const safetyResult = validateSafetyGates();
  
  const configuredBrokers: string[] = [];
  if (isBrokerConfigured('tradier')) configuredBrokers.push('tradier');
  if (isBrokerConfigured('alpaca')) configuredBrokers.push('alpaca');
  
  return {
    mode: safetyResult.mode,
    adapter_name: safetyResult.adapter_name,
    configured_brokers: configuredBrokers,
    live_enabled: safetyResult.allowed,
  };
}
